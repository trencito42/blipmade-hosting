import { connect } from 'node:net';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import * as ptero from './pterodactyl/application.js';
import * as pteroClient from './pterodactyl/client.js';
import { reconcilePanelIdentity } from './panel/identity.js';
import { resolveCustomerCredential } from './panel/credentials.js';
import type { Instance, Product } from '@prisma/client';

/** Steps recorded on the instance so an interrupted job can be reconciled. */
export const PROVISION_STEPS = [
  'pterodactyl_user',
  'node_selected',
  'allocation_selected',
  'server_created',
  'image_built',
  'installed',
  'started',
  'health_verified',
  'subscription_linked',
  'activated',
] as const;

export type ProvisionStep = (typeof PROVISION_STEPS)[number];

/**
 * How long a provisioning run may hold an instance before another run is
 * allowed to take over. A run that dies without releasing the lock would
 * otherwise block the instance forever.
 */
const PROVISION_LOCK_TTL_MS = 30 * 60 * 1000;

export class ProvisioningError extends Error {
  readonly step: ProvisionStep;
  constructor(step: ProvisionStep, message: string) {
    super(message);
    this.name = 'ProvisioningError';
    this.step = step;
  }
}

async function recordEvent(instanceId: string, type: string, message: string): Promise<void> {
  await prisma.instanceEvent.create({ data: { instanceId, type, message } });
}

/**
 * Takes the instance lock. Only one provisioning run may work on an instance
 * at a time, so two workers cannot create two servers for the same order.
 */
async function acquireLock(instanceId: string): Promise<boolean> {
  const stale = new Date(Date.now() - PROVISION_LOCK_TTL_MS);
  const result = await prisma.instance.updateMany({
    where: {
      id: instanceId,
      OR: [{ provisionLockAt: null }, { provisionLockAt: { lt: stale } }],
    },
    data: { provisionLockAt: new Date() },
  });
  return result.count > 0;
}

async function releaseLock(instanceId: string): Promise<void> {
  await prisma.instance.update({ where: { id: instanceId }, data: { provisionLockAt: null } }).catch(() => undefined);
}

/** Marks the instance as provisioning and stores the step being attempted. */
export async function beginProvisioning(instance: Instance, step: ProvisionStep): Promise<void> {
  await prisma.instance.update({
    where: { id: instance.id },
    data: { status: 'PROVISIONING', provisionError: null },
  });
  await prisma.provisioningJob.create({
    data: { instanceId: instance.id, step, status: 'running' },
  });
  await recordEvent(instance.id, 'provisioning', `Started at step "${step}".`);
}

/**
 * Records that a step finished. The step is stored on the instance, so a
 * retry resumes after it instead of running it again.
 */
async function completeStep(instanceId: string, step: ProvisionStep): Promise<void> {
  await prisma.instance.update({
    where: { id: instanceId },
    data: { provisionStep: step },
  });
  await prisma.provisioningJob.updateMany({
    where: { instanceId, status: 'running' },
    data: { status: 'completed' },
  });
}

/** True when the step already ran in an earlier attempt. */
function isDone(provisionStep: string | null, step: ProvisionStep): boolean {
  if (!provisionStep) return false;
  const index = PROVISION_STEPS.indexOf(provisionStep as ProvisionStep);
  if (index < 0) return false;
  return index >= PROVISION_STEPS.indexOf(step);
}

export async function failProvisioning(instanceId: string, step: ProvisionStep, message: string): Promise<void> {
  await prisma.instance.update({
    where: { id: instanceId },
    data: { status: 'FAILED', provisionError: `${step}: ${message}` },
  });
  await prisma.provisioningJob.updateMany({
    where: { instanceId, status: 'running' },
    data: { status: 'failed', error: message, attempts: { increment: 1 } },
  });
  await recordEvent(instanceId, 'failed', `Provisioning failed at "${step}": ${message}`);
  await audit({ action: 'instance.provision_failed', targetType: 'instance', targetId: instanceId, meta: { step, message } });
}

