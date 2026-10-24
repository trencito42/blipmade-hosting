import { createServer } from 'node:http';
import { UnrecoverableError, type Job } from 'bullmq';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { env } from './env.js';
import {
  createEmailWorker,
  createProvisionWorker,
  closeQueue,
  enqueueProvisioning,
  isLastAttempt,
  pruneQueueJobs,
  PROVISION_QUEUE,
  EMAIL_QUEUE,
  type EmailJobData,
  type EmailJobResult,
  type ProvisionJobData,
} from './services/queue.js';
import { noteJobCompleted, noteJobFailure } from './services/dead-letter.js';
import { deliverMail, mailDeliverySummary, MailDeliveryError } from './lib/mailer.js';
import {
  PaymentRequiredError,
  provisionInstance,
  reconcileInterruptedInstances,
} from './services/provisioning.js';
import { reconcileInvoicesWithProvider } from './services/billing.js';
import { reconcileWithProvider, releaseStalePromotionReservations, sweepSubscriptions } from './services/billing.js';
import { retryFailedWebhookEvents } from './routes/webhooks.js';
import { pruneSessions } from './plugins/auth.js';
import { audit } from './lib/audit.js';

/**
 * The provisioning worker.
 *
 * Jobs are keyed by instance id, so the same instance is never provisioned
 * twice at the same time, and every step is recorded on the instance so an
 * interrupted run can be reconciled.
 */
