import { connect } from 'node:net';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { fullName } from '../lib/people.js';
import { notifyInstanceProvisioned } from './notifications.js';
import * as ptero from './pterodactyl/application.js';
import * as pteroClient from './pterodactyl/client.js';
import { reconcilePanelIdentity } from './panel/identity.js';
import { renewCustomerCredential, resolveCustomerCredential } from './panel/credentials.js';
import { cancelSubscription, refundPayment } from './stripe.js';
import { starterFiles } from './starter-apps.js';
import type { Instance, Product } from '@prisma/client';
import type { PteroNode, PteroServer } from './pterodactyl/types.js';

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
 * The states of an order in which the money has arrived.
 *
 * An instance is only made for an order in one of these states. An order that
 * is still waiting for its payment, that was cancelled or that failed does
 * not buy a container, so it must never take capacity from a node.
 */
export const PAID_ORDER_STATUSES = ['PAID', 'FULFILLED'] as const;

/** Megabytes in a gigabyte. The panel counts the disk of a node in megabytes. */
const MB_PER_GB = 1024;

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

/**
 * Thrown when the order of an instance is not paid.
 *
 * The run stops before it takes anything from a node, so an unpaid order
 * never leaves a server and never leaves an address behind.
 */
export class PaymentRequiredError extends Error {
  readonly orderNumber: string | null;
  readonly orderStatus: string | null;
  constructor(message: string, orderNumber: string | null = null, orderStatus: string | null = null) {
    super(message);
    this.name = 'PaymentRequiredError';
    this.orderNumber = orderNumber;
    this.orderStatus = orderStatus;
  }
}

/**
 * True when the order of an instance may be provisioned.
 *
 * An instance that belongs to no order at all is not conditioned on a
 * payment: those are the servers a member of the staff imported by hand, and
 * they are paid for outside the platform. An instance that belongs to an
 * order is only provisioned when the money of that order arrived.
 */
export function orderIsPaid(order: { status: string } | null | undefined): boolean {
  if (!order) return true;
  return (PAID_ORDER_STATUSES as readonly string[]).includes(order.status);
}

async function recordEvent(instanceId: string, type: string, message: string): Promise<void> {
  await prisma.instanceEvent.create({ data: { instanceId, type, message } });
}

/**
 * Records that the provisioning was refused because the order is not paid.
 *
 * The reason is written to the journal of the instance and to the audit
 * journal. The same reason is only written once, so a run that is repeated
 * every minute does not fill the journal with the same line.
 */
