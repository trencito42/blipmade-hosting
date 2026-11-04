import { randomUUID } from 'node:crypto';
import type { Instance } from '@prisma/client';
import { prisma } from '../db.js';
import { installArchive, installGit } from './git-deploy.js';
import {
  IMPORT_MAX_ATTEMPTS,
  afterDeployObservation,
  afterQueueAttempt,
  deployOutcomeFromMessage,
  fulfillmentAllowed,
  orderFulfillmentDecision,
  queuedImportIsStale,
  zipShouldPurge,
  type ApplicationHealth,
} from './import-lifecycle.js';
import { notifyInstanceProvisioned } from './notifications.js';
import { importMayBuild } from './project-links.js';
import { linkImportDependencies } from './project-links-apply.js';
import { probeApplicationHealth } from './deploy-health.js';
import * as operations from './panel/operations.js';
import { currentGitDeploy, enqueueGitDeploy } from './queue.js';

type OpenImport = {
  id: string;
  userId: string;
  instanceId: string | null;
  kind: string;
  phase: string;
  repoUrl: string | null;
  branch: string | null;
  buildCommand: string;
  startCommand: string;
  deployId: string | null;
  attempts: number;
  appliedAt: Date | null;
  confirmedServices: string[];
  servicesLinkedAt: Date | null;
  lastError: string | null;
  zipBytes: Uint8Array | null;
  productSlug: string;
};

function importIdFromConfig(config: unknown): string | null {
  const value = (config as { importSourceId?: unknown } | null)?.importSourceId;
  return typeof value === 'string' && value ? value : null;
}

/** Keeps ImportSource.instanceId aligned with the server that owns the order line. */
export async function linkImportSourceToOrderItem(instance: { id: string; userId: string; orderItemId: string | null }): Promise<void> {
  if (!instance.orderItemId) return;
  const item = await prisma.orderItem.findUnique({ where: { id: instance.orderItemId }, select: { config: true } });
  const importSourceId = importIdFromConfig(item?.config);
  if (!importSourceId) return;
  await prisma.importSource.updateMany({
    where: { id: importSourceId, userId: instance.userId },
    data: { instanceId: instance.id },
  });
}

async function openImportForInstance(instance: { id: string; userId: string; orderItemId: string | null }): Promise<OpenImport | null> {
  if (!instance.orderItemId) return null;
  const item = await prisma.orderItem.findUnique({ where: { id: instance.orderItemId }, select: { config: true } });
  const importSourceId = importIdFromConfig(item?.config);
  if (!importSourceId) return null;
  const source = await prisma.importSource.findFirst({ where: { id: importSourceId, userId: instance.userId } });
  if (!source || source.appliedAt) return null;
  return source;
}

/** Removes archives that were applied or that have passed their retention time. */
export async function purgeExpiredImportArchives(now = new Date()): Promise<number> {
  const rows = await prisma.importSource.findMany({
    where: { zipBytesLength: { gt: 0 } },
    select: { id: true, zipBytesLength: true, zipExpiresAt: true, appliedAt: true },
    take: 200,
  });
  const ids = rows
    .filter((row) => zipShouldPurge({ bytes: row.zipBytesLength, expiresAt: row.zipExpiresAt?.getTime() ?? null, appliedAt: row.appliedAt?.getTime() ?? null }, now.getTime()))
    .map((row) => row.id);
  if (!ids.length) return 0;
  await prisma.importSource.updateMany({ where: { id: { in: ids } }, data: { zipBytes: null, zipBytesLength: 0 } });
  return ids.length;
}

async function importAttached(instance: { orderItemId: string | null }): Promise<boolean> {
  if (!instance.orderItemId) return false;
  const item = await prisma.orderItem.findUnique({ where: { id: instance.orderItemId }, select: { config: true } });
  return importIdFromConfig(item?.config) !== null;
}

