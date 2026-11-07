import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { verifyBackupStream } from './backup-archive.js';
import { installedArtifacts } from './addon-lifecycle.js';
import * as operations from './panel/operations.js';
import * as panel from './pterodactyl/client.js';
import { pluginFileForRelease } from './minecraft.js';
import { assertSnapshot, streamHashes, type ServerProfileSnapshot } from './profile-snapshot.js';
import { waitForBackupCompletion } from './addon-lifecycle.js';

const ACTIVE = ['pending', 'backing_up', 'staging', 'applying', 'verifying'];

async function profileData(instanceId: string, profileId: string) {
  const profile = await prisma.serverProfile.findFirst({ where: { id: profileId, instanceId } });
  if (!profile?.snapshot || !profile.snapshotSha256) throw notFound('Re-save this profile before activating it.');
  const snapshot = assertSnapshot(profile.snapshot as unknown as ServerProfileSnapshot, profile.snapshotSha256);
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: { product: { select: { slug: true, generatedVariables: true } } },
  });
  if (!instance) throw notFound('Instance not found.');
  return { profile, snapshot, instance };
}

export async function profileActivationPreview(instanceId: string, profileId: string) {
  const { profile, snapshot, instance } = await profileData(instanceId, profileId);
  const blockers: string[] = [];
  if (snapshot.catalog.productId !== instance.productId || snapshot.catalog.productSlug !== instance.product.slug) blockers.push('Switch back to the saved catalogue variant through Repurpose first.');
  if (snapshot.resources.ram !== instance.ram || snapshot.resources.cpu !== instance.cpu || snapshot.resources.disk !== instance.disk) blockers.push('Apply the saved resources through the resource-change quote first.');
  if (!instance.pterodactylUuid) blockers.push('This service is not deployed yet.');
  const variant = await prisma.catalogVariant.findUnique({ where: { productId: instance.productId }, select: { id: true, familyId: true } });
  if (!variant || variant.id !== snapshot.catalog.variantId || variant.familyId !== snapshot.catalog.familyId) blockers.push('The saved catalogue variant is no longer the active compatible variant.');
  const current = installedArtifacts(instance.installationManifest);
  return {
    eligible: blockers.length === 0,
    blockers,
    changes: {
      install: snapshot.artifacts.filter((wanted) => !current.some((row) => row.slug === wanted.slug && row.releaseId === wanted.releaseId)).map((row) => ({ slug: row.slug, version: row.version, releaseId: row.releaseId })),
      remove: current.filter((row) => !snapshot.artifacts.some((wanted) => wanted.slug === row.slug)).map((row) => ({ slug: row.slug, version: row.version })),
    },
    snapshotSha256: profile.snapshotSha256,
  };
}

export async function createProfileActivationJob(input: { instanceId: string; profileId: string; actorId: string; idempotencyKey: string }) {
  const preview = await profileActivationPreview(input.instanceId, input.profileId);
  if (!preview.eligible) throw badRequest(preview.blockers[0] ?? 'This profile cannot be activated.');
  const existing = await prisma.serverProfileActivationJob.findUnique({ where: { instanceId_idempotencyKey: { instanceId: input.instanceId, idempotencyKey: input.idempotencyKey } } });
  if (existing) return { job: existing, replayed: true };
  if (await prisma.serverProfileActivationJob.findFirst({ where: { activeKey: input.instanceId } })) throw conflict('Another profile activation is already running on this server.');
  const profile = await prisma.serverProfile.findUnique({ where: { id: input.profileId }, select: { snapshotSha256: true } });
  try {
    const job = await prisma.serverProfileActivationJob.create({
      data: { instanceId: input.instanceId, profileId: input.profileId, actorId: input.actorId, idempotencyKey: input.idempotencyKey, activeKey: input.instanceId, snapshotSha256: profile!.snapshotSha256! },
    });
    return { job, replayed: false };
  } catch {
    const replay = await prisma.serverProfileActivationJob.findUnique({ where: { instanceId_idempotencyKey: { instanceId: input.instanceId, idempotencyKey: input.idempotencyKey } } });
    if (replay) return { job: replay, replayed: true };
    throw conflict('Another profile activation is already running on this server.');
  }
}