async function refuseUnpaidProvisioning(instanceId: string, message: string): Promise<void> {
  const last = await prisma.instanceEvent.findFirst({
    where: { instanceId, type: 'refused' },
    orderBy: { createdAt: 'desc' },
    select: { message: true },
  });
  if (last?.message === message) return;

  await recordEvent(instanceId, 'refused', message);
  await audit({
    action: 'instance.provision_refused',
    targetType: 'instance',
    targetId: instanceId,
    meta: { reason: message },
  });

  // The instance goes back to the state it had before the run, so a later
  // run picks it up as soon as the order is paid.
  await prisma.instance
    .updateMany({
      where: { id: instanceId, status: 'PROVISIONING' },
      data: { status: 'PENDING' },
    })
    .catch(() => undefined);
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
/** True when the panel refused the key of the customer. */
function isUnauthenticated(error: unknown): boolean {
  return error instanceof pteroClient.ClientApiError && error.status === 401;
}

/**
 * Runs an operation on the panel with the key of the customer.
 *
 * A key that the panel does not know any more answers 401. That happens when
 * the key was revoked on the panel, for instance because another one was
 * issued for the same account. A new key is asked for and the operation runs a
 * second time, so a deployment does not fail over a key that is not valid any
 * more.
 */
/**
 * Puts the application of the product into a new container.
 *
 * The audit found a sold product whose container held nothing but `.npm/` and
 * `bm-test.txt`, with a start-up command that had nothing to run. The files
 * are written before the container starts, so the command of the egg finds an
 * application to run, and the health check of the deployment has something to
 * answer.
 *
 * The write is safe to repeat: the same files are written again.
 */
async function placeStarterApplication(instance: Instance, server: PteroServer, product: Product): Promise<void> {
  const probe = probeFor(product);
  const files = starterFiles({
    slug: product.slug,
    name: product.name,
    healthPath: probe.kind === 'http' ? (probe.path ?? '/') : '/',
  });

  await withCustomerKey(instance.userId, async (token) => {
    for (const file of files) {
      await pteroClient.writeFile(token, server.uuid, file.path, file.content);
    }
  });

  await recordEvent(instance.id, 'provisioning', `Placed the application of ${product.name} in the container.`);
}

async function withCustomerKey<T>(userId: string, run: (token: string) => Promise<T>): Promise<T> {
  const credential = await resolveCustomerCredential(userId);
  try {
    return await run(pteroClient.clientToken(credential.token));
  } catch (error) {
    if (!isUnauthenticated(error)) throw error;

    const fresh = await renewCustomerCredential(userId);
    try {
      return await run(pteroClient.clientToken(fresh));
    } catch (retryError) {
      if (isUnauthenticated(retryError)) {
        throw new Error('The panel refused the key of the customer.');
      }
      throw retryError;
    }
  }
}

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
 * The capacity a node has left, in megabytes.
 *
 * The panel counts the memory and the disk of a node in megabytes. The plan
 * of an instance counts the memory in megabytes and the disk in gigabytes, so
 * everything is brought to megabytes before the two are compared. Comparing
 * the free disk of a node in megabytes with the disk of an instance in
 * gigabytes was off by a factor of a thousand, so a node that was out of
 * disk by less than a gigabyte was picked all the same.
 */
export interface NodeCapacity {
  freeMemoryMb: number;
  freeDiskMb: number;
}

/** The free capacity of a node, in megabytes. */
export function nodeCapacity(node: PteroNode): NodeCapacity {
  return {
    freeMemoryMb: node.memory + node.memory_overallocate - node.allocated_resources.memory,
    freeDiskMb: node.disk + node.disk_overallocate - node.allocated_resources.disk,
  };
}

/**
 * The resources an instance needs, in the units the panel uses.
 *
 * The memory of an instance is in megabytes, the same unit the panel counts
 * it in. The disk of an instance is in gigabytes, so it is brought to
 * megabytes before it is compared with the free disk of a node. The processor
 * is a share of the processor of the node: the panel counts it in percent, so
 * one vCPU is a hundred percent.
 */
export interface RequiredCapacity {
  memoryMb: number;
  diskMb: number;
  diskGb: number;
  cpuPercent: number;
}

/** The resources an instance needs, in the units the panel uses. */
export function requiredCapacity(instance: { ram: number; disk: number; cpu: number }): RequiredCapacity {
  return {
    memoryMb: instance.ram,
    diskMb: instance.disk * MB_PER_GB,
    diskGb: instance.disk,
    cpuPercent: instance.cpu * 100,
  };
}

/**
 * The reason a node cannot hold the instance.
 *
 * The message names the values and their unit, so the operator reads how
 * much is missing instead of guessing.
 */
export function capacityRefusal(
  node: { id: number; name: string },
  capacity: NodeCapacity,
  required: RequiredCapacity,
): string {
  const parts: string[] = [];
  if (capacity.freeMemoryMb < required.memoryMb) {
    parts.push(
      `${capacity.freeMemoryMb} MB of free memory, but the instance needs ${required.memoryMb} MB of memory`,
    );
  }
  if (capacity.freeDiskMb < required.diskMb) {
    parts.push(
      `${capacity.freeDiskMb} MB of free disk, but the instance needs ${required.diskMb} MB of disk (${required.diskGb} GB)`,
    );
  }
  if (!parts.length) parts.push('the node has no free address left');
  return `Node ${node.id} (${node.name}) cannot hold this instance: ${parts.join('; ')}.`;
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
 *
 * A node is only picked when it really has the room for the instance. The
 * panel does not publish the processor of a node, so the processor of the
 * instance is checked against the limit of the product; the memory and the
 * disk of the node are the two that are compared with the plan.
 */
async function chooseNode(instance: { ram: number; disk: number; cpu: number }, product: Product): Promise<NodeChoice> {
  const required = requiredCapacity(instance);

  if (instance.cpu < 1 || instance.cpu > product.maxCpu) {
    throw new ProvisioningError(
      'node_selected',
      `This configuration asks for ${instance.cpu} vCPU (${required.cpuPercent}%), but ${product.name} allows at most ${product.maxCpu} vCPU.`,
    );
  }

  const nodes = await ptero.listNodes();
  const usable = nodes.filter((node) => !node.maintenance_mode);
  if (!usable.length) throw new ProvisioningError('node_selected', 'No node is available for new instances.');

  const refusals: string[] = [];
  let spare: NodeChoice | null = null;

  for (const node of usable) {
    const capacity = nodeCapacity(node);
    if (capacity.freeMemoryMb < required.memoryMb || capacity.freeDiskMb < required.diskMb) {
      refusals.push(capacityRefusal(node, capacity, required));
      continue;
    }

    const allocations = await ptero.listAllocations(node.id);
    const free = allocations.filter((allocation) => !allocation.assigned);
    if (!free.length) {
      refusals.push(capacityRefusal(node, capacity, required));
      continue;
    }
    const preferred = free.find((allocation) => allocation.port >= 30000);
    if (preferred) return { nodeId: node.id, allocationId: preferred.id };
    if (!spare) spare = { nodeId: node.id, allocationId: free[0]!.id };
  }

  if (spare) return spare;
  throw new ProvisioningError(
    'node_selected',
    `No node has enough free capacity for this configuration. The instance needs ${required.memoryMb} MB of memory and ${required.diskMb} MB of disk (${required.diskGb} GB). ${refusals.join(' ')}`.trim(),
  );
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
 * What an attempt of a provisioning run remembers about the server it made.
 *
 * The attempt is written before the identifiers of the server reach the
 * instance, so a run that is repeated finds the server of the earlier
 * attempt instead of making a second container for the same instance.
 */
interface ServerAttempt {
  serverId: number;
  uuid: string;
  node: number | null;
  allocation: number | null;
  panelUserId: number | null;
}

/** The attempt of an instance that made a server, if there is one. */
async function findServerAttempt(instanceId: string): Promise<ServerAttempt | null> {
  const jobs = await prisma.provisioningJob.findMany({
    where: { instanceId, step: 'server_created' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { payload: true },
  });
  for (const job of jobs) {
    const payload = job.payload as ServerAttempt | null;
    if (payload && typeof payload.serverId === 'number') return payload;
  }
  return null;
}

/**
 * Writes the server of an attempt on the attempt itself.
 *
 * The row of the attempt is the place where the identifier of the container
 * lives until the instance carries it. A write that fails here means the
 * identifier would be lost, so the container is deleted instead of being
 * left on the node.
 */
async function recordServerAttempt(instanceId: string, attempt: ServerAttempt): Promise<void> {
  await prisma.provisioningJob.updateMany({
    where: { instanceId, step: 'server_created', status: 'running' },
    data: { payload: attempt as never },
  });
}

/**
 * True when the panel says that the server does not exist any more.
 *
 * A panel that cannot be reached is not a server that is gone: the run stops
 * in that case, so a second container is never made for the same instance.
 */
function serverIsGone(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 404 || status === '404') return true;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('not found') || message.includes('404');
}

/**
 * Deletes a container that must not stay on the node.
 *
 * The deletion is written to the journal, also when it fails: a container
 * that stays on the node has to be found by an operator.
 */
async function discardServer(
  instanceId: string,
  server: { id: number; uuid: string },
  reason: string,
): Promise<boolean> {
  try {
    await ptero.deleteServer(server.id);
    await recordEvent(instanceId, 'server_deleted', `Deleted the server ${server.id}: ${reason}.`);
    await audit({
      action: 'instance.server_deleted',
      targetType: 'instance',
      targetId: instanceId,
      meta: { serverId: server.id, reason },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordEvent(
      instanceId,
      'server_delete_failed',
      `The server ${server.id} could not be deleted (${reason}): ${message}`,
    );
    await audit({
      action: 'instance.server_delete_failed',
      targetType: 'instance',
      targetId: instanceId,
      meta: { serverId: server.id, reason, error: message },
    });
    return false;
  }
}

/**
 * Writes the identifiers of the server on the instance.
 *
 * The state of the payment of the order is read again in the same transaction
 * that writes the identifiers, so an order that was cancelled while the run
 * was working cannot leave a container behind.
 */
async function storeServerIdentifiers(instance: Instance, created: PteroServer): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (instance.orderId) {
      const order = await tx.order.findUnique({
        where: { id: instance.orderId },
        select: { id: true, number: true, status: true },
      });
      if (!orderIsPaid(order)) {
        throw new PaymentRequiredError(
          `The order ${order?.number ?? instance.orderId} is ${(order?.status ?? 'missing').toLowerCase()}, so no server was made for it.`,
          order?.number ?? null,
          order?.status ?? null,
        );
      }
    }
    await tx.instance.update({
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
  });
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
  kind: 'http' | 'tcp' | 'container';
  path?: string;
  expectStatus?: number[];
  expectBody?: string;
  timeoutMs?: number;
}

export interface DeploymentProbeResult {
  ok: boolean;
  status: number | null;
  reason: string | null;
  /** A line that says what was found, for the log of the instance. */
  message?: string;
}

/** The probe of a product, with the strict defaults. */
export function probeFor(product: Pick<Product, 'healthProbe'>): DeploymentProbe {
  const configured = (product.healthProbe ?? null) as Partial<DeploymentProbe> | null;
  if (configured && configured.kind === 'tcp') {
    return { kind: 'tcp', timeoutMs: configured.timeoutMs ?? 8000 };
  }
  if (configured && configured.kind === 'container') {
    // A product that does not expose a port, like a bot that only talks to
    // another service. There is nothing to answer on the network, so the
    // deployment itself is checked.
    return { kind: 'container', timeoutMs: configured.timeoutMs ?? 8000 };
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

/**
 * Verifies the deployment of a product that does not expose a port.
 *
 * A bot that only talks to another service has nothing to answer on the
 * network, so the check is not "does the app answer" but "is the server really
 * on the node and does the panel manage it". The panel answers with the state
 * of the server, so an answer means the deployment reached the node.
 */
export async function verifyContainerDeployment(
  token: string,
  uuid: string,
  probe: DeploymentProbe = { kind: 'container' },
  options: { attempts?: number; delayMs?: number } = {},
): Promise<DeploymentProbeResult> {
  const attempts = options.attempts ?? 20;
  const delayMs = options.delayMs ?? 3000;

  let lastReason = 'The panel did not answer about the server.';

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const resources = await pteroClient.getResources(token, uuid);
      return {
        ok: true,
        status: null,
        reason: null,
        message: `The server is on the node and the panel manages it (state: ${resources.state}).`,
      };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : 'The panel did not answer about the server.';
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return { ok: false, status: null, reason: lastReason };
}

/**
 * What the compensation of a failed provisioning did.
 *
 * The customer must not pay for a service that does not exist, so a run that
 * failed for good leaves nothing behind: no container on the node, no address
 * taken and the money of the order back with the customer.
 */
export interface CompensationResult {
  /** True when the container of the instance was deleted on the panel. */
  serverDeleted: boolean;
  /** True when the instance holds no address on a node any more. */
  allocationReleased: boolean;
  /** True when the money of the order was returned by the provider. */
  refunded: boolean;
  /** True when the money could not be returned and is due. */
  refundDue: boolean;
  /** The order that was compensated, if the instance belongs to one. */
  orderId: string | null;
}

/**
 * Deletes the container of an instance.
 *
 * Only a container that belongs to this instance is deleted: the identifier
 * comes from the instance itself or from the attempt of this instance, and
 * the panel account of the customer is checked as well.
 */
async function removeServerOfInstance(
  instance: Instance & { user: { pterodactylUserId: string | null } },
): Promise<boolean> {
  const attempt = await findServerAttempt(instance.id);
  const serverId = instance.pterodactylServerId ?? attempt?.serverId ?? null;
  if (serverId === null) {
    await recordEvent(instance.id, 'compensation', 'There was no container to delete.');
    return true;
  }

  let server: PteroServer | null = null;
  try {
    server = await ptero.getServer(serverId);
  } catch (error) {
    if (!serverIsGone(error)) {
      const message = error instanceof Error ? error.message : String(error);
      await recordEvent(
        instance.id,
        'compensation_failed',
        `The panel could not be asked about the server ${serverId}, so nothing was deleted: ${message}`,
      );
      await audit({
        action: 'instance.compensation_failed',
        targetType: 'instance',
        targetId: instance.id,
        meta: { serverId, error: message },
      });
      return false;
    }
  }

  if (!server) {
    // The container is gone already, so the address is free on the node.
    await recordEvent(instance.id, 'compensation', `The server ${serverId} was gone already.`);
    return true;
  }

  const owner = instance.user.pterodactylUserId;
  if (owner !== null && server.user !== Number(owner)) {
    // The container belongs to another panel account: it is never deleted
    // here, because it is not the container of this instance.
    await recordEvent(
      instance.id,
      'compensation_failed',
      `The server ${serverId} belongs to another panel account, so it was not deleted.`,
    );
    await audit({
      action: 'instance.compensation_skipped',
      targetType: 'instance',
      targetId: instance.id,
      meta: { serverId, panelUserId: server.user, owner },
    });
    return false;
  }

  return discardServer(instance.id, { id: server.id, uuid: server.uuid }, 'the provisioning failed');
}

/**
 * Gives the address of the instance back to the node.
 *
 * The instance holds no address and no server any more, so the accounting of
 * the node does not count it.
 */
async function releaseAllocation(instance: Instance): Promise<boolean> {
  if (
    instance.pterodactylServerId === null &&
    instance.pterodactylAllocation === null &&
    instance.pterodactylNodeId === null
  ) {
    return true;
  }
  await prisma.instance.update({
    where: { id: instance.id },
    data: {
      pterodactylServerId: null,
      pterodactylUuid: null,
      pterodactylAllocation: null,
      pterodactylNodeId: null,
    },
  });
  await recordEvent(instance.id, 'compensation', 'The address on the node was given back.');
  return true;
}

/**
 * Stops the subscription of an instance.
 *
 * The service does not exist, so the customer must not be billed for it
 * again.
 */
async function stopSubscriptionOfInstance(
  instance: Instance & { orderItemId: string | null },
): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { instanceId: instance.id },
        ...(instance.orderItemId ? [{ orderItemId: instance.orderItemId }] : []),
      ],
    },
  });
  if (!subscription) return;
  try {
    await cancelSubscription(subscription);
    await recordEvent(instance.id, 'compensation', 'The subscription of the instance was cancelled.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordEvent(
      instance.id,
      'compensation_failed',
      `The subscription of the instance could not be cancelled: ${message}`,
    );
    await audit({
      action: 'instance.compensation_failed',
      targetType: 'instance',
      targetId: instance.id,
      meta: { subscriptionId: subscription.id, error: message },
    });
  }
}

/**
 * Gives the money of the order of a failed instance back to the customer.
 *
 * The order is claimed before the provider is called, the way the
 * administrative refund does it: a job that is delivered a second time finds
 * the order refunded and stops, so the customer is never refunded twice.
 *
 * When the provider cannot be reached the order goes back to what it was and
 * the refund is flagged, so an operator returns the money by hand instead of
 * the platform keeping a payment for a service that does not exist.
 */
async function refundOrderOfInstance(
  instance: Instance & { order: { id: string; number: string; status: string; total: number; currency: string; stripePaymentIntentId: string | null } | null; orderItemId: string | null },
  reason: string,
): Promise<{ refunded: boolean; due: boolean }> {
  const order = instance.order;
  if (!order) {
    await recordEvent(instance.id, 'compensation', 'The instance belongs to no order, so there is nothing to give back.');
    return { refunded: false, due: false };
  }
  if (!orderIsPaid(order)) {
    await recordEvent(
      instance.id,
      'compensation',
      `The order ${order.number} was not paid, so there is nothing to give back.`,
    );
    return { refunded: false, due: false };
  }

  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: { in: ['PAID', 'FULFILLED'] } },
    data: { status: 'REFUNDED', fulfillmentStatus: 'FAILED' },
  });
  if (claimed.count !== 1) {
    await recordEvent(instance.id, 'compensation', `The order ${order.number} was refunded already.`);
    return { refunded: true, due: false };
  }

  const payment =
    order.stripePaymentIntentId
      ? { stripePaymentIntentId: order.stripePaymentIntentId }
      : await prisma.payment.findFirst({
          where: { orderId: order.id, stripePaymentIntentId: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { stripePaymentIntentId: true },
        });

  const refunded = await refundPayment({
    orderId: order.id,
    stripePaymentIntentId: payment?.stripePaymentIntentId ?? null,
    amount: order.total,
    reason: `the provisioning failed: ${reason}`,
  });

  if (!refunded) {
    // The provider could not return the money. The order goes back to what it
    // was, so the money can still be returned by hand, and the refund is
    // flagged in the journal.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: order.status as 'PAID' | 'FULFILLED', fulfillmentStatus: 'FAILED' },
    });
    await recordEvent(
      instance.id,
      'refund_due',
      `The refund of ${order.total} ${order.currency} for the order ${order.number} is due: ${reason}`,
    );
    await audit({
      action: 'order.refund_pending',
      targetType: 'order',
      targetId: order.id,
      meta: { reason, amount: order.total, currency: order.currency, instanceId: instance.id },
    });
    await stopSubscriptionOfInstance(instance);
    return { refunded: false, due: true };
  }

  await recordEvent(instance.id, 'refunded', `The order ${order.number} was refunded.`);
  await audit({
    action: 'order.refunded',
    targetType: 'order',
    targetId: order.id,
    meta: { reason, amount: order.total, currency: order.currency, instanceId: instance.id },
  });
  await stopSubscriptionOfInstance(instance);
  return { refunded: true, due: false };
}

