import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;
let seq = 0;

async function staff(permissions: string[]) {
  seq += 1;
  const user = await prisma.user.create({ data: { email: `ed${seq}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'E', lastName: 'D', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
}

async function product(slug = 'demo', extra: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      slug, name: 'Demo', category: 'BOTS', description: 'A demo product for the editor.', icon: 'bot',
      eggId: 5, minRam: 512, defaultRam: 512, maxRam: 4096, minCpu: 1, defaultCpu: 1, maxCpu: 2, minDisk: 5, defaultDisk: 5, maxDisk: 50,
      visible: true, deployable: true,
      prices: { create: { period: 'MONTHLY', baseAmount: 300, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' } },
      ...extra,
    } as never,
  });
}

async function sell(productId: string) {
  const user = await prisma.user.create({ data: { email: `buyer${++seq}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'B', lastName: 'Y', emailVerifiedAt: new Date() } });
  return prisma.instance.create({ data: { userId: user.id, productId, name: 'live', status: 'ONLINE', pterodactylServerId: 900 + seq, pterodactylUuid: `u${seq}`, ram: 1024, cpu: 1, disk: 10, price: 300 } });
}

const eggs = () => prisma.egg.create({ data: { pterodactylId: 5, uuid: 'egg-5', name: 'Node bot', dockerImage: 'node:22', startup: 'node index.js' } });

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
});

describe('the record of a product', () => {
  it('shows every field, the state, the use and the readiness', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    await sell(p.id);
    const r = await client.request('GET', `/api/admin/products/${p.id}`);
    expect(r.status).toBe(200);
    expect(r.body.product).toMatchObject({ lifecycle: 'PUBLISHED', slug: 'demo', startup: null, installGuide: null });
    expect(r.body.usage).toEqual({ instances: 1, orderItems: 0, vpsServices: 0 });
    expect(r.body.readiness.find((c: { id: string }) => c.id === 'egg-known').ok).toBe(true);
  });
});

describe('a change of a product', () => {
  it('changes a safe field of a sold product without a confirmation, and keeps the before and after', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    await sell(p.id);
    const r = await client.request('PATCH', `/api/admin/products/${p.id}`, { name: 'Demo 2', docsUrl: 'https://docs.example.com/demo', installGuide: 'Open the panel and ...' });
    expect(r.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).name).toBe('Demo 2');
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'product.updated', targetId: p.id } });
    const changes = (entry.meta as { changes: { field: string; from: unknown; to: unknown }[] }).changes;
    expect(changes.find((c) => c.field === 'name')).toMatchObject({ from: 'Demo', to: 'Demo 2' });
    const history = await client.request('GET', `/api/admin/products/${p.id}/history`);
    expect(history.body.history).toHaveLength(1);
  });

  it('asks for a confirmation when a risky field changes on a product that has customers, and does not touch the service', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    const live = await sell(p.id);
    const first = await client.request('PATCH', `/api/admin/products/${p.id}`, { dockerImage: 'node:24', startupCommand: 'node server.js' });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('confirmation_required');
    expect(Object.keys(first.body.error.fields ?? {}).sort()).toEqual(['dockerImage', 'startupCommand']);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).dockerImage).toBeNull();

    const second = await client.request('PATCH', `/api/admin/products/${p.id}`, { dockerImage: 'node:24', startupCommand: 'node server.js', confirmRisky: true });
    expect(second.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).dockerImage).toBe('node:24');
    // The service that exists keeps the size it was built with.
    expect(await prisma.instance.findUniqueOrThrow({ where: { id: live.id } })).toMatchObject({ ram: 1024, cpu: 1, disk: 10, status: 'ONLINE' });
  });

  it('writes nothing in the preview', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    const r = await client.request('POST', `/api/admin/products/${p.id}/change-preview`, { maxRam: 8192 });
    expect(r.status).toBe(200);
    expect(r.body.plan.changes[0]).toMatchObject({ field: 'maxRam', from: 4096, to: 8192, risk: 'risky' });
    expect(r.body.plan.requiresConfirmation).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).maxRam).toBe(4096);
    expect(await prisma.auditLog.count({ where: { action: 'product.updated' } })).toBe(0);
  });

  it('refuses sizes that are out of order, unknown fields, bad variable names and a bad link', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    for (const body of [
      { minRam: 8192 },
      { defaultCpu: 5 },
      { fulfilment: 'VPS' },
      { startup: { 'bad name': 'x' } },
      { generatedVariables: { PASSWORD: { length: 2 } } },
      { docsUrl: 'javascript:alert(1)' },
      { icon: '<img>' },
      { minCpu: 0.3 },
    ]) {
      const r = await client.request('PATCH', `/api/admin/products/${p.id}`, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('refuses a stale edit', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    const r = await client.request('PATCH', `/api/admin/products/${p.id}`, { name: 'Later', expectedUpdatedAt: new Date(p.updatedAt.getTime() - 5000).toISOString() });
    expect(r.status).toBe(409);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).name).toBe('Demo');
  });

  it('needs products.write, and products.read is enough for the preview and the history', async () => {
    const reader = await staff(['products.read']);
    const p = await product();
    expect((await reader.request('PATCH', `/api/admin/products/${p.id}`, { name: 'Nope nope' })).status).toBe(403);
    expect((await reader.request('POST', `/api/admin/products/${p.id}/change-preview`, { name: 'Nope nope' })).status).toBe(200);
    expect((await reader.request('GET', `/api/admin/products/${p.id}/history`)).status).toBe(200);
    expect((await reader.request('GET', `/api/admin/products/${p.id}/preview`)).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).name).toBe('Demo');
  });
});

