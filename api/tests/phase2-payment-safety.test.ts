import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import { env } from '../src/env.js';
import type { FastifyInstance } from 'fastify';

/**
 * The money rules that the payment gate of the provisioning relies on.
 *
 * The gate is only a gate if the money state cannot be faked. These tests
 * cover the three ways it used to be faked: a dead order that was paid
 * anyway, a quote that did not travel with the order, and a payment event
 * that carried no amount at all.
 */

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

const MONTHLY = 149;
const YEARLY = 1788;

/** A counter, so that no two cases share a payment intent. */
let sequence = 0;

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
          // The resource price is zero, so the sum of the quote is the sum
          // of the price row and nothing else. The test then says what it
          // means: the yearly plan costs the yearly sum.
          { period: 'MONTHLY', baseAmount: MONTHLY, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' },
          { period: 'YEARLY', baseAmount: YEARLY, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' },
        ],
      },
    },
  });
}

async function placeOrder(email: string, period: 'MONTHLY' | 'YEARLY' = 'MONTHLY') {
  const { client } = await registerAndLogin(app, email);
  const response = await client.request('POST', '/api/orders', {
    items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    period,
  });
  return { client, response };
}

/** The internal test webhook, the way the Stripe delivery calls it. */
async function deliverPayment(orderId: string, amount?: number) {
  sequence += 1;
  const webhook = makeClient(app);
  return webhook.request(
    'POST',
    '/api/webhooks/stripe/test',
    {
      id: `evt_phase2_${orderId}_${sequence}`,
      type: 'checkout.session.completed',
      orderId,
      subscriptionId: `sub_phase2_${sequence}`,
      paymentIntentId: `pi_phase2_${sequence}`,
      ...(amount === undefined ? {} : { amount }),
    },
    { headers: { 'x-internal-token': env.internalToken } },
  );
}

describe('the state of an order when the money arrives', () => {
  it('never pays a cancelled order and provisions nothing', async () => {
    await seedProduct();
    const { response } = await placeOrder('cancelled@example.com');
    expect(response.status).toBe(201);
    const orderId = response.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });

    await deliverPayment(orderId, MONTHLY);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    // The order is not paid and nothing was created for it.
    expect(order?.status).not.toBe('PAID');
    expect(order?.status).not.toBe('FULFILLED');
    expect(order?.paidAt).toBeFalsy();
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
    // The money that arrives for a cancelled order is returned, so the order
    // ends up cancelled or refunded, never paid.
    expect(['CANCELLED', 'REFUNDED']).toContain(order?.status);
  });

  it('never pays a refunded order and provisions nothing', async () => {
    await seedProduct();
    const { response } = await placeOrder('refunded@example.com');
    const orderId = response.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });

    await deliverPayment(orderId, MONTHLY);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).not.toBe('PAID');
    expect(order?.status).not.toBe('FULFILLED');
    expect(order?.paidAt).toBeFalsy();
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
  });

  it('refuses to pay a dead order through the service that pays', async () => {
    await seedProduct();
    const { response } = await placeOrder('dead@example.com');
    const orderId = response.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });

    // The guard does not live only in the webhook. The service that marks an
    // order as paid refuses an order that is not payable, so no other caller
    // can open the payment gate of a dead order.
    const { markOrderPaid } = await import('../src/services/stripe.js');
    await expect(markOrderPaid({ orderId })).rejects.toThrow(/cannot be paid/i);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('CANCELLED');
    expect(order?.paidAt).toBeFalsy();
  });

  it('still pays an order that is waiting for a payment', async () => {
    await seedProduct();
    const { response } = await placeOrder('payable@example.com');
    const orderId = response.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: 'AWAITING_PAYMENT' } });

    const delivery = await deliverPayment(orderId, MONTHLY);
    expect(delivery.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');
    expect(order?.paidAt).toBeTruthy();
  });

  it('keeps a payment event that carries no amount from being applied', async () => {
    await seedProduct();
    const { response } = await placeOrder('noamount@example.com');
    const orderId = response.body.order.id as string;

    const delivery = await deliverPayment(orderId);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    // A payment event without an amount cannot be compared with the order, so
    // it is refused instead of being taken on trust.
    expect(order?.status).not.toBe('PAID');
    expect(order?.paidAt).toBeFalsy();
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
    expect(delivery.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a payment that collected a different sum than the order', async () => {
    await seedProduct();
    const { response } = await placeOrder('wrongamount@example.com');
    const orderId = response.body.order.id as string;

    const delivery = await deliverPayment(orderId, MONTHLY - 1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).not.toBe('PAID');
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
    expect(delivery.status).toBeGreaterThanOrEqual(400);
  });
});

