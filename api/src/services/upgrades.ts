import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { nextOrderNumber } from './order-numbers.js';
import { badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { instanceTerm, priceConfiguration, resourceRates, validateConfiguration, yearlyDiscountPercent } from './pricing.js';
import { findStripeCustomerId, giveBalanceCredit, refundPayment, updateSubscriptionAmount } from './stripe.js';
import { notifyUpgradeCompleted, notifyUpgradeFailed } from './notifications.js';
import * as pteroApp from './pterodactyl/application.js';
import * as client from './pterodactyl/client.js';
import { customerToken } from './panel/operations.js';
import type {
  FulfillmentStatus,
  Instance,
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  Product,
} from '@prisma/client';

/**
 * Resource changes are a paid product, not a direct write.
 *
 * The flow is: quote -> order -> payment -> apply. The instance is never
 * changed before the money arrived, and a change that the panel refuses leaves
 * the instance exactly as it was.
 */

export interface ResourceRequest {
  ram: number;
  cpu: number;
  disk: number;
}

const DISK_SHRINK_MARGIN_BYTES = 64 * 1024 * 1024;

/**
 * A smaller disk is refused when the files already stored do not fit, with 64 MB spare.
 * Unknown usage is also refused: the panel would reject the shrink after payment.
 */
export function diskShrinkDecision(input: { currentGb: number; nextGb: number; usedBytes: number | null }): { ok: true } | { ok: false; message: string } {
  if (input.nextGb >= input.currentGb) return { ok: true };
  if (input.usedBytes === null || !Number.isFinite(input.usedBytes) || input.usedBytes < 0) {
    return { ok: false, message: 'Disk cannot be reduced until the current usage is known.' };
  }
  const nextBytes = input.nextGb * 1024 * 1024 * 1024;
  if (input.usedBytes + DISK_SHRINK_MARGIN_BYTES > nextBytes) {
    return { ok: false, message: 'Disk cannot be reduced below the space already used, plus 64 MB.' };
  }
  return { ok: true };
}

async function assertDiskFits(instance: { id: string; userId: string; disk: number; pterodactylUuid: string | null; pterodactylServerId: number | null; status: string; generatedVariables: string | null; product: { generatedVariables: unknown } }, nextGb: number): Promise<void> {
  if (nextGb >= instance.disk) return;
  let used: number | null = null;
  if (instance.pterodactylUuid) {
    try {
      const token = await customerToken({
        id: instance.id,
        userId: instance.userId,
        pterodactylUuid: instance.pterodactylUuid,
        pterodactylServerId: instance.pterodactylServerId,
        status: instance.status,
        generatedVariables: instance.generatedVariables,
        productVariables: instance.product.generatedVariables,
      });
      used = (await client.getResources(token, instance.pterodactylUuid)).disk.used;
    } catch {
      used = null;
    }
  }
  const decision = diskShrinkDecision({ currentGb: instance.disk, nextGb, usedBytes: used });
  if (!decision.ok) throw badRequest(decision.message);
}

export interface ResourceQuote {
  currentPrice: number;
  newPrice: number;
  /** The amount due now. It is the recurring difference for the days left in the paid period. */
  priceDelta: number;
  /** The full recurring difference, in the same unit as the current term. */
  recurringDelta: number;
  currency: string;
  period: 'MONTHLY' | 'YEARLY';
  remainingDays: number | null;
  changesUsed: number;
  changesAllowed: number;
  /** When the oldest counted change leaves the 30-day window. Null when none is counted. */
  nextChangeAt: string | null;
  /** True when the customer has to pay for the change. */
  requiresPayment: boolean;
  /** Why no credit is given for a decrease, when the unused time was not collected. Null when nothing is withheld. */
  creditWithheld: string | null;
  /** What the price depends on, in one string. The change is refused when it differs at the moment of paying. */
  fingerprint: string;
  /** The quote is frozen for a short time. After it the customer has to look at the price again. */
  expiresAt: string;
}

export const QUOTE_TTL_MS = 15 * 60 * 1000;

/** The facts a quote stands on. Two quotes with the same fingerprint charge and credit the same amounts. */
export function quoteFingerprint(parts: {
  from: ResourceRequest;
  to: ResourceRequest;
  currentPrice: number;
  newPrice: number;
  dueNow: number;
  currency: string;
  period: string;
  periodEnd: Date | null;
  subscriptionStatus: string | null;
}): string {
  return createHash('sha256')
    .update(JSON.stringify([parts.from, parts.to, parts.currentPrice, parts.newPrice, parts.dueNow, parts.currency, parts.period, parts.periodEnd?.toISOString() ?? null, parts.subscriptionStatus]))
    .digest('hex')
    .slice(0, 32);
}

/** True when a quote the customer saw can still be used for the change they asked for. */
export function quoteStillValid(seen: { fingerprint: string; issuedAt: string } | undefined, current: { fingerprint: string }, now = Date.now()): boolean {
  if (!seen) return false;
  const issued = Date.parse(seen.issuedAt);
  if (!Number.isFinite(issued) || now - issued > QUOTE_TTL_MS || issued > now + 60_000) return false;
  return seen.fingerprint === current.fingerprint;
}

export const RESIZE_LIMIT = 2;
export const RESIZE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The part of a recurring difference that belongs to the days still paid for. */
export function prorateRemaining(
  recurringDelta: number,
  start: Date | null,
  end: Date | null,
  now = new Date(),
): { dueNow: number; remainingDays: number | null } {
  if (!start || !end || end.getTime() <= start.getTime() || end.getTime() <= now.getTime()) {
    return { dueNow: recurringDelta, remainingDays: null };
  }
  const fraction = (end.getTime() - now.getTime()) / (end.getTime() - start.getTime());
  return {
    dueNow: Math.round(recurringDelta * fraction),
    remainingDays: Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000)),
  };
}

