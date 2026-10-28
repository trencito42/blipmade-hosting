import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

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

/**
 * A product of the catalogue that can be ordered.
 *
 * The price of the configuration is the price of the catalogue, so the extra
 * resources are free in the price and the quote of the tests is a number that
 * everybody knows.
 */
async function makeProduct(slug: string) {
  return prisma.product.create({
    data: {
      slug,
      name: 'Service',
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
      eggId: 1,
      prices: {
        create: {
          period: 'MONTHLY',
          baseAmount: 149,
          ramPerGb: 0,
          cpuPerUnit: 0,
          diskPerGb: 0,
          currency: 'EUR',
        },
      },
    },
  });
}

/**
 * The billing data of one customer: a service, the subscription that pays for
 * it, an invoice and a payment.
 *
 * Every customer gets rows of its own, so a test can tell the rows of the
 * customer apart from the rows of somebody else.
 */
async function makeBillingData(
  userId: string,
  options: { slug: string; invoiceNumber: string; cancelAtPeriodEnd?: boolean },
) {
  const product = await makeProduct(options.slug);

  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'service',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      instanceId: instance.id,
      status: 'ACTIVE',
      amount: 149,
      currency: 'EUR',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
      ...(options.cancelAtPeriodEnd ? { cancelledAt: new Date() } : {}),
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      number: options.invoiceNumber,
      userId,
      status: 'PAID',
      amount: 149,
      tax: 0,
      total: 149,
      currency: 'EUR',
      paidAt: new Date(),
    },
  });

  const payment = await prisma.payment.create({
    data: { userId, amount: 149, currency: 'EUR', status: 'SUCCEEDED' },
  });

  return { product, instance, subscription, invoice, payment };
}

