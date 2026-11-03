import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

vi.mock('../src/services/queue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/queue.js')>();
  return { ...actual, enqueueProvisioning: vi.fn(async () => undefined) };
});

let app: FastifyInstance;

/** A service with a product of its own, owned by `ownerId`. */
async function makeService(ownerId: string) {
  const product = await prisma.product.create({
    data: {
      slug: `product-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test product',
      category: 'WEB_CMS',
      description: 'A product used only by the tests.',
      icon: 'globe',
      minRam: 512, minCpu: 1, minDisk: 5, maxRam: 8192, maxCpu: 4, maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  return prisma.instance.create({
    data: {
      userId: ownerId, productId: product.id, name: 'shared-service', status: 'ONLINE',
      ram: 1024, cpu: 1, disk: 10, price: 149, currency: 'EUR',
      pterodactylServerId: 100, pterodactylUuid: `server-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

describe('changing the role of a share', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('lets the owner change the role of an invite and of a member, and says it in the audit log', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.test');
    const service = await makeService(userId);
    const invite = await client.request('POST', `/api/instances/${service.id}/access`, { role: 'viewer' });
    expect(invite.status).toBe(200);
    const changed = await client.request('PATCH', `/api/instances/${service.id}/access/${invite.body.id}`, { role: 'manager' });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ id: invite.body.id, role: 'manager' });
    expect((await prisma.instanceShare.findUniqueOrThrow({ where: { id: invite.body.id } })).role).toBe('manager');
    const logged = await prisma.auditLog.findFirst({ where: { action: 'instance.access_role_changed', targetId: service.id } });
    expect(logged).not.toBeNull();
  });

  it('refuses a role that does not exist, a share that is not there and a share that was taken back', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner2@example.test');
    const service = await makeService(userId);
    const invite = await client.request('POST', `/api/instances/${service.id}/access`, { role: 'viewer' });
    expect((await client.request('PATCH', `/api/instances/${service.id}/access/${invite.body.id}`, { role: 'owner' })).status).toBe(400);
    expect((await client.request('PATCH', `/api/instances/${service.id}/access/missing`, { role: 'manager' })).status).toBe(404);
    await client.request('DELETE', `/api/instances/${service.id}/access/${invite.body.id}`);
    expect((await client.request('PATCH', `/api/instances/${service.id}/access/${invite.body.id}`, { role: 'manager' })).status).toBe(404);
  });

  it('is only for the owner: another account cannot change the role of a share of a service that is not its own', async () => {
    const owner = await registerAndLogin(app, 'owner3@example.test');
    const other = await registerAndLogin(app, 'other@example.test');
    const service = await makeService(owner.userId);
    const invite = await owner.client.request('POST', `/api/instances/${service.id}/access`, { role: 'viewer' });
    const attempt = await other.client.request('PATCH', `/api/instances/${service.id}/access/${invite.body.id}`, { role: 'manager' });
    expect(attempt.status).toBe(404);
    expect((await prisma.instanceShare.findUniqueOrThrow({ where: { id: invite.body.id } })).role).toBe('viewer');
  });
});
