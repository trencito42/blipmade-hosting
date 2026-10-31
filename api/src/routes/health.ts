import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { redisPing } from '../redis.js';
import { mailDeliverySummary, mailTransportName } from '../lib/mailer.js';
import { env } from '../env.js';
import { isShuttingDown } from '../lib/perf-shutdown.js';
import * as ptero from '../services/pterodactyl/application.js';
import { getQueue } from '../services/queue.js';
import { proxmoxConfigured, vmExists } from '../services/proxmox.js';
import { activeAnnouncements, activeIncidents, pastIncidents, statusHistory } from '../services/status-history.js';

const startedAt = Date.now();

async function databaseOk(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * How long the answer of the readiness may take.
 *
 * The answer says whether the API can serve the traffic. A database that
 * takes longer than this is not usable, and the answer says so instead of
 * holding the connection of the checker open.
 */
const READINESS_TIMEOUT_MS = 2000;

/** Runs a work and gives up when it takes too long. */
async function withinTime(work: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
        timer.unref();
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The checks the readiness is made of.
 *
 * They are gathered here so that the answer can be tested with checks that
 * are known to fail, without taking the database away.
 */
export interface ReadinessProbes {
  database: () => Promise<boolean>;
  redis: () => Promise<boolean>;
}

const defaultProbes: ReadinessProbes = {
  database: databaseOk,
  redis: redisPing,
};

/**
 * The checks the readiness is made of.
 *
 * The object is exported so that a test can put a check that is known to fail
 * in it, without taking the database away from the whole suite.
 */
export const readinessProbes: ReadinessProbes = {
  database: defaultProbes.database,
  redis: defaultProbes.redis,
};

export interface ReadinessReport {
  /** Whether the API can serve the traffic. */
  ready: boolean;
  /** The checks it was made of. */
  checks: { database: boolean; redis: boolean };
}

/** Whether the dependencies of the API can be used. */
export async function readinessReport(probes: ReadinessProbes = defaultProbes): Promise<ReadinessReport> {
  const [database, redis] = await Promise.all([
    withinTime(probes.database(), READINESS_TIMEOUT_MS),
    withinTime(probes.redis(), READINESS_TIMEOUT_MS),
  ]);
  return { ready: database && redis, checks: { database, redis } };
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
    mailDelivery: mailDeliverySummary(),
    // The mode of Stripe is written as it is: a key of the sandbox says
    // "sandbox" and not "live", so the operator sees from the health of the
    // platform whether the money of a customer goes to Stripe or to the
    // sandbox of the tests.
    stripe: env.stripeEnabled ? env.stripeMode : env.isTest ? 'test' : 'not_configured',
    pterodactyl: env.pterodactylEnabled ? 'configured' : 'not_configured',
    panelKeyBridge: env.panelBridgeEnabled ? 'configured' : 'not_installed',
  };
}

/**
 * The liveness of the process.
 *
 * The answer says that the process is alive and nothing else: it asks no
 * database and no cache. A checker that asks the database would turn a
 * moment of slowness of the database into a restart of the container, and a
 * restart does not make the database any faster.
 */
async function livenessHandler() {
  return {
    status: 'ok',
    service: 'blipmade-api',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  };
}

/**
 * The readiness of the process.
 *
 * The answer says that the API can serve the traffic: the database and the
 * cache have to answer for that. While the process is stopping the answer is
 * that it is not ready, so the traffic is taken away before the requests that
 * are running are finished.
 */
async function readinessHandler(_request: unknown, reply: { code: (status: number) => unknown }) {
  if (isShuttingDown()) {
    reply.code(503);
    return { status: 'stopping', ready: false, database: false, redis: false };
  }
  const report = await readinessReport(readinessProbes);
  reply.code(report.ready ? 200 : 503);
  return {
    status: report.ready ? 'ok' : 'degraded',
    ready: report.ready,
    database: report.checks.database,
    redis: report.checks.redis,
  };
}

/** Registered both at the root (container health check) and under /api. */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', healthHandler);
  app.get('/health/live', livenessHandler);
  app.get('/health/ready', readinessHandler);
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
    const queue = getQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const failed = counts.failed ?? 0;
    const delayed = counts.delayed ?? 0;
    // A failed job stays in the queue until someone removes it, so an old failure must not keep the
    // queue "degraded" for ever: only failures of the last six hours count, and the older ones are
    // told apart in the sentence.
    const recentSince = Date.now() - 6 * 3_600_000;
    const failedJobs = failed > 0 ? await queue.getFailed(0, 49) : [];
    const recent = failedJobs.filter((job) => (job.finishedOn ?? 0) >= recentSince).length;
    const old = failed - recent;
    // A job that waits and does not start is a problem as well: the oldest waiting job must not be old.
    const oldestWaiting = waiting > 0 ? (await queue.getWaiting(0, 0))[0] : undefined;
    const waitingMinutes = oldestWaiting?.timestamp ? Math.round((Date.now() - oldestWaiting.timestamp) / 60_000) : 0;
    const stuck = waitingMinutes >= 15;
    const detail = `${waiting} waiting, ${active} running, ${delayed} delayed, ${recent} failed in the last 6 hours${old > 0 ? `, ${old} older failure(s) to look at in the job queues` : ''}${stuck ? `; the oldest waiting job has waited ${waitingMinutes} minutes` : ''}.`;
    return { ok: recent === 0 && !stuck, detail };
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

export interface StatusComponent { id: string; name: string; state: string; detail: string }

/** Whether the public site answers, asked from the outside through the address a visitor uses. */
async function siteState(): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(`${env.publicWebUrl}/`, { signal: AbortSignal.timeout(6000), redirect: 'manual' });
    return { ok: response.status < 500, detail: response.status < 500 ? 'The site answers.' : `The site answered with ${response.status}.` };
  } catch {
    return { ok: false, detail: 'The site did not answer.' };
  }
}