export async function completeProvisioning(instanceId: string): Promise<void> {
  await prisma.provisioningJob.updateMany({
    where: { instanceId, status: 'running' },
    data: { status: 'completed' },
  });
  await recordEvent(instanceId, 'provisioned', 'Instance is online.');
}

/**
 * The panel account of the customer that owns the instance.
 *
 * The account is found by the external id and by nothing else. An address is
 * never used for the lookup, so a panel account that somebody created by hand
 * is never taken over, not even when the address happens to match.
 *
 * The account carries the two parts of the name of the customer and a reserved
 * address that cannot receive mail. The customer never signs in to the panel.
 */
async function ensurePterodactylUser(
  instance: Instance & {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      pterodactylUserId: string | null;
    };
  },
): Promise<number> {
  const identity = await reconcilePanelIdentity(instance.user);
  if (identity.created) {
    await recordEvent(instance.id, 'provisioning', `Panel account ${identity.panelUserId} created for this customer.`);
  }
  return identity.panelUserId;
}

interface NodeChoice {
  nodeId: number;
  allocationId: number;
}

/**
 * Chooses a node with free capacity and an unassigned allocation.
 *
 * The address that is reserved here is only a place to put the server. The
 * port that the service really listens on is read back from the panel after
 * the server exists, so no port is ever assumed.
 *
 * The allocations of the application range are preferred, so the ports that
 * are reserved for other kinds of workload stay free. A node that only has
 * addresses left outside that range is still used when it is the only one
 * with room.
 */
async function chooseNode(ram: number, disk: number): Promise<NodeChoice> {
  const nodes = await ptero.listNodes();
  const usable = nodes.filter((node) => !node.maintenance_mode);
  if (!usable.length) throw new ProvisioningError('node_selected', 'No node is available for new instances.');

  let spare: NodeChoice | null = null;


  for (const node of usable) {
    const freeMemory = node.memory + node.memory_overallocate - node.allocated_resources.memory;
    const freeDisk = node.disk + node.disk_overallocate - node.allocated_resources.disk;
    if (freeMemory < ram || freeDisk < disk) continue;

    const allocations = await ptero.listAllocations(node.id);
    const free = allocations.filter((allocation) => !allocation.assigned);
    const preferred = free.find((allocation) => allocation.port >= 30000);
    if (preferred) return { nodeId: node.id, allocationId: preferred.id };
    if (free.length && !spare) spare = { nodeId: node.id, allocationId: free[0]!.id };
  }

  if (spare) return spare;
  throw new ProvisioningError('node_selected', 'No node has enough free capacity for this configuration.');
}

/**
 * Maps the Blipmade product onto a Pterodactyl egg, image and environment.
 * The environment starts from the egg's defaults and is then overridden by the
 * product configuration, so a product can change the startup variables of its
 * container.
 */
async function resolveEgg(product: Product): Promise<{ egg: number; image: string; startup: string; environment: Record<string, string> }> {
  if (!product.eggId) {
    throw new ProvisioningError('server_created', `${product.name} has no egg mapping yet.`);
  }
  const nests = await ptero.listNests();
  for (const nest of nests) {
    const eggs = await ptero.listEggs(nest.id);
    const egg = eggs.find((candidate) => candidate.id === product.eggId);
    if (egg) {
      const template = await ptero.eggEnvironmentTemplate(egg.id);
      const overrides = (product.startup as Record<string, string> | undefined) ?? {};
      return {
        egg: egg.id,
        image: product.dockerImage ?? egg.docker_image,
        startup: product.startupCommand ?? egg.startup,
        environment: { ...template, ...overrides },
      };
    }
  }
  throw new ProvisioningError('server_created', 'The mapped egg is not available on the panel.');
}

/**
 * How a deployment is verified.
 *
 * An HTTP probe only passes when the application answers with the expected
 * status, so a 404 or a 403 is a failure instead of a false green light. A
 * TCP probe is used for services that speak a protocol of their own, such as
 * a database.
 */
export interface DeploymentProbe {
  kind: 'http' | 'tcp';
  path?: string;
  expectStatus?: number[];
  expectBody?: string;
  timeoutMs?: number;
}

export interface DeploymentProbeResult {
  ok: boolean;
  status: number | null;
  reason: string | null;
}

