import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The money of the platform, with a provider that is under the control of the
 * test.
 *
 * The provider is replaced by one that records what the platform asks of it,
 * so the rules of the money can be checked without a request that leaves the
 * machine: the cadence of a price, the cancellation of a subscription, the
 * refund of an order and the link of a checkout with the account of Stripe.
 */

const calls = vi.hoisted(() => ({
  refunds: [] as { params: Record<string, unknown>; options?: Record<string, unknown> }[],
  refundStatus: 'succeeded' as 'succeeded' | 'pending' | 'failed',
  prices: [] as Record<string, unknown>[],
  pricesById: new Map<string, Record<string, unknown>>(),
  subscriptionUpdates: [] as { id: string; params: Record<string, unknown> }[],
  subscriptionCancels: [] as string[],
  subscriptionsById: new Map<string, Record<string, unknown>>(),
  unreachable: new Set<string>(),
  checkouts: [] as Record<string, unknown>[],
  portals: [] as Record<string, unknown>[],
}));

vi.mock('stripe', () => {
  class FakeStripe {
    constructor(
      public key: string,
      public options?: unknown,
    ) {}

    webhooks = {
      constructEvent: (raw: string) => JSON.parse(raw),
    };

    refunds = {
      create: vi.fn(async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
        calls.refunds.push({ params, options });
        return { id: `re_${calls.refunds.length}`, status: calls.refundStatus };
      }),
    };

    prices = {
      create: vi.fn(async (params: Record<string, unknown>) => {
        calls.prices.push(params);
        return { id: `price_${calls.prices.length}`, ...params };
      }),
      retrieve: vi.fn(async (id: string) => calls.pricesById.get(id) ?? { id }),
    };

    subscriptions = {
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        calls.subscriptionUpdates.push({ id, params });
        return { id };
      }),
      retrieve: vi.fn(async (id: string) => {
        if (calls.unreachable.has(id)) throw new Error('The provider is not reachable.');
        const found = calls.subscriptionsById.get(id);
        if (!found) throw new Error(`No such subscription: ${id}`);
        return found;
      }),
      cancel: vi.fn(async (id: string) => {
        calls.subscriptionCancels.push(id);
        return { id };
      }),
    };

    checkout = {
      sessions: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          calls.checkouts.push(params);
          return { id: `cs_${calls.checkouts.length}`, url: 'https://checkout.stripe.test/session' };
        }),
      },
    };

    billingPortal = {
      sessions: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          calls.portals.push(params);
          return { url: 'https://billing.stripe.test/session' };
        }),
      },
    };
  }

  return { default: FakeStripe };
});

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
const { resetDatabase } = await import('./setup.js');
const { hashPassword } = await import('../src/lib/password.js');
const {
  buildCheckoutLineItems,
  cancelSubscription,
  createBillingPortal,
  createCheckout,
  refundPayment,
  upsertInvoice,
  resumeSubscription,
  updateSubscriptionAmount,
} = await import('../src/services/stripe.js');

/**
 * The environment of a site that collects money with Stripe.
 *
 * The key is a placeholder: the provider of the test answers every request
 * that is made, and no request ever leaves the machine.
 */
const environment = env as unknown as {
  STRIPE_SECRET_KEY: string;
  stripeEnabled: boolean;
  paymentsEnabled: boolean;
  stripeTaxEnabled: boolean;
};
environment.STRIPE_SECRET_KEY = 'sk_test_blipmade_placeholder';
environment.stripeEnabled = true;
environment.paymentsEnabled = true;
environment.stripeTaxEnabled = false;

beforeEach(async () => {
  await resetDatabase();
  calls.refunds.length = 0;
  calls.refundStatus = 'succeeded';
  calls.prices.length = 0;
  calls.pricesById.clear();
  calls.subscriptionUpdates.length = 0;
  calls.subscriptionCancels.length = 0;
  calls.subscriptionsById.clear();
  calls.unreachable.clear();
  calls.checkouts.length = 0;
  calls.portals.length = 0;
  environment.stripeTaxEnabled = false;
});