const worker = createProvisionWorker(async (job: Job<ProvisionJobData>) => {
  const { instanceId } = job.data;
  const instance = await prisma.instance.findUnique({ where: { id: instanceId } });
  if (!instance) {
    job.log?.('instance no longer exists');
    return;
  }
  if (instance.status === 'ONLINE') {
    job.log?.('instance is already online');
    return;
  }

  try {
    // The last attempt of a job is the end of the road: a run that fails
    // there leaves nothing behind and gives the money of the order back.
    await provisionInstance(instanceId, { final: isLastAttempt(job) });
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      // The order of the instance is not paid. The run is not repeated: the
      // reason is in the journal of the instance and the instance is picked
      // up again as soon as the money of the order arrives.
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
});

worker.on('completed', (job) => {
  console.info(`[worker] job ${job.id} completed`);
  // The job failed and then worked on a later attempt, so the failure that
  // was written down is not a failure any more.
  void noteJobCompleted(PROVISION_QUEUE, job).catch((error) =>
    console.error('[worker] could not close the failure', (error as Error).message),
  );
});
worker.on('failed', (job, error) => {
  console.error(`[worker] job ${job?.id} failed: ${error.message}`);
  // The failure is written down, so it survives the end of the job in the
  // queue and can be put back on the queue by hand.
  void noteJobFailure(PROVISION_QUEUE, job, error).catch((writeError) =>
    console.error('[worker] could not write the failure down', (writeError as Error).message),
  );
});

/**
 * The mail worker.
 *
 * The messages are sent here and not while a request waits for them. A
 * message that keeps failing stays in the failed state of the queue, where it
 * can be read. The name of a job is a hash, so it never carries a token.
 */
const emailWorker = createEmailWorker(async (job: Job<EmailJobData, EmailJobResult>): Promise<EmailJobResult> => {
  try {
    const result = await deliverMail(job.data);
    return { state: result.state, delivered: result.delivered, id: result.id };
  } catch (error) {
    // The class of the failure is part of the message, so the report of the
    // queue shows what kind of problem it was.
    const errorClass = error instanceof MailDeliveryError ? error.errorClass : 'Error';
    throw new Error(`${errorClass}: ${(error as Error).message}`);
  }
});

emailWorker.on('completed', (job) => {
  console.info(`[worker] mail job ${job.id} completed`);
  void noteJobCompleted(EMAIL_QUEUE, job).catch((error) =>
    console.error('[worker] could not close the failure', (error as Error).message),
  );
});
emailWorker.on('failed', (job, error) => {
  console.error(`[worker] mail job ${job?.id} failed: ${error.message}`);
  // The body of the message is never written here: only the name of the
  // message and its kind, so the failure can be read without a message of a
  // customer ending up in the table of the failures.
  void noteJobFailure(EMAIL_QUEUE, job, error).catch((writeError) =>
    console.error('[worker] could not write the failure down', (writeError as Error).message),
  );
});

/** Puts instances that were left running mid-flight back into the queue. */
async function reconcile(): Promise<void> {
  const count = await reconcileInterruptedInstances();
  if (count) {
    console.info(`[worker] requeued ${count} interrupted instance(s)`);
    const stuck = await prisma.instance.findMany({
      where: {
        status: { in: ['PROVISIONING', 'PENDING'] },
        // An instance of an order that is not paid is not put on the queue:
        // the run would refuse it, and it is picked up as soon as the money
        // of the order arrives.
        OR: [{ orderId: null }, { order: { status: { in: ['PAID', 'FULFILLED'] } } }],
      },
      select: { id: true },
      take: 100,
    });
    for (const instance of stuck) {
      await enqueueProvisioning(instance.id, { reason: 'reconciliation' });
    }
    await audit({ action: 'worker.reconciled', meta: { count } });
  }
}

/**
 * Removes finished jobs so the queue does not grow without bound.
 *
 * The jobs that failed are kept for a week, so a failure survives long enough
 * to be read and to be put back on the queue.
 */
async function pruneQueue(): Promise<void> {
  await pruneQueueJobs();
}

/**
 * The billing sweep: renewals, suspensions of services that were not paid
 * for and withdrawals at the end of a paid period.
 */
async function sweepBilling(): Promise<void> {
  const result = await sweepSubscriptions();
  if (result.renewed || result.suspended || result.withdrawn) {
    console.info(
      `[worker] billing sweep: ${result.renewed} renewed, ${result.suspended} suspended, ${result.withdrawn} withdrawn`,
    );
  }
  await reconcileWithProvider().catch(() => undefined);
  // The invoices are compared with the truth of the provider as well, so an
  // invoice that was collected is never left open and an invoice that was
  // never collected is never marked as paid.
  const invoices = await reconcileInvoicesWithProvider().catch(() => null);
  if (invoices && (invoices.paid || invoices.corrected)) {
    console.info(`[worker] invoice reconciliation: ${invoices.paid} paid, ${invoices.corrected} corrected`);
  }
  await releaseStalePromotionReservations().catch(() => undefined);
}

/**
 * The events that the provider could not deliver are retried here, so a
 * failed payment is never lost.
 */
async function retryWebhooks(): Promise<void> {
  const recovered = await retryFailedWebhookEvents().catch(() => 0);
  if (recovered) console.info(`[worker] recovered ${recovered} failed webhook event(s)`);
}

const timers: NodeJS.Timeout[] = [];

/**
 * The worker answers a small health endpoint so the container can report
 * whether it is alive and connected to the database and the queue. Without it
 * the container inherits the API health check, which it can never pass.
 */
const healthPort = Number(env.WORKER_HEALTH_PORT ?? 3101);
const healthServer = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end('{"error":"not found"}');
    return;
  }
  void (async () => {
    const checks = { database: false, redis: false, worker: worker.isRunning() };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }
    try {
      checks.redis = (await redis.ping()) === 'PONG';
    } catch {
      checks.redis = false;
    }
    const healthy = checks.database && checks.redis && checks.worker;
    // The state of the mail is part of the health of the worker: it is the
    // process that really delivers the messages.
    const mail = mailDeliverySummary();
    response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', ...checks, mail: mail.transport, email: mail.counts }));
  })();
});

async function main(): Promise<void> {
  console.info(`[worker] starting in ${env.NODE_ENV}`);
  healthServer.listen(healthPort, '0.0.0.0');
  await reconcile();
  timers.push(setInterval(() => void reconcile().catch((error) => console.error('[worker] reconcile failed', error)), 60_000));
  timers.push(setInterval(() => void pruneQueue().catch(() => undefined), 10 * 60_000));
  timers.push(setInterval(() => void pruneSessions().catch(() => undefined), 60 * 60_000));
  timers.push(setInterval(() => void sweepBilling().catch((error) => console.error('[worker] billing sweep failed', error)), 15 * 60_000));
  timers.push(setInterval(() => void retryWebhooks().catch((error) => console.error('[worker] webhook retry failed', error)), 5 * 60_000));
}

const shutdown = async () => {
  for (const timer of timers) clearInterval(timer);
  healthServer.close();
  await worker.close();
  await emailWorker.close();
  await closeQueue();
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

await main();
