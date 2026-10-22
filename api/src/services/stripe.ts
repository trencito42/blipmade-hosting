import Stripe from 'stripe';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { badRequest, unavailable } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import type { Order, OrderItem, Subscription } from '@prisma/client';

let client: Stripe | null = null;

function getClient(): Stripe {
  if (!env.stripeEnabled) throw unavailable('Stripe is not configured on this environment.');
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/** True when a real Stripe secret key is configured. */
export function stripeLive(): boolean {
  return env.stripeEnabled;
}

/**
 * True when the platform runs against the local test gateway. It is used when
 * no Stripe credentials exist so the order -> payment -> provisioning flow can
 * still be exercised end to end, with data kept strictly separate from real
 * billing.
 */
export function stripeTestGateway(): boolean {
  return !env.stripeEnabled && (env.isTest || process.env.STRIPE_TEST_MODE === 'true');
}

export interface CheckoutResult {
  url: string | null;
  sessionId: string | null;
  reason: string | null;
}

/**
 * The Stripe customer of a Blipmade account. It is what the billing portal
 * needs, so it is stored as soon as a checkout session exposes it.
 */
export async function findStripeCustomerId(userId: string): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { userId, stripeCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true },
  });
  return payment?.stripeCustomerId ?? null;
}

/**
 * Creates a Checkout session for an order. Each order item becomes its own
 * recurring line so every instance can be cancelled or scaled on its own, and
 * an upgrade order is charged exactly the price difference.
 */
export async function createCheckout(order: Order & { items: OrderItem[] }): Promise<CheckoutResult> {
  const baseUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');

  if (stripeTestGateway()) {
    const sessionId = `test_cs_${order.id}`;
    await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: sessionId } });
    const url = `${baseUrl}/app/billing?checkout=${encodeURIComponent(sessionId)}`;
    return { url, sessionId, reason: null };
  }

  if (!env.stripeEnabled) {
    return { url: null, sessionId: null, reason: 'Payment processing is not configured on this environment.' };
  }

  const stripe = getClient();
  const customer = await findStripeCustomerId(order.userId);
  // An upgrade is paid once, for the difference. The recurring amount of the
  // existing subscription is changed afterwards, when the change is applied.
  const isUpgrade = order.kind === 'UPGRADE';

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.length
    ? order.items.map((item) => {
        const config = (item.config ?? {}) as { ram?: number; cpu?: number; disk?: number };
        const parts = [
          item.name,
          config.ram ? `${config.ram} MB RAM` : null,
          config.cpu ? `${config.cpu} vCPU` : null,
          config.disk ? `${config.disk} GB storage` : null,
        ].filter(Boolean);
        return {
          quantity: item.quantity,
          price_data: {
            currency: item.currency.toLowerCase(),
            unit_amount: item.unitAmount,
            recurring: { interval: 'month' as const },
            product_data: { name: parts.join(' · ') },
          },
        };
      })
    : [
        {
          quantity: 1,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: order.total,
            ...(isUpgrade ? {} : { recurring: { interval: 'month' as const } }),
            product_data: {
              name: `Blipmade ${isUpgrade ? 'resource change' : 'order'} ${order.number}`,
            },
          },
        },
      ];

  const session = await stripe.checkout.sessions.create({
    mode: isUpgrade ? 'payment' : 'subscription',
    ...(customer ? { customer } : { customer_email: undefined }),
    client_reference_id: order.id,
    metadata: { orderId: order.id, orderNumber: order.number, orderKind: order.kind },
    ...(isUpgrade
      ? {}
      : { subscription_data: { metadata: { orderId: order.id, orderNumber: order.number, orderKind: order.kind } } }),
    line_items: lineItems,
    success_url: `${baseUrl}/app/billing?checkout=success`,
    cancel_url: `${baseUrl}/app/billing?checkout=cancelled`,
  });

  await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url, sessionId: session.id, reason: null };
}

/**
 * The real billing period of a Stripe subscription. Stripe is asked directly
 * so the local period dates are never an approximation of a month.
 */
export async function retrieveStripeSubscription(
  stripeSubscriptionId: string,
): Promise<{ currentPeriodStart: Date | null; currentPeriodEnd: Date | null; items: { id: string; quantity: number }[] } | null> {
  if (!stripeLive()) return null;
  try {
    const subscription = await getClient().subscriptions.retrieve(stripeSubscriptionId);
    return {
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      items: subscription.items.data.map((item) => ({ id: item.id, quantity: item.quantity ?? 1 })),
    };
  } catch {
    return null;
  }
}

export interface MarkOrderPaidParams {
  orderId: string;
  stripePaymentIntentId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  /** Maps an order item id to the Stripe subscription item that pays for it. */
  stripeSubscriptionItemIds?: Record<string, string>;
  /** The amount Stripe actually collected, in minor units. */
  amount?: number;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}

