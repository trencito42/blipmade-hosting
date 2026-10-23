import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';

/**
 * The links a customer follows.
 *
 * Every link that leaves the system is built from the public origin of the
 * site. The address of the API is never used for them: in the deployed
 * environment it is `http://127.0.0.1:3000`, and a customer that follows it
 * ends up on the server itself.
 *
 * The Stripe client and the database are replaced, so the test needs neither
 * a Stripe account nor a database.
 */

const mocks = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  orderUpdate: vi.fn(),
  paymentFindFirst: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('stripe', () => {
  class FakeStripe {
    checkout = { sessions: { create: mocks.checkoutCreate } };
    billingPortal = { sessions: { create: mocks.portalCreate } };
  }
  return { default: FakeStripe };
});

vi.mock('../src/db.js', () => ({
  prisma: {
    order: { update: mocks.orderUpdate },
    payment: { findFirst: mocks.paymentFindFirst },
    auditLog: { create: mocks.auditCreate },
  },
}));

const { createBillingPortal, createCheckout, paymentState } = await import('../src/services/stripe.js');

const ORIGINAL = {
  paymentsEnabled: env.paymentsEnabled,
  stripeEnabled: env.stripeEnabled,
  appPublicUrl: env.APP_PUBLIC_URL,
  stripeTestMode: process.env.STRIPE_TEST_MODE,
};

function setEnv(key: string, value: unknown): void {
  Object.defineProperty(env, key, { value, configurable: true, writable: true, enumerable: true });
}

/** The order of a customer that is about to pay. */
const ORDER = {
  id: 'order_test_1',
  number: 'BM-00001',
  userId: 'user_test_1',
  kind: 'NEW',
  status: 'PENDING',
  currency: 'EUR',
  total: 1490,
  items: [],
} as unknown as Parameters<typeof createCheckout>[0];

afterEach(() => {
  setEnv('paymentsEnabled', ORIGINAL.paymentsEnabled);
  setEnv('stripeEnabled', ORIGINAL.stripeEnabled);
  setEnv('APP_PUBLIC_URL', ORIGINAL.appPublicUrl);
  if (ORIGINAL.stripeTestMode === undefined) delete process.env.STRIPE_TEST_MODE;
  else process.env.STRIPE_TEST_MODE = ORIGINAL.stripeTestMode;
  mocks.checkoutCreate.mockReset();
  mocks.portalCreate.mockReset();
  mocks.orderUpdate.mockReset();
  mocks.paymentFindFirst.mockReset();
  mocks.auditCreate.mockReset();
});

describe('the links of the checkout', () => {
  it('are built from the public origin and not from the address of the API', async () => {
    setEnv('paymentsEnabled', true);
    setEnv('stripeEnabled', true);
    // The address the API has in the deployed environment.
    setEnv('APP_PUBLIC_URL', 'http://127.0.0.1:3000');
    mocks.checkoutCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const result = await createCheckout(ORDER);

    const params = mocks.checkoutCreate.mock.calls[0]![0];
    expect(params.success_url).toBe(`${env.publicWebUrl}/app/billing?checkout=success`);
    expect(params.cancel_url).toBe(`${env.publicWebUrl}/app/billing?checkout=cancelled`);
    expect(params.success_url).not.toContain('127.0.0.1');
    expect(params.cancel_url).not.toContain('127.0.0.1');
    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('keeps the line items and the metadata of the order', async () => {
    setEnv('paymentsEnabled', true);
    setEnv('stripeEnabled', true);
    mocks.checkoutCreate.mockResolvedValue({ id: 'cs_test_2', url: 'https://checkout.stripe.com/c/pay/cs_test_2' });

    await createCheckout(ORDER);

    const params = mocks.checkoutCreate.mock.calls[0]![0];
    expect(params.mode).toBe('subscription');
    expect(params.client_reference_id).toBe(ORDER.id);
    expect(params.metadata).toEqual({ orderId: ORDER.id, orderNumber: ORDER.number, orderKind: ORDER.kind });
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0].price_data.currency).toBe('eur');
    expect(params.line_items[0].price_data.unit_amount).toBe(ORDER.total);
  });

  it('sends the customer back to the public origin after the billing portal', async () => {
    setEnv('paymentsEnabled', true);
    setEnv('stripeEnabled', true);
    setEnv('APP_PUBLIC_URL', 'http://127.0.0.1:3000');
    mocks.paymentFindFirst.mockResolvedValue({ stripeCustomerId: 'cus_test_1' });
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test' });

    const result = await createBillingPortal('user_test_1');

    const params = mocks.portalCreate.mock.calls[0]![0];
    expect(params.return_url).toBe(`${env.publicWebUrl}/app/billing`);
    expect(params.return_url).not.toContain('127.0.0.1');
    expect(params.customer).toBe('cus_test_1');
    expect(result.url).toBe('https://billing.stripe.com/p/session/test');
  });
});

describe('the state of the payments', () => {
  it('says that a payment cannot be taken while payments are off', async () => {
    setEnv('paymentsEnabled', false);
    setEnv('stripeEnabled', false);
    // The local test gateway is off, so this is the state of the live site.
    process.env.STRIPE_TEST_MODE = 'false';

    const state = paymentState();

    expect(state.enabled).toBe(false);
    expect(state.reason).toContain('not available');
  });

  it('refuses a checkout while payments are off, without creating a session', async () => {
    setEnv('paymentsEnabled', false);
    setEnv('stripeEnabled', false);
    process.env.STRIPE_TEST_MODE = 'false';

    await expect(createCheckout(ORDER)).rejects.toMatchObject({
      statusCode: 503,
      code: 'payments_unavailable',
    });

    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
  });

  it('refuses the billing portal while payments are off, without creating a session', async () => {
    setEnv('paymentsEnabled', false);
    setEnv('stripeEnabled', false);
    process.env.STRIPE_TEST_MODE = 'false';

    await expect(createBillingPortal('user_test_1')).rejects.toMatchObject({
      statusCode: 503,
      code: 'payments_unavailable',
    });

    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });

  it('keeps the local test gateway for the installations that use it', async () => {
    setEnv('paymentsEnabled', false);
    setEnv('stripeEnabled', false);
    process.env.STRIPE_TEST_MODE = 'true';

    const result = await createCheckout(ORDER);

    expect(result.sessionId).toBe('test_cs_order_test_1');
    expect(result.url).toContain(`${env.publicWebUrl}/app/billing?checkout=`);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });
});
