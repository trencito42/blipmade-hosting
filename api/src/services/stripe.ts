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
 * Creates a Checkout session for an order. Each order item becomes its own
 * recurring line so every instance can be cancelled or scaled on its own.
 */
export async function createCheckout(order: Order & { items: OrderItem[] }): Promise<CheckoutResult> {
  if (stripeTestGateway()) {
    const sessionId = `test_cs_${order.id}`;
    await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: sessionId } });
    const url = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/app/billing?checkout=${encodeURIComponent(sessionId)}`;
    return { url, sessionId, reason: null };
  }

  if (!env.stripeEnabled) {
    return { url: null, sessionId: null, reason: 'Payment processing is not configured on this environment.' };
  }

  const stripe = getClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: undefined,
    client_reference_id: order.id,
    metadata: { orderId: order.id, orderNumber: order.number },
    subscription_data: { metadata: { orderId: order.id, orderNumber: order.number } },
    line_items: order.items.map((item) => {
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
    }),
    success_url: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/app/billing?checkout=success`,
    cancel_url: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/app/billing?checkout=cancelled`,
  });

  await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url, sessionId: session.id, reason: null };
}

/**
 * Marks an order as paid and links the resulting subscription. Idempotent:
 * running it twice does not create a second subscription.
 */
export async function markOrderPaid(params: {
  orderId: string;
  stripePaymentIntentId?: string | null;
  stripeSubscriptionId?: string | null;
  amount?: number;
}): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });
  if (!order) throw badRequest('Order not found.');

  if (order.status === 'PAID' || order.status === 'FULFILLED') return;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      stripePaymentIntentId: params.stripePaymentIntentId ?? undefined,
    },
  });

  if (params.stripePaymentIntentId) {
    await prisma.payment.upsert({
      where: { stripePaymentIntentId: params.stripePaymentIntentId },
      create: {
        userId: order.userId,
        orderId: order.id,
        stripePaymentIntentId: params.stripePaymentIntentId,
        amount: params.amount ?? order.total,
        currency: order.currency,
        status: 'SUCCEEDED',
      },
      update: { status: 'SUCCEEDED' },
    });
  }

  if (params.stripeSubscriptionId) {
    const existing = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: params.stripeSubscriptionId },
    });
    if (!existing) {
      const first = order.items[0];
      await prisma.subscription.create({
        data: {
          userId: order.userId,
          stripeSubscriptionId: params.stripeSubscriptionId,
          stripePriceId: null,
          status: 'ACTIVE',
          quantity: 1,
          amount: first?.unitAmount ?? order.total,
          currency: order.currency,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  await audit({
    actorId: order.userId,
    action: 'order.paid',
    targetType: 'order',
    targetId: order.id,
    meta: { total: order.total },
  });
}

/** Cancels a subscription at the end of the paid period. */
export async function cancelSubscription(subscription: Subscription): Promise<Subscription> {
  if (stripeLive() && subscription.stripeSubscriptionId) {
    await getClient().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
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
  const customer = await prisma.payment.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { user: true },
  });
  const customerId = (customer as { stripeCustomerId?: string } | undefined)?.stripeCustomerId;
  if (!customerId) {
    return { url: null, reason: 'No payment method is on file yet.' };
  }
  const session = await getClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/app/billing`,
  });
  return { url: session.url, reason: null };
}
