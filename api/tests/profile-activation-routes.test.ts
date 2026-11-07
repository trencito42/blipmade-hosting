import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

const artifact = {
  slug: 'luckperms', status: 'installed', filename: 'LuckPerms.jar', version: '5.4.0', project: 'luckperms', at: '2026-11-07T00:00:00.000Z',
  releaseId: 'release_1234', source: 'modrinth', sourceProjectId: 'project_1234', sourceUrl: 'https://cdn.modrinth.com/data/x/LuckPerms.jar',
  sha256: 'a'.repeat(64), sourceSha512: 'b'.repeat(128), loader: 'paper', gameVersion: '1.21.1', dependencies: [],
};

describe('profile activation routes', () => {
  beforeAll(async () => { await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  async function seed(email = 'profile-activation@example.test') {
    const { client, userId } = await registerAndLogin(await getApp(), email);
    const product = await prisma.product.create({ data: { slug: `paper-${userId.slice(-6)}`, name: 'Paper', category: 'GAMES', description: 'Paper', icon: 'box', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 2048, defaultCpu: 2, defaultDisk: 20, maxRam: 8192, maxCpu: 8, maxDisk: 100, deployable: true, visible: true } });
    const family = await prisma.catalogFamily.create({ data: { slug: `minecraft-${userId.slice(-6)}`, name: 'Minecraft', summary: 'Minecraft', group: 'games' } });
    const variant = await prisma.catalogVariant.create({ data: { familyId: family.id, productId: product.id, slug: 'paper', label: 'Paper', active: true } });
    const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'Paper', status: 'ONLINE', ram: 2048, cpu: 2, disk: 20, price: 500, currency: 'EUR', pterodactylServerId: Math.floor(Math.random() * 100000) + 1, pterodactylUuid: `uuid-${userId}`, installationManifest: { addons: [artifact] } } });
    return { client, userId, product, family, variant, instance };
  }

  it('saves an immutable snapshot, previews it and makes job creation idempotent', async () => {
    const { client, instance } = await seed();
    const saved = await client.request('POST', `/api/instances/${instance.id}/profiles`, { name: 'Tournament' });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    const profileId = saved.body.profile.id as string;
    const preview = await client.request('GET', `/api/instances/${instance.id}/profiles/${profileId}/activation-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ eligible: true, changes: { install: [], remove: [] } });
    const first = await client.request('POST', `/api/instances/${instance.id}/profiles/${profileId}/activate`, { idempotencyKey: 'profile-replay-1' });
    const replay = await client.request('POST', `/api/instances/${instance.id}/profiles/${profileId}/activate`, { idempotencyKey: 'profile-replay-1' });
    expect(first.status).toBe(202);
    expect(replay.status).toBe(200);
    expect(replay.body.job.id).toBe(first.body.job.id);
    expect(await prisma.serverProfileActivationJob.count()).toBe(1);
  });

  it('enforces one active job and reports resource incompatibility before side effects', async () => {
    const { client, instance } = await seed();
    const one = await client.request('POST', `/api/instances/${instance.id}/profiles`, { name: 'One' });
    const two = await client.request('POST', `/api/instances/${instance.id}/profiles`, { name: 'Two' });
    expect((await client.request('POST', `/api/instances/${instance.id}/profiles/${one.body.profile.id}/activate`, { idempotencyKey: 'profile-active-1' })).status).toBe(202);
    expect((await client.request('POST', `/api/instances/${instance.id}/profiles/${two.body.profile.id}/activate`, { idempotencyKey: 'profile-active-2' })).status).toBe(409);
    await prisma.serverProfileActivationJob.updateMany({ data: { status: 'failed', activeKey: null } });
    await prisma.instance.update({ where: { id: instance.id }, data: { ram: 4096 } });
    const preview = await client.request('GET', `/api/instances/${instance.id}/profiles/${one.body.profile.id}/activation-preview`);
    expect(preview.body.eligible).toBe(false);
    expect(preview.body.blockers.join(' ')).toMatch(/resource-change quote/);
  });

  it('refuses legacy mutable artifacts and another tenant', async () => {
    const { client, instance } = await seed();
    await prisma.instance.update({ where: { id: instance.id }, data: { installationManifest: { addons: [{ slug: 'x', status: 'installed', filename: 'x.jar', version: 'latest', at: 'now' }] } } });
    expect((await client.request('POST', `/api/instances/${instance.id}/profiles`, { name: 'Unsafe' })).status).toBe(400);
    const other = await registerAndLogin(await getApp(), 'profile-stranger@example.test');
    expect((await other.client.request('GET', `/api/instances/${instance.id}/profiles`)).status).toBe(404);
  });
});