/** The order stays unfulfilled until every remaining application is ready. appliedAt is not readiness. */
export async function syncOrderFulfillment(orderId: string): Promise<void> {
  const instances = await prisma.instance.findMany({
    where: { orderId },
    select: { id: true, userId: true, status: true, applicationReadyAt: true, orderItemId: true },
  });
  const flags = [];
  for (const instance of instances) {
    const attached = instance.applicationReadyAt ? false : await importAttached(instance);
    flags.push({
      cancelled: instance.status === 'CANCELLED',
      online: instance.status === 'ONLINE' || instance.status === 'RESTARTING' || instance.status === 'DEGRADED',
      applicationReady: fulfillmentAllowed({
        cancelled: instance.status === 'CANCELLED',
        applicationReady: Boolean(instance.applicationReadyAt),
        importAttached: attached,
      }),
    });
  }
  const decision = orderFulfillmentDecision({ instances: flags });
  if (decision === 'FULFILLED') {
    await prisma.order.updateMany({
      where: { id: orderId, status: 'PAID' },
      data: { status: 'FULFILLED', fulfillmentStatus: 'FULFILLED' },
    });
    return;
  }
  await prisma.order.updateMany({
    where: { id: orderId, status: 'PAID' },
    data: { fulfillmentStatus: 'PROVISIONING' },
  });
}

async function probeApplication(instance: Instance, productSlug: string) {
  return probeApplicationHealth(instance, productSlug);
}

async function rememberOutcome(instance: Instance, source: OpenImport, observed: { state: 'succeeded' | 'failed' | 'building' | 'none'; message: string }, health: ApplicationHealth): Promise<void> {
  if (source.appliedAt && instance.applicationReadyAt) {
    if (instance.orderId) await syncOrderFulfillment(instance.orderId);
    return;
  }
  if (source.appliedAt && !instance.applicationReadyAt) {
    if (health !== 'ready') {
      await prisma.instance.update({
        where: { id: instance.id },
        data: { applicationError: 'The import was recorded before the application was marked ready, and the health check has not passed.' },
      });
      if (instance.orderId) await syncOrderFulfillment(instance.orderId);
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.instance.update({ where: { id: instance.id }, data: { applicationReadyAt: new Date(), applicationError: null } });
      await tx.orderItem.updateMany({
        where: { instances: { some: { id: instance.id } } },
        data: { fulfillmentStatus: 'FULFILLED', fulfillmentError: null },
      });
    });
    if (instance.orderId) await syncOrderFulfillment(instance.orderId);
    await notifyInstanceProvisioned({ userId: instance.userId, instanceName: instance.name, occurrence: new Date() });
    return;
  }
  const decision = afterDeployObservation({ deployState: observed.state, health, attempts: source.attempts });
  const ready = importMayBuild({ confirmed: source.confirmedServices.length, linked: Boolean(source.servicesLinkedAt) });
  if (decision.fulfill && !ready.build) {
    await prisma.importSource.update({
      where: { id: source.id },
      data: { phase: 'pending', appliedAt: null, lastError: ready.reason },
    });
    await prisma.instance.update({
      where: { id: instance.id },
      data: { applicationReadyAt: null, applicationError: ready.reason },
    });
    return;
  }
  if (!decision.fulfill) {
    await prisma.importSource.update({
      where: { id: source.id },
      data: { phase: decision.phase, appliedAt: null, lastError: decision.error },
    });
    await prisma.instance.update({
      where: { id: instance.id },
      data: { applicationError: decision.error ?? observed.message },
    });
    if (decision.error && decision.error !== source.lastError) {
      await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: decision.error } });
    }
    if (instance.orderId) await syncOrderFulfillment(instance.orderId);
    return;
  }
  const committed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.importSource.updateMany({
      where: { id: source.id, appliedAt: null },
      data: { phase: 'applied', appliedAt: new Date(), lastError: null, zipBytes: null, zipBytesLength: 0 },
    });
    if (claimed.count !== 1) return false;
    await tx.instance.update({ where: { id: instance.id }, data: { applicationReadyAt: new Date(), applicationError: null } });
    await tx.orderItem.updateMany({
      where: { instances: { some: { id: instance.id } } },
      data: { fulfillmentStatus: 'FULFILLED', fulfillmentError: null },
    });
    return true;
  });
  if (!committed) {
    if (instance.orderId) await syncOrderFulfillment(instance.orderId);
    return;
  }
  if (instance.orderId) await syncOrderFulfillment(instance.orderId);
  await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: 'The imported application is built and answered its health check.' } });
  await notifyInstanceProvisioned({ userId: instance.userId, instanceName: instance.name, occurrence: new Date() });
}

