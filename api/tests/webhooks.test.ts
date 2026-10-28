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
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
}

/**
 * The events of this file carry the sum that was collected.
 *
 * A payment event without an amount cannot be compared with the order, so it
 * is refused: a check that lets the missing amount through is not a check.
 */
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
      amount: orderResponse.body.order.total,
    };

    const internal = { headers: { 'x-internal-token': env.internalToken } };
    const first = await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);
    expect(first.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    // The money state and the fulfilment state are separate: the order is
    // paid, and the services are still being provisioned.
    expect(order?.status).toBe('PAID');
    expect(order?.fulfillmentStatus).toBe('PROVISIONING');
    expect(order?.paidAt).toBeTruthy();

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(1);
    expect(instances[0]?.status).toBe('PENDING');
  });

  it('creates one subscription per order line', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'multi@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [
        { productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 },
        { productSlug: 'wordpress', ram: 2048, cpu: 2, disk: 10 },
      ],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const internal = { headers: { 'x-internal-token': env.internalToken } };
    const response = await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_multi',
      type: 'checkout.session.completed',
      orderId,
      subscriptionId: 'sub_multi',
      customerId: 'cus_multi',
      amount: orderResponse.body.order.total,
    }, internal);
    expect(response.status).toBe(200);

    const subscriptions = await prisma.subscription.findMany({ where: { orderItem: { orderId } } });
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions.every((subscription) => subscription.stripeSubscriptionId === 'sub_multi')).toBe(true);
    expect(subscriptions.every((subscription) => subscription.status === 'ACTIVE')).toBe(true);

    // The customer is stored, so the billing portal can find it.
    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment?.stripeCustomerId).toBe('cus_multi');
  });

  it('provisions one instance per unit of a line', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'quantity@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10, quantity: 3 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_quantity',
      type: 'checkout.session.completed',
      orderId,
      amount: orderResponse.body.order.total,
    }, { headers: { 'x-internal-token': env.internalToken } });

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(3);
    expect(new Set(instances.map((instance) => instance.provisioningKey)).size).toBe(3);
  });

  it('refuses a payment that does not match the order and keeps the event for a replay', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'mismatch@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const internal = { headers: { 'x-internal-token': env.internalToken } };
    const response = await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_mismatch',
      type: 'checkout.session.completed',
      orderId,
      amount: 9999,
    }, internal);

    // The event could not be processed, so the provider is told to retry it.
    expect(response.status).toBe(500);

    const event = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_test_mismatch' } },
    });
    expect(event?.status).toBe('failed');
    expect(event?.error).toBeTruthy();

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(0);
  });

  it('replays a failed event', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'replay@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const internal = { headers: { 'x-internal-token': env.internalToken } };
    await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_replay',
      type: 'checkout.session.completed',
      orderId,
      amount: 9999,
    }, internal);

    // The order is corrected to the amount the provider collected, and the
    // event is replayed from the ledger.
    await prisma.order.update({ where: { id: orderId }, data: { total: 9999 } });
    const replay = await webhook.request('POST', '/api/webhooks/stripe/replay', { eventId: 'evt_test_replay' }, internal);
    expect(replay.status).toBe(200);

    const event = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_test_replay' } },
    });
    expect(event?.status).toBe('processed');

    const instances = await prisma.instance.findMany({ where: { orderId } });
    expect(instances).toHaveLength(1);
  });

  it('does not consume a promotion before the payment', async () => {
    await seedProduct();
    const promotion = await prisma.promotion.create({
      data: { code: 'SAVE10', type: 'PERCENT', value: 1000, maxRedemptions: 1 },
    });
    const { client } = await registerAndLogin(app, 'promo@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
      promotionCode: 'SAVE10',
    });
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.order.id as string;

    // The campaign is reserved, not used.
    const beforePayment = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(beforePayment?.usedCount).toBe(0);

    const webhook = makeClient(app);
    await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_promo',
      type: 'checkout.session.completed',
      orderId,
      amount: orderResponse.body.order.total,
    }, { headers: { 'x-internal-token': env.internalToken } });

    const afterPayment = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(afterPayment?.usedCount).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.promotionRedeemedAt).toBeTruthy();
  });

  it('processes a redelivered event only once', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer2@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = orderResponse.body.order.id as string;

    const webhook = makeClient(app);
    const event = { id: 'evt_test_duplicate', type: 'checkout.session.completed', orderId, subscriptionId: 'sub_dup', amount: orderResponse.body.order.total };

    const internal = { headers: { 'x-internal-token': env.internalToken } };
    const first = await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);
    const second = await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);

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
    const event = { id: 'evt_test_payment', type: 'checkout.session.completed', orderId, paymentIntentId: 'pi_once', amount: orderResponse.body.order.total };
    const internal = { headers: { 'x-internal-token': env.internalToken } };
    await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);
    await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);

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
    }, { headers: { 'x-internal-token': env.internalToken } });
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
      amount: orderResponse.body.order.total,
    }, { headers: { 'x-internal-token': env.internalToken } });

    // A different event id for the same order must not create a second instance.
    await webhook.request('POST', '/api/webhooks/stripe/test', {
      id: 'evt_test_order_2',
      type: 'checkout.session.completed',
      orderId,
      amount: orderResponse.body.order.total,
    }, { headers: { 'x-internal-token': env.internalToken } });

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
    // Two gigabytes of memory, two processors and ten gigabytes of disk.
    expect(response.body.order.total).toBe(400);
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
