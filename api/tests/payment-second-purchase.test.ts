/**
 * A customer that pays twice.
 *
 * The customer of the provider is the same for every order of a customer, so
 * the second payment of a customer carries the same identifier as the first
 * one. The table of the payments held the customer of the provider under a
 * unique constraint, so the second payment was refused by the database. The
 * order was marked as paid before the write, so the money was taken, the
 * payment was never written and no service was delivered.
 *
 * The gateway of the test gives every order its own customer, so the suite
 * could never reach this defect. The event below carries the same customer
 * for the two orders, the way the provider does.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import { env } from '../src/env.js';
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

async function seedProduct(slug: string, name: string) {
  return prisma.product.create({
    data: {
      slug,
      name,
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 1024,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
}

describe('a customer that pays twice', () => {
  it('is served the second time as well', async () => {
    await seedProduct('wordpress', 'WordPress');
    await seedProduct('code-server', 'code-server');
    const { client } = await registerAndLogin(app, 'repeat@example.com');
    const webhook = makeClient(app);
    const internal = { headers: { 'x-internal-token': env.internalToken } };

    const first = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    expect(first.status).toBe(201);
    const firstOrderId = first.body.order.id as string;

    const firstEvent = await webhook.request(
      'POST',
      '/api/webhooks/stripe/test',
      {
        id: 'evt_repeat_first',
        type: 'checkout.session.completed',
        orderId: firstOrderId,
        paymentIntentId: 'pi_repeat_first',
        customerId: 'cus_repeat',
        amount: first.body.order.total,
      },
      internal,
    );
    expect(firstEvent.status).toBe(200);

    // The second order of the same customer. The provider gives the same
    // customer for it, so the second payment carries the same identifier.
    const second = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'code-server', ram: 2048, cpu: 1, disk: 10 }],
    });
    expect(second.status).toBe(201);
    const secondOrderId = second.body.order.id as string;

    const secondEvent = await webhook.request(
      'POST',
      '/api/webhooks/stripe/test',
      {
        id: 'evt_repeat_second',
        type: 'checkout.session.completed',
        orderId: secondOrderId,
        paymentIntentId: 'pi_repeat_second',
        customerId: 'cus_repeat',
        amount: second.body.order.total,
      },
      internal,
    );
    expect(secondEvent.status).toBe(200);

    // The money of the second order is written down.
    const payments = await prisma.payment.findMany({ where: { orderId: secondOrderId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe('SUCCEEDED');
    expect(payments[0]?.stripeCustomerId).toBe('cus_repeat');

    // Both orders are paid and both services are delivered. Before the
    // repair the second payment was refused by the database, the order was
    // left as paid and no service existed.
    const orders = await prisma.order.findMany({ where: { id: { in: [firstOrderId, secondOrderId] } } });
    expect(orders.every((order) => order.status === 'PAID')).toBe(true);
    const instances = await prisma.instance.findMany({ where: { orderId: { in: [firstOrderId, secondOrderId] } } });
    expect(instances).toHaveLength(2);
  });
});