/** Records the result of the deployment job. A successful queue submission is not an applied import. */
export async function settleImportedDeploy(instanceId: string, deployId: string, result: { state: string; message: string }): Promise<void> {
  const instance = await prisma.instance.findUnique({ where: { id: instanceId }, include: { product: { select: { slug: true } } } });
  if (!instance) return;
  const source = await prisma.importSource.findFirst({ where: { instanceId, deployId, userId: instance.userId } });
  if (!source) return;
  if (source.appliedAt && instance.applicationReadyAt) {
    if (instance.orderId) await syncOrderFulfillment(instance.orderId);
    return;
  }
  const state = source.appliedAt ? 'succeeded' : result.state === 'succeeded' || result.state === 'failed' ? result.state : 'none';
  const health = state === 'succeeded' ? await probeApplication(instance, source.productSlug || instance.product.slug) : 'unknown';
  await rememberOutcome(instance, source, { state, message: result.message }, health);
}

/**
 * Hands the approved project to the customer container.
 * appliedAt stays empty until that deployment succeeds and the health check passes.
 * A queue refusal is recorded and can be tried again.
 */
export async function applyStoredImport(instance: Instance): Promise<void> {
  if (!instance.orderItemId || !instance.pterodactylUuid || !instance.pterodactylServerId) return;
  const source = await openImportForInstance(instance);
  if (!source) return;
  if (source.phase === 'applied' || source.appliedAt) return;
  if (source.phase === 'queued' || source.phase === 'checking') return;
  if (source.phase === 'failed' && source.attempts >= IMPORT_MAX_ATTEMPTS) return;

  if (source.confirmedServices.length > 0) {
    await linkImportDependencies(source.id);
  }
  const dependencies = importMayBuild({ confirmed: source.confirmedServices.length, linked: Boolean(source.servicesLinkedAt) });
  if (!dependencies.build) {
    await prisma.importSource.update({
      where: { id: source.id },
      data: { instanceId: instance.id, phase: 'pending', deployId: null, lastError: dependencies.reason },
    });
    await prisma.instance.update({ where: { id: instance.id }, data: { applicationError: dependencies.reason } });
    return;
  }

  const deployId = randomUUID();
  try {
    await prisma.importSource.update({
      where: { id: source.id },
      data: { instanceId: instance.id, deployId, phase: 'queued', appliedAt: null, lastError: null },
    });
    const owned = await operations.loadOwnedInstance(instance.userId, instance.id);
    if (source.kind === 'git' && source.repoUrl) {
      const installed = await installGit(owned, {
        repoUrl: source.repoUrl,
        branch: source.branch || 'main',
        buildCommand: source.buildCommand,
        startCommand: source.startCommand,
      }, null);
      await prisma.gitDeploy.upsert({
        where: { instanceId: instance.id },
        create: { instanceId: instance.id, repoUrl: source.repoUrl, branch: source.branch || 'main', buildCommand: source.buildCommand, startCommand: source.startCommand, previousStartup: installed.previousStartup },
        update: { repoUrl: source.repoUrl, branch: source.branch || 'main', buildCommand: source.buildCommand, startCommand: source.startCommand },
      });
    } else if (source.kind === 'zip' && source.zipBytes) {
      const installed = await installArchive(owned, { buildCommand: source.buildCommand, startCommand: source.startCommand }, Buffer.from(source.zipBytes));
      await prisma.gitDeploy.upsert({
        where: { instanceId: instance.id },
        create: { instanceId: instance.id, repoUrl: 'archive://project', branch: 'upload', buildCommand: source.buildCommand, startCommand: source.startCommand, previousStartup: installed.previousStartup },
        update: { repoUrl: 'archive://project', branch: 'upload', buildCommand: source.buildCommand, startCommand: source.startCommand },
      });
    } else if (source.kind === 'zip') {
      await prisma.importSource.update({
        where: { id: source.id },
        data: { phase: 'failed', deployId: null, appliedAt: null, lastError: 'The archive expired before the server was ready.' },
      });
      await prisma.instance.update({ where: { id: instance.id }, data: { applicationError: 'The archive expired before the server was ready.' } });
      return;
    } else {
      await prisma.importSource.update({ where: { id: source.id }, data: { phase: 'pending', deployId: null } });
      return;
    }
    const action = source.kind === 'zip' ? 'archive' : 'build';
    const accepted = await enqueueGitDeploy({ instanceId: instance.id, deployId, action, by: 'import' });
    const queued = afterQueueAttempt(accepted);
    if (!accepted) {
      const running = await currentGitDeploy(instance.id);
      if (running?.deployId === deployId) return;
      await prisma.importSource.update({
        where: { id: source.id },
        data: { phase: queued.phase, deployId: null, appliedAt: null, lastError: queued.error },
      });
      await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: queued.error ?? 'The deployment queue did not accept the job.' } });
      return;
    }
    await prisma.importSource.update({
      where: { id: source.id },
      data: { phase: 'queued', deployId, appliedAt: null, attempts: { increment: 1 }, lastError: null },
    });
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: 'The imported project was queued on this server. It is not applied until the build and the health check succeed.' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await prisma.importSource.update({
      where: { id: source.id },
      data: { phase: 'failed', appliedAt: null, lastError: message, instanceId: instance.id },
    }).catch(() => undefined);
    await prisma.instance.update({ where: { id: instance.id }, data: { applicationError: message } }).catch(() => undefined);
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: `The imported project was not started: ${message}` } });
  }
}