/**
 * Marks an order as paid and creates the subscriptions it paid for.
 *
 * The function is idempotent: running it twice does not create a second
 * subscription and does not change a paid order. Every order line owns exactly
 * one subscription, so a checkout with several items produces several
 * subscriptions that can be cancelled independently.
 */
export async function markOrderPaid(params: MarkOrderPaidParams): Promise<Subscription[]> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });
  if (!order) throw badRequest('Order not found.');

  const alreadyPaid = order.status === 'PAID' || order.status === 'FULFILLED';

  // The promotion is consumed here, when the money arrives. Until then it is
  // only reserved, so an unpaid order cannot exhaust a campaign.
  if (order.promotionId && !order.promotionRedeemedAt) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { promotionRedeemedAt: new Date() } }),
      prisma.promotion.update({ where: { id: order.promotionId }, data: { usedCount: { increment: 1 } } }),
    ]);
  }

  if (!alreadyPaid) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        stripePaymentIntentId: params.stripePaymentIntentId ?? undefined,
      },
    });
  }

  // The payment row is the link to the Stripe customer and to the invoice.
  await upsertPayment(order, params);

  // The real period comes from Stripe whenever it is available.
  let currentPeriodStart = params.currentPeriodStart ?? null;
  let currentPeriodEnd = params.currentPeriodEnd ?? null;
  let stripeItems: { id: string; quantity: number }[] = [];
  if (params.stripeSubscriptionId) {
    const remote = await retrieveStripeSubscription(params.stripeSubscriptionId);
    if (remote) {
      currentPeriodStart = remote.currentPeriodStart ?? currentPeriodStart;
      currentPeriodEnd = remote.currentPeriodEnd ?? currentPeriodEnd;
      stripeItems = remote.items;
    }
  }

  const subscriptions: Subscription[] = [];
  for (const item of order.items) {
    const stripeItemId =
      params.stripeSubscriptionItemIds?.[item.id] ??
      (stripeItems.length === order.items.length ? stripeItems[order.items.indexOf(item)].id : undefined) ??
      null;

    const subscription = await prisma.subscription.upsert({
      where: { orderItemId: item.id },
      create: {
        userId: order.userId,
        orderItemId: item.id,
        stripeSubscriptionId: params.stripeSubscriptionId ?? null,
        stripeSubscriptionItemId: stripeItemId,
        status: 'ACTIVE',
        quantity: item.quantity,
        amount: item.total,
        currency: item.currency,
        currentPeriodStart,
        currentPeriodEnd,
      },
      update: {
        stripeSubscriptionId: params.stripeSubscriptionId ?? undefined,
        stripeSubscriptionItemId: stripeItemId ?? undefined,
        status: 'ACTIVE',
        amount: item.total,
        currency: item.currency,
        currentPeriodStart: currentPeriodStart ?? undefined,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
      },
    });
    subscriptions.push(subscription);
  }

  if (!alreadyPaid) {
    await audit({
      actorId: order.userId,
      action: 'order.paid',
      targetType: 'order',
      targetId: order.id,
      meta: { total: order.total, subscriptions: subscriptions.length },
    });
  }

  return subscriptions;
}

/**
 * Writes the payment row for an order. The customer id is stored here, which
 * is what makes the Stripe billing portal work for an account.
 */
async function upsertPayment(order: Order & { items: OrderItem[] }, params: MarkOrderPaidParams): Promise<void> {
  const amount = params.amount ?? order.total;
  const data = {
    userId: order.userId,
    orderId: order.id,
    stripePaymentIntentId: params.stripePaymentIntentId ?? null,
    stripeSubscriptionId: params.stripeSubscriptionId ?? null,
    stripeCustomerId: params.stripeCustomerId ?? null,
    amount,
    currency: order.currency,
    status: 'SUCCEEDED' as const,
  };

  if (params.stripePaymentIntentId) {
    await prisma.payment.upsert({
      where: { stripePaymentIntentId: params.stripePaymentIntentId },
      create: data,
      update: {
        status: 'SUCCEEDED',
        amount,
        ...(params.stripeCustomerId ? { stripeCustomerId: params.stripeCustomerId } : {}),
        ...(params.stripeSubscriptionId ? { stripeSubscriptionId: params.stripeSubscriptionId } : {}),
      },
    });
    return;
  }

  // Without a payment intent the payment is matched by the order it belongs
  // to, so a redelivered webhook does not create a second payment.
  const existing = await prisma.payment.findFirst({ where: { orderId: order.id } });
  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        status: 'SUCCEEDED',
        amount,
        ...(params.stripeCustomerId ? { stripeCustomerId: params.stripeCustomerId } : {}),
        ...(params.stripeSubscriptionId ? { stripeSubscriptionId: params.stripeSubscriptionId } : {}),
      },
    });
    return;
  }
  await prisma.payment.create({ data });
}

