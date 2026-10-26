import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Stripe from 'stripe';

/**
 * The chain of a payment, with the real provider in its sandbox.
 *
 * The other test of the chain replaces the provider at its own boundary, so
 * the platform is checked and the provider is not. This one does the opposite:
 * the provider is the sandbox of Stripe itself, a real checkout session is
 * made, a real payment is taken with a card of the test mode, and the
 * delivery that reaches the webhook is signed with the real secret of the
 * webhook. Nothing of the live site is touched: the keys are the keys of the
 * test mode, and the data lives in the disposable database of the tests.
 *
 * The file is skipped unless the operator asks for it:
 *
 *   STRIPE_SANDBOX_E2E=1 STRIPE_SECRET_KEY=sk_test_... npm test -- stripe-sandbox-live
 *
 * The cases that are covered:
 *
 *   1. the checkout that the platform builds exists in the sandbox;
 *   2. the payment of the sandbox is taken, the order is paid, the
 *      subscription starts, the invoice is written, the service is put on the
 *      queue and the customer is told;
 *   3. the same delivery that arrives twice does not write anything twice;
 *   4. a payment that is refused does not mark the order as paid;
 *   5. a checkout that is given up does not mark the order as paid;
 *   6. the money of a paid order comes back.
 */

/** The file only runs when the operator asked for the sandbox. */
const wanted = process.env.STRIPE_SANDBOX_E2E === '1';

/** The key of the sandbox: the key of the live site never runs this file. */
const sandboxKey = process.env.STRIPE_SECRET_KEY ?? '';
const isSandbox = sandboxKey.startsWith('sk_test_');

const stripe = new Stripe(sandboxKey || 'sk_test_none', {
  apiVersion: '2025-02-24.acacia' as never,
});

/** The card of the test mode that is always accepted. */
const CARD_OK = 'pm_card_visa';
/** The card of the test mode that is always refused. */
const CARD_REFUSED = 'pm_card_chargeDeclined';

/** What the run leaves behind in the sandbox and in the database. */
const created: {
  userId?: string;
  productId?: string;
  orderIds: string[];
  sessionIds: string[];
  intentIds: string[];
} = { orderIds: [], sessionIds: [], intentIds: [] };

/** The stamp of the run, so nothing of a run is the name of another. */
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