/**
 * Undoes a provisioning that failed for good.
 *
 * Nothing of the failed run may stay behind: the container is deleted from
 * the panel, the address on the node is given back and the money of the order
 * goes back to the customer.
 *
 * The compensation can run twice: a job that is delivered a second time finds
 * the order refunded already and stops, so the customer is never refunded
 * twice. A container that belongs to another instance is never deleted.
 */
export async function compensateFailedProvisioning(instanceId: string, reason: string): Promise<CompensationResult> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: { user: true, order: true },
  });
  if (!instance) {
    return { serverDeleted: false, allocationReleased: false, refunded: false, refundDue: false, orderId: null };
  }

  if (instance.provisionStep === 'activated') {
    // The service was delivered and is running. A run that fails after that
    // does not take the service away from the customer.
    await recordEvent(
      instanceId,
      'compensation_skipped',
      `The instance was already delivered, so nothing was undone: ${reason}`,
    );
    await audit({
      action: 'instance.compensation_skipped',
      targetType: 'instance',
      targetId: instanceId,
      meta: { reason, provisionStep: instance.provisionStep },
    });
    return {
      serverDeleted: false,
      allocationReleased: false,
      refunded: false,
      refundDue: false,
      orderId: instance.orderId,
    };
  }

  await audit({
    action: 'instance.provision_compensated',
    targetType: 'instance',
    targetId: instanceId,
    meta: { reason },
  });

  const serverDeleted = await removeServerOfInstance(instance);
  const allocationReleased = await releaseAllocation(instance);
  const refund = await refundOrderOfInstance(instance, reason);

  await recordEvent(
    instanceId,
    'compensated',
    `The provisioning was undone: ${reason}. Container: ${serverDeleted ? 'deleted' : 'not deleted'}. Address: ${
      allocationReleased ? 'given back' : 'still taken'
    }. Money: ${refund.refunded ? 'refunded' : refund.due ? 'refund due' : 'nothing to give back'}.`,
  );

  return {
    serverDeleted,
    allocationReleased,
    refunded: refund.refunded,
    refundDue: refund.due,
    orderId: instance.orderId,
  };
}

