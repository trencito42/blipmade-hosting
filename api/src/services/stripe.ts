import Stripe from 'stripe';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { AppError, badRequest, conflict, unavailable } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { allocateOrderAmounts, allocateLineTotals } from './order-amounts.js';
import { nextInvoiceNumber } from './order-numbers.js';
import type { Order, OrderItem, Subscription } from '@prisma/client';

let client: Stripe | null = null;

/**
 * The version of the Stripe API the platform speaks.
 *
 * The version is pinned here, so the shape of the payloads does not change
 * under the platform when the account of the operator is moved to another
 * version of the API. The value is the one the installed SDK knows, and the
 * fields that moved between versions are read defensively.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-02-24.acacia';

function getClient(): Stripe {
  if (!env.stripeEnabled) throw unavailable('Stripe is not configured on this environment.');
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
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
 *
 * The gateway is only a stand-in for the flow of the tests and of a local
 * installation, never of the live site: `STRIPE_TEST_MODE=false` turns it off,
 * so an environment that has no Stripe key at all behaves like the live site
 * and says that payments are not available.
 */
export function stripeTestGateway(): boolean {
  // The local gateway stands in for Stripe while the tests and a local
  // installation run. A live site never uses it: there, the absence of a
  // Stripe key means that payments are not available and that a webhook
  // without a signature is refused. Without this rule anybody could send a
  // signed-look-alike event to the webhook of the live site and have an
  // order marked as paid.
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.STRIPE_TEST_MODE === 'false') return false;
  return !env.stripeEnabled && (env.isTest || process.env.STRIPE_TEST_MODE === 'true');
}

/**
 * The origin every outward link is built from.
 *
 * The public origin of the site (`PUBLIC_WEB_URL`) is the only source of the
 * links a customer follows. The address of the API is never used for them: a
 * checkout that points at `127.0.0.1` sends the customer to the server itself.
 * When the origin is not usable the request fails with a clear error instead
 * of building a broken link.
 */
function publicOrigin(): string {
  const origin = env.publicWebUrl;
  if (!origin) {
    throw new AppError(500, 'public_origin_missing', 'The public origin of the site is not configured.');
  }
  let address: URL;
  try {
    address = new URL(origin);
  } catch {
    throw new AppError(500, 'public_origin_invalid', `The public origin of the site ("${origin}") is not a valid address.`);
  }
  if (address.protocol !== 'http:' && address.protocol !== 'https:') {
    throw new AppError(500, 'public_origin_invalid', `The public origin of the site ("${origin}") is not an http address.`);
  }
  return origin.replace(/\/+$/, '');
}

export interface PaymentState {
  /** True when a real payment can be taken. */
  enabled: boolean;
  /** True when the local test gateway stands in for Stripe. */
  simulated: boolean;
  /** Why no payment is possible, or null when it is. */
  reason: string | null;
}

/**
 * The state of the payments of this environment.
 *
 * Payments are only possible when the operator turns them on and a Stripe key
 * is present. Until then the answer says so, instead of pretending that a
 * payment can be taken.
 */
export function paymentState(): PaymentState {
  if (env.paymentsEnabled) {
    return { enabled: true, simulated: false, reason: null };
  }
  if (stripeTestGateway()) {
    return {
      enabled: false,
      simulated: true,
      reason: 'The local test gateway is in use, so no real payment is taken.',
    };
  }
  return {
    enabled: false,
    simulated: false,
    reason: env.stripeEnabled
      ? 'Payments are not available at the moment: payments are turned off on this environment.'
      : 'Payments are not available at the moment: no Stripe key is configured on this environment.',
  };
}

/**
 * The error of a request that needs a payment while payments are off.
 *
 * It has a code of its own, so the client can tell it apart from a missing
 * Stripe key and tell the customer that the payment cannot be taken now. No
 * session is created and no link is handed out.
 */