describe('the slug', () => {
  it('can change while nothing was sold, and must stay unique', async () => {
    const { client } = await createAdmin(app);
    const p = await product('first');
    await product('second');
    await eggs();
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { slug: 'second' })).status).toBe(400);
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { slug: 'renamed', confirmRisky: true })).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).slug).toBe('renamed');
  });

  it('is fixed once the product was sold', async () => {
    const { client } = await createAdmin(app);
    const p = await product('sold');
    await eggs();
    await sell(p.id);
    const r = await client.request('PATCH', `/api/admin/products/${p.id}`, { slug: 'other', confirmRisky: true });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/sold/);
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { category: 'GAMES', confirmRisky: true })).status).toBe(400);
  });
});

describe('the states', () => {
  it('does not publish a product that the panel cannot build', async () => {
    const { client } = await createAdmin(app);
    const noEgg = await product('no-egg', { eggId: null, visible: false, deployable: false });
    expect((await client.request('PATCH', `/api/admin/products/${noEgg.id}`, { lifecycle: 'PUBLISHED' })).status).toBe(400);

    const unknownEgg = await product('unknown-egg', { eggId: 77, visible: false, deployable: false });
    const r = await client.request('PATCH', `/api/admin/products/${unknownEgg.id}`, { lifecycle: 'PUBLISHED' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/imported/);

    const noPrice = await prisma.product.create({ data: { slug: 'no-price', name: 'No price', category: 'BOTS', description: 'Product without a price.', icon: 'bot', eggId: 5, visible: false, deployable: false } });
    await eggs();
    expect((await client.request('PATCH', `/api/admin/products/${noPrice.id}`, { lifecycle: 'PUBLISHED' })).status).toBe(400);
  });

  it('publishes a product that is ready, then makes it unavailable, then retires it, and never touches its services', async () => {
    const { client } = await createAdmin(app);
    const p = await product('ready', { visible: false, deployable: false });
    await eggs();
    const live = await sell(p.id);
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { lifecycle: 'PUBLISHED', confirmRisky: true })).body.product.lifecycle).toBe('PUBLISHED');
    expect(await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ visible: true, deployable: true, retiredAt: null });

    await client.request('PATCH', `/api/admin/products/${p.id}`, { lifecycle: 'UNAVAILABLE', confirmRisky: true });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ visible: true, deployable: false });

    const retired = await client.request('PATCH', `/api/admin/products/${p.id}`, { lifecycle: 'RETIRED', confirmRisky: true });
    expect(retired.body.product.lifecycle).toBe('RETIRED');
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ visible: false, deployable: false });
    expect(row.retiredAt).not.toBeNull();
    expect(await prisma.instance.findUniqueOrThrow({ where: { id: live.id } })).toMatchObject({ status: 'ONLINE', ram: 1024 });

    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { lifecycle: 'DRAFT', confirmRisky: true })).body.product.lifecycle).toBe('DRAFT');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).retiredAt).toBeNull();
  });

  it('refuses an edit that leaves a published product unsellable, and both a state and the switches', async () => {
    const { client } = await createAdmin(app);
    const p = await product();
    await eggs();
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { eggId: null, confirmRisky: true })).status).toBe(400);
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { lifecycle: 'DRAFT', visible: true })).status).toBe(400);
  });

  it('keeps working for the switches the old page sent', async () => {
    const { client } = await createAdmin(app);
    const p = await product('legacy', { visible: false, deployable: false });
    await eggs();
    expect((await client.request('PATCH', `/api/admin/products/${p.id}`, { visible: true })).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).visible).toBe(true);
  });
});

describe('mail plans and VPS plans', () => {
  it('take no egg, and a VPS plan takes no size here', async () => {
    const { client } = await createAdmin(app);
    const mail = await prisma.product.create({ data: { slug: 'mail-s', name: 'Mail S', category: 'EMAIL_HOSTING', fulfilment: 'EMAIL', description: 'A mail plan for the test.', icon: 'mail' } });
    expect((await client.request('PATCH', `/api/admin/products/${mail.id}`, { eggId: 5 })).status).toBe(400);
    const vps = await prisma.product.create({ data: { slug: 'vps-x', name: 'VPS X', category: 'VPS', fulfilment: 'VPS', description: 'A VPS plan for the test.', icon: 'server' } });
    expect((await client.request('PATCH', `/api/admin/products/${vps.id}`, { maxRam: 9999 })).status).toBe(400);
    expect((await client.request('PATCH', `/api/admin/products/${vps.id}`, { description: 'A better description of it.' })).status).toBe(200);
  });
});

describe('the preview of a product', () => {
  it('shows the card, what is asked at the order and why it cannot be ordered', async () => {
    const { client } = await createAdmin(app);
    const p = await product('card', { visible: true, deployable: false, customerVariables: { STEAM_USER: { label: 'Steam account', required: true } } });
    const r = await client.request('GET', `/api/admin/products/${p.id}/preview`);
    expect(r.body.preview).toMatchObject({ lifecycle: 'UNAVAILABLE', orderable: false, askedAtOrder: [{ name: 'STEAM_USER', label: 'Steam account', required: true }] });
    expect(r.body.preview.blockers.length).toBeGreaterThan(0);
  });
});