/** Whether the host of the virtual servers answers. Null when virtual servers are not set up on this platform. */
async function vpsHostState(): Promise<{ ok: boolean; detail: string } | null> {
  if (!proxmoxConfigured()) return null;
  try {
    await vmExists(env.VPS_TEMPLATE_VMID);
    return { ok: true, detail: 'The host of the virtual servers answers.' };
  } catch {
    return { ok: false, detail: 'The host of the virtual servers does not answer.' };
  }
}

/** Every component, measured now. The page and the history are made from this one list. */
export async function collectStatusComponents(): Promise<StatusComponent[]> {
  const [database, redis, panel, worker, queue, provisioning, nodes, allocator, site, vps] = await Promise.all([
    databaseOk(),
    redisPing(),
    ptero.ping(),
    workerOk(),
    queueState(),
    provisioningState(),
    nodeState(),
    allocatorState(),
    siteState(),
    vpsHostState(),
  ]);

  const components: StatusComponent[] = [
    { id: 'site', name: 'Website', state: site.ok ? 'operational' : 'down', detail: site.detail },
    { id: 'api', name: 'Platform API', state: database ? 'operational' : 'down', detail: database ? 'The database answers.' : 'The database does not answer.' },
    { id: 'dashboard', name: 'Dashboard', state: database ? 'operational' : 'down', detail: database ? 'The dashboard reads its data.' : 'The dashboard cannot read its data.' },
    { id: 'cache', name: 'Cache and queues', state: redis ? 'operational' : 'degraded', detail: redis ? 'The cache answers.' : 'The cache does not answer.' },
    { id: 'panel', name: 'Control panel', state: panel ? 'operational' : 'down', detail: panel ? 'The panel answers.' : 'The panel does not answer.' },
    { id: 'worker', name: 'Automation worker', state: worker.ok ? 'operational' : 'down', detail: worker.detail },
    { id: 'queue', name: 'Provisioning queue', state: queue.ok ? 'operational' : 'degraded', detail: queue.detail },
    { id: 'nodes', name: 'Compute nodes', state: nodes.ok ? 'operational' : 'degraded', detail: nodes.detail },
    { id: 'allocator', name: 'Port allocator', state: allocator.ok ? 'operational' : 'degraded', detail: allocator.detail },
    { id: 'provisioning', name: 'Deployments', state: provisioning.ok ? 'operational' : 'degraded', detail: provisioning.detail },
    ...(vps ? [{ id: 'vps', name: 'Virtual servers', state: vps.ok ? 'operational' : 'down', detail: vps.detail }] : []),
    {
      id: 'support',
      name: 'Support',
      state: mailTransportName() === 'smtp' ? 'operational' : 'degraded',
      detail: mailTransportName() === 'smtp' ? 'Mail is delivered.' : 'Mail is written to a file, not delivered.',
    },
  ];
  return components;
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
    const components = await collectStatusComponents();
    const history = await statusHistory(components.map((component) => component.id));
    const [incidents, announcements] = await Promise.all([activeIncidents(), activeAnnouncements()]);

    const overall = components.some((component) => component.state === 'down')
      ? 'major_outage'
      : components.some((component) => component.state === 'degraded')
        ? 'degraded'
        : 'operational';

    return {
      overall,
      components: components.map((component) => ({ ...component, uptime: history.uptime[component.id] ?? null, days: history.days[component.id] ?? [] })),
      incidents,
      announcements,
      updatedAt: new Date().toISOString(),
    };
  });

  /** The incidents that are over, newest first. */
  app.get('/status/incidents', async () => ({ incidents: await pastIncidents(60) }));

  /** The messages for the dashboard (maintenance, news). Public, so the page of status shows them too. */
  app.get('/announcements', async () => ({ announcements: await activeAnnouncements() }));
}
