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

async function seedProduct() {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
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
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
}

describe('stripe webhook handling', () => {
  it('marks an order paid and creates exactly one instance', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const event = {
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      orderId,
      subscriptionId: 'sub_test_1',
      paymentIntentId: 'pi_test_1',
      amount: 149,
    };

    const first = await webhook.request('POST', '/api/webhooks/stripe/test', event);
    expect(first.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('FULFILLED');
    expect(order?.paidAt).toBeTruthy();

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(1);
    expect(instances[0]?.status).toBe('PENDING');
  });

  it('processes a redelivered event only once', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer2@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const event = { id: 'evt_test_duplicate', type: 'checkout.session.completed', orderId, subscriptionId: 'sub_dup' };

    const first = await webhook.request('POST', '/api/webhooks/stripe/test', event);
    const second = await webhook.request('POST', '/api/webhooks/stripe/test', event);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(1);

    const events = await prisma.webhookEvent.findMany({ where: { provider: 'stripe', eventId: 'evt_test_duplicate' } });
    expect(events).toHaveLength(1);
  });

  it('records a payment exactly once for a repeated event', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer3@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const event = { id: 'evt_test_payment', type: 'checkout.session.completed', orderId, paymentIntentId: 'pi_once' };
    await webhook.request('POST', '/api/webhooks/stripe/test', event);
    await webhook.request('POST', '/api/webhooks/stripe/test', event);

    const payments = await prisma.payment.findMany({ where: { stripePaymentIntentId: 'pi_once' } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.status).toBe('SUCCEEDED');
  });

  it('ignores an event for an unknown order', async () => {
    const webhook = makeClient(app);
    const response = await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_unknown',
      type: 'checkout.session.completed',
      orderId: 'does-not-exist',
    });
    expect(response.status).toBe(200);
    expect(await prisma.instance.count()).toBe(0);
  });

  it('refuses a second order for the same paid item', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer4@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_order',
      type: 'checkout.session.completed',
      orderId,
    });

    // A different event id for the same order must not create a second instance.
    await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_order_2',
      type: 'checkout.session.completed',
      orderId,
    });

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(1);
  });
});

describe('orders', () => {
  it('creates an order with a server-side price', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'order@example.com');

    const response = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 2048, cpu: 2, disk: 10 }],
    });

    expect(response.status).toBe(201);
    expect(response.body.order.total).toBe(289);
    expect(response.body.order.status).toBe('PENDING');
    expect(response.body.order.items[0].config.ram).toBe(2048);
  });

  it('refuses to create an order for an unknown product', async () => {
    const { client } = await registerAndLogin(app, 'order2@example.com');
    const response = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'nothing-here', ram: 512, cpu: 1, disk: 5 }],
    });
    expect(response.status).toBe(404);
  });

  it('does not let a customer cancel a paid order', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'order3@example.com');
    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
    });
    const orderId = orderResponse.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
    const response = await client.request('POST', `/api/orders/${orderId}/cancel`);
    expect(response.status).toBe(400);
  });
});
