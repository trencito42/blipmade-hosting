import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const bytes = Buffer.from('pinned-plugin');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const sha512 = createHash('sha512').update(bytes).digest('hex');

vi.mock('../src/services/panel/operations.js', async () => ({
  ...(await vi.importActual<typeof import('../src/services/panel/operations.js')>('../src/services/panel/operations.js')),
  customerToken: vi.fn(async () => 'ptlc_test'),
}));
vi.mock('../src/services/pterodactyl/application.js', async () => ({
  ...(await vi.importActual<typeof import('../src/services/pterodactyl/application.js')>('../src/services/pterodactyl/application.js')),
  getServer: vi.fn(async () => ({ container: { environment: { MC_VERSION: '1.21.1' } } })),
}));
vi.mock('../src/services/minecraft.js', async () => ({
  ...(await vi.importActual<typeof import('../src/services/minecraft.js')>('../src/services/minecraft.js')),
  pluginFileFor: vi.fn(async () => ({ url: 'https://cdn.modrinth.com/data/project/LuckPerms.jar', filename: 'LuckPerms.jar', size: bytes.length, version: '5.4.0', releaseId: 'release_1234', projectId: 'project_1234', loaders: ['paper'], gameVersions: ['1.21.1'], dependencies: [{ projectId: 'dep', versionId: 'dep-v1', type: 'required' }], sourceSha512: sha512 })),
}));
vi.mock('../src/services/pterodactyl/client.js', async () => ({
  ...(await vi.importActual<typeof import('../src/services/pterodactyl/client.js')>('../src/services/pterodactyl/client.js')),
  createBackup: vi.fn(async () => ({ uuid: 'backup-1', completed_at: '2026-11-07T00:00:00Z', is_successful: true })),
  listBackups: vi.fn(async () => [{ uuid: 'backup-1', completed_at: '2026-11-07T00:00:00Z', is_successful: true }]),
  createFolder: vi.fn(async () => undefined), pullFile: vi.fn(async () => undefined),
  listFiles: vi.fn(async () => [{ name: 'LuckPerms.jar', is_file: true }]),
  downloadFile: vi.fn(async () => Readable.from(bytes)), deleteFile: vi.fn(async () => undefined),
}));

const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

describe('reproducible add-on artifact capture', () => {
  beforeAll(async () => { await getApp(); }); afterAll(async () => { await closeApp(); }); beforeEach(async () => { await resetDatabase(); });

  it('records release identity, runtime, dependency versions and the bytes read back from the server', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'artifact-profile@example.test');
    const product = await prisma.product.create({ data: { slug: 'minecraft-paper', name: 'Paper', category: 'GAMES', description: 'Paper', icon: 'box', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 2048, defaultCpu: 2, defaultDisk: 20, maxRam: 8192, maxCpu: 8, maxDisk: 100, deployable: true, visible: true } });
    const family = await prisma.catalogFamily.create({ data: { slug: 'minecraft', name: 'Minecraft', summary: 'Minecraft', group: 'games' } });
    await prisma.catalogVariant.create({ data: { familyId: family.id, productId: product.id, slug: 'paper', label: 'Paper', active: true } });
    await prisma.catalogAddonDefinition.create({ data: { familyId: family.id, slug: 'luckperms', name: 'LuckPerms', summary: 'Permissions', kind: 'SOFTWARE', active: true, installSpec: { adapter: 'minecraft-plugin', project: 'luckperms' } } });
    const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'Paper', status: 'ONLINE', ram: 2048, cpu: 2, disk: 20, price: 500, currency: 'EUR', pterodactylServerId: 98761, pterodactylUuid: 'artifact-uuid' } });
    const answer = await client.request('POST', `/api/instances/${instance.id}/addons/luckperms`, { action: 'install', confirmBackup: true, idempotencyKey: 'artifact-capture-1' });
    expect(answer.status).toBe(200);
    const saved = await prisma.instance.findUnique({ where: { id: instance.id }, select: { installationManifest: true } });
    expect(saved?.installationManifest).toMatchObject({ addons: [{ releaseId: 'release_1234', source: 'modrinth', sourceProjectId: 'project_1234', sha256, sourceSha512: sha512, loader: 'paper', gameVersion: '1.21.1', dependencies: [{ versionId: 'dep-v1' }] }] });
  });
});