type InstanceWithProduct = Instance & { product: Product };

/**
 * The machine-readable reasons of the refund decision.
 *
 * The reason is written in the journal of the platform, so the money of an
 * order can be followed without asking the payment provider.
 */
export type UpgradeRefundReason =
  /** The money of the order may be returned. */
  | 'refund'
  /** The money is back with the customer already. */
  | 'already_refunded'
  /** The order carries no money that could be returned. */
  | 'order_not_paid'
  /** The paid change was not refused, so there is nothing to give back. */
  | 'change_not_failed'
  /** The order carries no payment intent, so the provider has nothing to refund. */
  | 'no_payment_intent'
  /** The payment itself was never collected. */
  | 'payment_not_settled';

/**
 * The local state of the money of an order. It is what the refund decision
 * reads, and it comes from the platform alone: no provider is asked.
 */
export interface UpgradeRefundState {
  /** The money status of the order. */
  status: OrderStatus;
  /** Whether the paid change was delivered. */
  fulfillmentStatus: FulfillmentStatus;
  /** The payment intent the provider refunds. */
  stripePaymentIntentId: string | null;
  /** The status of the payment of the order, when the platform has one. */
  paymentStatus: PaymentStatus | null;
}

/**
 * The answer of the refund decision.
 */
export interface UpgradeRefundDecision {
  /** True when the money may be returned. */
  refund: boolean;
  /** The machine-readable reason of the answer. */
  reason: UpgradeRefundReason;
  /** The sentence that is shown and written in the journal. */
  message: string;
}

/**
 * Decides whether the money of a paid resource change may be returned.
 *
 * The function is pure: it reads the local state of the order and answers,
 * without touching the database and without asking the payment provider. That
 * is what makes the decision testable on its own, and it is what keeps the
 * platform from asking twice for the same money.
 *
 * The guard exists because `applyUpgradeOrder` can run more than once for the
 * same order: a webhook that is delivered twice, a worker that is retried and
 * an operator who applies the change again all arrive here. A second refund
 * for money that is already back is a second charge on the account of a
 * customer, so the order and its payment are read before the provider is
 * asked.
 */