async function setJob(id: string, data: { status?: string; progress?: number; step?: string; backupUuid?: string; backupSha256?: string; error?: string | null; result?: object; activeKey?: null }) {
  return prisma.serverProfileActivationJob.update({ where: { id }, data });
}

async function ensureFolder(token: string, uuid: string, path: string) {
  try { await panel.createFolder(token, uuid, path); } catch { /* already exists */ }
}

/** Executes one durable job. Original plugin files are moved aside until every replacement verifies. */
export async function runProfileActivation(jobId: string): Promise<void> {
  const job = await prisma.serverProfileActivationJob.findUnique({ where: { id: jobId } });
  if (!job || !ACTIVE.includes(job.status)) return;
  const { snapshot, instance } = await profileData(job.instanceId, job.profileId);
  if (job.snapshotSha256 !== (await prisma.serverProfile.findUnique({ where: { id: job.profileId }, select: { snapshotSha256: true } }))?.snapshotSha256) {
    await setJob(job.id, { status: 'failed', error: 'The profile changed after this job was created.', activeKey: null });
    return;
  }
  const owned = { id: instance.id, userId: instance.userId, status: instance.status, pterodactylUuid: instance.pterodactylUuid, pterodactylServerId: instance.pterodactylServerId, generatedVariables: instance.generatedVariables, productVariables: instance.product.generatedVariables };
  const preview = await profileActivationPreview(job.instanceId, job.profileId);
  if (!preview.eligible) {
    await setJob(job.id, { status: 'failed', error: preview.blockers[0] ?? 'The service changed after this job was queued.', activeKey: null });
    return;
  }
  const token = await operations.customerToken(owned);
  const uuid = instance.pterodactylUuid!;
  let backupUuid = job.backupUuid;
  let filesMoved = false;
  try {
    if (!backupUuid) {
      await setJob(job.id, { status: 'backing_up', progress: 10, step: 'Creating locked backup' });
      const created = await panel.createBackup(token, uuid, { name: `Before profile ${job.profileId}`.slice(0, 100), locked: true });
      backupUuid = created.uuid;
      await setJob(job.id, { backupUuid });
      const waited = await waitForBackupCompletion({ created, list: () => panel.listBackups(token, uuid) });
      if (!waited.ok) throw new Error(waited.reason);
      const integrity = await verifyBackupStream(await panel.downloadBackup(token, uuid, backupUuid));
      await setJob(job.id, { backupSha256: integrity.sha256, progress: 25, step: 'Backup verified' });
    }
    const root = `/.blipmade-profile-${job.id}`;
    const staged = `${root}/staged`;
    const previous = `${root}/previous`;
    await ensureFolder(token, uuid, root); await ensureFolder(token, uuid, staged); await ensureFolder(token, uuid, previous); await ensureFolder(token, uuid, '/plugins');
    await setJob(job.id, { status: 'staging', progress: 35, step: 'Downloading immutable releases' });
    for (const artifact of snapshot.artifacts) {
      const file = await pluginFileForRelease(artifact.releaseId!, { projectId: artifact.sourceProjectId!, gameVersion: artifact.gameVersion!, loader: artifact.loader! });
      if (file.url !== artifact.sourceUrl || file.filename !== artifact.filename || file.sourceSha512 !== artifact.sourceSha512) throw new Error(`The source identity of ${artifact.slug} changed.`);
      await panel.pullFile(token, uuid, file.url, staged, file.filename);
      const hashes = await streamHashes(await panel.downloadFile(token, uuid, `${staged}/${file.filename}`));
      if (hashes.sha256 !== artifact.sha256 || hashes.sha512 !== artifact.sourceSha512 || hashes.bytes !== file.size) throw new Error(`The checksum of ${artifact.slug} does not match the saved profile.`);
    }
    await setJob(job.id, { status: 'applying', progress: 65, step: 'Switching verified files' });
    const current = installedArtifacts(instance.installationManifest);
    for (const artifact of current) {
      const exists = (await panel.listFiles(token, uuid, '/plugins')).some((file) => file.name === artifact.filename);
      if (exists) { filesMoved = true; await panel.moveFile(token, uuid, `/plugins/${artifact.filename}`, `${previous}/${artifact.filename}`); }
    }
    for (const artifact of snapshot.artifacts) { filesMoved = true; await panel.moveFile(token, uuid, `${staged}/${artifact.filename}`, `/plugins/${artifact.filename}`); }
    await setJob(job.id, { status: 'verifying', progress: 85, step: 'Verifying installed files' });
    for (const artifact of snapshot.artifacts) {
      const hashes = await streamHashes(await panel.downloadFile(token, uuid, `/plugins/${artifact.filename}`));
      if (hashes.sha256 !== artifact.sha256) throw new Error(`The installed file ${artifact.filename} failed verification.`);
    }
    await prisma.$transaction([
      prisma.instance.update({ where: { id: instance.id }, data: { installationManifest: snapshot.manifest as object } }),
      prisma.serverProfileActivationJob.update({ where: { id: job.id }, data: { status: 'succeeded', progress: 100, step: 'Completed', activeKey: null, error: null, result: { backupUuid, artifacts: snapshot.artifacts.length } } }),
      prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'profile', message: 'Saved profile activated after a verified locked backup.' } }),
    ]);
    await panel.deleteFile(token, uuid, root).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile activation failed.';
    if (filesMoved) await setJob(job.id, { status: 'recovery_required', step: 'Recovery required', error: message });
    else await setJob(job.id, { status: 'failed', step: 'Failed before files changed', error: message, activeKey: null });
  }
}