export function paymentsUnavailable(): AppError {
  const state = paymentState();
  return new AppError(503, 'payments_unavailable', state.reason ?? 'Payments are not available at the moment.');
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
 * The line items of a checkout session.
 *
 * The provider is given the price that is really due, which is the order
 * total split over the lines. A promotion belongs to the order and not to a
 * line, so without this split the customer would be charged the catalogue
 * price and the amount collected would not match the amount quoted.
 */
export function buildCheckoutLineItems(
  items: OrderItem[],
  orderTotal: number,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const chunks = allocateOrderAmounts(
    items.map((item) => ({ unitAmount: item.unitAmount, quantity: item.quantity, total: item.total })),
    orderTotal,
  );

  return chunks.flatMap((chunk) => {
    const item = items[chunk.lineIndex];
    const config = (item.config ?? {}) as { ram?: number; cpu?: number; disk?: number; period?: string };
    const parts = [
      item.name,
      config.ram ? `${config.ram} MB RAM` : null,
      config.cpu ? `${config.cpu} vCPU` : null,
      config.disk ? `${config.disk} GB storage` : null,
    ].filter(Boolean);
    // The interval of the subscription is the interval of the price that was
    // ordered: a yearly plan is charged once a year, not once a month.
    const interval = config.period === 'YEARLY' ? ('year' as const) : ('month' as const);
    return [
      {
        quantity: chunk.quantity,
        price_data: {
          currency: item.currency.toLowerCase(),
          unit_amount: chunk.unitAmount,
          recurring: { interval },
          product_data: { name: parts.join(' · ') },
        },
      },
    ];
  });
}

/**
 * Creates a Checkout session for an order. Each order item becomes its own
 * recurring line so every instance can be cancelled or scaled on its own, and
 * an upgrade order is charged exactly the price difference.
 *
 * The address of the customer is what links the checkout to the account of
 * Stripe. Without it, every checkout creates a customer of its own, and the
 * billing portal would only ever know the last of them. The address is
 * passed in by the caller, which already knows the customer who is paying.
 */
export async function createCheckout(
  order: Order & { items: OrderItem[] },
  customerEmail?: string | null,
): Promise<CheckoutResult> {
  if (stripeTestGateway()) {
    const sessionId = `test_cs_${order.id}`;
    await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: sessionId } });
    const url = `${publicOrigin()}/app/billing?checkout=${encodeURIComponent(sessionId)}`;
    return { url, sessionId, reason: null };
  }

  if (!env.paymentsEnabled) {
    // Payments are off: no session is created and no link is handed out.
    throw paymentsUnavailable();
  }

  const baseUrl = publicOrigin();
  const stripe = getClient();
  const customer = await findStripeCustomerId(order.userId);
  // An upgrade is paid once, for the difference. The recurring amount of the
  // existing subscription is changed afterwards, when the change is applied.
  const isUpgrade = order.kind === 'UPGRADE';

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.length
    ? buildCheckoutLineItems(order.items, order.total)
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
    ...(customer ? { customer } : customerEmail ? { customer_email: customerEmail } : {}),
    client_reference_id: order.id,
    metadata: { orderId: order.id, orderNumber: order.number, orderKind: order.kind },
    ...(isUpgrade
      ? {}
      : { subscription_data: { metadata: { orderId: order.id, orderNumber: order.number, orderKind: order.kind } } }),
    // The tax is calculated by the provider only when the operator turned it
    // on. With it off, the session carries exactly the sum of the order, and
    // the tax of the platform stays the one of the company settings.
    ...(env.stripeTaxEnabled ? { automatic_tax: { enabled: true } } : {}),
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
  /**
   * The tax that was charged on top of the amount.
   *
   * It is only what the provider really charged: the platform never invents a
   * tax. With Stripe Tax turned off, the tax is zero and the amount is the
   * whole sum that was collected.
   */
  tax?: number;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}

/**
 * The states in which an order can never become paid.
 *
 * `CANCELLED` means the order was refused and `REFUNDED` means the money was
 * already given back. An order in one of them states must never become paid
 * again, because the payment gate of the provisioning would open for an order
 * that nobody owes anything for.
 *
 * Every other state can still be paid. `FAILED` in particular is left out on
 * purpose: a payment that did not match the order marks the order as failed
 * so that the money is not applied, and the operator corrects the order and
 * replays the event. A guard that refused the failed state would close that
 * way out.
 */