export function decideUpgradeRefund(state: UpgradeRefundState): UpgradeRefundDecision {
  // The money of an order that was refunded is back with the customer.
  // Returning it a second time would take a second time what the customer
  // already got back.
  if (state.status === 'REFUNDED' || state.paymentStatus === 'REFUNDED') {
    return {
      refund: false,
      reason: 'already_refunded',
      message: 'The money of this change was returned already, so it is not returned a second time.',
    };
  }

  // Only a paid order carries money that can be given back.
  if (state.status !== 'PAID' && state.status !== 'FULFILLED') {
    return {
      refund: false,
      reason: 'order_not_paid',
      message: `This change was not paid for (the order is ${state.status.toLowerCase()}), so there is no money to return.`,
    };
  }

  // A refund is the answer to a change that did not happen. A change that was
  // delivered is not given back.
  if (state.fulfillmentStatus !== 'FAILED') {
    return {
      refund: false,
      reason: 'change_not_failed',
      message: 'The paid change was not refused, so there is no money to return.',
    };
  }

  // Without a payment intent the provider has nothing to refund: the money
  // was never collected by the platform.
  if (!state.stripePaymentIntentId) {
    return {
      refund: false,
      reason: 'no_payment_intent',
      message: 'This change carries no payment intent, so no money can be returned.',
    };
  }

  // A payment that failed or is still pending was never collected, so there
  // is nothing to give back.
  if (state.paymentStatus === 'FAILED' || state.paymentStatus === 'PENDING') {
    return {
      refund: false,
      reason: 'payment_not_settled',
      message: `The payment of this change is ${state.paymentStatus.toLowerCase()}, so no money can be returned.`,
    };
  }

  return {
    refund: true,
    reason: 'refund',
    message: 'The paid change was refused, so the money of the customer is returned.',
  };
}

/**
 * The state of the money of an order, read from the order and its payments.
 *
 * A payment that was refunded says that the money is back with the customer,
 * whatever the order itself says, so the state of the payment is what counts.
 */
function refundStateOf(order: {
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  stripePaymentIntentId: string | null;
  payments: Payment[];
}): UpgradeRefundState {
  const payment = order.payments.find((entry) => entry.stripePaymentIntentId) ?? order.payments[0] ?? null;
  const refunded = order.payments.some((entry) => entry.status === 'REFUNDED');
  return {
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    stripePaymentIntentId: order.stripePaymentIntentId ?? payment?.stripePaymentIntentId ?? null,
    paymentStatus: refunded ? 'REFUNDED' : payment?.status ?? null,
  };
}

/**
 * Prices a resource change without touching anything.
 */
async function appliedResizes(instanceId: string): Promise<number> {
  return prisma.order.count({
    where: {
      instanceId,
      kind: 'UPGRADE',
      status: { in: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'FULFILLED'] },
      createdAt: { gt: new Date(Date.now() - RESIZE_WINDOW_MS) },
    },
  });
}