/** Continues imports that were left queued, checking, or failed before the attempt limit. */
export async function recoverStoredImports(): Promise<number> {
  const waiting = await prisma.instance.findMany({
    where: { status: 'ONLINE', applicationReadyAt: null, orderItemId: { not: null } },
    select: { id: true },
    take: 20,
  });
  const sources = await prisma.importSource.findMany({
    where: {
      OR: [
        { appliedAt: null, instanceId: { not: null }, phase: { in: ['pending', 'queued', 'checking', 'failed'] } },
        { instanceId: { in: waiting.map((row) => row.id) }, appliedAt: { not: null } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  let recovered = 0;
  for (const source of sources) {
    if (!source.instanceId) continue;
    const instance = await prisma.instance.findUnique({ where: { id: source.instanceId }, include: { product: { select: { slug: true } } } });
    if (!instance || instance.status !== 'ONLINE') continue;
    if (source.appliedAt) {
      if (instance.applicationReadyAt) {
        if (instance.orderId) await syncOrderFulfillment(instance.orderId);
        continue;
      }
      const health = await probeApplication(instance, source.productSlug || instance.product.slug);
      await rememberOutcome(instance, source, { state: 'succeeded', message: source.lastError ?? '' }, health);
      recovered += 1;
      continue;
    }
    if (source.phase === 'checking') {
      const health = await probeApplication(instance, source.productSlug || instance.product.slug);
      await rememberOutcome(instance, source, { state: 'succeeded', message: source.lastError ?? '' }, health);
      recovered += 1;
      continue;
    }
    if (source.phase === 'queued') {
      const job = await currentGitDeploy(instance.id);
      const stale = queuedImportIsStale({ jobPresent: Boolean(job), jobDeployId: job?.deployId ?? null, recordedDeployId: source.deployId });
      if (stale === 'wait') continue;
      const event = source.deployId
        ? await prisma.instanceEvent.findFirst({
          where: { instanceId: instance.id, type: 'deploy', message: { startsWith: `deploy:${source.deployId}:` } },
          orderBy: { createdAt: 'desc' },
        })
        : null;
      const outcome = event && source.deployId ? deployOutcomeFromMessage(event.message, source.deployId) : null;
      if (outcome) {
        await settleImportedDeploy(instance.id, source.deployId as string, { state: outcome, message: event?.message ?? '' });
        recovered += 1;
        continue;
      }
      await prisma.importSource.update({ where: { id: source.id }, data: { phase: 'pending', deployId: null } });
    }
    if (source.phase === 'failed' && source.attempts >= IMPORT_MAX_ATTEMPTS) continue;
    await applyStoredImport(instance);
    recovered += 1;
  }
  return recovered;
}