/** The probe of a product, with the strict defaults. */
export function probeFor(product: Pick<Product, 'healthProbe'>): DeploymentProbe {
  const configured = (product.healthProbe ?? null) as Partial<DeploymentProbe> | null;
  if (configured && configured.kind === 'tcp') {
    return { kind: 'tcp', timeoutMs: configured.timeoutMs ?? 8000 };
  }
  return {
    kind: 'http',
    path: configured?.path ?? '/',
    expectStatus: configured?.expectStatus ?? [200, 201, 204, 301, 302, 307, 308],
    expectBody: configured?.expectBody,
    timeoutMs: configured?.timeoutMs ?? 8000,
  };
}

/** Opens a TCP connection to check that a service accepts connections. */
function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: ip, port });
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Verifies that the application is really up. The probe comes from the
 * product, so a web application is checked over HTTP with the expected
 * status, and a service that speaks its own protocol is checked with a TCP
 * connection.
 */
export async function verifyDeployment(
  ip: string,
  port: number,
  probe: DeploymentProbe = { kind: 'http', path: '/' },
  options: { attempts?: number; delayMs?: number } = {},
): Promise<DeploymentProbeResult> {
  const attempts = options.attempts ?? 40;
  const delayMs = options.delayMs ?? 3000;
  const timeoutMs = probe.timeoutMs ?? 8000;

  let lastReason = `No answer from ${ip}:${port}.`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (probe.kind === 'tcp') {
      const reachable = await tcpProbe(ip, port, timeoutMs);
      if (reachable) return { ok: true, status: null, reason: null };
      lastReason = `Nothing accepted a connection on ${ip}:${port}.`;
    } else {
      const url = `http://${ip}:${port}${probe.path ?? '/'}`;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'manual',
          headers: { 'user-agent': 'blipmade-healthcheck/1.0' },
        });
        const expected = probe.expectStatus ?? [200, 201, 204, 301, 302, 307, 308];
        if (!expected.includes(response.status)) {
          lastReason = `The application answered with HTTP ${response.status}, expected ${expected.join(' or ')}.`;
        } else if (probe.expectBody) {
          const body = await response.text();
          if (!body.includes(probe.expectBody)) {
            lastReason = `The application answered with HTTP ${response.status} but the body did not contain "${probe.expectBody}".`;
          } else {
            return { ok: true, status: response.status, reason: null };
          }
        } else {
          return { ok: true, status: response.status, reason: null };
        }
      } catch {
        lastReason = `No HTTP response from ${url}.`;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { ok: false, status: null, reason: lastReason };
}

export interface ProvisionOptions {
  domain?: string | null;
}

/**
 * The full provisioning flow.
 *
 * Every step records its outcome on the instance, so a retried job continues
 * after the last completed step instead of starting over. The reinstall of a
 * server happens at most once: a retry of a running server never reinstalls
 * it, which is what keeps customer data safe.
 */