const DEAD_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'] as const;

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

  // A cancelled or refunded order is not payable. The state of the order is
  // the guard: without it a late or replayed payment event would turn a dead
  // order into a paid one and the provisioning would follow.
  if (!alreadyPaid && (DEAD_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    throw conflict(
      `Order ${order.number} cannot be paid: its status is ${order.status}.`,
    );
  }

  // The sum the caller reports is checked against the sum of the order: an
  // order is paid the sum it was quoted, never another one. The check is
  // closed, so a caller that reports no sum pays nothing, and a caller that
  // reports another sum does not pay the order either.
  //
  // The check is on the path that changes the state. An order that is already
  // paid stays paid whatever the caller repeats, so a replay of an event
  // without a sum does not turn a paid order into an error.
  if (!alreadyPaid) {
    if (typeof params.amount !== 'number' || !Number.isFinite(params.amount)) {
      throw conflict(`Order ${order.number} cannot be paid: the payment carries no amount.`);
    }
    if (params.amount !== order.total) {
      throw conflict(
        `Order ${order.number} cannot be paid: the payment of ${params.amount} is not the ${order.total} that was quoted.`,
      );
    }
  }

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
  // The amount of a line is what is really due for it: the promotion is
  // spread over the lines, so the subscription carries the amount that was
  // charged and not the catalogue price.
  const lineTotals = allocateLineTotals(
    order.items.map((item) => ({ unitAmount: item.unitAmount, quantity: item.quantity, total: item.total })),
    order.total,
  );
  for (const [index, item] of order.items.entries()) {
    const lineTotal = lineTotals[index] ?? item.total;
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
        amount: lineTotal,
        currency: item.currency,
        currentPeriodStart,
        currentPeriodEnd,
      },
      update: {
        stripeSubscriptionId: params.stripeSubscriptionId ?? undefined,
        stripeSubscriptionItemId: stripeItemId ?? undefined,
        status: 'ACTIVE',
        amount: lineTotal,
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
    // The customer paid, so the platform owes an invoice. It is written here,
    // with the sum that was really collected, so the sum that was quoted is
    // the sum that is invoiced. The invoice of the payment provider, when
    // there is one, is the reconciliation and not the only document.
    await writeOrderInvoice(order, subscriptions, params);
  }

  return subscriptions;
}

/**
 * One month after a date. The period of an invoice that the provider did not
 * tell us about is a month, because that is what a monthly price means.
 */
function addOneMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Writes the invoice of a paid order.
 *
 * The invoice carries the sum of the order, which is the sum that was
 * collected, and the period of the subscription it pays for. An order that
 * was already invoiced is not invoiced a second time: the function is called
 * again every time the payment event is replayed.
 */
async function writeOrderInvoice(
  order: Order & { items: OrderItem[] },
  subscriptions: Subscription[],
  params: MarkOrderPaidParams,
): Promise<void> {
  const existing = await prisma.invoice.findFirst({ where: { orderId: order.id } });
  if (existing) return;

  const periodStart = params.currentPeriodStart ?? new Date();
  const periodEnd = params.currentPeriodEnd ?? addOneMonth(periodStart);
  // The tax of the invoice is the tax the provider charged, and nothing else.
  const tax = params.tax ?? 0;

  await prisma.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      userId: order.userId,
      orderId: order.id,
      stripeInvoiceId: null,
      status: 'PAID',
      amount: order.total,
      tax,
      total: order.total + tax,
      currency: order.currency,
      paidAt: new Date(),
      dueDate: periodStart,
      periodStart,
      periodEnd,
    },
  });

  await audit({
    actorId: order.userId,
    action: 'invoice.written',
    targetType: 'order',
    targetId: order.id,
    meta: { total: order.total, subscriptions: subscriptions.length },
  });
}

/**
 * Writes the payment row for an order. The customer id is stored here, which
 * is what makes the Stripe billing portal work for an account.
 */
