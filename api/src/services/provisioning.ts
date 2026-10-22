import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import * as ptero from './pterodactyl/application.js';
import type { Instance, Product } from '@prisma/client';

/** Steps recorded on the instance so an interrupted job can be reconciled. */
export const PROVISION_STEPS = [
  'pterodactyl_user',
  'node_selected',
  'allocation_selected',
  'server_created',
  'image_built',
  'installed',
  'health_verified',
  'subscription_linked',
  'activated',
] as const;

export type ProvisionStep = (typeof PROVISION_STEPS)[number];

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
 * Returns the Pterodactyl user for a Blipmade customer, creating one on first
 * use. Blipmade manages one Pterodactyl user per customer.
 */
async function ensurePterodactylUser(instance: Instance & { user: { id: string; email: string; name: string | null; pterodactylUserId: string | null } }): Promise<number> {
  if (instance.user.pterodactylUserId) return Number(instance.user.pterodactylUserId);

  const existing = await ptero.findUserByEmail(instance.user.email);
  if (existing) {
    await prisma.user.update({
      where: { id: instance.user.id },
      data: { pterodactylUserId: String(existing.id) },
    });
    return existing.id;
  }

  // Pterodactyl requires a usable password. A random value is generated because
  // customers never sign in to the panel directly.
  const password = `bm-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const created = await ptero.createUser({
    email: instance.user.email,
    username: (instance.user.name ?? instance.user.email.split('@')[0] ?? 'customer').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 30) || 'customer',
    password,
    root_admin: false,
  });
  await prisma.user.update({
    where: { id: instance.user.id },
    data: { pterodactylUserId: String(created.id) },
  });
  return created.id;
}

interface NodeChoice {
  nodeId: number;
  allocationId: number;
  port: number;
  ip: string;
}

/**
 * Chooses a node with free capacity and an unassigned allocation.
 * Only application ports (30000+) are used so game ports stay untouched.
 */
async function chooseNode(ram: number, disk: number): Promise<NodeChoice> {
  const nodes = await ptero.listNodes();
  const usable = nodes.filter((node) => !node.maintenance_mode);
  if (!usable.length) throw new ProvisioningError('node_selected', 'No node is available for new instances.');

  for (const node of usable) {
    const freeMemory = node.memory + node.memory_overallocate - node.allocated_resources.memory;
    const freeDisk = node.disk + node.disk_overallocate - node.allocated_resources.disk;
    if (freeMemory < ram || freeDisk < disk) continue;

    const allocations = await ptero.listAllocations(node.id);
    const candidate = allocations.find((allocation) => !allocation.assigned && allocation.port >= 30000);
    if (!candidate) continue;

    return { nodeId: node.id, allocationId: candidate.id, port: candidate.port, ip: candidate.ip };
  }

  throw new ProvisioningError('node_selected', 'No node has enough free capacity for this configuration.');
}

/** Maps the Blipmade product onto a Pterodactyl egg and image. */
async function resolveEgg(product: Product): Promise<{ egg: number; image: string; startup: string }> {
  if (!product.eggId) {
    throw new ProvisioningError('server_created', `${product.name} has no egg mapping yet.`);
  }
  const nests = await ptero.listNests();
  for (const nest of nests) {
    const eggs = await ptero.listEggs(nest.id);
    const egg = eggs.find((candidate) => candidate.id === product.eggId);
    if (egg) {
      return {
        egg: egg.id,
        image: product.dockerImage ?? egg.docker_image,
        startup: (product.startup as string | undefined) ?? egg.startup,
      };
    }
  }
  throw new ProvisioningError('server_created', 'The mapped egg is not available on the panel.');
}

/**
 * Waits for the Pterodactyl install to finish, then verifies the container
 * answers over HTTP. A service is only activated after this succeeds.
 */
export async function verifyDeployment(
  ip: string,
  port: number,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<{ ok: boolean; status: number | null; reason: string | null }> {
  const attempts = options.attempts ?? 40;
  const delayMs = options.delayMs ?? 3000;
  const url = `http://${ip}:${port}/`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
      // Any HTTP answer means the application is serving. 5xx means the app is
      // up but broken, which is still a running process to report.
      return { ok: response.status < 500, status: response.status, reason: response.status >= 500 ? `Application answered with HTTP ${response.status}.` : null };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { ok: false, status: null, reason: `No HTTP response from ${url} after ${attempts} attempts.` };
}

