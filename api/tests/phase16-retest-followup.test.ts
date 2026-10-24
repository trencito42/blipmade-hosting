import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { markOrderPaid } from '../src/services/stripe.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';

/**
 * The follow-up of the independent retest of the repairs.
 *
 * Four rules are checked here, because each of them was measured as still
 * open by that retest:
 *
 *  - the limit of the quote and the limit of the order are kept per visitor,
 *    not for the whole platform (the retest measured that the whole suite
 *    stayed green with the key of the counter disconnected);
 *  - an order that is already paid stays paid when the payment is repeated
 *    without a sum: the service that pays is idempotent;
 *  - a refunded order keeps the trace of the refund when a payment arrives
 *    late for it;
 *  - a person may act on their own account: a member of the staff may refund
 *    their own order.
 */

let app: FastifyInstance;

const MONTHLY = 149;
const QUOTE_LIMIT = 120;
const ORDER_LIMIT = 30;

let sequence = 0;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

/** A product with a price, so that a quote and an order have a sum. */
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
      prices: {
        create: [
          { period: 'MONTHLY', baseAmount: MONTHLY, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' },
        ],
      },
    },
  });
}

/** The internal test webhook, the way the Stripe delivery calls it. */
async function deliverPayment(orderId: string, amount?: number) {
  sequence += 1;
  const webhook = makeClient(app);
  return webhook.request(
    'POST',
    '/api/webhooks/stripe/test',
    {
      id: `evt_phase16_${orderId}_${sequence}`,
      type: 'checkout.session.completed',
      orderId,
      subscriptionId: `sub_phase16_${sequence}`,
      paymentIntentId: `pi_phase16_${sequence}`,
      ...(amount === undefined ? {} : { amount }),
    },
    { headers: { 'x-internal-token': env.internalToken } },
  );
}

describe('the limits of the customer are kept per visitor', () => {
  it('keeps the limit of the quote per visitor', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'quotes@example.com');
    const body = { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }] };

    // The visitor fills their own limit.
    for (let index = 0; index < QUOTE_LIMIT; index += 1) {
      const response = await client.request('POST', '/api/catalog/quote', body, {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(response.status).toBe(200);
    }

    const refused = await client.request('POST', '/api/catalog/quote', body, {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');

    // Another visitor is not refused by the counter of the first one. This is
    // the assertion that fails when the key of the counter is the address of
    // the proxy instead of the address of the visitor.
    const other = await client.request('POST', '/api/catalog/quote', body, {
      headers: { 'x-forwarded-for': '198.51.100.4' },
    });
    expect(other.status).toBe(200);
  });

  it('keeps the limit of the order per visitor', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'orders@example.com');
    const body = { items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }] };

    for (let index = 0; index < ORDER_LIMIT; index += 1) {
      const response = await client.request('POST', '/api/orders', body, {
        headers: { 'x-forwarded-for': '203.0.113.20' },
      });
      expect(response.status).toBe(201);
    }

    const refused = await client.request('POST', '/api/orders', body, {
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });
    expect(refused.status).toBe(429);

    const other = await client.request('POST', '/api/orders', body, {
      headers: { 'x-forwarded-for': '198.51.100.5' },
    });
    expect(other.status).toBe(201);
  });
});

describe('the service that pays an order', () => {
  it('keeps an order that is already paid paid when the payment is repeated', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'replay@example.com');
    const response = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = response.body.order.id as string;

    await markOrderPaid({ orderId, amount: MONTHLY });
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe('PAID');

    // The same payment, repeated, without a sum: the order stays paid and
    // the service does not turn into an error.
    await expect(markOrderPaid({ orderId })).resolves.toBeDefined();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');
    expect(order?.paidAt).toBeTruthy();
    expect(await prisma.invoice.count({ where: { orderId } })).toBeLessThanOrEqual(1);
  });

  it('keeps the trace of the refund when a payment arrives late', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'late@example.com');
    const placed = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = placed.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });

    await deliverPayment(orderId, MONTHLY);

    // The order was refunded, so the state that says the money was returned
    // is not erased by a payment that arrives late.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('REFUNDED');
    expect(order?.status).not.toBe('PAID');
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
  });
});

describe('the accounts of the platform', () => {
  it('lets a member of the staff refund their own order', async () => {
    await seedProduct();
    const { hashPassword } = await import('../src/lib/password.js');
    const staff = await prisma.user.create({
      data: {
        email: 'staff@example.com',
        passwordHash: await hashPassword('PerfLocal9x!secure'),
        role: 'STAFF',
        firstName: 'Test',
        lastName: 'Staff',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.staffMember.create({ data: { userId: staff.id, permissions: ['orders.write'] } });

    const client = makeClient(app);
    const login = await client.request('POST', '/api/auth/login', {
      email: 'staff@example.com',
      password: 'PerfLocal9x!secure',
    });
    expect(login.status).toBe(200);

    const order = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    expect(order.status).toBe(201);
    const orderId = order.body.order.id as string;

    // The order is their own: the rule of the accounts of the platform does
    // not stop them from asking for the money back.
    const refund = await client.request('POST', `/api/admin/orders/${orderId}/refund`, {
      reason: 'a reason that is long enough for the audit',
    });
    expect(refund.status).not.toBe(403);
  });
});
