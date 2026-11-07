import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { packZip } from '../src/services/backup-archive.js';

const bytes = Buffer.from('verified-plugin-release');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const sha512 = createHash('sha512').update(bytes).digest('hex');
const remote = { files: new Map<string, Buffer>(), backupFails: false, corruptPull: false, restores: 0 };

vi.mock('../src/services/panel/operations.js', () => ({ customerToken: vi.fn(async () => 'ptlc_test') }));
vi.mock('../src/services/minecraft.js', () => ({
  pluginFileForRelease: vi.fn(async () => ({ url: 'https://cdn.modrinth.com/data/project/plugin.jar', filename: 'plugin.jar', size: bytes.length, version: '1.0.0', releaseId: 'release_1234', projectId: 'project_1234', loaders: ['paper'], gameVersions: ['1.21.1'], dependencies: [], sourceSha512: sha512 })),
}));
vi.mock('../src/services/pterodactyl/client.js', () => ({
  createBackup: vi.fn(async () => { if (remote.backupFails) throw new Error('no backup space'); return { uuid: 'backup-1', completed_at: '2026-11-07T00:00:00Z', is_successful: true }; }),
  listBackups: vi.fn(async () => [{ uuid: 'backup-1', completed_at: '2026-11-07T00:00:00Z', is_successful: true }]),
  downloadBackup: vi.fn(async () => Readable.from(packZip([{ name: 'world/data', data: Buffer.from('safe') }]))),
  createFolder: vi.fn(async () => undefined),
  pullFile: vi.fn(async (_token: string, _uuid: string, _url: string, directory: string, filename: string) => { remote.files.set(`${directory}/${filename}`.replace('//', '/'), remote.corruptPull ? Buffer.from('wrong') : bytes); }),
  downloadFile: vi.fn(async (_token: string, _uuid: string, path: string) => Readable.from(remote.files.get(path) ?? Buffer.alloc(0))),
  listFiles: vi.fn(async (_token: string, _uuid: string, path: string) => [...remote.files.keys()].filter((file) => file.startsWith(`${path}/`) && !file.slice(path.length + 1).includes('/')).map((file) => ({ name: file.slice(path.length + 1), is_file: true }))),
  moveFile: vi.fn(async (_token: string, _uuid: string, from: string, to: string) => { const value = remote.files.get(from); if (!value) throw new Error('missing file'); remote.files.delete(from); remote.files.set(to, value); }),
  deleteFile: vi.fn(async (_token: string, _uuid: string, path: string) => { for (const key of [...remote.files.keys()]) if (key === path || key.startsWith(`${path}/`)) remote.files.delete(key); }),
  restoreBackup: vi.fn(async () => { remote.restores += 1; }),
}));

const { prisma } = await import('../src/db.js');
const { buildSnapshot, snapshotSha256 } = await import('../src/services/profile-snapshot.js');
const { createProfileActivationJob, recoverInterruptedProfileActivations, requestProfileRecovery, runProfileActivation } = await import('../src/services/profile-activation.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

describe('profile activation worker', () => {
  beforeAll(async () => { await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); remote.files.clear(); remote.backupFails = false; remote.corruptPull = false; remote.restores = 0; });

  async function seed() {
    const { userId } = await registerAndLogin(await getApp(), `profile-worker-${Math.random()}@example.test`);
    const product = await prisma.product.create({ data: { slug: `paper-${userId.slice(-6)}`, name: 'Paper', category: 'GAMES', description: 'Paper', icon: 'box', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 2048, defaultCpu: 2, defaultDisk: 20, maxRam: 8192, maxCpu: 8, maxDisk: 100, deployable: true, visible: true } });
    const family = await prisma.catalogFamily.create({ data: { slug: `family-${userId.slice(-6)}`, name: 'Minecraft', summary: 'Minecraft', group: 'games' } });
    const variant = await prisma.catalogVariant.create({ data: { familyId: family.id, productId: product.id, slug: 'paper', label: 'Paper', active: true } });
    const wanted = { slug: 'plugin', status: 'installed' as const, filename: 'plugin.jar', version: '1.0.0', project: 'plugin', at: '2026-11-07T00:00:00Z', releaseId: 'release_1234', source: 'modrinth' as const, sourceProjectId: 'project_1234', sourceUrl: 'https://cdn.modrinth.com/data/project/plugin.jar', sha256, sourceSha512: sha512, loader: 'paper', gameVersion: '1.21.1', dependencies: [] };
    const manifest = { addons: [wanted] };
    const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'Paper', status: 'ONLINE', ram: 2048, cpu: 2, disk: 20, price: 500, currency: 'EUR', pterodactylServerId: Math.floor(Math.random() * 100000) + 1, pterodactylUuid: `uuid-${userId}`, installationManifest: { addons: [] } } });
    const snapshot = buildSnapshot({ catalog: { familyId: family.id, variantId: variant.id, productId: product.id, productSlug: product.slug, presetVersionId: null }, runtime: { productSlug: product.slug, loader: 'paper', gameVersion: '1.21.1' }, resources: { ram: 2048, cpu: 2, disk: 20 }, manifest });
    const profile = await prisma.serverProfile.create({ data: { userId, instanceId: instance.id, name: 'Pinned', productSlug: product.slug, ram: 2048, cpu: 2, disk: 20, manifest, snapshot: snapshot as object, snapshotSha256: snapshotSha256(snapshot) } });
    const created = await createProfileActivationJob({ instanceId: instance.id, profileId: profile.id, actorId: userId, idempotencyKey: `worker-${Math.random()}` });
    return { userId, instance, profile, job: created.job };
  }

  it('verifies backup and artifact hashes before committing the manifest', async () => {
    const { instance, job } = await seed();
    await runProfileActivation(job.id);
    expect(await prisma.serverProfileActivationJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'succeeded', progress: 100, backupUuid: 'backup-1' });
    expect((await prisma.instance.findUnique({ where: { id: instance.id } }))?.installationManifest).toMatchObject({ addons: [{ releaseId: 'release_1234', sha256 }] });
    expect(remote.files.get('/plugins/plugin.jar')).toEqual(bytes);
  });

  it('fails before changing files on backup failure or hash mismatch', async () => {
    const first = await seed(); remote.backupFails = true;
    await runProfileActivation(first.job.id);
    expect((await prisma.serverProfileActivationJob.findUnique({ where: { id: first.job.id } }))?.status).toBe('failed');
    await resetDatabase(); remote.backupFails = false; remote.corruptPull = true;
    const second = await seed(); await runProfileActivation(second.job.id);
    expect(await prisma.serverProfileActivationJob.findUnique({ where: { id: second.job.id } })).toMatchObject({ status: 'failed', step: 'Failed before files changed' });
  });

  it('turns an interrupted write into an explicit recovery workflow and never claims restore completion', async () => {
    const { userId, instance, job } = await seed();
    await prisma.serverProfileActivationJob.update({ where: { id: job.id }, data: { status: 'applying', backupUuid: 'backup-1' } });
    expect(await recoverInterruptedProfileActivations()).toBe(1);
    expect((await prisma.serverProfileActivationJob.findUnique({ where: { id: job.id } }))?.status).toBe('recovery_required');
    const restored = await requestProfileRecovery({ instanceId: instance.id, jobId: job.id, actorId: userId });
    expect(restored.status).toBe('recovery_requested');
    expect(remote.restores).toBe(1);
    expect(await prisma.serverProfileActivationJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'recovery_requested', activeKey: instance.id });
  });
});