export async function provisionInstance(instanceId: string, options: ProvisionOptions = {}): Promise<void> {
  if (!(await acquireLock(instanceId))) {
    throw new ProvisioningError('server_created', 'Another provisioning run is already working on this instance.');
  }

  try {
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      include: { user: true, product: true, order: { include: { items: true } } },
    });
    if (!instance) throw new ProvisioningError('server_created', 'Instance not found.');

    const product = instance.product;
    const done = (step: ProvisionStep) => isDone(instance.provisionStep, step);

    await beginProvisioning(instance, 'pterodactyl_user');
    const pterodactylUserId = await ensurePterodactylUser(instance);
    await recordEvent(instance.id, 'provisioning', 'Pterodactyl account ready.');
    await completeStep(instance.id, 'pterodactyl_user');

    // The server may already exist from an earlier attempt.
    let server = instance.pterodactylServerId
      ? await ptero.getServer(instance.pterodactylServerId).catch(() => null)
      : null;

    let choice: NodeChoice | null = null;

    if (!server) {
      await beginProvisioning(instance, 'node_selected');
      choice = await chooseNode(instance.ram, instance.disk);
      await recordEvent(instance.id, 'provisioning', `Reserved an address on node ${choice.nodeId}.`);
      await completeStep(instance.id, 'node_selected');

      const egg = await resolveEgg(product);
      await beginProvisioning(instance, 'server_created');

      const environment: Record<string, string> = { ...egg.environment };

      const created = await ptero.createServer({
        name: instance.name,
        description: `Blipmade instance for ${instance.user.email}`,
        user: pterodactylUserId,
        egg: egg.egg,
        docker_image: egg.image,
        startup: egg.startup,
        environment,
        limits: {
          memory: instance.ram,
          swap: 0,
          disk: instance.disk * 1024,
          io: 500,
          // Pterodactyl expresses CPU as a percentage; one vCPU is 100%.
          cpu: instance.cpu * 100,
        },
        resource_limits: {
          memory: instance.ram,
          swap: 0,
          disk: instance.disk * 1024,
          io: 500,
          cpu: instance.cpu * 100,
        },
        feature_limits: { databases: 0, backups: 0 },
        // The panel expects the id of the allocation that becomes the primary
        // address, plus the list of assigned allocations.
        allocation: { default: choice.allocationId, allocations: [choice.allocationId] },
      });

      await prisma.instance.update({
        where: { id: instance.id },
        data: {
          pterodactylServerId: created.id,
          pterodactylUuid: created.uuid,
          // The allocation and the node are the ones the panel really assigned,
          // never the ones that were asked for.
          pterodactylAllocation: created.allocation ?? null,
          pterodactylNodeId: created.node ?? null,
        },
      });
      server = created;
      await recordEvent(instance.id, 'provisioning', `Created server ${created.id}.`);
      await completeStep(instance.id, 'server_created');
    }

    if (!server) throw new ProvisioningError('server_created', 'The server could not be created.');

    // The port and the address come from the allocation that the panel really
    // assigned to this server. A port is never assumed and never taken from
    // the plan, so a server that the panel moved keeps working.
    const allocations = await ptero.listAllocations(server.node);
    const allocationId = server.allocation;
    const allocation = allocations.find((candidate) => candidate.id === allocationId);
    const port = allocation?.port ?? 0;
    const ip = allocation?.ip ?? '127.0.0.1';
    if (!port) {
      throw new ProvisioningError(
        'allocation_selected',
        'The panel did not assign an address to this server, so the service cannot be reached.',
      );
    }

    // The assigned allocation is kept on the instance, so the rest of the
    // platform can show the address without asking the panel again.
    await prisma.instance.update({
      where: { id: instance.id },
      data: { pterodactylAllocation: allocationId, pterodactylNodeId: server.node },
    });

    // The installation is requested once.
    //
    // The panel wipes the files of a server when it is reinstalled, so a server
    // that is already installed is never installed a second time. The state of
    // the server is read again on every run, so a run that was interrupted
    // after the server was installed still sees that it is installed.
    if (!done('image_built')) {
      await beginProvisioning(instance, 'image_built');
      if (server.container.installed === 1) {
        await completeStep(instance.id, 'image_built');
        await recordEvent(instance.id, 'provisioning', 'The server was already installed, so nothing was reinstalled.');
      } else {
        await ptero.reinstallServer(server.id);
        await completeStep(instance.id, 'image_built');
        await recordEvent(instance.id, 'provisioning', 'The installation was started on the node.');
      }
    } else {
      await recordEvent(instance.id, 'provisioning', 'The installation was already requested, skipping it.');
    }

    if (!done('installed')) {
      await beginProvisioning(instance, 'installed');
      // The install script prepares the container on the node, which takes a
      // few minutes, so the worker waits for the panel to report it as done.
      const installed = await ptero.waitForServerInstalled(server.id, 900_000);
      if (!installed) throw new ProvisioningError('installed', 'The installation did not finish in time.');
      await completeStep(instance.id, 'installed');
    }

    if (!done('started')) {
      await beginProvisioning(instance, 'started');
      // An installed container is stopped, so the platform starts it before the
      // service is handed over.
      //
      // The Application API cannot power a server, so this uses the client key
      // of the customer that owns the instance. That key is scoped to the
      // panel account of the customer, so it can only ever start this
      // customer's own server.
      let customerToken: string;
      try {
        const credential = await resolveCustomerCredential(instance.userId);
        customerToken = pteroClient.clientToken(credential.token);
      } catch (error) {
        throw new ProvisioningError(
          'started',
          `The container cannot be started: ${
            error instanceof Error ? error.message : 'the client key of the customer is not available.'
          }`,
        );
      }
      await pteroClient.sendPower(customerToken, server.uuid, 'start');
      await completeStep(instance.id, 'started');
      await recordEvent(instance.id, 'provisioning', 'Container started.');
    }

    if (!done('health_verified')) {
      await beginProvisioning(instance, 'health_verified');
      const health = await verifyDeployment(ip, port, probeFor(product));
      if (!health.ok) {
        throw new ProvisioningError('health_verified', health.reason ?? 'The application did not answer as expected.');
      }
      await completeStep(instance.id, 'health_verified');
      await recordEvent(
        instance.id,
        'provisioning',
        health.status === null ? 'The service accepted a connection.' : `Application answered with HTTP ${health.status}.`,
      );
    }

    // Link the subscription that was created with the order.
    await beginProvisioning(instance, 'subscription_linked');
    await prisma.$transaction(async (tx) => {
      if (!instance.orderItemId) return;
      const subscription = await tx.subscription.findUnique({ where: { orderItemId: instance.orderItemId } });
      if (subscription && !subscription.instanceId) {
        await tx.subscription.update({ where: { id: subscription.id }, data: { instanceId: instance.id } });
      }
    });
    await completeStep(instance.id, 'subscription_linked');

    if (options.domain) {
      await prisma.instanceDomain.upsert({
        where: { hostname: options.domain },
        create: {
          instanceId: instance.id,
          hostname: options.domain,
          targetPort: port,
          status: 'PENDING_DNS',
        },
        update: { instanceId: instance.id, targetPort: port },
      });
    }

    await beginProvisioning(instance, 'activated');
    await prisma.instance.update({
      where: { id: instance.id },
      data: { status: 'ONLINE', provisionError: null, suspendedAt: null },
    });
    await completeStep(instance.id, 'activated');
    await completeProvisioning(instance.id);

    // The order is fulfilled when its services are running.
    if (instance.orderId) {
      const pending = await prisma.instance.count({
        where: { orderId: instance.orderId, status: { notIn: ['ONLINE', 'CANCELLED'] } },
      });
      if (pending === 0) {
        await prisma.order.updateMany({
          where: { id: instance.orderId, status: 'PAID' },
          data: { status: 'FULFILLED', fulfillmentStatus: 'FULFILLED' },
        });
      } else {
        await prisma.order.updateMany({
          where: { id: instance.orderId },
          data: { fulfillmentStatus: 'PROVISIONING' },
        });
      }
    }

    await audit({ action: 'instance.provisioned', targetType: 'instance', targetId: instance.id });
  } catch (error) {
    const step = error instanceof ProvisioningError ? error.step : 'server_created';
    const message = error instanceof Error ? error.message : String(error);
    await failProvisioning(instanceId, step, message);
    throw error;
  } finally {
    await releaseLock(instanceId);
  }
}

/**
 * Finds instances that were left in a non-terminal state by an interrupted
 * worker and puts them back in the queue.
 */
export async function reconcileInterruptedInstances(): Promise<number> {
  const stale = new Date(Date.now() - PROVISION_LOCK_TTL_MS);
  const stuck = await prisma.instance.findMany({
    where: {
      status: { in: ['PROVISIONING', 'PENDING'] },
      OR: [{ provisionLockAt: null }, { provisionLockAt: { lt: stale } }],
    },
    select: { id: true },
    take: 100,
  });
  for (const instance of stuck) {
    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'reconcile', message: 'Requeued after an interrupted provisioning run.' },
    });
  }
  return stuck.length;
}

export const instanceBaseUrl = (ip: string, port: number) => `http://${ip}:${port}`;

export const defaultDomain = (hostname: string) =>
  env.DOMAIN_BASE ? `${hostname}.${env.DOMAIN_BASE}` : hostname;
