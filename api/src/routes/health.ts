import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { redisPing } from '../redis.js';
import { mailTransportName } from '../lib/mailer.js';
import { env } from '../env.js';
import * as ptero from '../services/pterodactyl/application.js';
import { getQueue } from '../services/queue.js';

const startedAt = Date.now();

async function databaseOk(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function healthHandler() {
  const [database, redis] = await Promise.all([databaseOk(), redisPing()]);
  return {
    status: database ? 'ok' : 'degraded',
    service: 'blipmade-api',
    version: '1.0.0',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    database,
    redis,
    mail: mailTransportName(),
    stripe: env.stripeEnabled ? 'live' : env.isTest ? 'test' : 'not_configured',
    pterodactyl: env.pterodactylEnabled ? 'configured' : 'not_configured',
    pterodactylClient: env.pterodactylClientEnabled ? 'configured' : 'not_configured',
  };
}

/** Registered both at the root (container health check) and under /api. */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', healthHandler);
}

type ComponentState = 'operational' | 'degraded' | 'down';

interface Component {
  id: string;
  name: string;
  state: ComponentState;
  detail?: string;
}

/**
 * The health of the worker. The worker serves its own endpoint, so the queue
 * is only reported as working when the worker really answers.
 */
async function workerOk(): Promise<{ ok: boolean; detail: string }> {
  const base = (env.WORKER_URL || 'http://worker:3101').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { ok: false, detail: `The worker answered with HTTP ${response.status}.` };
    const body = (await response.json()) as { status?: string };
    return { ok: body.status === 'ok', detail: body.status === 'ok' ? 'The worker is running.' : `The worker reports "${body.status}".` };
  } catch {
    return { ok: false, detail: 'The worker did not answer.' };
  }
}

/** The depth of the provisioning queue. */
async function queueState(): Promise<{ ok: boolean; detail: string }> {
  try {
    const counts = await getQueue().getJobCounts('waiting', 'active', 'failed', 'delayed');
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const failed = counts.failed ?? 0;
    const delayed = counts.delayed ?? 0;
    const detail = `${waiting} waiting, ${active} running, ${delayed} delayed, ${failed} failed.`;
    // A queue that is not moving is a problem even when nothing is down.
    if (failed > 0) return { ok: false, detail };
    return { ok: true, detail };
  } catch {
    return { ok: false, detail: 'The queue could not be read.' };
  }
}

/** How many services are stuck, and for how long. */
async function provisioningState(): Promise<{ ok: boolean; detail: string }> {
  try {
    const stuck = await prisma.instance.count({ where: { status: { in: ['PROVISIONING', 'FAILED'] } } });
    const oldest = await prisma.instance.findFirst({
      where: { status: 'PROVISIONING' },
      orderBy: { updatedAt: 'asc' },
      select: { updatedAt: true },
    });
    const ageMinutes = oldest ? Math.round((Date.now() - oldest.updatedAt.getTime()) / 60000) : 0;
    const detail = stuck
      ? `${stuck} service(s) are not online${ageMinutes ? `, the oldest for ${ageMinutes} minutes` : ''}.`
      : 'Every service is online.';
    return { ok: stuck === 0, detail };
  } catch {
    return { ok: false, detail: 'The provisioning state could not be read.' };
  }
}

/**
 * The nodes are measured through the panel: a node that the panel cannot
 * reach does not answer, and the allocator only has free ports when the node
 * reported its allocations.
 */
async function nodeState(): Promise<{ ok: boolean; detail: string }> {
  try {
    const nodes = await ptero.listNodes();
    if (!nodes.length) return { ok: false, detail: 'The panel does not know any node.' };
    const offline = nodes.filter((node) => node.maintenance_mode);
    const detail = offline.length
      ? `${nodes.length - offline.length} of ${nodes.length} nodes are in maintenance.`
      : `${nodes.length} node(s) are registered.`;
    return { ok: offline.length < nodes.length, detail };
  } catch {
    return { ok: false, detail: 'The nodes could not be read from the panel.' };
  }
}

/** Whether the allocator still has ports for new services. */
async function allocatorState(): Promise<{ ok: boolean; detail: string }> {
  try {
    const nodes = await ptero.listNodes();
    let free = 0;
    for (const node of nodes) {
      const allocations = await ptero.listAllocations(node.id);
      free += allocations.filter((allocation) => !allocation.assigned && allocation.port >= 30000).length;
    }
    return { ok: free > 0, detail: `${free} port(s) are free for new services.` };
  } catch {
    return { ok: false, detail: 'The allocator could not be read.' };
  }
}

/**
 * Public service status.
 *
 * Every component is measured on its own, so a green light means that
 * specific part was actually checked. The page never claims that deployments
 * work just because the panel answers.
 */
export async function registerStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async () => {
    const [database, redis, panel, worker, queue, provisioning, nodes, allocator] = await Promise.all([
      databaseOk(),
      redisPing(),
      ptero.ping(),
      workerOk(),
      queueState(),
      provisioningState(),
      nodeState(),
      allocatorState(),
    ]);

    const components: Component[] = [
      { id: 'api', name: 'Platform API', state: database ? 'operational' : 'down', detail: database ? 'The database answers.' : 'The database does not answer.' },
      { id: 'dashboard', name: 'Dashboard', state: database ? 'operational' : 'down', detail: database ? 'The dashboard reads its data.' : 'The dashboard cannot read its data.' },
      { id: 'cache', name: 'Cache and queues', state: redis ? 'operational' : 'degraded', detail: redis ? 'The cache answers.' : 'The cache does not answer.' },
      { id: 'panel', name: 'Control panel', state: panel ? 'operational' : 'down', detail: panel ? 'The panel answers.' : 'The panel does not answer.' },
      { id: 'worker', name: 'Automation worker', state: worker.ok ? 'operational' : 'down', detail: worker.detail },
      { id: 'queue', name: 'Provisioning queue', state: queue.ok ? 'operational' : 'degraded', detail: queue.detail },
      { id: 'nodes', name: 'Compute nodes', state: nodes.ok ? 'operational' : 'degraded', detail: nodes.detail },
      { id: 'allocator', name: 'Port allocator', state: allocator.ok ? 'operational' : 'degraded', detail: allocator.detail },
      { id: 'provisioning', name: 'Deployments', state: provisioning.ok ? 'operational' : 'degraded', detail: provisioning.detail },
      {
        id: 'support',
        name: 'Support',
        state: mailTransportName() === 'smtp' ? 'operational' : 'degraded',
        detail: mailTransportName() === 'smtp' ? 'Mail is delivered.' : 'Mail is written to a file, not delivered.',
      },
    ];

    const overall = components.some((component) => component.state === 'down')
      ? 'major_outage'
      : components.some((component) => component.state === 'degraded')
        ? 'degraded'
        : 'operational';

    return { overall, components, updatedAt: new Date().toISOString() };
  });
}