export interface ProvisionOptions {
  domain?: string | null;
  /**
   * True when this run is the last one of the job.
   *
   * A failure on the last attempt is the end of the run: the container is
   * deleted, the address on the node is given back and the money of the order
   * goes back to the customer, so nobody pays for a service that does not
   * exist.
   */
  final?: boolean;
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

    // The money of the order has to have arrived before anything is made.
    // The check is here, in the service every path goes through, and not only
    // in the route that puts the job on the queue: an order that is still
    // waiting for its payment must not leave a server behind.
    if (!orderIsPaid(instance.order)) {
      const message = `The order ${instance.order?.number ?? instance.orderId} is ${(instance.order?.status ?? 'missing').toLowerCase()}, so no server was made for it.`;
      await refuseUnpaidProvisioning(instance.id, message);
      throw new PaymentRequiredError(message, instance.order?.number ?? null, instance.order?.status ?? null);
    }

    await beginProvisioning(instance, 'pterodactyl_user');
    const pterodactylUserId = await ensurePterodactylUser(instance);
    await recordEvent(instance.id, 'provisioning', 'Pterodactyl account ready.');
    await completeStep(instance.id, 'pterodactyl_user');

    // The server may already exist from an earlier attempt.
    let server = instance.pterodactylServerId
      ? await ptero.getServer(instance.pterodactylServerId).catch(() => null)
      : null;

