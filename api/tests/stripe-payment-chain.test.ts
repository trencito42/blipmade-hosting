import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The whole chain of a payment.
 *
 * The customer asks for a checkout, the checkout is paid, the delivery of the
 * payment arrives at the webhook, the order is paid, the subscription starts,
 * the invoice is written, the service is put on the queue of the worker and
 * the customer is told.
 *
 * The provider is replaced at its own boundary, so the real adapters run:
 * the real request is built, the real signature is verified with the same
 * computation the provider uses, and the real answer is parsed. No request
 * leaves the machine.
 */

const WEBHOOK_SECRET = 'whsec_blipmade_test_secret';

/** What the fake provider remembers. */
const provider = vi.hoisted(() => ({
  sessions: [] as { id: string; url: string; client_reference_id: string; metadata: Record<string, string> }[],
  customerId: null as string | null,
}));

/**
 * The provider of the payments.
 *
 * The signature of a delivery is verified exactly the way the provider
 * verifies it: the timestamp of the delivery and the signature of the body,
 * compared in constant time.
 */
vi.mock('stripe', () => {
  class StripeMock {
    webhooks = {
      constructEvent(raw: string, header: string, secret: string) {
        const parts = String(header ?? '').split(',').map((part) => part.trim().split('='));
        const timestamp = parts.find(([key]) => key === 't')?.[1];
        const signature = parts.find(([key]) => key === 'v1')?.[1];
        if (!timestamp || !signature) throw new Error('No signatures found matching the expected signature for payload');
        const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new Error('No signatures found matching the expected signature for payload');
        }
        return JSON.parse(raw);
      },
    };
    checkout = {
      sessions: {
        create: async (params: { client_reference_id: string; metadata: Record<string, string> }) => {
          const session = {
            id: `cs_test_chain_${provider.sessions.length + 1}`,
            url: 'https://checkout.stripe.com/c/pay/cs_test_chain',
            client_reference_id: params.client_reference_id,
            metadata: params.metadata,
          };
          provider.sessions.push(session);
          return session;
        },
      },
    };
    customers = {
      create: async () => ({ id: provider.customerId ?? 'cus_test_chain' }),
      list: async () => ({ data: [] }),
    };
    subscriptions = {
      retrieve: async (id: string) => ({
        id,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        items: { data: [] },
      }),
    };
    paymentIntents = { retrieve: async (id: string) => ({ id, amount: 1000, status: 'succeeded' }) };
    invoices = { retrieve: async (id: string) => ({ id, amount_paid: 1000, total: 1000 }) };
    refunds = { create: async (params: { payment_intent: string }) => ({ id: 're_test_chain', payment_intent: params.payment_intent }) };
    checkoutSessions = { list: async () => ({ data: [] }) };
  }
  return { default: StripeMock };
});

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
const { buildApp } = await import('../src/app.js');
const { resetDatabase } = await import('./setup.js');
const { hashPassword } = await import('../src/lib/password.js');

/**
 * The environment of a site that has a provider of payments.
 *
 * The key is a placeholder and the secret is the one the deliveries of the
 * tests are signed with. The environment of the tests is read when the module
 * is loaded, so the values are set on the object itself.
 */
const environment = env as unknown as {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  stripeEnabled: boolean;
  stripeTaxEnabled: boolean;
  paymentsEnabled: boolean;
  publicWebUrl: string;
};
environment.STRIPE_SECRET_KEY = 'sk_test_blipmade_placeholder';
environment.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
environment.stripeEnabled = true;
environment.stripeTaxEnabled = false;
environment.paymentsEnabled = true;
// The checkout hands out a link to the site, so the origin of the site has
// to be there even when the machine that runs the tests has none.
environment.publicWebUrl = 'https://blipmade.com';

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
  provider.sessions = [];
  provider.customerId = null;
});