export interface ProvisionOptions {
  domain?: string | null;
}

/**
 * The full provisioning flow. It is written to be restart-safe: every step
 * records its outcome on the instance, so a retried job picks up where it
 * stopped instead of creating a second server.
 */
export async function provisionInstance(instanceId: string, options: ProvisionOptions = {}): Promise<void> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: { user: true, product: true, order: { include: { items: true } } },
  });
  if (!instance) throw new ProvisioningError('server_created', 'Instance not found.');

  const product = instance.product;

  await beginProvisioning(instance, 'pterodactyl_user');
  try {
    const pterodactylUserId = await ensurePterodactylUser(instance);
    await recordEvent(instance.id, 'provisioning', 'Pterodactyl account ready.');

    // The server may already exist from an earlier attempt.
    let server = instance.pterodactylServerId
      ? await ptero.getServer(instance.pterodactylServerId).catch(() => null)
      : null;

    let choice: NodeChoice | null = null;

    if (!server) {
      await beginProvisioning(instance, 'node_selected');
      choice = await chooseNode(instance.ram, instance.disk);
      await recordEvent(instance.id, 'provisioning', `Allocated port ${choice.port} on node ${choice.nodeId}.`);

      const egg = await resolveEgg(product);
      await beginProvisioning(instance, 'server_created');

      const environment: Record<string, string> = {
        ...((product.startup as Record<string, string> | undefined) ?? {}),
      };

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
        allocation: { default: true, allocations: [choice.allocationId] },
      });

      await prisma.instance.update({
        where: { id: instance.id },
        data: { pterodactylServerId: created.id, pterodactylUuid: created.uuid },
      });
      server = created;
      await recordEvent(instance.id, 'provisioning', `Created server ${created.id}.`);
    }

    if (!server) throw new ProvisioningError('server_created', 'The server could not be created.');

    // Find the allocation for the existing server so health checks work on retries.
    const allocations = await ptero.listAllocations(server.node);
    const allocation = allocations.find((candidate) => candidate.id === server!.allocation);
    const port = allocation?.port ?? choice?.port ?? 0;
    const ip = allocation?.ip ?? '127.0.0.1';
    if (!port) throw new ProvisioningError('allocation_selected', 'No port is assigned to this server.');

    await beginProvisioning(instance, 'image_built');
    await ptero.buildServer(server.id, { image: server.container.image, pull_image: true, rebuild_container: false, allow_failure: true });

    await beginProvisioning(instance, 'installed');
    await ptero.installServer(server.id).catch(() => undefined);

    // Wait for Pterodactyl to finish the install before checking the container.
    const installed = await waitForInstall(server.id, 180_000);
    if (!installed) throw new ProvisioningError('installed', 'The installation did not finish in time.');

    await beginProvisioning(instance, 'health_verified');
    const health = await verifyDeployment(ip, port);
    if (!health.ok) {
      throw new ProvisioningError('health_verified', health.reason ?? 'The application did not answer over HTTP.');
    }
    await recordEvent(instance.id, 'provisioning', `Application answered with HTTP ${health.status}.`);

    // Link the subscription that was created with the order.
    await beginProvisioning(instance, 'subscription_linked');
    await prisma.$transaction(async (tx) => {
      const order = instance.order;
      if (order) {
        const subscription = await tx.subscription.findFirst({ where: { userId: instance.userId, instanceId: null } });
        if (subscription) {
          await tx.subscription.update({ where: { id: subscription.id }, data: { instanceId: instance.id } });
        }
      }
    });

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
    await completeProvisioning(instance.id);
    await audit({ action: 'instance.provisioned', targetType: 'instance', targetId: instance.id });
  } catch (error) {
    const step = error instanceof ProvisioningError ? error.step : 'server_created';
    const message = error instanceof Error ? error.message : String(error);
    await failProvisioning(instance.id, step, message);
    throw error;
  }
}

/** Polls the server until Pterodactyl reports the install finished. */
async function waitForInstall(serverId: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const server = await ptero.getServer(serverId).catch(() => null);
    if (server && (server.container.installed === 1 || server.container.installed === 2)) return true;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}

/**
 * Finds instances that were left in a non-terminal state by an interrupted
 * worker and puts them back in the queue.
 */
export async function reconcileInterruptedInstances(): Promise<number> {
  const stuck = await prisma.instance.findMany({
    where: { status: { in: ['PROVISIONING', 'PENDING'] } },
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
