import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

/**
 * The administrative refund.
 *
 * The money is returned by the payment provider, so the order has to carry a
 * payment intent, and the order may only be refunded once. Every step of it
 * leaves a trace in the audit journal.
 */

const mocks = vi.hoisted(() => ({
  refundCreate: vi.fn(async () => ({ id: 're_test', status: 'succeeded' as const })),
}));

// The payment provider is replaced, so the test needs no Stripe account. The
// refund of the platform still runs, with the provider replaced by this one.
vi.mock('stripe', () => {
  class FakeStripe {
    refunds = { create: mocks.refundCreate };
  }
  return { default: FakeStripe };
});

let app: FastifyInstance;

const ORIGINAL_STRIPE_ENABLED = env.stripeEnabled;

function setStripeEnabled(value: boolean): void {
  Object.defineProperty(env, 'stripeEnabled', { value, configurable: true, writable: true, enumerable: true });
}

/** Creates a customer who can hold an order. */
async function createCustomer(email: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(VALID_PASSWORD),
      role: 'CUSTOMER',
      firstName: 'Test',
      lastName: 'Customer',
      emailVerifiedAt: new Date(),
    },
  });
  return user.id;
}

/** Creates an administrator and logs them in. */
async function createAdmin(email = 'admin@blipmade.test'): Promise<{ client: TestClient; userId: string }> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(VALID_PASSWORD),
      role: 'ADMIN',
      firstName: 'Test',
      lastName: 'Administrator',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions: [] } });

  const client = makeClient(app);
  const response = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (response.status !== 200) throw new Error(`Could not log ${email} in: ${response.status}`);
  return { client, userId: user.id };
}

/** Creates an order of a customer. */
let orderNumber = 1000;
async function createOrder(
  userId: string,
  options: { status?: 'PENDING' | 'PAID' | 'FULFILLED'; paymentIntentId?: string | null; amount?: number } = {},
): Promise<string> {
  orderNumber += 1;
  const order = await prisma.order.create({
    data: {
      number: `BM-${orderNumber}`,
      userId,
      status: options.status ?? 'PAID',
      total: options.amount ?? 2400,
      currency: 'EUR',
      stripePaymentIntentId: options.paymentIntentId ?? null,
      paidAt: options.status === 'PENDING' ? null : new Date(),
    },
  });
  if (options.paymentIntentId) {
    await prisma.payment.create({
      data: {
        userId,
        orderId: order.id,
        amount: options.amount ?? 2400,
        currency: 'EUR',
        status: 'SUCCEEDED',
        stripePaymentIntentId: options.paymentIntentId,
      },
    });
  }
  return order.id;
}

describe('the administrative refund', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    setStripeEnabled(ORIGINAL_STRIPE_ENABLED);
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    mocks.refundCreate.mockClear();
    setStripeEnabled(true);
  });

  afterEach(async () => {
    setStripeEnabled(ORIGINAL_STRIPE_ENABLED);
  });

  it('refuses to refund an order that is not paid', async () => {
    const { client: admin } = await createAdmin();
    const customerId = await createCustomer('customer@blipmade.test');
    const orderId = await createOrder(customerId, { status: 'PENDING', paymentIntentId: 'pi_test' });

    const response = await admin.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The customer asked for it.' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
    expect(response.body.error.message).toMatch(/not paid/i);
    expect(mocks.refundCreate).not.toHaveBeenCalled();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PENDING');
  });

  it('refuses to refund an order that carries no payment intent', async () => {
    const { client: admin } = await createAdmin();
    const customerId = await createCustomer('customer@blipmade.test');
    const orderId = await createOrder(customerId, { status: 'PAID', paymentIntentId: null });

    const response = await admin.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The customer asked for it.' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
    expect(response.body.error.message).toMatch(/payment intent/i);
    expect(mocks.refundCreate).not.toHaveBeenCalled();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');
  });

  it('says that payments are not configured when they are not', async () => {
    setStripeEnabled(false);
    const { client: admin } = await createAdmin();
    const customerId = await createCustomer('customer@blipmade.test');
    const orderId = await createOrder(customerId, { status: 'PAID', paymentIntentId: 'pi_test' });

    const response = await admin.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The customer asked for it.' });

    expect(response.status).toBe(503);
    expect(response.body.error.message).toMatch(/not configured/i);
    expect(mocks.refundCreate).not.toHaveBeenCalled();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');
  });

  it('refunds a paid order and writes the reason and the amount in the audit journal', async () => {
    const { client: admin } = await createAdmin();
    const customerId = await createCustomer('customer@blipmade.test');
    const orderId = await createOrder(customerId, { status: 'PAID', paymentIntentId: 'pi_test', amount: 2400 });

    const response = await admin.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The service was never delivered.' });

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe('refunded');
    expect(response.body.order.amount).toBe(2400);
    expect(mocks.refundCreate).toHaveBeenCalledTimes(1);
    // The refund is asked for with a key that belongs to this order, so a
    // second refund of the same order is the same request at the provider and
    // the money is never returned twice.
    expect(mocks.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test' }),
      expect.objectContaining({ idempotencyKey: `blipmade-refund-${orderId}` }),
    );

    // The order is not paid any more.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('REFUNDED');

    // The reason and the amount of the refund are in the audit journal.
    const entry = await prisma.auditLog.findFirst({ where: { action: 'order.refunded', targetId: orderId } });
    expect(entry).not.toBeNull();
    const meta = entry?.meta as unknown as { reason?: string; amount?: number } | null;
    expect(meta?.reason).toBe('The service was never delivered.');
    expect(meta?.amount).toBe(2400);
  });

  it('refunds an order only once', async () => {
    const { client: admin } = await createAdmin();
    const customerId = await createCustomer('customer@blipmade.test');
    const orderId = await createOrder(customerId, { status: 'FULFILLED', paymentIntentId: 'pi_test' });

    const first = await admin.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The first refund.' });
    expect(first.status).toBe(200);

    const second = await admin.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The second refund.' });
    expect(second.status).toBe(409);
    expect(mocks.refundCreate).toHaveBeenCalledTimes(1);

    const entries = await prisma.auditLog.count({ where: { action: 'order.refunded', targetId: orderId } });
    expect(entries).toBe(1);
  });

  it('refuses the refund when the account may not write orders', async () => {
    const staff = await prisma.user.create({
      data: {
        email: 'staff@blipmade.test',
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: 'STAFF',
        firstName: 'Test',
        lastName: 'Staff',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.staffMember.create({ data: { userId: staff.id, permissions: ['orders.read'] } });
    const client = makeClient(app);
    await client.request('POST', '/api/auth/login', { email: 'staff@blipmade.test', password: VALID_PASSWORD });

    const customerId = await createCustomer('customer@blipmade.test');
    const orderId = await createOrder(customerId, { status: 'PAID', paymentIntentId: 'pi_test' });

    const response = await client.request('POST', `/api/admin/orders/${orderId}/refund`, { reason: 'The customer asked for it.' });

    expect(response.status).toBe(403);
    expect(mocks.refundCreate).not.toHaveBeenCalled();
  });
});
