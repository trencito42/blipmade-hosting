import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * The webhook of Stripe.
 *
 * The deliveries of this file are signed the way Stripe signs them: the
 * timestamp of the delivery and the signature of the body, computed with the
 * secret of the platform. The verification that is checked here is therefore
 * the verification of a real delivery, and not a shortcut.
 *
 * The key of Stripe is a placeholder. No request ever leaves the machine: the
 * tests only look at what the platform does with a delivery.
 */

const WEBHOOK_SECRET = 'whsec_blipmade_test_secret';

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
const { buildApp } = await import('../src/app.js');
const { resetDatabase } = await import('./setup.js');
const { hashPassword } = await import('../src/lib/password.js');
const Stripe = (await import('stripe')).default;

/**
 * The environment of a site that has a Stripe key.
 *
 * The key is a placeholder, and the secret is the one the deliveries of the
 * tests are signed with. The environment of the tests is read when the module
 * is loaded, so the values are set on the object itself.
 */
const environment = env as unknown as {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  stripeEnabled: boolean;
  stripeTaxEnabled: boolean;
};
environment.STRIPE_SECRET_KEY = 'sk_test_blipmade_placeholder';
environment.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
environment.stripeEnabled = true;

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  environment.stripeTaxEnabled = false;
});

/**
 * The header of a delivery that was signed the way Stripe signs it: the
 * timestamp of the delivery, the signature of the body and the timestamp
 * again.
 */
function signedHeader(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Delivers an event to the webhook, the way Stripe delivers it.
 *
 * The body is signed with the secret of the platform, unless another secret,
 * another body or another header is given: a delivery that is signed with the
 * wrong secret, whose body was changed after it was signed, or that carries
 * no header at all, has to be refused.
 */
async function deliver(
  payload: unknown,
  options: { header?: string | null; secret?: string; signedBody?: unknown; timestamp?: number } = {},
): Promise<{ status: number; body: { received?: boolean; duplicate?: boolean; deferred?: boolean; reason?: string } }> {
  const raw = JSON.stringify(payload);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signedBody = options.signedBody === undefined ? raw : JSON.stringify(options.signedBody);
  const computed = signedHeader(signedBody, options.secret ?? WEBHOOK_SECRET, timestamp);
  const header = options.header === undefined ? computed : options.header;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (header !== null) headers['stripe-signature'] = header;

  const response = await app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    headers,
    payload: raw,
  });

  let body: { received?: boolean; duplicate?: boolean; deferred?: boolean; reason?: string };
  try {
    body = JSON.parse(response.body);
  } catch {
    body = { reason: response.body };
  }
  return { status: response.statusCode, body };
}

async function seedUser(): Promise<{ id: string; email: string }> {
  const email = `stripe-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('CorrectHorseBattery9'),
      firstName: 'Test',
      lastName: 'Customer',
      emailVerifiedAt: new Date(),
    },
  });
  return user;
}

async function seedProduct() {
  return prisma.product.create({
    data: {
      slug: `product-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: 'Service',
      category: 'WEB_CMS',
      description: 'A service.',
      icon: 'globe',
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 1000, currency: 'EUR' } },
    },
  });
}

/**
 * An order that waits for its payment, with the line it pays for.
 */
