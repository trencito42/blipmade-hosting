import { createServer } from 'node:http';
import { UnrecoverableError, type Job } from 'bullmq';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { env } from './env.js';
import {
  createEmailWorker,
  createMailProvisionWorker,
  createVpsProvisionWorker,
  createProvisionWorker,
  closeQueue,
  enqueueProvisioning,
  enqueueMailProvisioning,
  isLastAttempt,
  pruneQueueJobs,
  PROVISION_QUEUE,
  EMAIL_QUEUE,
  MAIL_PROVISION_QUEUE,
  type EmailJobData,
  type EmailJobResult,
  type MailProvisionJobData,
  type ProvisionJobData,
} from './services/queue.js';
import { noteJobCompleted, noteJobFailure } from './services/dead-letter.js';
import { watchDeadLetterQueue } from './services/dead-letter-monitor.js';
import { reconcileRuntimeState, runtimeStateWarning } from './services/runtime-state.js';
import { deliverMail, mailDeliverySummary, MailDeliveryError } from './lib/mailer.js';
import {
  PaymentRequiredError,
  provisionInstance,
  reconcileInterruptedInstances,
} from './services/provisioning.js';
import { reconcileInvoicesWithProvider } from './services/billing.js';
import { reconcileWithProvider, releaseStalePromotionReservations, sweepSubscriptions } from './services/billing.js';
import { provisionMailService, sweepMailServices } from './services/mail-commerce.js';
import { provisionVps } from './services/vps.js';
import { reconcileDomainRoutes } from './services/domain-routing.js';
import { dispatchPendingEvents } from './services/notification-dispatch.js';
import { runOpsSweep } from './services/ops-health.js';
import { retryFailedWebhookEvents } from './routes/webhooks.js';
import { pruneSessions } from './plugins/auth.js';
import { audit } from './lib/audit.js';
import { createMetricsServer } from './lib/perf-metrics.js';
import { perfConfig } from './lib/perf-config.js';

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

/**
 * The worker of the hosted mail.
 *
 * The mail has a queue of its own, so a mail system that is slow or that is
 * down never holds a deployment of a server hostage, and a server that fails
 * never looks like a failure of the mail.
 */
const mailWorker = createMailProvisionWorker(async (job: Job<MailProvisionJobData>) => {
  const { serviceId } = job.data;
  const service = await prisma.mailService.findUnique({ where: { id: serviceId } });
  if (!service) {
    job.log?.('the mail service no longer exists');
    return;
  }
  const result = await provisionMailService(serviceId);
  job.log?.(`hosted ${result.provisioned} domain(s), ${result.waiting} waiting for a proof`);
  // A service whose domains wait for their proof is not a failure: the
  // customer has to show that the domain is theirs first.
  if (result.failed > 0) {
    throw new Error(`${result.failed} domain(s) of the mail service could not be hosted.`);
  }
});

mailWorker.on('completed', (job) => {
  console.info(`[worker] mail job ${job.id} completed`);
  void noteJobCompleted(MAIL_PROVISION_QUEUE, job).catch((error) =>
    console.error('[worker] could not close the failure', (error as Error).message),
  );
});
mailWorker.on('failed', (job, error) => {
  console.error(`[worker] mail job ${job?.id} failed: ${error.message}`);
  void noteJobFailure(MAIL_PROVISION_QUEUE, job, error).catch((writeError) =>
    console.error('[worker] could not write the failure down', (writeError as Error).message),
  );
});

/** The worker of the virtual private servers. */
const vpsWorker = createVpsProvisionWorker(async (job) => {
  await provisionVps(job.data.serviceId);
});
vpsWorker.on('completed', (job) => console.info(`[worker] vps job ${job.id} completed`));
vpsWorker.on('failed', (job, error) => console.error(`[worker] vps job ${job?.id} failed: ${error.message}`));

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
    // The mail services that were left in the middle of a run are put back on
    // the queue of the mail, which is a queue of its own.
    const stuckMail = await prisma.mailService.findMany({
      where: { status: 'PROVISIONING' },
      select: { id: true },
      take: 50,
    });
    for (const service of stuckMail) {
      await enqueueMailProvisioning(service.id, { reason: 'reconciliation' });
    }
    await audit({ action: 'worker.reconciled', meta: { count } });
  }
}