afterAll(async () => {
  const { prisma: db } = await import('../src/db.js');
  await db.$disconnect();
});

async function seedUser(): Promise<{ id: string; email: string }> {
  const email = `money-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
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

async function seedOrder(userId: string, total = 1000) {
  const product = await prisma.product.create({
    data: {
      slug: `product-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: 'Service',
      category: 'WEB_CMS',
      description: 'A service.',
      icon: 'globe',
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: total, currency: 'EUR' } },
    },
  });
  const order = await prisma.order.create({
    data: {
      number: `BM-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      userId,
      status: 'PAID',
      total,
      currency: 'EUR',
      items: {
        create: { productId: product.id, name: 'Service', quantity: 1, unitAmount: total, total, currency: 'EUR' },
      },
    },
  });
  return { order, product };
}

async function seedSubscription(
  userId: string,
  data: { stripeSubscriptionId?: string; stripeSubscriptionItemId?: string; stripePriceId?: string } = {},
) {
  return prisma.subscription.create({
    data: {
      userId,
      stripeSubscriptionId: data.stripeSubscriptionId ?? 'sub_test',
      stripeSubscriptionItemId: data.stripeSubscriptionItemId ?? 'si_test',
      stripePriceId: data.stripePriceId ?? null,
      status: 'ACTIVE',
      amount: 1000,
      currency: 'EUR',
    },
  });
}

/** The subscription of the provider, with the lines it carries. */
function remoteSubscription(id: string, items: { id: string; price?: Record<string, unknown> }[]) {
  calls.subscriptionsById.set(id, {
    id,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    items: {
      data: items.map((item) => ({
        id: item.id,
        quantity: 1,
        price: item.price ?? {
          id: `price_of_${item.id}`,
          product: 'prod_default',
          currency: 'eur',
          recurring: { interval: 'month', interval_count: 1 },
        },
      })),
    },
  });
}

describe('the cancellation of a subscription', () => {
  it('cancels it at the end of the period that was paid for', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, { stripeSubscriptionId: 'sub_one', stripeSubscriptionItemId: 'si_one' });
    remoteSubscription('sub_one', [{ id: 'si_one' }]);

    const updated = await cancelSubscription(subscription);

    expect(updated.cancelAtPeriodEnd).toBe(true);
    // The line is not removed and nothing is prorated: the service keeps
    // running until the end of the period that was paid for.
    expect(calls.subscriptionUpdates).toHaveLength(1);
    expect(calls.subscriptionUpdates[0]!.params).toEqual({ cancel_at_period_end: true });
    expect(calls.subscriptionCancels).toHaveLength(0);
  });

  it('leaves a subscription that carries other lines alone', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, { stripeSubscriptionId: 'sub_two', stripeSubscriptionItemId: 'si_one' });
    remoteSubscription('sub_two', [{ id: 'si_one' }, { id: 'si_two' }]);

    const updated = await cancelSubscription(subscription);

    expect(updated.cancelAtPeriodEnd).toBe(true);
    // Cancelling the whole subscription would stop the other services of the
    // customer as well, so the provider is not told anything yet.
    expect(calls.subscriptionUpdates).toHaveLength(0);
    expect(calls.subscriptionCancels).toHaveLength(0);
  });

  it('removes the line right away when the service does not exist any more', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, { stripeSubscriptionId: 'sub_three', stripeSubscriptionItemId: 'si_three' });
    remoteSubscription('sub_three', [{ id: 'si_three' }]);

    const updated = await cancelSubscription(subscription, { immediate: true });

    expect(updated.status).toBe('CANCELLED');
    expect(calls.subscriptionUpdates).toHaveLength(1);
    expect(calls.subscriptionUpdates[0]!.params).toEqual({
      items: [{ id: 'si_three', deleted: true }],
      proration_behavior: 'none',
    });
  });

  it('leaves the provider alone when it cannot be reached', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, { stripeSubscriptionId: 'sub_far', stripeSubscriptionItemId: 'si_far' });
    calls.unreachable.add('sub_far');

    const updated = await cancelSubscription(subscription);

    expect(updated.cancelAtPeriodEnd).toBe(true);
    expect(calls.subscriptionUpdates).toHaveLength(0);
  });
});

describe('the resumption of a subscription', () => {
  it('takes the mark of the cancellation back', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, { stripeSubscriptionId: 'sub_resume' });
    remoteSubscription('sub_resume', [{ id: 'si_resume' }]);

    const updated = await resumeSubscription(subscription);

    expect(updated.cancelAtPeriodEnd).toBe(false);
    expect(calls.subscriptionUpdates[0]!.params).toEqual({ cancel_at_period_end: false });
  });

  it('refuses to resume a subscription that was already ended', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, { stripeSubscriptionId: 'sub_ended' });
    const ended = await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED' } });

    await expect(resumeSubscription(ended)).rejects.toThrow(/cannot be resumed/i);
    expect(calls.subscriptionUpdates).toHaveLength(0);
  });
});

describe('the amount of a subscription that changes', () => {
  it('keeps the cadence of the plan and the product of the line', async () => {
    const user = await seedUser();
    calls.pricesById.set('price_yearly', {
      id: 'price_yearly',
      product: 'prod_yearly',
      currency: 'eur',
      recurring: { interval: 'year', interval_count: 1 },
    });
    const subscription = await seedSubscription(user.id, {
      stripeSubscriptionId: 'sub_year',
      stripeSubscriptionItemId: 'si_year',
      stripePriceId: 'price_yearly',
    });

    await updateSubscriptionAmount(subscription, 2400);

    expect(calls.prices[0]!.recurring).toEqual({ interval: 'year', interval_count: 1 });
    expect(calls.prices[0]!.product).toBe('prod_yearly');
    expect(calls.prices[0]!.product_data).toBeUndefined();
    // The difference was already collected with the order of the change, so
    // nothing is prorated.
    expect(calls.subscriptionUpdates[0]!.params.proration_behavior).toBe('none');
  });

  it('reads the cadence from the price of the line when the platform does not know the price', async () => {
    const user = await seedUser();
    const subscription = await seedSubscription(user.id, {
      stripeSubscriptionId: 'sub_read',
      stripeSubscriptionItemId: 'si_read',
    });
    remoteSubscription('sub_read', [
      {
        id: 'si_read',
        price: {
          id: 'price_read',
          product: 'prod_read',
          currency: 'eur',
          recurring: { interval: 'year', interval_count: 1 },
        },
      },
    ]);

    await updateSubscriptionAmount(subscription, 2400);

    expect(calls.prices[0]!.recurring).toEqual({ interval: 'year', interval_count: 1 });
    expect(calls.prices[0]!.product).toBe('prod_read');
  });
});

describe('concurrent Stripe invoice numbering', () => {
  it('assigns distinct invoice numbers when separate invoices arrive together', async () => {
    const user = await seedUser();
    await Promise.all([
      upsertInvoice({ stripeInvoiceId: 'in_parallel_number_1', userId: user.id, amount: 700, status: 'PAID' }),
      upsertInvoice({ stripeInvoiceId: 'in_parallel_number_2', userId: user.id, amount: 800, status: 'PAID' }),
    ]);

    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      select: { number: true, stripeInvoiceId: true },
    });
    expect(invoices).toHaveLength(2);
    expect(new Set(invoices.map((invoice) => invoice.number)).size).toBe(2);
    expect(invoices.every((invoice) => /^BM-INV-[0-9]+$/.test(invoice.number))).toBe(true);
  });
});

describe('the refund of an order', () => {
  it('returns the money once, whatever the number of requests', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    await prisma.payment.create({
      data: { userId: user.id, orderId: order.id, stripePaymentIntentId: 'pi_once', amount: 1000, currency: 'EUR', status: 'SUCCEEDED' },
    });

    expect(await refundPayment({ orderId: order.id, stripePaymentIntentId: 'pi_once', amount: 1000 })).toBe(true);
    expect(await refundPayment({ orderId: order.id, stripePaymentIntentId: 'pi_once', amount: 1000 })).toBe(true);

    expect(calls.refunds).toHaveLength(1);
    expect(calls.refunds[0]!.options?.idempotencyKey).toBe(`blipmade-refund-${order.id}`);
    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment?.status).toBe('REFUNDED');
  });

  it('does not claim a pending Stripe refund was completed', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    const payment = await prisma.payment.create({
      data: { userId: user.id, orderId: order.id, stripePaymentIntentId: 'pi_pending_refund',
        amount: 1000, currency: 'EUR', status: 'SUCCEEDED' },
    });
    calls.refundStatus = 'pending';
    expect(await refundPayment({
      orderId: order.id, stripePaymentIntentId: 'pi_pending_refund', amount: 1000,
    })).toBe(false);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('SUCCEEDED');
    const event = await prisma.auditLog.findFirst({
      where: { action: 'payment.refund_not_completed', targetId: order.id },
    });
    expect(event?.meta).toMatchObject({ status: 'pending' });
  });

  it('sends the same key for two requests of the same order', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    const payment = await prisma.payment.create({
      data: { userId: user.id, orderId: order.id, stripePaymentIntentId: 'pi_two', amount: 1000, currency: 'EUR', status: 'SUCCEEDED' },
    });

    await refundPayment({ orderId: order.id, stripePaymentIntentId: 'pi_two', amount: 1000, reason: 'the order was cancelled' });
    // The database is written after the provider answered. A crash in between
    // leaves the payment as it was, and the next request has to be the same
    // request at the provider.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } });
    await refundPayment({ orderId: order.id, stripePaymentIntentId: 'pi_two', amount: 1000, reason: 'the provisioning failed' });

    expect(calls.refunds).toHaveLength(2);
    expect(calls.refunds[0]!.options?.idempotencyKey).toBe(calls.refunds[1]!.options?.idempotencyKey);
  });
});

describe('the checkout', () => {
  it('links the checkout with the address of the customer', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    const withItems = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });

    await createCheckout(withItems!, user.email);

    expect(calls.checkouts[0]!.customer_email).toBe(user.email);
  });

  it('asks for no tax when the operator did not turn it on', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    const withItems = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });

    await createCheckout(withItems!);

    expect(calls.checkouts[0]!.automatic_tax).toBeUndefined();
  });

  it('asks for the tax of the provider when the operator turned it on', async () => {
    environment.stripeTaxEnabled = true;
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    const withItems = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });

    await createCheckout(withItems!);

    expect(calls.checkouts[0]!.automatic_tax).toEqual({ enabled: true });
  });

  it('charges a yearly plan once a year', () => {
    const items = buildCheckoutLineItems(
      [
        {
          id: 'item_yearly',
          orderId: 'order_yearly',
          productId: 'product_yearly',
          name: 'Service',
          quantity: 1,
          unitAmount: 1000,
          total: 1000,
          currency: 'EUR',
          config: { period: 'YEARLY' },
        },
      ],
      1000,
    );

    expect(items[0]!.price_data?.recurring).toEqual({ interval: 'year' });
  });
});

describe('the billing portal', () => {
  it('opens the portal of the customer of the account', async () => {
    const user = await seedUser();
    const { order } = await seedOrder(user.id);
    await prisma.payment.create({
      data: { userId: user.id, orderId: order.id, stripeCustomerId: 'cus_mine', amount: 1000, currency: 'EUR', status: 'SUCCEEDED' },
    });

    const portal = await createBillingPortal(user.id);

    expect(portal.url).toBe('https://billing.stripe.test/session');
    expect(calls.portals[0]!.customer).toBe('cus_mine');
  });

  it('never opens the portal of another account', async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const { order } = await seedOrder(owner.id);
    await prisma.payment.create({
      data: { userId: owner.id, orderId: order.id, stripeCustomerId: 'cus_mine', amount: 1000, currency: 'EUR', status: 'SUCCEEDED' },
    });

    const portal = await createBillingPortal(other.id);

    expect(portal.url).toBeNull();
    expect(calls.portals).toHaveLength(0);
  });
});
