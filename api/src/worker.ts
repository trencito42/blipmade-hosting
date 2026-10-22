import { createServer } from 'node:http';
import type { Job } from 'bullmq';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { env } from './env.js';
import { createProvisionWorker, closeQueue, enqueueProvisioning, getQueue } from './services/queue.js';
import { provisionInstance, reconcileInterruptedInstances } from './services/provisioning.js';
import { pruneSessions } from './plugins/auth.js';
import { audit } from './lib/audit.js';

/**
 * The provisioning worker.
 *
 * Jobs are keyed by instance id, so the same instance is never provisioned
 * twice at the same time, and every step is recorded on the instance so an
 * interrupted run can be reconciled.
 */
const worker = createProvisionWorker(async (job: Job<{ instanceId: string; reason?: string }>) => {
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

  await provisionInstance(instanceId);
});

worker.on('completed', (job) => {
  console.info(`[worker] job ${job.id} completed`);
});
worker.on('failed', (job, error) => {
  console.error(`[worker] job ${job?.id} failed: ${error.message}`);
});

/** Puts instances that were left running mid-flight back into the queue. */
async function reconcile(): Promise<void> {
  const count = await reconcileInterruptedInstances();
  if (count) {
    console.info(`[worker] requeued ${count} interrupted instance(s)`);
    const stuck = await prisma.instance.findMany({
      where: { status: { in: ['PROVISIONING', 'PENDING'] } },
      select: { id: true },
      take: 100,
    });
    for (const instance of stuck) {
      await enqueueProvisioning(instance.id, { reason: 'reconciliation' });
    }
    await audit({ action: 'worker.reconciled', meta: { count } });
  }
}

/** Removes finished jobs so the queue does not grow without bound. */
async function pruneQueue(): Promise<void> {
  const queue = getQueue();
  await queue.clean(0, 1000, 'completed');
  await queue.clean(0, 1000, 'failed');
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
    response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', ...checks }));
  })();
});

async function main(): Promise<void> {
  console.info(`[worker] starting in ${env.NODE_ENV}`);
  healthServer.listen(healthPort, '0.0.0.0');
  await reconcile();
  timers.push(setInterval(() => void reconcile().catch((error) => console.error('[worker] reconcile failed', error)), 60_000));
  timers.push(setInterval(() => void pruneQueue().catch(() => undefined), 10 * 60_000));
  timers.push(setInterval(() => void pruneSessions().catch(() => undefined), 60 * 60_000));
}

const shutdown = async () => {
  for (const timer of timers) clearInterval(timer);
  healthServer.close();
  await worker.close();
  await closeQueue();
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

await main();
