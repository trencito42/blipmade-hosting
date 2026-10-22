import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

async function makeInstance(ownerId: string, name = 'Test instance') {
  const product = await prisma.product.create({
    data: {
      slug: `product-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test product',
      category: 'WEB_CMS',
      description: 'A product used only by the tests.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });

  return prisma.instance.create({
    data: {
      userId: ownerId,
      productId: product.id,
      name,
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
    },
  });
}

describe('cross-customer isolation', () => {
  it('does not list another customer instances', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    await makeInstance(ownerId);

    const list = await other.request('GET', '/api/instances');
    expect(list.status).toBe(200);
    expect(list.body.instances).toHaveLength(0);
  });

  it('answers 404 when a customer reads another customer instance', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    const instance = await makeInstance(ownerId);
    const response = await other.request('GET', `/api/instances/${instance.id}`);
    expect(response.status).toBe(404);
  });

  it('refuses a power change on another customer instance', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    const instance = await makeInstance(ownerId);
    const response = await other.request('POST', `/api/instances/${instance.id}/power`, { action: 'stop' });
    expect(response.status).toBe(404);

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.status).toBe('ONLINE');
  });

  it('refuses a resource change on another customer instance', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    const instance = await makeInstance(ownerId);
    const response = await other.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 4096,
      cpu: 2,
      disk: 20,
    });
    expect(response.status).toBe(404);

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
  });

  it('does not show another customer orders', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    const product = await prisma.product.create({
      data: {
        slug: 'ordered-product',
        name: 'Ordered product',
        category: 'WEB_CMS',
        description: 'A product used only by the tests.',
        icon: 'globe',
        minRam: 512,
        minCpu: 1,
        minDisk: 5,
        deployable: true,
        prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
      },
    });
    await prisma.order.create({
      data: {
        number: 'BM-00001',
        userId: ownerId,
        status: 'PENDING',
        total: 149,
        currency: 'EUR',
        items: { create: { productId: product.id, name: 'Ordered product', quantity: 1, unitAmount: 149, total: 149 } },
      },
    });

    const list = await other.request('GET', '/api/orders');
    expect(list.body.orders).toHaveLength(0);

    const single = await other.request('GET', '/api/orders/BM-00001');
    expect(single.status).toBe(404);
  });

  it('does not show another customer tickets', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    const ticket = await prisma.ticket.create({
      data: {
        userId: ownerId,
        subject: 'Private question',
        status: 'OPEN',
        messages: { create: { authorId: ownerId, body: 'Only the owner may read this.' } },
      },
    });

    const list = await other.request('GET', '/api/tickets');
    expect(list.body.tickets).toHaveLength(0);

    const single = await other.request('GET', `/api/tickets/${ticket.id}`);
    expect(single.status).toBe(404);
  });

  it('does not let a customer attach a ticket to another customer instance', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');

    const instance = await makeInstance(ownerId);
    const response = await other.request('POST', '/api/tickets', {
      subject: 'Not my instance',
      body: 'Trying to attach somebody else instance.',
      instanceId: instance.id,
    });
    expect(response.status).toBe(400);
  });

  it('refuses admin routes to a customer', async () => {
    const { client } = await registerAndLogin(app, 'notadmin@example.com');
    const response = await client.request('GET', '/api/admin/overview');
    expect(response.status).toBe(403);
  });
});

describe('anonymous access', () => {
  it('rejects a protected route without a session', async () => {
    const client = makeClient(app);
    for (const url of ['/api/instances', '/api/orders', '/api/tickets', '/api/billing/invoices']) {
      const response = await client.request('GET', url);
      expect(response.status).toBe(401);
    }
  });
});
