import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import { env } from '../src/env.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

async function seed() {
  return prisma.product.create({
    data: {
      slug: 'wordpress', name: 'WordPress', category: 'WEB_CMS', description: 'd', icon: 'globe',
      minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10,
      maxRam: 8192, maxCpu: 4, maxDisk: 100, deployable: true, eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
}

describe('probe3', () => {
  it('first: a simple order is paid', async () => {
    await seed();
    const { client } = await registerAndLogin(app, 'buyer@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;
    const webhook = makeClient(app);
    const delivery = await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_1', type: 'checkout.session.completed', orderId,
      subscriptionId: 'sub_test_1', paymentIntentId: 'pi_test_1',
      amount: created.body.order.total,
    }, { headers: { 'x-internal-token': env.internalToken } });
    console.log('T1 DELIVERY', delivery.status);
    expect(delivery.status).toBe(200);
  });

  it('second: a two line order fails', async () => {
    await seed();
    const { client } = await registerAndLogin(app, 'multi@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [
        { productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 },
        { productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 },
      ],
    });
    const orderId = created.body.order.id as string;
    const webhook = makeClient(app);
    const delivery = await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_multi', type: 'checkout.session.completed', orderId,
      subscriptionId: 'sub_multi', paymentIntentId: 'pi_multi',
      amount: created.body.order.total,
    }, { headers: { 'x-internal-token': env.internalToken } });
    console.log('T2 DELIVERY', delivery.status, JSON.stringify(delivery.body));
    const events = await prisma.webhookEvent.findMany({});
    console.log('T2 LEDGER', JSON.stringify(events.map((e) => ({ id: e.eventId, status: e.status, error: e.error })), null, 2));
    expect(true).toBe(true);
  });
});