async function upsertPayment(order: Order & { items: OrderItem[] }, params: MarkOrderPaidParams): Promise<void> {
  // The row of the payment carries the whole sum that was collected: the
  // amount of the order and the tax the provider charged on top of it.
  const amount = (params.amount ?? order.total) + (params.tax ?? 0);
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
 * The price of a subscription line, as the provider knows it.
 *
 * The price is asked for, so the real cadence of the subscription is known: a
 * yearly plan stays yearly when its amount changes. The product of the price
 * is the product of the line, so a new price does not create a new product.
 */
async function retrieveStripePriceContext(subscription: Subscription): Promise<{
  productId: string | null;
  interval: NonNullable<Stripe.Price['recurring']>['interval'];
  intervalCount: number;
  currency: string;
} | null> {
  if (!stripeLive()) return null;
  const stripe = getClient();
  try {
    let price: Stripe.Price | null = null;
    if (subscription.stripePriceId) {
      price = await stripe.prices.retrieve(subscription.stripePriceId);
    } else if (subscription.stripeSubscriptionId) {
      const remote = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const item =
        remote.items.data.find((entry) => entry.id === subscription.stripeSubscriptionItemId) ??
        remote.items.data[0];
      price = item?.price ?? null;
    }
    if (!price || !price.recurring) return null;
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    return {
      productId,
      interval: price.recurring.interval,
      intervalCount: price.recurring.interval_count ?? 1,
      currency: price.currency,
    };
  } catch {
    return null;
  }
}

/**
 * Changes the recurring amount of one subscription line.
 *
 * The new amount is charged with the cadence the line already has: a yearly
 * plan stays yearly. The product of the line is reused, so a change of the
 * amount does not fill the account of the operator with products that
 * describe the same service.
 *
 * Nothing is prorated. The difference between the old and the new amount was
 * already collected with the order of the change, so a proration would
 * collect it a second time.
 */
export async function updateSubscriptionAmount(subscription: Subscription, amount: number): Promise<void> {
  if (!stripeLive() || !subscription.stripeSubscriptionId) return;
  const stripe = getClient();
  const unitAmount = Math.max(0, Math.round(amount / Math.max(1, subscription.quantity)));
  const context = await retrieveStripePriceContext(subscription);

  const price = await stripe.prices.create({
    currency: (context?.currency ?? subscription.currency).toLowerCase(),
    unit_amount: unitAmount,
    recurring: {
      interval: context?.interval ?? 'month',
      interval_count: context?.intervalCount ?? 1,
    },
    ...(context?.productId
      ? { product: context.productId }
      : { product_data: { name: `Blipmade service ${subscription.id}` } }),
  });

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: subscription.stripeSubscriptionItemId ? [{ id: subscription.stripeSubscriptionItemId, price: price.id }] : [],
    proration_behavior: 'none',
  });
}

/**
 * Refunds a payment.
 *
 * The refund is guarded twice, so the money is never returned twice:
 *
 *   - the local payment row says whether the money is already back, and
 *   - the provider receives a key that is the same for every refund of the
 *     same order, so a second request is answered with the first refund
 *     instead of a second one.
 *
 * The local guard is what makes a redelivery of an event a no-op, and the key
 * of the provider is what makes two requests that arrive at the same time a
 * single refund. The key is derived from the order, so it does not change
 * when the reason of the refund changes.
 */
export async function refundPayment(params: {
  orderId: string;
  stripePaymentIntentId?: string | null;
  amount?: number;
  reason?: string;
  /** The key that makes a repeated request the same request at the provider. */
  idempotencyKey?: string;
}): Promise<boolean> {
  if (!stripeLive() || !params.stripePaymentIntentId) return false;

  // The money that is already back is not back a second time. The row of the
  // payment is only written after a refund that the provider accepted, so a
  // row that says refunded means the refund really happened.
  const alreadyRefunded = await prisma.payment.findFirst({
    where: { orderId: params.orderId, status: 'REFUNDED' },
    select: { id: true },
  });
  if (alreadyRefunded) return true;

  try {
    await getClient().refunds.create(
      {
        payment_intent: params.stripePaymentIntentId,
        ...(params.amount ? { amount: params.amount } : {}),
        reason: 'requested_by_customer',
        metadata: { orderId: params.orderId, reason: params.reason ?? 'change could not be applied' },
      },
      { idempotencyKey: params.idempotencyKey ?? `blipmade-refund-${params.orderId}` },
    );
    // The payment of the order is marked as refunded, so a refund that comes
    // later finds the money back and does nothing.
    const marked = await prisma.payment.updateMany({
      where: { orderId: params.orderId, stripePaymentIntentId: params.stripePaymentIntentId },
      data: { status: 'REFUNDED' },
    });
    if (marked.count === 0) {
      await prisma.payment.updateMany({ where: { orderId: params.orderId }, data: { status: 'REFUNDED' } });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancels a subscription.
 *
 * A cancellation takes effect at the end of the period that was paid for: the
 * service keeps running until then, and the customer is not charged again.
 *
 * The subscription of Stripe is only cancelled as a whole when this line is
 * the only one it carries. When other lines share it, cancelling the whole
 * subscription would stop the other services of the customer as well, so
 * nothing is told to the provider now, and the line is removed at the end of
 * the paid period by the sweep.
 *
 * `immediate` is for the case where the service does not exist any more, for
 * example a provisioning that failed: there is nothing to keep running and
 * the customer must not be billed for it again.
 */
export async function cancelSubscription(
  subscription: Subscription,
  options: { immediate?: boolean } = {},
): Promise<Subscription> {
  if (stripeLive() && subscription.stripeSubscriptionId) {
    const stripe = getClient();
    const remote = await retrieveStripeSubscription(subscription.stripeSubscriptionId);
    // When the provider cannot be reached, the number of lines is unknown and
    // the subscription of the provider is left alone: cancelling a shared
    // subscription would stop services that are still paid for.
    const onlyLine = remote !== null && remote.items.length <= 1;

    if (options.immediate) {
      if (subscription.stripeSubscriptionItemId) {
        // Only this line of the order is removed; the rest keeps running.
        // Nothing is prorated: the money is given back by the refund of the
        // compensation, not by a credit of the provider.
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: subscription.stripeSubscriptionItemId, deleted: true }],
          proration_behavior: 'none',
        });
      } else if (onlyLine) {
        // The line of this subscription is not known, so the subscription
        // itself is stopped: the service does not exist any more and the
        // customer must not be billed for it again.
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      }
    } else if (onlyLine) {
      // The line is the only one of its subscription, so the subscription is
      // stopped at the end of the period that was paid for.
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }
  return prisma.subscription.update({
    // The owner is part of the search, so a cancellation can never touch the
    // subscription of another account.
    where: { id: subscription.id, userId: subscription.userId },
    data: {
      cancelAtPeriodEnd: true,
      ...(options.immediate ? { status: 'CANCELLED' as const, cancelledAt: new Date() } : {}),
    },
  });
}