describe('the billing of another customer', () => {
  it('does not cancel the subscription of another customer', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const { subscription } = await makeBillingData(ownerId, {
      slug: 'owner-product',
      invoiceNumber: 'BM-OWNER-1',
    });

    const response = await other.request('POST', `/api/billing/subscriptions/${subscription.id}/cancel`);

    // The subscription of somebody else is not found. The answer does not say
    // that it exists for another customer.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');

    const unchanged = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(unchanged?.cancelAtPeriodEnd).toBe(false);
    expect(unchanged?.status).toBe('ACTIVE');
  });

  it('does not resume the subscription of another customer', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const { subscription } = await makeBillingData(ownerId, {
      slug: 'owner-product',
      invoiceNumber: 'BM-OWNER-1',
      cancelAtPeriodEnd: true,
    });

    const response = await other.request('POST', `/api/billing/subscriptions/${subscription.id}/resume`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');

    // The subscription of the owner is still cancelled: nobody woke it up.
    const unchanged = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(unchanged?.cancelAtPeriodEnd).toBe(true);
    expect(unchanged?.cancelledAt).toBeTruthy();
  });

  it('does not renew the subscription of another customer', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const { subscription } = await makeBillingData(ownerId, {
      slug: 'owner-product',
      invoiceNumber: 'BM-OWNER-1',
    });

    const response = await other.request('POST', `/api/billing/subscriptions/${subscription.id}/renew`, {
      period: 'MONTHLY',
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');

    // No renewal was written for the owner: no invoice and no order.
    const invoices = await prisma.invoice.findMany({ where: { userId: ownerId } });
    expect(invoices).toHaveLength(1);
    const orders = await prisma.order.findMany({ where: { userId: ownerId } });
    expect(orders).toHaveLength(0);
  });

  it('shows only the rows of the customer in the summary', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { userId: otherId, client: other } = await registerAndLogin(app, 'other@example.com');
    const owner = await makeBillingData(ownerId, { slug: 'owner-product', invoiceNumber: 'BM-OWNER-1' });
    const own = await makeBillingData(otherId, { slug: 'other-product', invoiceNumber: 'BM-OTHER-1' });

    // An invoice that is still open belongs to the renewal list of the summary.
    await prisma.invoice.create({
      data: {
        number: 'BM-OWNER-2',
        userId: ownerId,
        status: 'OPEN',
        amount: 149,
        tax: 0,
        total: 149,
        currency: 'EUR',
        dueDate: new Date(),
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await other.request('GET', '/api/billing/summary');
    expect(response.status).toBe(200);

    // The lists and the numbers of the summary are the rows of the customer.
    expect(response.body.instances.map((row: { id: string }) => row.id)).toEqual([own.instance.id]);
    expect(response.body.subscriptions.map((row: { id: string }) => row.id)).toEqual([own.subscription.id]);
    expect(response.body.pendingRenewals).toHaveLength(0);
    expect(response.body.monthlyEstimate).toBe(149);
    expect(response.body.currentPeriodEnd).toBeTruthy();

    // Nothing of the other customer is in the answer.
    const answer = JSON.stringify(response.body);
    expect(answer).not.toContain(owner.instance.id);
    expect(answer).not.toContain(owner.subscription.id);
    expect(answer).not.toContain('BM-OWNER-1');
    expect(answer).not.toContain('BM-OWNER-2');
  });

  it('shows only the subscriptions of the customer', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { userId: otherId, client: other } = await registerAndLogin(app, 'other@example.com');
    const owner = await makeBillingData(ownerId, { slug: 'owner-product', invoiceNumber: 'BM-OWNER-1' });
    const own = await makeBillingData(otherId, { slug: 'other-product', invoiceNumber: 'BM-OTHER-1' });

    const response = await other.request('GET', '/api/billing/subscriptions');
    expect(response.status).toBe(200);
    expect(response.body.subscriptions).toHaveLength(1);
    expect(response.body.subscriptions[0].id).toBe(own.subscription.id);
    expect(JSON.stringify(response.body)).not.toContain(owner.subscription.id);
  });

  it('shows only the invoices of the customer', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { userId: otherId, client: other } = await registerAndLogin(app, 'other@example.com');
    const owner = await makeBillingData(ownerId, { slug: 'owner-product', invoiceNumber: 'BM-OWNER-1' });
    const own = await makeBillingData(otherId, { slug: 'other-product', invoiceNumber: 'BM-OTHER-1' });

    const response = await other.request('GET', '/api/billing/invoices');
    expect(response.status).toBe(200);
    expect(response.body.invoices.map((row: { id: string }) => row.id)).toEqual([own.invoice.id]);
    expect(JSON.stringify(response.body)).not.toContain(owner.invoice.number);
  });

  it('does not export the data of the service of another customer', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const { instance } = await makeBillingData(ownerId, { slug: 'owner-product', invoiceNumber: 'BM-OWNER-1' });

    const response = await other.request('GET', `/api/billing/instances/${instance.id}/export`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
    expect(response.body.export).toBeUndefined();
  });

  it('exports the data of the customer of the service only', async () => {
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { userId: otherId, client: other } = await registerAndLogin(app, 'other@example.com');
    const owner = await makeBillingData(ownerId, { slug: 'owner-product', invoiceNumber: 'BM-OWNER-1' });
    const own = await makeBillingData(otherId, { slug: 'other-product', invoiceNumber: 'BM-OTHER-1' });

    const response = await other.request('GET', `/api/billing/instances/${own.instance.id}/export`);
    expect(response.status).toBe(200);
    expect(response.body.export.customer.email).toBe('other@example.com');
    expect(response.body.export.invoices.map((row: { id: string }) => row.id)).toEqual([own.invoice.id]);
    expect(JSON.stringify(response.body)).not.toContain(owner.instance.id);
  });
});

describe('the payment method', () => {
  it('answers that payments are unavailable instead of handing out a portal link', async () => {
    const { client } = await registerAndLogin(app, 'payer@example.com');

    const response = await client.request('POST', '/api/billing/payment-method');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('payments_unavailable');
    expect(response.body.url).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('stripe.com');
  });

  it('tells the customer that no payment can be taken', async () => {
    const { client } = await registerAndLogin(app, 'payer@example.com');

    const response = await client.request('GET', '/api/billing/payment-state');
    expect(response.status).toBe(200);
    expect(response.body.payments.enabled).toBe(false);
    expect(response.body.payments.reason).toBeTruthy();
  });
});

describe('the quote', () => {
  it('prices the quote on the server and ignores a price from the body', async () => {
    const { client } = await registerAndLogin(app, 'quoter@example.com');
    const product = await makeProduct('quoted-product');

    const response = await client.request('POST', '/api/billing/quote', {
      items: [
        {
          productSlug: product.slug,
          ram: 1024,
          cpu: 1,
          disk: 10,
          price: 1,
          unitAmount: 1,
          total: 1,
          amount: 1,
        },
      ],
      period: 'MONTHLY',
      total: 1,
      subtotal: 1,
      discount: 0,
      currency: 'EUR',
    });

    expect(response.status).toBe(200);
    // The price of the resources of the configuration, and not the price that
    // the body of the request carried: the fee of the instance, one gigabyte
    // of memory, one processor and ten gigabytes of disk.
    expect(response.body.items[0].unitAmount).toBe(374);
    expect(response.body.items[0].total).toBe(374);
    expect(response.body.subtotal).toBe(374);
    expect(response.body.total).toBe(374);
  });
});