describe.skipIf(!wanted || !isSandbox)('the chain of a payment with the sandbox of the provider', () => {
  let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
  let prisma: typeof import('../src/db.js').prisma;

  beforeAll(async () => {
    // The file must never write in the database of the live site.
    const { assertDisposableDatabase } = await import('../src/lib/test-target.js');
    assertDisposableDatabase({ label: 'run the sandbox of the payments' });
    const appModule = await import('../src/app.js');
    const dbModule = await import('../src/db.js');
    app = await appModule.buildApp();
    await app.ready();
    prisma = dbModule.prisma;
  });

  afterAll(async () => {
    // Everything the run made in the sandbox is given back.
    for (const intent of created.intentIds) {
      await stripe.refunds.create({ payment_intent: intent }).catch(() => undefined);
    }
    for (const session of created.sessionIds) {
      await stripe.checkout.sessions.expire(session).catch(() => undefined);
    }
    if (created.orderIds.length) {
      await prisma.notificationEvent.deleteMany({ where: { userId: created.userId } }).catch(() => undefined);
      await prisma.instance.deleteMany({ where: { orderId: { in: created.orderIds } } }).catch(() => undefined);
      await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orderIds } } }).catch(() => undefined);
      await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } }).catch(() => undefined);
    }
    if (created.productId) {
      await prisma.product.deleteMany({ where: { id: created.productId } }).catch(() => undefined);
    }
    if (created.userId) {
      await prisma.user.deleteMany({ where: { id: created.userId } }).catch(() => undefined);
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  /** The customer, the product and the order of the run. */
  async function makeOrder(label: string): Promise<{ orderId: string; userId: string; productId: string }> {
    const { hashPassword } = await import('../src/lib/password.js');
    const user = await prisma.user.create({
      data: {
        email: `sandbox-${label}-${stamp}@example.com`,
        passwordHash: await hashPassword('CorrectHorseBattery9'),
        firstName: 'Sand',
        lastName: 'Box',
        emailVerifiedAt: new Date(),
      },
    });
    created.userId = user.id;
    const product = await prisma.product.create({
      data: {
        slug: `sandbox-product-${label}-${stamp}`,
        name: 'Service',
        category: 'WEB_CMS',
        description: 'A service.',
        icon: 'globe',
        deployable: true,
        eggId: 15,
        prices: { create: { period: 'MONTHLY', baseAmount: 1000, currency: 'EUR' } },
      },
    });
    created.productId = product.id;
    const created2 = await prisma.order.create({
      data: {
        number: `SANDBOX-${label}-${stamp}`,
        userId: user.id,
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
    created.orderIds.push(created2.id);
    return { orderId: created2.id, userId: user.id, productId: product.id };
  }

  /** The checkout that the platform builds, and the answer of the sandbox. */
  async function makeCheckout(orderId: string): Promise<Stripe.Checkout.Session> {
    const { createCheckout } = await import('../src/services/stripe.js');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const checkout = await createCheckout(order, 'sandbox@example.com');
    created.sessionIds.push(checkout.sessionId!);
    return stripe.checkout.sessions.retrieve(checkout.sessionId!);
  }

  /** A real payment in the sandbox, with a card of the test mode. */
  async function payInSandbox(orderId: string, card: string): Promise<Stripe.PaymentIntent> {
    const intent = await stripe.paymentIntents.create({
      amount: 1000,
      currency: 'eur',
      payment_method: card,
      confirm: true,
      // Stripe asks for it when the account may use payment methods that
      // send the customer somewhere else: the test never leaves the page.
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { orderId },
    });
    created.intentIds.push(intent.id);
    return intent;
  }

  /** The delivery of the provider, signed the way the provider signs it. */
  async function deliver(body: unknown, eventId: string): Promise<number> {
    const payload = JSON.stringify(body);
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      payload,
    });
    void eventId;
    return response.statusCode;
  }

  it('builds a checkout that exists in the sandbox', async () => {
    const { orderId } = await makeOrder('checkout');
    const session = await makeCheckout(orderId);
    expect(session.id).toMatch(/^cs_/);
    expect(session.amount_total).toBe(1000);
    expect(session.currency).toBe('eur');
    expect(session.client_reference_id).toBe(orderId);
    expect(session.payment_status).toBe('unpaid');
  });

  it('takes the payment, pays the order, starts the subscription, writes the invoice, queues the service and tells the customer', async () => {
    const { orderId, userId } = await makeOrder('paid');
    const session = await makeCheckout(orderId);
    const intent = await payInSandbox(orderId, CARD_OK);
    expect(intent.status).toBe('succeeded');

    const status = await deliver(
      {
        id: `evt_sandbox_paid_${stamp}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            ...session,
            client_reference_id: orderId,
            payment_status: 'paid',
            payment_intent: intent.id,
            customer: session.customer ?? `cus_sandbox_${stamp}`,
            subscription: `sub_sandbox_${stamp}`,
            amount_total: 1000,
            amount_subtotal: 1000,
            metadata: { orderId, orderNumber: `SANDBOX-paid-${stamp}` },
          },
        },
      },
      `evt_sandbox_paid_${stamp}`,
    );
    expect(status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('PAID');
    // The order is paid and the service is being provisioned: the fulfilment
    // is complete when the worker has put the service in place.
    expect(order.fulfillmentStatus).toBe('PROVISIONING');
    expect(order.stripePaymentIntentId).toBe(intent.id);

    const subscription = await prisma.subscription.findFirst({ where: { instance: { order: { id: orderId } } } });
    expect(subscription?.status).toBe('ACTIVE');

    const invoice = await prisma.invoice.findFirst({ where: { orderId } });
    expect(invoice?.status).toBeTruthy();

    const instance = await prisma.instance.findFirst({ where: { orderId } });
    expect(instance).not.toBeNull();

    const { getQueue } = await import('../src/services/queue.js');
    const job = instance ? await getQueue().getJob(`provision-${instance.id}`) : null;
    expect(job).not.toBeNull();

    const events = await prisma.notificationEvent.findMany({ where: { userId } });
    expect(events.length).toBeGreaterThan(0);
  });

  it('writes nothing twice when the same delivery arrives again', async () => {
    const { orderId, userId } = await makeOrder('twice');
    const session = await makeCheckout(orderId);
    const intent = await payInSandbox(orderId, CARD_OK);
    const eventId = `evt_sandbox_twice_${stamp}`;
    const body = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          ...session,
          client_reference_id: orderId,
          payment_status: 'paid',
          payment_intent: intent.id,
          customer: session.customer ?? `cus_sandbox_${stamp}`,
          subscription: `sub_sandbox_${stamp}`,
          amount_total: 1000,
          amount_subtotal: 1000,
          metadata: { orderId, orderNumber: `SANDBOX-twice-${stamp}` },
        },
      },
    };
    await deliver(body, eventId);
    const first = {
      instances: await prisma.instance.count({ where: { orderId } }),
      invoices: await prisma.invoice.count({ where: { orderId } }),
      events: await prisma.notificationEvent.count({ where: { userId } }),
    };
    await deliver(body, eventId);
    const second = {
      instances: await prisma.instance.count({ where: { orderId } }),
      invoices: await prisma.invoice.count({ where: { orderId } }),
      events: await prisma.notificationEvent.count({ where: { userId } }),
    };
    expect(second).toEqual(first);
  });

  it('does not pay an order whose payment was refused', async () => {
    const { orderId } = await makeOrder('refused');
    const session = await makeCheckout(orderId);
    let refused: Stripe.PaymentIntent | null = null;
    try {
      await payInSandbox(orderId, CARD_REFUSED);
    } catch (error) {
      const failure = error as { payment_intent?: { id: string } };
      refused = { id: failure.payment_intent?.id ?? '' } as Stripe.PaymentIntent;
    }
    expect(refused).not.toBeNull();

    const status = await deliver(
      {
        id: `evt_sandbox_refused_${stamp}`,
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: refused?.id,
            status: 'requires_payment_method',
            amount: 1000,
            currency: 'eur',
            last_payment_error: { message: 'Your card was declined.', code: 'card_declined' },
            metadata: { orderId },
          },
        },
      },
      `evt_sandbox_refused_${stamp}`,
    );
    expect(status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
  });

  it('does not pay an order whose checkout was given up', async () => {
    const { orderId } = await makeOrder('expired');
    const session = await makeCheckout(orderId);
    await stripe.checkout.sessions.expire(session.id);
    const expired = await stripe.checkout.sessions.retrieve(session.id);
    expect(expired.status).toBe('expired');

    const status = await deliver(
      {
        id: `evt_sandbox_expired_${stamp}`,
        type: 'checkout.session.expired',
        data: {
          object: {
            ...expired,
            client_reference_id: orderId,
            payment_status: 'unpaid',
            metadata: { orderId, orderNumber: `SANDBOX-expired-${stamp}` },
          },
        },
      },
      `evt_sandbox_expired_${stamp}`,
    );
    expect(status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).not.toBe('PAID');
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
  });

  it('gives the money of a paid order back', async () => {
    const { orderId } = await makeOrder('refund');
    const session = await makeCheckout(orderId);
    const intent = await payInSandbox(orderId, CARD_OK);
    await deliver(
      {
        id: `evt_sandbox_refund_${stamp}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            ...session,
            client_reference_id: orderId,
            payment_status: 'paid',
            payment_intent: intent.id,
            customer: session.customer ?? `cus_sandbox_${stamp}`,
            subscription: `sub_sandbox_${stamp}`,
            amount_total: 1000,
            amount_subtotal: 1000,
            metadata: { orderId, orderNumber: `SANDBOX-refund-${stamp}` },
          },
        },
      },
      `evt_sandbox_refund_${stamp}`,
    );
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(paid.status).toBe('PAID');

    const { refundPayment } = await import('../src/services/stripe.js');
    const refunded = await refundPayment({
      orderId,
      stripePaymentIntentId: intent.id,
      reason: 'the sandbox asks for it',
    });
    expect(refunded).toBe(true);

    // The money is really back at the provider, and the platform wrote it
    // down: the payment of the order carries the state.
    const refund = await stripe.refunds.list({ payment_intent: intent.id });
    expect(refund.data.length).toBeGreaterThan(0);
    const payment = await prisma.payment.findFirst({ where: { orderId, stripePaymentIntentId: intent.id } });
    expect(payment?.status).toBe('REFUNDED');

    // A second refund does not take the money back twice.
    const again = await refundPayment({
      orderId,
      stripePaymentIntentId: intent.id,
      reason: 'the sandbox asks for it again',
    });
    expect(again).toBe(true);
    const refunds = await stripe.refunds.list({ payment_intent: intent.id });
    expect(refunds.data.length).toBe(1);
  });
});