/**
 * Puts back the routes of the hostnames that were proven.
 *
 * The routes of the customers live in the configuration of the gateway, and
 * that configuration is replaced whenever the gateway is restarted or its file
 * is reloaded. The worker writes the routes again, so a domain that was
 * working keeps working after a change on the edge.
 */
async function reconcileRoutes(): Promise<void> {
  const outcomes = await reconcileDomainRoutes();
  const broken = outcomes.filter((outcome) => !outcome.applied);
  if (broken.length) {
    console.error(
      `[worker] ${broken.length} domain route(s) could not be applied: ${broken
        .map((outcome) => `${outcome.hostname} (${outcome.reason ?? 'unknown reason'})`)
        .join(', ')}`,
    );
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
 * The sweep of the life of the mail.
 *
 * A mail service that was not paid for goes through a period of grace, then
 * it is suspended, and its data is deleted only when the retention ends. The
 * data of a customer is never deleted the moment a payment fails.
 */
async function sweepMail(): Promise<void> {
  const result = await sweepMailServices().catch(() => ({ suspended: 0, deleted: 0 }));
  if (result.suspended || result.deleted) {
    console.info(
      `[worker] mail sweep: ${result.suspended} suspended, ${result.deleted} released after the retention`,
    );
  }
}

/**
 * The sweep of the notifications.
 *
 * The business wrote its events in the outbox and stopped. The worker is the
 * only place that turns an event into a message, so a relay that is down
 * never breaks the request that caused the event: the event waits here and
 * is tried again with a longer pause.
 */
async function sweepNotifications(): Promise<void> {
  const report = await dispatchPendingEvents(25);
  if (report.processed || report.failed) {
    console.info(
      `[worker] notifications: ${report.processed} processed, ${report.failed} failed, ${report.sent} sent, ${report.skipped} skipped`,
    );
  }
}

/**
 * The sweep of the health of the platform.
 *
 * The worker is the only thing of the platform that runs when nothing
 * happens, so it is the only thing that can notice that the machine is
 * running out of room, that the mail server is gone or that a backup did
 * not happen.
 *
 * The sweep does not send an alarm every time it runs. The alarm of a
 * finding that was already reported waits for a pause that grows with every
 * report, so a platform that is broken in one place does not send a hundred
 * mails a day about it.
 */
async function sweepOpsHealth(): Promise<void> {
  const result = await runOpsSweep();
  if (result.sent || result.suppressed) {
    console.info(
      `[worker] the health of the platform: ${result.checks} check(s), ${result.findings} finding(s), ${result.sent} alarm(s) sent, ${result.suppressed} held back`,
    );
  }
}

/**
 * The events that the provider could not deliver are retried here, so a
 * failed payment is never lost.
 */
async function retryWebhooks(): Promise<void> {
  const recovered = await retryFailedWebhookEvents().catch(() => 0);
  if (recovered) console.info(`[worker] recovered ${recovered} failed webhook event(s)`);
}

/**
 * Watches the failures that are waiting for an operator.
 *
 * A job that failed for good is a customer whose service was never given,
 * and the customer must not have to write in to say so: the platform has to
 * say it itself. The watch counts the open failures, says a word the first
 * time a failure appears, and gives the number of the queue to the measures
 * of the process.
 */
async function watchDeadLetters(): Promise<void> {
  const observed = await watchDeadLetterQueue();
  if (observed.pending > 0) {
    console.info(
      `[worker] dead letters waiting for an operator: ${observed.pending} (the highest was ${observed.peakPending})`,
    );
  }
}

/**
 * Asks the node about the containers of the instances and writes down what it
 * says.
 *
 * The state the customer zone shows comes from here, so this run is not a
 * watch of the failures of the operator: it is the truth about the services
 * that were promised. It has a timer of its own and runs every minute, so a
 * service that runs is shown as running long before the customer writes in.
 *
 * The run never breaks an instance: a node that cannot be asked leaves the
 * last known state alone and only says that it is not fresh any more.
 */
async function watchRuntimeState(): Promise<void> {
  const result = await reconcileRuntimeState({ limit: 100 });
  const warning = runtimeStateWarning(result);
  if (warning) console.warn(warning);
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

/**
 * The measures of the worker.
 *
 * The worker is a process of its own, so the measures of the API are not
 * the measures of the worker. The gauge of the dead-letter queue lives in
 * the process that watches the queue, so the worker gives its own measures
 * away: on the loopback of the container, and only to a collector that
 * knows the key.
 */
const metricsServer = createMetricsServer({
  enabled: env.METRICS_ENABLED,
  host: perfConfig.metricsHost,
  port: perfConfig.metricsPort,
  token: perfConfig.metricsToken,
  log: {
    info: (payload: unknown, message?: string) => console.info('[worker]', message ?? '', payload),
    warn: (payload: unknown, message?: string) => console.warn('[worker]', message ?? '', payload),
    error: (payload: unknown, message?: string) => console.error('[worker]', message ?? '', payload),
  },
});
// A port that is taken is a mistake of the address and not a reason to stop
// the worker, so the failure of the listener is written down and swallowed.
void metricsServer.ready.catch(() => undefined);

async function main(): Promise<void> {
  console.info(`[worker] starting in ${env.NODE_ENV}`);
  healthServer.listen(healthPort, '0.0.0.0');
  await reconcile();
  // The routes of the hostnames are put back right away, so a gateway that
  // was restarted while the worker was down serves the customers again
  // without waiting for the first tick.
  await reconcileRoutes().catch((error) => console.error('[worker] the route repair failed', error));
  // The failures that are waiting for an operator are looked at right away,
  // so the queue is known from the first moment of the life of the worker
  // and not only after the first tick.
  await watchDeadLetters().catch((error) => console.error('[worker] the dead-letter watch failed', error));
  // The state of the containers is asked for right away as well, so the
  // customer zone shows what the node says from the first moment.
  await watchRuntimeState().catch((error) => console.error('[worker] the state of the containers could not be read', error));
  timers.push(setInterval(() => void reconcile().catch((error) => console.error('[worker] reconcile failed', error)), 60_000));
  // The routes of the customers are checked every minute: the configuration of
  // the gateway is not a file of the platform, so a change on the edge takes
  // the routes away and this is what brings them back.
  timers.push(setInterval(() => void reconcileRoutes().catch((error) => console.error('[worker] the route repair failed', error)), 60_000));
  timers.push(setInterval(() => void pruneQueue().catch(() => undefined), 10 * 60_000));
  timers.push(setInterval(() => void pruneSessions().catch(() => undefined), 60 * 60_000));
  timers.push(setInterval(() => void sweepBilling().catch((error) => console.error('[worker] billing sweep failed', error)), 15 * 60_000));
  timers.push(setInterval(() => void sweepMail().catch((error) => console.error('[worker] mail sweep failed', error)), 30 * 60_000));
  timers.push(setInterval(() => void retryWebhooks().catch((error) => console.error('[worker] webhook retry failed', error)), 5 * 60_000));
  // The health of the platform is looked at every five minutes: often enough
  // that a problem is seen while it is still small, and rare enough that the
  // machine is not asked the same questions all day.
  timers.push(setInterval(() => void sweepOpsHealth().catch((error) => console.error('[worker] the health sweep failed', error)), 5 * 60_000));
  // The outbox is emptied every five seconds: a message that waits for a
  // customer does not wait for long.
  timers.push(setInterval(() => void sweepNotifications().catch((error) => console.error('[worker] the notification sweep failed', error)), 5_000));
  // The queue of the failures is watched every three minutes: often enough
  // that a failure is seen while the customer is still waiting, and rare
  // enough that the log of the worker stays readable.
  timers.push(setInterval(() => void watchDeadLetters().catch((error) => console.error('[worker] the dead-letter watch failed', error)), 3 * 60_000));
  // The containers are asked about every minute: the customer zone shows
  // what the node says, so the state of a service that runs has to be fresh.
  timers.push(setInterval(() => void watchRuntimeState().catch((error) => console.error('[worker] the state of the containers could not be read', error)), 60_000));
}

const shutdown = async () => {
  for (const timer of timers) clearInterval(timer);
  healthServer.close();
  await metricsServer.close().catch(() => undefined);
  await worker.close();
  await emailWorker.close();
  await mailWorker.close();
  await vpsWorker.close();
  await closeQueue();
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

await main();