/**
 * Resumes a subscription that was cancelled for the end of the period.
 *
 * Only the mark of the cancellation is taken back. The subscription of Stripe
 * is told to keep running, and the service continues until the end of the
 * period that was paid for.
 *
 * A subscription that was already ended cannot be resumed: the service has to
 * be ordered again. The platform says so instead of clearing the mark and
 * promising a service that does not exist.
 */
export async function resumeSubscription(subscription: Subscription): Promise<Subscription> {
  if (subscription.status === 'CANCELLED') {
    throw conflict('This subscription was already ended, so it cannot be resumed.');
  }
  if (stripeLive() && subscription.stripeSubscriptionId) {
    try {
      await getClient().subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    } catch {
      // The provider ended the subscription already, so the mark of the
      // cancellation cannot be taken back.
      throw conflict('The subscription was already ended at the payment provider, so it cannot be resumed.');
    }
  }
  return prisma.subscription.update({
    // The owner is part of the search, so a resumption can never touch the
    // subscription of another account.
    where: { id: subscription.id, userId: subscription.userId },
    data: { cancelAtPeriodEnd: false, cancelledAt: null },
  });
}

/**
 * Removes one line of a subscription of Stripe.
 *
 * A cancellation that takes effect at the end of the paid period leaves the
 * customer billed for the line until the provider is told to stop. The line is
 * removed here, without a proration: the period was paid for and the money
 * of it is not given back.
 *
 * The function answers whether the line was removed. A provider that cannot
 * be reached is not an error of the sweep: the state of the platform is
 * already correct, and the failure is left for the operator to see.
 */
export async function removeStripeSubscriptionItem(subscription: {
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
}): Promise<boolean> {
  if (!stripeLive() || !subscription.stripeSubscriptionId || !subscription.stripeSubscriptionItemId) return false;
  try {
    await getClient().subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{ id: subscription.stripeSubscriptionItemId, deleted: true }],
      proration_behavior: 'none',
    });
    return true;
  } catch {
    return false;
  }
}

/** Opens the Stripe customer portal so a customer can manage payment methods. */
export async function createBillingPortal(userId: string): Promise<{ url: string | null; reason: string | null }> {
  if (!env.paymentsEnabled) {
    // Payments are off: no session is created and no link is handed out.
    throw paymentsUnavailable();
  }
  const customerId = await findStripeCustomerId(userId);
  if (!customerId) {
    return { url: null, reason: 'No payment method is on file yet.' };
  }
  const session = await getClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${publicOrigin()}/app/billing`,
  });
  return { url: session.url, reason: null };
}