/**
 * Creates or updates the local invoice for a Stripe invoice. The local row is
 * the one shown to the customer, so it is always upserted from the provider
 * payload instead of only being updated when it already exists.
 */
export async function upsertInvoice(params: {
  stripeInvoiceId: string;
  userId: string;
  orderId?: string | null;
  amount: number;
  tax?: number;
  currency?: string;
  status?: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  hostedUrl?: string | null;
  pdfUrl?: string | null;
  paidAt?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  dueDate?: Date | null;
}): Promise<void> {
  const currency = params.currency ?? 'EUR';
  const total = params.amount;
  const tax = params.tax ?? 0;

  const existing = await prisma.invoice.findUnique({ where: { stripeInvoiceId: params.stripeInvoiceId } });
  const data = {
    userId: params.userId,
    orderId: params.orderId ?? existing?.orderId ?? null,
    stripeInvoiceId: params.stripeInvoiceId,
    status: params.status ?? existing?.status ?? ('OPEN' as const),
    amount: total,
    tax,
    total: total + tax,
    currency,
    hostedUrl: params.hostedUrl ?? existing?.hostedUrl ?? null,
    pdfUrl: params.pdfUrl ?? existing?.pdfUrl ?? null,
    paidAt: params.paidAt ?? existing?.paidAt ?? null,
    periodStart: params.periodStart ?? existing?.periodStart ?? null,
    periodEnd: params.periodEnd ?? existing?.periodEnd ?? null,
    dueDate: params.dueDate ?? existing?.dueDate ?? null,
  };

  if (existing) {
    await prisma.invoice.update({ where: { id: existing.id }, data });
    return;
  }

  const count = await prisma.invoice.count();
  await prisma.invoice.create({
    data: { ...data, number: `BM-INV-${String(count + 1).padStart(5, '0')}` },
  });
}

/**
 * Changes the recurring amount of one subscription line. Stripe needs a new
 * price object for the new amount, so one is created and then attached to the
 * subscription item.
 */
export async function updateSubscriptionAmount(subscription: Subscription, amount: number): Promise<void> {
  if (!stripeLive() || !subscription.stripeSubscriptionId) return;
  const stripe = getClient();
  const unitAmount = Math.max(0, Math.round(amount / Math.max(1, subscription.quantity)));
  const price = await stripe.prices.create({
    currency: subscription.currency.toLowerCase(),
    unit_amount: unitAmount,
    recurring: { interval: 'month' },
    product_data: { name: `Blipmade service ${subscription.id}` },
  });
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: subscription.stripeSubscriptionItemId ? [{ id: subscription.stripeSubscriptionItemId, price: price.id }] : [],
    proration_behavior: 'create_prorations',
  });
}

/**
 * Refunds a payment. It is used when a paid change cannot be applied, so the
 * customer is not charged for something they did not get.
 */
export async function refundPayment(params: {
  orderId: string;
  stripePaymentIntentId?: string | null;
  amount?: number;
  reason?: string;
}): Promise<boolean> {
  if (!stripeLive() || !params.stripePaymentIntentId) return false;
  try {
    await getClient().refunds.create({
      payment_intent: params.stripePaymentIntentId,
      ...(params.amount ? { amount: params.amount } : {}),
      reason: 'requested_by_customer',
      metadata: { orderId: params.orderId, reason: params.reason ?? 'change could not be applied' },
    });
    await prisma.payment.updateMany({
      where: { orderId: params.orderId },
      data: { status: 'REFUNDED' },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancels a subscription at the end of the paid period. */
export async function cancelSubscription(subscription: Subscription): Promise<Subscription> {
  if (stripeLive() && subscription.stripeSubscriptionId) {
    if (subscription.stripeSubscriptionItemId) {
      // Only this line of the order is removed; the rest keeps running.
      await getClient().subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: subscription.stripeSubscriptionItemId, deleted: true }],
        proration_behavior: 'create_prorations',
      });
    } else {
      await getClient().subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { cancelAtPeriodEnd: true },
  });
}

export async function resumeSubscription(subscription: Subscription): Promise<Subscription> {
  if (stripeLive() && subscription.stripeSubscriptionId) {
    await getClient().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { cancelAtPeriodEnd: false, cancelledAt: null },
  });
}

/** Opens the Stripe customer portal so a customer can manage payment methods. */
export async function createBillingPortal(userId: string): Promise<{ url: string | null; reason: string | null }> {
  if (!stripeLive()) {
    return { url: null, reason: 'Payment processing is not configured on this environment.' };
  }
  const customerId = await findStripeCustomerId(userId);
  if (!customerId) {
    return { url: null, reason: 'No payment method is on file yet.' };
  }
  const session = await getClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/app/billing`,
  });
  return { url: session.url, reason: null };
}