async function seedOrder(
  userId: string,
  options: { total?: number; status?: 'PENDING' | 'AWAITING_PAYMENT' | 'PAID' } = {},
) {
  const product = await seedProduct();
  const total = options.total ?? 1000;
  const order = await prisma.order.create({
    data: {
      number: `BM-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      userId,
      status: options.status ?? 'AWAITING_PAYMENT',
      total,
      currency: 'EUR',
      items: {
        create: {
          productId: product.id,
          name: 'Service',
          quantity: 1,
          unitAmount: total,
          total,
          currency: 'EUR',
        },
      },
    },
  });
  return { order, product };
}

async function seedSubscription(userId: string, stripeSubscriptionId: string, status: 'ACTIVE' | 'PAST_DUE' = 'ACTIVE') {
  return prisma.subscription.create({
    data: { userId, stripeSubscriptionId, status, amount: 1000, currency: 'EUR' },
  });
}

describe('the signature of a delivery', () => {
  it('accepts a delivery that carries a valid signature', async () => {
    const response = await deliver({ id: 'evt_valid', type: 'ping', data: { object: {} } });
    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });

  it('accepts a signature that the Stripe SDK itself produced', async () => {
    const raw = JSON.stringify({ id: 'evt_sdk', type: 'ping', data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: WEBHOOK_SECRET });
    const response = await deliver(JSON.parse(raw), { header });
    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });

  it('refuses a delivery that carries no signature header', async () => {
    const response = await deliver({ id: 'evt_unsigned', type: 'ping', data: { object: {} } }, { header: null });
    expect(response.status).toBe(400);
    expect(response.body.reason).toMatch(/stripe-signature header is missing/i);
  });

  it('refuses a delivery whose header is malformed', async () => {
    const response = await deliver(
      { id: 'evt_malformed', type: 'ping', data: { object: {} } },
      { header: 'this-is-not-a-signature' },
    );
    expect(response.status).toBe(400);
    expect(response.body.reason).toMatch(/malformed/i);
  });

  it('refuses a delivery whose signature has expired', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const response = await deliver({ id: 'evt_expired', type: 'ping', data: { object: {} } }, { timestamp: old });
    expect(response.status).toBe(400);
    expect(response.body.reason).toMatch(/expired/i);
  });

  it('refuses a delivery that was signed with another secret', async () => {
    const response = await deliver(
      { id: 'evt_other_secret', type: 'ping', data: { object: {} } },
      { secret: 'whsec_a_different_secret' },
    );
    expect(response.status).toBe(400);
    expect(response.body.reason).toMatch(/does not match/i);
  });

  it('refuses a delivery whose body was changed after it was signed', async () => {
    const response = await deliver(
      { id: 'evt_tampered', type: 'ping', data: { object: { amount: 1 } } },
      { signedBody: { id: 'evt_tampered', type: 'ping', data: { object: { amount: 999999 } } } },
    );
    expect(response.status).toBe(400);
    expect(response.body.reason).toMatch(/does not match/i);
  });

  it('does not apply a delivery whose signature was refused', async () => {
    await deliver({ id: 'evt_refused', type: 'ping', data: { object: {} } }, { header: null });
    const event = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_refused' } },
    });
    expect(event).toBeNull();
  });

  it('records a delivery it accepted in the ledger', async () => {
    await deliver({ id: 'evt_ledger', type: 'ping', data: { object: {} } });
    const event = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_ledger' } },
    });
    expect(event?.status).toBe('processed');
  });

  it('ignores a redelivery of an event it already processed', async () => {
    const payload = { id: 'evt_twice', type: 'ping', data: { object: {} } };
    await deliver(payload);
    const second = await deliver(payload);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });
});

describe('the state of a subscription', () => {
  const states: { stripe: string; expected: string }[] = [
    { stripe: 'active', expected: 'ACTIVE' },
    { stripe: 'trialing', expected: 'TRIALING' },
    { stripe: 'past_due', expected: 'PAST_DUE' },
    { stripe: 'unpaid', expected: 'PAST_DUE' },
    { stripe: 'incomplete', expected: 'INCOMPLETE' },
    { stripe: 'incomplete_expired', expected: 'CANCELLED' },
    { stripe: 'canceled', expected: 'CANCELLED' },
    { stripe: 'paused', expected: 'PAUSED' },
  ];

  for (const state of states) {
    it(`maps the state ${state.stripe} to ${state.expected}`, async () => {
      const user = await seedUser();
      await seedSubscription(user.id, `sub_${state.stripe}`, 'PAST_DUE');
      const response = await deliver({
        id: `evt_state_${state.stripe}`,
        type: 'customer.subscription.updated',
        data: { object: { id: `sub_${state.stripe}`, status: state.stripe, cancel_at_period_end: false } },
      });
      expect(response.status).toBe(200);
      const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: `sub_${state.stripe}` } });
      expect(subscription?.status).toBe(state.expected);
    });
  }

  it('keeps the state of the platform when Stripe sends a state it does not know', async () => {
    const user = await seedUser();
    await seedSubscription(user.id, 'sub_unknown', 'PAST_DUE');
    const response = await deliver({
      id: 'evt_state_unknown',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_unknown', status: 'a_state_of_the_future', cancel_at_period_end: false } },
    });
    expect(response.status).toBe(200);
    const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: 'sub_unknown' } });
    expect(subscription?.status).toBe('PAST_DUE');
    const entry = await prisma.auditLog.findFirst({ where: { action: 'stripe.subscription_state_unknown' } });
    expect(entry).toBeTruthy();
  });

  it('cancels a subscription that was deleted', async () => {
    const user = await seedUser();
    await seedSubscription(user.id, 'sub_deleted', 'ACTIVE');
    const response = await deliver({
      id: 'evt_subscription_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_deleted', status: 'canceled', cancel_at_period_end: false } },
    });
    expect(response.status).toBe(200);
    const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: 'sub_deleted' } });
    expect(subscription?.status).toBe('CANCELLED');
  });
});

describe('a checkout that was abandoned', () => {
  it('releases the order and the campaign slot it was holding', async () => {
    const user = await seedUser();
    const promotion = await prisma.promotion.create({
      data: { code: `PROMO-${Date.now()}-${Math.floor(Math.random() * 100000)}`, type: 'PERCENT', value: 10 },
    });
    const { order } = await seedOrder(user.id, { total: 900, status: 'AWAITING_PAYMENT' });
    await prisma.order.update({ where: { id: order.id }, data: { promotionId: promotion.id } });
    await prisma.promotionRedemption.create({
      data: { promotionId: promotion.id, userId: user.id, orderId: order.id, amount: 100 },
    });

    const response = await deliver({
      id: 'evt_checkout_expired',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_expired', client_reference_id: order.id } },
    });
    expect(response.status).toBe(200);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('CANCELLED');
    const redemption = await prisma.promotionRedemption.findUnique({ where: { orderId: order.id } });
    expect(redemption).toBeNull();
  });

  it('leaves an order that was paid alone', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id, { status: 'PAID' });
    const response = await deliver({
      id: 'evt_checkout_expired_paid',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_expired_paid', client_reference_id: order.id } },
    });
    expect(response.status).toBe(200);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
  });
});

describe('the subscription an invoice pays for', () => {
  it('reads the subscription of an invoice of the newer shape', async () => {
    const user = await seedUser();
    await seedSubscription(user.id, 'sub_nested');
    const now = Math.floor(Date.now() / 1000);
    const response = await deliver({
      id: 'evt_invoice_nested',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_nested',
          parent: { subscription_details: { subscription: 'sub_nested' } },
          customer: 'cus_nested',
          amount_paid: 1000,
          currency: 'EUR',
          period_start: now,
          period_end: now + 30 * 24 * 3600,
        },
      },
    });
    expect(response.status).toBe(200);
    const invoice = await prisma.invoice.findFirst({ where: { stripeInvoiceId: 'in_nested' } });
    expect(invoice).toBeTruthy();
    expect(invoice?.userId).toBe(user.id);
    const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: 'sub_nested' } });
    expect(subscription?.currentPeriodEnd).toBeTruthy();
  });

  it('reads the subscription of an invoice of the pinned shape', async () => {
    const user = await seedUser();
    await seedSubscription(user.id, 'sub_direct');
    const now = Math.floor(Date.now() / 1000);
    const response = await deliver({
      id: 'evt_invoice_direct',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_direct',
          subscription: 'sub_direct',
          customer: 'cus_direct',
          amount_paid: 1000,
          currency: 'EUR',
          period_start: now,
          period_end: now + 30 * 24 * 3600,
        },
      },
    });
    expect(response.status).toBe(200);
    const invoice = await prisma.invoice.findFirst({ where: { stripeInvoiceId: 'in_direct' } });
    expect(invoice).toBeTruthy();
  });

  it('marks the subscription past due when the invoice could not be paid', async () => {
    const user = await seedUser();
    await seedSubscription(user.id, 'sub_failed');
    const response = await deliver({
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_failed',
          parent: { subscription_details: { subscription: 'sub_failed' } },
          amount_paid: 0,
          currency: 'EUR',
        },
      },
    });
    expect(response.status).toBe(200);
    const subscription = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: 'sub_failed' } });
    expect(subscription?.status).toBe('PAST_DUE');
  });
});

describe('the sum that pays for an order', () => {
  it('pays the order for the sum of the order when no tax is charged', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id, { total: 1000 });
    const response = await deliver({
      id: 'evt_paid_plain',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_plain',
          client_reference_id: order.id,
          payment_status: 'paid',
          payment_intent: 'pi_plain',
          customer: 'cus_plain',
          subscription: 'sub_plain',
          amount_total: 1000,
          amount_subtotal: 1000,
        },
      },
    });
    expect(response.status).toBe(200);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
    const invoice = await prisma.invoice.findFirst({ where: { orderId: order.id } });
    expect(invoice?.amount).toBe(1000);
    expect(invoice?.tax).toBe(0);
    expect(invoice?.total).toBe(1000);
  });

  it('records the tax the provider charged next to the sum of the order', async () => {
    environment.stripeTaxEnabled = true;
    const user = await seedUser();
    const { order } = await seedOrder(user.id, { total: 1000 });
    const response = await deliver({
      id: 'evt_paid_with_tax',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_tax',
          client_reference_id: order.id,
          payment_status: 'paid',
          payment_intent: 'pi_tax',
          customer: 'cus_tax',
          subscription: 'sub_tax',
          amount_total: 1100,
          amount_subtotal: 1000,
        },
      },
    });
    expect(response.status).toBe(200);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
    const invoice = await prisma.invoice.findFirst({ where: { orderId: order.id } });
    expect(invoice?.amount).toBe(1000);
    expect(invoice?.tax).toBe(100);
    expect(invoice?.total).toBe(1100);
    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment?.amount).toBe(1100);
  });

  it('refuses a payment that does not match the sum of the order', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id, { total: 1000 });
    const response = await deliver({
      id: 'evt_wrong_sum',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_wrong',
          client_reference_id: order.id,
          payment_status: 'paid',
          payment_intent: 'pi_wrong',
          customer: 'cus_wrong',
          amount_total: 999,
          amount_subtotal: 999,
        },
      },
    });
    expect(response.status).toBe(500);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('FAILED');
    const subscription = await prisma.subscription.findFirst({ where: { orderItem: { orderId: order.id } } });
    expect(subscription).toBeNull();
  });
});

describe('the flow of a payment', () => {
  it('turns a signed payment into a service that is provisioned', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id, { total: 1000 });

    const response = await deliver({
      id: 'evt_paid_and_provisioned',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_provisioned',
          client_reference_id: order.id,
          payment_status: 'paid',
          payment_intent: 'pi_provisioned',
          customer: 'cus_provisioned',
          subscription: 'sub_provisioned',
          amount_total: 1000,
          amount_subtotal: 1000,
        },
      },
    });

    expect(response.status).toBe(200);

    // The order is paid and the fulfilment has started.
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
    expect(updated?.fulfillmentStatus).toBe('PROVISIONING');

    // The service exists and its provisioning is on the queue.
    const instances = await prisma.instance.findMany({ where: { orderId: order.id } });
    expect(instances).toHaveLength(1);
    const instance = instances[0]!;
    expect(instance.status).toBe('PENDING');

    const { getQueue } = await import('../src/services/queue.js');
    const job = await getQueue().getJob(`provision-${instance.id}`);
    expect(job).toBeTruthy();
  });
});