export async function runPendingProfileActivations(): Promise<number> {
  const jobs = await prisma.serverProfileActivationJob.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 2 });
  for (const job of jobs) await runProfileActivation(job.id);
  return jobs.length;
}

/** A crashed worker never guesses that rollback succeeded; it exposes the verified backup for an explicit restore. */
export async function recoverInterruptedProfileActivations(): Promise<number> {
  const jobs = await prisma.serverProfileActivationJob.findMany({ where: { status: { in: ACTIVE.filter((status) => status !== 'pending') } }, take: 20 });
  for (const job of jobs) {
    if (job.backupUuid) await setJob(job.id, { status: 'recovery_required', step: 'Worker interrupted; recovery required', error: 'The activation worker stopped before recording completion.' });
    else await setJob(job.id, { status: 'failed', step: 'Worker interrupted before backup', error: 'The activation worker stopped before recording completion.', activeKey: null });
  }
  return jobs.length;
}

export async function requestProfileRecovery(input: { instanceId: string; jobId: string; actorId?: string }) {
  const job = await prisma.serverProfileActivationJob.findFirst({ where: { id: input.jobId, instanceId: input.instanceId, ...(input.actorId ? { actorId: input.actorId } : {}) } });
  if (!job?.backupUuid || job.status !== 'recovery_required') throw badRequest('This activation has no verified recovery point.');
  const { instance } = await profileData(job.instanceId, job.profileId);
  const token = await operations.customerToken({ id: instance.id, userId: instance.userId, status: instance.status, pterodactylUuid: instance.pterodactylUuid, pterodactylServerId: instance.pterodactylServerId, generatedVariables: instance.generatedVariables, productVariables: instance.product.generatedVariables });
  await panel.restoreBackup(token, instance.pterodactylUuid!, job.backupUuid);
  return setJob(job.id, { status: 'recovery_requested', step: 'Panel accepted restore request', progress: 0, error: null });
}