export async function quoteResourceChange(
  instance: InstanceWithProduct,
  request: ResourceRequest,
): Promise<ResourceQuote> {
  const changesUsed = await appliedResizes(instance.id);
  const oldest = changesUsed > 0
    ? await prisma.order.findFirst({
        where: {
          instanceId: instance.id,
          kind: 'UPGRADE',
          status: { in: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'FULFILLED'] },
          createdAt: { gt: new Date(Date.now() - RESIZE_WINDOW_MS) },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
    : null;
  const nextChangeAt = oldest ? new Date(oldest.createdAt.getTime() + RESIZE_WINDOW_MS).toISOString() : null;
  if (changesUsed >= RESIZE_LIMIT) {
    throw badRequest(`This service already has two resource changes in the last 30 days. Next change available ${nextChangeAt?.slice(0, 10)}.`);
  }
  const period = await instanceTerm(instance.orderItemId);
  let price = await prisma.productPrice.findFirst({
    where: { productId: instance.productId, period, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!price && period === 'YEARLY' && instance.product.fulfilment === 'SERVER') {
    price = await prisma.productPrice.findFirst({
      where: { productId: instance.productId, period: 'MONTHLY', active: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!price) throw badRequest(period === 'YEARLY' ? 'This yearly service has no yearly price, so the change cannot be settled.' : 'This product has no active price.');

  validateConfiguration(instance.product, request);
  await assertDiskFits(instance, request.disk);

  const rates = await resourceRates();
  const discount = await yearlyDiscountPercent();
  const currentConfig = { ram: instance.ram, cpu: instance.cpu, disk: instance.disk };
  const newPrice = priceConfiguration(price, instance.product, request, [], rates, period, discount);
  const currentPrice = priceConfiguration(price, instance.product, currentConfig, [], rates, period, discount);
  const recurringDelta = newPrice - currentPrice;
  const subscription = await prisma.subscription.findFirst({
    where: { instanceId: instance.id },
    select: { currentPeriodStart: true, currentPeriodEnd: true, status: true },
  });
  const prorated = prorateRemaining(recurringDelta, subscription?.currentPeriodStart ?? null, subscription?.currentPeriodEnd ?? null);
  // Only money that was collected is given back as credit. A subscription that is late or paused has not paid for
  // the days that are left, so the change is applied and no credit is written.
  const uncollected = subscription !== null && subscription.status !== 'ACTIVE' && subscription.status !== 'TRIALING';
  const creditWithheld = prorated.dueNow < 0 && uncollected ? 'The current period is not paid, so there is no credit for the unused time. The lower price applies from the next period.' : null;
  if (creditWithheld) prorated.dueNow = 0;

  return {
    currentPrice,
    newPrice,
    priceDelta: prorated.dueNow,
    recurringDelta,
    currency: price.currency,
    period,
    remainingDays: prorated.remainingDays,
    changesUsed,
    changesAllowed: RESIZE_LIMIT,
    nextChangeAt,
    requiresPayment: prorated.dueNow > 0,
    creditWithheld,
    fingerprint: quoteFingerprint({
      from: currentConfig,
      to: request,
      currentPrice,
      newPrice,
      dueNow: prorated.dueNow,
      currency: price.currency,
      period,
      periodEnd: subscription?.currentPeriodEnd ?? null,
      subscriptionStatus: subscription?.status ?? null,
    }),
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  };
}

/**
 * Creates the order that pays for a resource change. The order stays pending
 * until the payment is confirmed, and the instance is not touched.
 */
export async function createUpgradeOrder(
  instance: InstanceWithProduct,
  request: ResourceRequest,
  quote: ResourceQuote,
  user: { id: string; email: string },
): Promise<Order> {
  const number = await nextOrderNumber();
  const order = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'resize:' + instance.id}))`;
    const reserved = await tx.order.count({
      where: {
        instanceId: instance.id,
        kind: 'UPGRADE',
        status: { in: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'FULFILLED'] },
        createdAt: { gt: new Date(Date.now() - RESIZE_WINDOW_MS) },
      },
    });
    if (reserved >= RESIZE_LIMIT) throw badRequest('This service already has two resource changes in the last 30 days.');
    return tx.order.create({
      data: {
        number,
        userId: user.id,
        status: 'PENDING',
        kind: 'UPGRADE',
        instanceId: instance.id,
        requestedConfig: request as unknown as object,
        total: Math.max(0, quote.priceDelta),
        discount: quote.priceDelta < 0 ? Math.abs(quote.priceDelta) : 0,
        currency: quote.currency,
      },
    });
  });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'instance.upgrade_ordered',
    targetType: 'order',
    targetId: order.id,
    meta: { instanceId: instance.id, priceDelta: quote.priceDelta, ...request },
  });

  return order;
}

/**
 * Applies a paid resource change.
 *
 * The payment is checked here, inside the function, so every caller is
 * covered: a change that was not paid for never touches the resources of a
 * running service.
 *
 * The panel is updated first. If it refuses, the database is left untouched
 * and the money of the customer goes back. The order then says what really
 * happened: a refunded order when the money is back with the customer, and an
 * order that is still paid when the refund could not be executed, so an
 * operator has to return the money.
 */
/**
 * Writes the unused-time credit after the panel has already accepted the new limits.
 * A missing provider customer, or a provider error, leaves no local credit, so a later call can try again.
 * The lock and the existing credit row keep a repeated call from writing a second credit.
 */
export async function recordDowngradeCredit(order: {
  id: string;
  userId: string;
  number: string;
  discount: number;
  total: number;
  currency: string;
}): Promise<boolean> {
  if (order.total !== 0 || order.discount <= 0) return false;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'resize-credit:' + order.id}))`;
    const already = await tx.moneyAdjustment.findFirst({ where: { orderId: order.id, kind: 'credit' }, select: { id: true } });
    if (already) return false;
    const customerId = await findStripeCustomerId(order.userId);
    if (!customerId) return false;
    let providerRef: string;
    try {
      providerRef = await giveBalanceCredit({
        customerId,
        amount: order.discount,
        currency: order.currency,
        description: `Unused time after a resource decrease (${order.number})`,
        idempotencyKey: `resize-credit:${order.id}`,
      });
    } catch {
      return false;
    }
    await tx.moneyAdjustment.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        kind: 'credit',
        amount: order.discount,
        currency: order.currency,
        reason: 'Unused time after a resource decrease',
        providerRef,
      },
    });
    return true;
  });
}