describe('the period of the price travels with the order', () => {
  it('quotes a yearly plan with the yearly price', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'yearly@example.com');

    const quote = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
      period: 'YEARLY',
    });

    expect(quote.status).toBe(200);
    expect(quote.body.period).toBe('YEARLY');
    expect(quote.body.total).toBe(YEARLY);
  });

  it('orders the yearly plan with the sum that was quoted', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'yearly-order@example.com');

    const quote = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
      period: 'YEARLY',
    });
    const order = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
      period: 'YEARLY',
    });

    expect(order.status).toBe(201);
    // The sum that was quoted is the sum that is charged.
    expect(order.body.order.total).toBe(quote.body.total);
    expect(order.body.order.total).toBe(YEARLY);

    const stored = await prisma.order.findUnique({
      where: { id: order.body.order.id as string },
      include: { items: true },
    });
    const config = (stored?.items[0]?.config ?? {}) as { period?: string };
    // The period travels with the line, so the payment provider is asked for
    // the yearly interval and not for the monthly one.
    expect(config.period).toBe('YEARLY');
  });

  it('keeps the monthly sum for a monthly order', async () => {
    await seedProduct();
    const { response } = await placeOrder('monthly@example.com');

    expect(response.status).toBe(201);
    expect(response.body.order.total).toBe(MONTHLY);
  });

  it('refuses a yearly quote for a product that has no yearly price', async () => {
    await prisma.product.create({
      data: {
        slug: 'monthly-only',
        name: 'Monthly only',
        category: 'WEB_CMS',
        description: 'A product that is only sold by the month.',
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
        prices: { create: { period: 'MONTHLY', baseAmount: MONTHLY, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' } },
      },
    });
    const { client } = await registerAndLogin(app, 'noyearly@example.com');

    const quote = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'monthly-only', ram: 1024, cpu: 1, disk: 10 }],
      period: 'YEARLY',
    });

    // A product without a yearly price has no yearly quote. The answer is
    // refused, never replaced with the monthly sum.
    expect(quote.status).toBeGreaterThanOrEqual(400);
    expect(quote.body.total).toBeUndefined();
  });
});

describe('the customer comes back from the payment', () => {
  it('confirms the payment through the local gateway and provisions the order', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'return@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;

    const checkout = await client.request('POST', `/api/orders/${orderId}/checkout`);
    expect(checkout.status).toBe(200);
    // The local gateway names the session after the order, so the page can
    // come back to the order it belongs to.
    expect(String(checkout.body.sessionId)).toContain(orderId);

    const confirmed = await client.request('POST', `/api/orders/${orderId}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.order.status).toBe('PAID');

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');
    expect(order?.paidAt).toBeTruthy();
    expect(await prisma.instance.count({ where: { orderId } })).toBe(1);
  });

  it('is safe to confirm a payment twice', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'twice@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;

    const first = await client.request('POST', `/api/orders/${orderId}/confirm`);
    const second = await client.request('POST', `/api/orders/${orderId}/confirm`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.alreadyPaid).toBe(true);
    // One order, one instance: the second confirmation changes nothing.
    expect(await prisma.instance.count({ where: { orderId } })).toBe(1);
  });

  it('refuses to confirm an order that is not the customer one', async () => {
    await seedProduct();
    const { client: owner } = await registerAndLogin(app, 'owner@example.com');
    const created = await owner.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;

    const { client: stranger } = await registerAndLogin(app, 'stranger@example.com');
    const confirmed = await stranger.request('POST', `/api/orders/${orderId}/confirm`);

    expect(confirmed.status).toBe(404);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).not.toBe('PAID');
  });

  it('refuses to confirm a cancelled order', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'cancelled-confirm@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;
    await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });

    const confirmed = await client.request('POST', `/api/orders/${orderId}/confirm`);

    expect(confirmed.status).toBeGreaterThanOrEqual(400);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('CANCELLED');
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
  });
});

describe('the customer is invoiced for what they paid', () => {
  it('writes an invoice with the sum of the order when the payment arrives', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'invoiced@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;
    const total = created.body.order.total as number;

    const delivery = await deliverPayment(orderId, total);
    expect(delivery.status).toBe(200);

    const invoices = await client.request('GET', '/api/billing/invoices');
    expect(invoices.status).toBe(200);
    expect(invoices.body.invoices).toHaveLength(1);
    // The sum that was quoted is the sum that is invoiced.
    expect(invoices.body.invoices[0].total).toBe(total);
    // The status is written in the upper case in the database and returned in
    // the lower case by the API, like every other status of the platform.
    expect(String(invoices.body.invoices[0].status).toUpperCase()).toBe('PAID');
    expect(invoices.body.invoices[0].number).toMatch(/^BM-INV-/);
    // The invoice belongs to the order that was paid. The list of the API
    // does not show the internal id, so the link is checked in the database.
    const written = await prisma.invoice.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email: 'invoiced@example.com' } }))!.id } });
    expect(written?.orderId).toBe(orderId);
    expect(written?.total).toBe(total);
  });

  it('writes one invoice when the payment event is replayed', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'replayed@example.com');
    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    const orderId = created.body.order.id as string;
    const total = created.body.order.total as number;

    await deliverPayment(orderId, total);
    // The same event, delivered again.
    await deliverPayment(orderId, total);

    const invoices = await client.request('GET', '/api/billing/invoices');
    expect(invoices.body.invoices).toHaveLength(1);
  });
});
