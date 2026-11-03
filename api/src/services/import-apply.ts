import { randomUUID } from 'node:crypto';
import type { Instance } from '@prisma/client';
import { prisma } from '../db.js';
import { installArchive, installGit } from './git-deploy.js';
import {
  IMPORT_MAX_ATTEMPTS,
  afterDeployObservation,
  afterQueueAttempt,
  deployOutcomeFromMessage,
  healthKind,
  interpretHttpStatus,
  interpretProcessState,
  orderFulfillmentDecision,
  queuedImportIsStale,
  zipShouldPurge,
  type ApplicationHealth,
} from './import-lifecycle.js';
import { notifyInstanceProvisioned } from './notifications.js';
import * as operations from './panel/operations.js';
import * as panelClient from './pterodactyl/client.js';
import { currentGitDeploy, enqueueGitDeploy } from './queue.js';
import { resolveTarget } from './domain-routing.js';

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
  lastError: string | null;
  zipBytes: Uint8Array | null;
  productSlug: string;
};

function importIdFromConfig(config: unknown): string | null {
  const value = (config as { importSourceId?: unknown } | null)?.importSourceId;
  return typeof value === 'string' && value ? value : null;
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

/** The order stays unpaid-for-delivery until every remaining application is ready. Money status is not moved backwards. */
export async function syncOrderFulfillment(orderId: string): Promise<void> {
  const instances = await prisma.instance.findMany({
    where: { orderId },
    select: { id: true, userId: true, status: true, applicationReadyAt: true, orderItemId: true },
  });
  const flags = [];
  for (const instance of instances) {
    const open = instance.applicationReadyAt ? null : await openImportForInstance(instance);
    flags.push({
      cancelled: instance.status === 'CANCELLED',
      online: instance.status === 'ONLINE' || instance.status === 'RESTARTING' || instance.status === 'DEGRADED',
      applicationReady: instance.status === 'CANCELLED' || Boolean(instance.applicationReadyAt) || !open,
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

async function probeApplication(instance: Instance, productSlug: string): Promise<ApplicationHealth> {
  if (!instance.pterodactylUuid || !instance.pterodactylServerId) return 'unknown';
  if (healthKind(productSlug) === 'process') {
    try {
      const owned = await operations.loadOwnedInstance(instance.userId, instance.id);
      const token = await operations.customerToken(owned);
      const resources = await panelClient.getResources(token, instance.pterodactylUuid);
      return interpretProcessState(resources.state);
    } catch {
      return 'unknown';
    }
  }
  try {
    const target = await resolveTarget(instance);
    const response = await fetch(`http://${target.host}:${target.port}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return interpretHttpStatus(response.status, true);
  } catch {
    return interpretHttpStatus(null, false);
  }
}

async function rememberOutcome(instance: Instance, source: OpenImport, observed: { state: 'succeeded' | 'failed' | 'building' | 'none'; message: string }, health: ApplicationHealth): Promise<void> {
  if (source.appliedAt) return;
  const decision = afterDeployObservation({ deployState: observed.state, health, attempts: source.attempts });
  await prisma.importSource.update({
    where: { id: source.id },
    data: {
      phase: decision.phase,
      appliedAt: decision.markApplied ? new Date() : null,
      lastError: decision.error,
      ...(decision.clearZip ? { zipBytes: null, zipBytesLength: 0 } : {}),
    },
  });
  if (!decision.fulfill) {
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
  await prisma.instance.update({
    where: { id: instance.id },
    data: { applicationReadyAt: new Date(), applicationError: null },
  });
  await prisma.orderItem.updateMany({
    where: { instances: { some: { id: instance.id } } },
    data: { fulfillmentStatus: 'FULFILLED', fulfillmentError: null },
  });
  if (instance.orderId) await syncOrderFulfillment(instance.orderId);
  await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: 'The imported application is built and answered its health check.' } });
  await notifyInstanceProvisioned({ userId: instance.userId, instanceName: instance.name, occurrence: new Date() });
}

/** Records the result of the deployment job. A successful queue submission is not an applied import. */
export async function settleImportedDeploy(instanceId: string, deployId: string, result: { state: string; message: string }): Promise<void> {
  const instance = await prisma.instance.findUnique({ where: { id: instanceId }, include: { product: { select: { slug: true } } } });
  if (!instance) return;
  const source = await prisma.importSource.findFirst({ where: { instanceId, deployId, userId: instance.userId } });
  if (!source || source.appliedAt) return;
  const state = result.state === 'succeeded' || result.state === 'failed' ? result.state : 'none';
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
  const sources = await prisma.importSource.findMany({
    where: { appliedAt: null, instanceId: { not: null }, phase: { in: ['pending', 'queued', 'checking', 'failed'] } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  let recovered = 0;
  for (const source of sources) {
    if (!source.instanceId) continue;
    const instance = await prisma.instance.findUnique({ where: { id: source.instanceId }, include: { product: { select: { slug: true } } } });
    if (!instance || instance.status !== 'ONLINE') continue;
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