    // The instance has a server, but the panel does not answer. A new server
    // would leave the data of the customer on the old one, so the run stops
    // here and the reason is written on the instance.
    if (!server && instance.pterodactylServerId) {
      throw new ProvisioningError(
        'server_created',
        'The server of this instance exists, but the panel does not answer. The instance was not touched.',
      );
    }

    if (!server) {
      // An earlier attempt of this instance may have made a container already.
      // The attempt is reused, so the same order line and the same unit
      // always end up with the same server and never with two.
      const attempt = await findServerAttempt(instance.id);
      if (attempt) {
        let existing: PteroServer | null = null;
        try {
          existing = await ptero.getServer(attempt.serverId);
        } catch (error) {
          if (!serverIsGone(error)) throw error;
        }
        if (existing) {
          server = existing;
          await recordEvent(instance.id, 'provisioning', `Reused the server ${existing.id} of an earlier attempt.`);
          await storeServerIdentifiers(instance, existing);
          await completeStep(instance.id, 'server_created');
        }
      }
    }

    if (!server) {
      await beginProvisioning(instance, 'node_selected');
      const choice = await chooseNode(instance, product);
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
          disk: instance.disk * MB_PER_GB,
          io: 500,
          // Pterodactyl expresses CPU as a percentage; one vCPU is 100%.
          cpu: instance.cpu * 100,
        },
        resource_limits: {
          memory: instance.ram,
          swap: 0,
          disk: instance.disk * MB_PER_GB,
          io: 500,
          cpu: instance.cpu * 100,
        },
        feature_limits: { databases: 0, backups: 0 },
        // The panel expects the id of the allocation that becomes the primary
        // address, plus the list of assigned allocations.
        allocation: { default: choice.allocationId, allocations: [choice.allocationId] },
      });

      // The attempt is written before the identifiers reach the instance: a
      // run that is repeated finds this container instead of making a second
      // one for the same instance.
      try {
        await recordServerAttempt(instance.id, {
          serverId: created.id,
          uuid: created.uuid,
          node: created.node ?? null,
          allocation: created.allocation ?? null,
          panelUserId: created.user ?? null,
        });
      } catch (error) {
        // The identifier of the container cannot be stored, so the container
        // is deleted instead of being left on the node.
        await discardServer(instance.id, { id: created.id, uuid: created.uuid }, 'the attempt could not be stored');
        throw error;
      }

      try {
        await storeServerIdentifiers(instance, created);
      } catch (error) {
        // An order that is not paid must not keep a container.
        if (error instanceof PaymentRequiredError) {
          await discardServer(instance.id, { id: created.id, uuid: created.uuid }, 'the order is not paid');
        }
        throw error;
      }

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

    // A container that holds no application is not a product. The files of
    // the application are written once the container is installed and before
    // it starts, so the start-up command of the egg finds something to run.
    await placeStarterApplication(instance, server, product);

    if (!done('started')) {
      await beginProvisioning(instance, 'started');
      // An installed container is stopped, so the platform starts it before the
      // service is handed over.
      //
      // The Application API cannot power a server, so this uses the client key
      // of the customer that owns the instance. That key is scoped to the
      // panel account of the customer, so it can only ever start this
      // customer's own server.
      try {
        await withCustomerKey(instance.userId, (token) => pteroClient.sendPower(token, server.uuid, 'start'));
      } catch (error) {
        throw new ProvisioningError(
          'started',
          `The container cannot be started: ${
            error instanceof Error ? error.message : 'the client key of the customer is not available.'
          }`,
        );
      }
      await completeStep(instance.id, 'started');
      await recordEvent(instance.id, 'provisioning', 'Container started.');
    }

    if (!done('health_verified')) {
      await beginProvisioning(instance, 'health_verified');
      const probe = probeFor(product);
      let health: DeploymentProbeResult;
      if (probe.kind === 'container') {
        // The check asks the panel about the server, so the key of the customer
        // is needed here as well.
        try {
          health = await withCustomerKey(instance.userId, (token) =>
            verifyContainerDeployment(token, server.uuid, probe),
          );
        } catch (error) {
          throw new ProvisioningError(
            'health_verified',
            `The server cannot be checked: ${
              error instanceof Error ? error.message : 'the client key of the customer is not available.'
            }`,
          );
        }
      } else {
        health = await verifyDeployment(ip, port, probe);
      }
      if (!health.ok) {
        throw new ProvisioningError('health_verified', health.reason ?? 'The application did not answer as expected.');
      }
      await completeStep(instance.id, 'health_verified');
      await recordEvent(
        instance.id,
        'provisioning',
        health.message ??
          (health.status === null ? 'The service accepted a connection.' : `Application answered with HTTP ${health.status}.`),
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

    // The customer hears that the service is ready. The message follows the
    // preferences of the account and its state is the one of the mailer: while
    // no relay is configured, it is written to a file and nobody receives it.
    const owner = await prisma.user.findUnique({ where: { id: instance.userId } });
    if (owner) {
      await notifyInstanceProvisioned({
        userId: owner.id,
        email: owner.email,
        name: fullName(owner),
        instanceName: instance.name,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof PaymentRequiredError) {
      // The order is not paid: the run stops without touching the node and
      // the reason is written to the journal.
      await refuseUnpaidProvisioning(instanceId, message);
      throw error;
    }

    const step = error instanceof ProvisioningError ? error.step : 'server_created';
    await failProvisioning(instanceId, step, message);

    if (options.final) {
      // This was the last attempt of the job, so the service will never
      // exist: the container is deleted, the address on the node is given
      // back and the money of the order goes back to the customer.
      await compensateFailedProvisioning(instanceId, `${step}: ${message}`).catch((compensationError) => {
        console.error(
          '[provisioning] the compensation of the failed instance failed',
          instanceId,
          (compensationError as Error).message,
        );
      });
    }

    throw error;
  } finally {
    await releaseLock(instanceId);
  }
}

/**
 * Finds instances that were left in a non-terminal state by an interrupted
 * worker and puts them back in the queue.
 *
 * An instance of an order that is not paid is left alone: the run would
 * refuse it anyway, and it is picked up as soon as the money of the order
 * arrives.
 */
export async function reconcileInterruptedInstances(): Promise<number> {
  const stale = new Date(Date.now() - PROVISION_LOCK_TTL_MS);
  const stuck = await prisma.instance.findMany({
    where: {
      status: { in: ['PROVISIONING', 'PENDING'] },
      OR: [{ provisionLockAt: null }, { provisionLockAt: { lt: stale } }],
      AND: [
        {
          OR: [
            { orderId: null },
            { order: { status: { in: [...PAID_ORDER_STATUSES] } } },
          ],
        },
      ],
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