/** A customer of the platform. */
async function seedUser() {
  const email = `chain-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('CorrectHorseBattery9'),
      firstName: 'Test',
      lastName: 'Customer',
      emailVerifiedAt: new Date(),
    },
  });
}

/** A product that can be bought. */
async function seedProduct() {
  return prisma.product.create({
    data: {
      slug: `chain-product-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
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

/** An order that waits for its payment, with the line it pays for. */
async function seedOrder(userId: string) {
  const product = await seedProduct();
  const created = await prisma.order.create({
    data: {
      number: `BM-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      userId,
      status: 'AWAITING_PAYMENT',
      total: 1000,
      currency: 'EUR',
      items: {
        create: {
          productId: product.id,
          name: 'Service',
          quantity: 1,
          unitAmount: 1000,
          total: 1000,
          currency: 'EUR',
        },
      },
    },
  });
  // The checkout needs the lines of the order, so the order is read again
  // with them.
  const order = await prisma.order.findUnique({ where: { id: created.id }, include: { items: true } });
  return { order: order!, product };
}

/** The header of a delivery that the provider signed. */
function signedHeader(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/** Delivers an event to the webhook, the way the provider delivers it. */
async function deliver(payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const response = await app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': signedHeader(raw, WEBHOOK_SECRET, timestamp) },
    payload: raw,
  });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = { raw: response.body };
  }
  return { status: response.statusCode, body };
}

describe('the chain of a payment', () => {
  it('goes from the checkout to a service that is provisioned and a customer that is told', async () => {
    const user = await seedUser();
    const { order, product } = await seedOrder(user.id);

    // 1. The customer asks for a checkout.
    const { createCheckout } = await import('../src/services/stripe.js');
    const checkout = await createCheckout(order as never, user.email);

    expect(checkout.url).toBeTruthy();
    expect(checkout.sessionId).toBeTruthy();
    expect(provider.sessions).toHaveLength(1);
    expect(provider.sessions[0]!.client_reference_id).toBe(order.id);
    // The order keeps the session, so a second checkout of the same order is
    // recognised as the same one.
    const withSession = await prisma.order.findUnique({ where: { id: order.id } });
    expect(withSession?.stripeCheckoutSessionId).toBe(checkout.sessionId);

    // 2. The payment arrives and is delivered to the webhook.
    const response = await deliver({
      id: `evt_chain_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkout.sessionId,
          client_reference_id: order.id,
          payment_status: 'paid',
          payment_intent: 'pi_chain',
          customer: 'cus_chain',
          subscription: 'sub_chain',
          amount_total: 1000,
          amount_subtotal: 1000,
          metadata: { orderId: order.id, orderNumber: order.number },
        },
      },
    });
    expect(response.status).toBe(200);

    // 3. The order is paid.
    const paid = await prisma.order.findUnique({ where: { id: order.id } });
    expect(paid?.status).toBe('PAID');
    expect(paid?.fulfillmentStatus).toBe('PROVISIONING');

    // 4. The subscription of the line exists and is active.
    const subscription = await prisma.subscription.findFirst({ where: { orderItemId: { not: null } } });
    expect(subscription?.status).toBe('ACTIVE');
    expect(subscription?.stripeSubscriptionId).toBe('sub_chain');

    // 5. The invoice of the payment is written.
    const invoice = await prisma.invoice.findFirst({ where: { orderId: order.id } });
    expect(invoice?.status).toBe('PAID');
    expect(invoice?.total).toBe(1000);

    // 6. The service is on the queue of the worker.
    const instance = await prisma.instance.findFirst({ where: { orderId: order.id } });
    expect(instance).toBeTruthy();
    expect(instance?.productId).toBe(product.id);
    const { getQueue } = await import('../src/services/queue.js');
    expect(await getQueue().getJob(`provision-${instance!.id}`)).toBeTruthy();

    // 7. The customer is told that the subscription started.
    const events = await prisma.notificationEvent.findMany({ where: { userId: user.id } });
    expect(events.map((event) => event.type)).toContain('subscription.activated');
  });

  it('does not pay the same order twice', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);

    const event = {
      id: `evt_chain_twice_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_chain_twice',
          client_reference_id: order.id,
          payment_status: 'paid',
          payment_intent: 'pi_chain_twice',
          customer: 'cus_chain',
          subscription: 'sub_chain_twice',
          amount_total: 1000,
          amount_subtotal: 1000,
        },
      },
    };

    const first = await deliver(event);
    expect(first.status).toBe(200);

    const second = await deliver(event);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    // One order, one subscription, one invoice, one service.
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.instance.count({ where: { orderId: order.id } })).toBe(1);
  });
});