/** Credits downgrades whose resources were applied and whose balance credit is still missing. */
export async function retryPendingDowngradeCredits(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { kind: 'UPGRADE', fulfillmentStatus: 'FULFILLED', total: 0, discount: { gt: 0 } },
    orderBy: { updatedAt: 'asc' },
    take: 20,
    select: { id: true, userId: true, number: true, discount: true, total: true, currency: true },
  });
  if (!orders.length) return 0;
  const credited = await prisma.moneyAdjustment.findMany({
    where: { kind: 'credit', orderId: { in: orders.map((order) => order.id) } },
    select: { orderId: true },
  });
  const done = new Set(credited.map((row) => row.orderId));
  let count = 0;
  for (const order of orders) {
    if (done.has(order.id)) continue;
    if (await recordDowngradeCredit(order)) count += 1;
  }
  return count;
}

export async function applyUpgradeOrder(orderId: string): Promise<{ applied: boolean; reason: string | null }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      instance: { include: { product: true } },
      // The payments are read here, because the state of the money decides
      // whether the money may be returned.
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) return { applied: false, reason: 'Order not found.' };
  if (order.kind !== 'UPGRADE') return { applied: false, reason: 'This order is not a resource change.' };
  if (!order.instance) return { applied: false, reason: 'The instance of this order no longer exists.' };
  if (order.fulfillmentStatus === 'FULFILLED') {
    await recordDowngradeCredit(order);
    return { applied: true, reason: null };
  }

  const refundState = refundStateOf(order);

  // The money of an order that was refunded is back with the customer. The
  // change is not applied again and no second refund is asked for, so a
  // replayed webhook, a retried job or an operator cannot charge the
  // customer twice.
  if (refundState.status === 'REFUNDED' || refundState.paymentStatus === 'REFUNDED') {
    const reason =
      'The money of this change was returned already, so the change was not applied again and no second refund was requested.';
    await prisma.instanceEvent.create({
      data: {
        instanceId: order.instance.id,
        type: 'resources',
        message: `The resource change was skipped: ${reason}`,
      },
    });
    await audit({
      action: 'instance.upgrade_refund_skipped',
      targetType: 'order',
      targetId: order.id,
      meta: { instanceId: order.instance.id, refundReason: 'already_refunded', refunded: false },
    });
    return { applied: false, reason };
  }

  // The change was not paid for, so it is not applied and the service keeps
  // the resources it has.
  if (order.status !== 'PAID' && order.status !== 'FULFILLED') {
    const reason = `This change has not been paid for, so it was not applied (the order is ${order.status.toLowerCase()}).`;
    await prisma.instanceEvent.create({
      data: {
        instanceId: order.instance.id,
        type: 'resources',
        message: `The resource change was refused: ${reason}`,
      },
    });
    await audit({
      action: 'instance.upgrade_refused',
      targetType: 'order',
      targetId: order.id,
      meta: { instanceId: order.instance.id, status: order.status, reason },
    });
    return { applied: false, reason };
  }

  const request = (order.requestedConfig ?? {}) as unknown as ResourceRequest;
  if (!request.ram || !request.cpu || !request.disk) {
    return { applied: false, reason: 'The order does not carry a resource configuration.' };
  }

  const instance = order.instance;

  if (instance.pterodactylServerId) {
    try {
      await assertDiskFits(instance, request.disk);
      await pteroApp.updateServerBuild(instance.pterodactylServerId, {
        limits: {
          memory: request.ram,
          swap: 0,
          disk: request.disk * 1024,
          io: 500,
          cpu: request.cpu * 100,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The panel rejected the new limits.';

      // The change did not happen, so the fulfilment failed. The update below
      // is a claim: it only touches an order whose fulfilment did not fail
      // yet. Only the caller that wins the claim goes on and returns the
      // money, so two applications of the same order can never ask for two
      // refunds.
      const claimed = await prisma.order.updateMany({
        where: { id: order.id, fulfillmentStatus: { in: ['NOT_STARTED', 'PROVISIONING'] } },
        data: { fulfillmentStatus: 'FAILED' },
      });
      if (claimed.count !== 1) {
        // Somebody else is handling this failure right now. The money is not
        // touched here.
        await prisma.instanceEvent.create({
          data: {
            instanceId: instance.id,
            type: 'resources',
            message: `The paid resource change could not be applied: ${reason}. The failure was already handled, so no second refund was requested.`,
          },
        });
        await audit({
          action: 'instance.upgrade_refund_skipped',
          targetType: 'order',
          targetId: order.id,
          meta: { instanceId: instance.id, reason, refundReason: 'already_handled', refunded: false },
        });
        return { applied: false, reason };
      }

      // The change did not happen, so the customer is told. The order and
      // the reason are the occurrence, so two failures of the same order are
      // two messages and the same failure is one.
      await notifyUpgradeFailed({
        userId: instance.userId,
        instanceName: instance.name,
        reason,
        occurrence: `${order.id}:${reason}`,
      });

      // The change was paid for and it did not happen, so the money of the
      // customer goes back. The decision is taken from the local state of the
      // order, so it is the same answer every time and the same money is
      // never asked for twice.
      const decision = decideUpgradeRefund({ ...refundState, fulfillmentStatus: 'FAILED' });

      if (!decision.refund) {
        // The money is not returned here. An order whose money is back with
        // the customer says so, and an order that carries no money that can
        // be returned is failed. The reason is written down, so an operator
        // can see what happened to the money.
        await prisma.order.updateMany({
          where: { id: order.id, status: { in: ['PAID', 'FULFILLED'] } },
          data: { status: decision.reason === 'already_refunded' ? 'REFUNDED' : 'FAILED' },
        });
        await prisma.instanceEvent.create({
          data: {
            instanceId: instance.id,
            type: 'resources',
            message: `The paid resource change could not be applied: ${reason}. ${decision.message}`,
          },
        });
        await audit({
          action: 'instance.upgrade_refund_skipped',
          targetType: 'order',
          targetId: order.id,
          meta: { instanceId: instance.id, reason, refunded: false, refundReason: decision.reason },
        });
        return { applied: false, reason };
      }

      const refunded = await refundPayment({
        orderId: order.id,
        stripePaymentIntentId: refundState.stripePaymentIntentId,
        amount: order.total,
        reason: 'the panel rejected the change',
      });

      if (refunded) {
        // The money is back with the customer, so the order says so. The
        // fulfilment stays failed: the change itself did not happen.
        await prisma.payment.updateMany({
          where: { orderId: order.id, status: { not: 'REFUNDED' } },
          data: { status: 'REFUNDED' },
        });
        await prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
        await prisma.instanceEvent.create({
          data: {
            instanceId: instance.id,
            type: 'resources',
            message: `The paid resource change could not be applied: ${reason}. The money of the change was returned to you.`,
          },
        });
        await audit({
          action: 'instance.upgrade_refunded',
          targetType: 'order',
          targetId: order.id,
          meta: {
            instanceId: instance.id,
            reason,
            refunded: true,
            amount: order.total,
            currency: order.currency,
          },
        });
        return { applied: false, reason };
      }

      // The refund could not be executed. The money is still with the
      // platform, so the order stays paid and an operator has to return it.
      // The journal says so, because a refund that was not done is not a
      // refund.
      await prisma.instanceEvent.create({
        data: {
          instanceId: instance.id,
          type: 'resources',
          message: `The paid resource change could not be applied: ${reason}. The money could not be returned by the platform, so an operator has to return it.`,
        },
      });
      await audit({
        action: 'instance.upgrade_refund_failed',
        targetType: 'order',
        targetId: order.id,
        meta: {
          instanceId: instance.id,
          reason,
          refunded: false,
          amount: order.total,
          currency: order.currency,
        },
      });
      return { applied: false, reason };
    }
  }

  // The panel accepted the change, so the local state follows.
  const term = await instanceTerm(instance.orderItemId);
  let price = await prisma.productPrice.findFirst({
    where: { productId: instance.productId, period: term, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!price && term === 'YEARLY' && instance.product.fulfilment === 'SERVER') {
    price = await prisma.productPrice.findFirst({
      where: { productId: instance.productId, period: 'MONTHLY', active: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  const rates = await resourceRates();
  const discount = await yearlyDiscountPercent();
  const monthlyPrice = price
    ? priceConfiguration(price, instance.product, request, [], rates, 'MONTHLY', 0)
    : instance.price;
  const billedPrice = price
    ? priceConfiguration(price, instance.product, request, [], rates, term, discount)
    : instance.price;

  await prisma.instance.update({
    where: { id: instance.id },
    data: { ram: request.ram, cpu: request.cpu, disk: request.disk, price: monthlyPrice },
  });

  // The subscription now bills the new amount. A provider failure here does
  // not undo the change, but it is recorded so it can be corrected.
  const subscription = await prisma.subscription.findFirst({ where: { instanceId: instance.id } });
  if (subscription) {
    try {
      await updateSubscriptionAmount(subscription, billedPrice);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { amount: billedPrice },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The billing provider rejected the new amount.';
      await prisma.instanceEvent.create({
        data: {
          instanceId: instance.id,
          type: 'resources',
          message: `The resources changed, but the billing provider did not accept the new amount: ${reason}`,
        },
      });
      await audit({
        action: 'instance.upgrade_billing_mismatch',
        targetType: 'order',
        targetId: order.id,
        meta: { instanceId: instance.id, price: billedPrice, reason },
      });
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { fulfillmentStatus: 'FULFILLED', status: 'FULFILLED' },
  });
  await recordDowngradeCredit(order);
  await prisma.instanceEvent.create({
    data: {
      instanceId: instance.id,
      type: 'resources',
      message: `Resources changed to ${request.ram} MB, ${request.cpu} vCPU, ${request.disk} GB.`,
    },
  });
  await audit({
    action: 'instance.upgrade_applied',
    targetType: 'order',
    targetId: order.id,
    meta: { instanceId: instance.id, ...request, price: monthlyPrice },
  });

  // The change of the resources went through, so the customer is told. The
  // order is the occurrence, so an order that is applied again is one
  // message.
  await notifyUpgradeCompleted({
    userId: instance.userId,
    instanceName: instance.name,
    change: `Resources changed to ${request.ram} MB, ${request.cpu} vCPU, ${request.disk} GB.`,
    occurrence: order.id,
  });

  return { applied: true, reason: null };
}

/**
 * Settles a change that costs less than the service the customer already has.
 *
 * There is no money to collect, so the order is marked paid here.
 * The balance credit is written only after `applyUpgradeOrder` changes the server.
 */
export async function settleFreeUpgradeOrder(
  orderId: string,
  actor: { id: string; email: string },
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw badRequest('Order not found.');
  if (order.kind !== 'UPGRADE' || !order.instanceId || order.total !== 0 || order.userId !== actor.id) {
    throw badRequest('This order is not an eligible free resource change.');
  }
  if (order.status === 'PAID' || order.status === 'FULFILLED') return;

  const transitioned = await prisma.order.updateMany({
    where: { id: orderId, userId: actor.id, kind: 'UPGRADE', total: 0, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date() },
  });
  if (transitioned.count !== 1) throw badRequest('This resource change cannot be settled in its current state.');
  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'instance.upgrade_credited',
    targetType: 'order',
    targetId: orderId,
    meta: { total: order.total, discount: order.discount, reason: 'the change costs less, so there is nothing to collect' },
  });
}
