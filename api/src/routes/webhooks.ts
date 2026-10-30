import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type SubscriptionStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import {
  markOrderPaid,
  refundPayment,
  stripeLive,
  stripeTestGateway,
  upsertInvoice,
  cancelSubscription,
  cancelRemoteSubscription,
  promotionCardIdentity,
  STRIPE_API_VERSION,
} from '../services/stripe.js';
import { enqueueProvisioning, enqueueMailProvisioning, enqueueVpsProvisioning } from '../services/queue.js';
import { createVpsService } from '../services/vps.js';
import * as mailCommerce from '../services/mail-commerce.js';
import {
  notifyInvoiceFailed,
  notifyInvoicePaid,
  notifyPaymentCanceled,
  notifyPaymentFailed,
  notifyPaymentSucceeded,
  notifySubscriptionChanged,
} from '../services/notifications.js';
import { applyUpgradeOrder } from '../services/upgrades.js';
import { allocateUnitPrices } from '../services/order-amounts.js';
import { applyRenewalToSubscription, readRenewalMarker, resolveInvoiceUser } from '../services/billing.js';
import { audit } from '../lib/audit.js';

/**
 * Stripe webhook receiver.
 *
 * Every delivery is written to the WebhookEvent ledger before it is
 * processed, and the ledger carries the processing state:
 *
 *   received -> processing -> processed
 *                       \-> failed
 *                       \-> deferred
 *
 * A delivery that fails leaves the event in `failed`, and the request is
 * answered with a non-2xx status so the provider retries it. A redelivery of a
 * failed event is processed again, while a redelivery of a processed event is
 * ignored as a duplicate. Nothing is silently dropped.
 *
 * An event that arrives before the state it needs is left in `deferred`: it is
 * tried again later, so money that was collected is never lost. The number of
 * tries is bounded, so an event that can never be applied waits for an
 * operator instead of looping forever.
 */

/** A delivery that is older than this is treated as abandoned and retried. */
const STALE_ATTEMPT_MS = 5 * 60 * 1000;

/**
 * How many times an event may be tried before it waits for an operator.
 *
 * The bound is what keeps an event that can never be applied from looping
 * forever: it is marked as failed and stays in the ledger.
 */
const MAX_ATTEMPTS = 12;

/** How long a deferred event waits before it is tried again. */
const DEFER_RETRY_DELAY_MS = 60 * 1000;

export type WebhookOutcome = 'claimed' | 'duplicate' | 'retry';

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * The states a Stripe subscription can have, and the state of the platform
 * that belongs to each of them.
 *
 * Every state Stripe can send is listed, and nothing else. A state that is
 * not listed is not known to the platform, and it never becomes ACTIVE: the
 * subscription keeps the state it had, and the unknown state is written down
 * for an operator. A subscription that becomes ACTIVE by accident would be
 * provisioned and billed for a service nobody confirmed.
 *
 * The spelling is the one Stripe uses: a cancelled subscription is `canceled`,
 * with one `l`. The British spelling of the platform is used for the state of
 * the platform itself.
 */
const SUBSCRIPTION_STATUS_BY_STRIPE_STATE: Record<string, SubscriptionStatus> = {
  ACTIVE: 'ACTIVE',
  TRIALING: 'TRIALING',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'PAST_DUE',
  INCOMPLETE: 'INCOMPLETE',
  // The first payment of the subscription never arrived, so the subscription
  // is dead. It is cancelled like a subscription that was stopped, so nothing
  // tries to renew it.
  INCOMPLETE_EXPIRED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  PAUSED: 'PAUSED',
};

/**
 * The subscription an invoice pays for.
 *
 * Stripe moved the field: in the version of the API the platform pins, the
 * invoice carries `subscription`, and in the newer ones the subscription is
 * under `parent.subscription_details.subscription`. Both are read, so an
 * invoice is still matched with the subscription it pays for whichever
 * version the account of the operator uses.
 */
function readInvoiceSubscriptionId(object: Record<string, unknown>): string | null {
  const direct = object.subscription;
  if (typeof direct === 'string' && direct) return direct;
  const parent = object.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  const nested = parent?.subscription_details?.subscription;
  if (typeof nested === 'string' && nested) return nested;
  return null;
}

/**
 * The sum of a checkout session that pays for the order, and the tax that
 * was charged on top of it.
 *
 * With Stripe Tax turned on, the total of the session carries the tax as
 * well, and the sum of the order is the subtotal. With it turned off, the
 * two are the same number. The tax is only what the provider really charged:
 * the platform never invents one.
 */
function readSessionAmounts(object: Record<string, unknown>): { amount: number | null; tax: number } {
  const total = typeof object.amount_total === 'number' ? object.amount_total : null;
  const subtotal = typeof object.amount_subtotal === 'number' ? object.amount_subtotal : null;
  if (env.stripeTaxEnabled && subtotal !== null && total !== null) {
    return { amount: subtotal, tax: Math.max(0, total - subtotal) };
  }
  return { amount: total, tax: 0 };
}

function promotionCardHash(fingerprint: string): string {
  return createHmac('sha256', env.PROMOTION_FINGERPRINT_SECRET)
    .update(`stripe-card:${fingerprint}`)
    .digest('hex');
}

/**
 * Completes a fully sponsored checkout only after one card has been bound to
 * the campaign. The unique database index is the final concurrency guard: two
 * accounts completing Checkout at the same time cannot both claim one card.
 */
async function completeSponsoredCheckout(
  order: { id: string; number: string; userId: string; total: number; currency: string; promotionId: string | null; status: string },
  object: Record<string, unknown>,
  eventId: string,
): Promise<void> {
  if (!order.promotionId || order.total !== 0) throw new Error('Sponsored checkout does not match a zero-total promotion order.');
  if (order.status === 'PAID' || order.status === 'FULFILLED') return;
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') return;

  const stripeSubscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
  if (!stripeSubscriptionId) throw new DeferredWebhookError('The sponsored checkout has no Stripe subscription yet.');
  const identity = await promotionCardIdentity(stripeSubscriptionId);
  if (!identity) throw new DeferredWebhookError('Stripe has not attached a card to the sponsored subscription yet.');

  try {
    await prisma.promotionRedemption.update({
      where: { orderId: order.id },
      data: { cardFingerprintHash: promotionCardHash(identity.fingerprint) },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    await cancelRemoteSubscription(stripeSubscriptionId);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    await releaseCancelledOrderPromotion({ id: order.id, promotionId: order.promotionId, promotionRedeemedAt: null });
    await audit({
      actorId: order.userId,
      action: 'promotion.card_reused',
      targetType: 'order',
      targetId: order.id,
      meta: { promotionId: order.promotionId, stripeSubscriptionId },
    });
    await notifyPaymentFailed({
      userId: order.userId,
      number: order.number,
      amount: 0,
      currency: order.currency,
      reason: 'This promotion has already been claimed with this card.',
      occurrence: eventId,
    });
    return;
  }

  await markOrderPaid({
    orderId: order.id,
    stripeSubscriptionId,
    stripeCustomerId: identity.customerId,
    amount: 0,
    tax: 0,
  });
  await fulfilOrder(order.id);
  await notifyPaymentSucceeded({
    userId: order.userId,
    number: order.number,
    amount: 0,
    currency: order.currency,
    occurrence: eventId,
  });
}

/** Parses a JSON payload without throwing on malformed input. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Takes ownership of an event.
 *
 * `claimed` means the caller has to process the event, `retry` means the event
 * was seen before but did not succeed, and `duplicate` means the event was
 * already handled and must not be applied again.
 */
async function claimEvent(
  provider: string,
  eventId: string,
  type: string,
  payload: unknown,
): Promise<WebhookOutcome> {
  try {
    await prisma.webhookEvent.create({
      data: { provider, eventId, type, payload: payload as never, status: 'received' },
    });
    return 'claimed';
  } catch {
    // The unique constraint only fires for an event that was seen before.
  }

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider, eventId } },
  });
  if (!existing) return 'claimed';

  if (existing.status === 'processed') return 'duplicate';

  // An event that was tried too often is not tried again: it waits for an
  // operator, so a delivery that can never be applied does not loop forever.
  if (existing.attempts >= MAX_ATTEMPTS) return 'duplicate';

  const abandoned =
    existing.status === 'received' ||
    (existing.lastAttemptAt ? Date.now() - existing.lastAttemptAt.getTime() > STALE_ATTEMPT_MS : false);

  // A deferred event is tried again: the state it was waiting for may have
  // arrived in the meantime.
  if (existing.status === 'failed' || existing.status === 'deferred' || abandoned) {
    await prisma.webhookEvent.update({
      where: { id: existing.id },
      data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
    });
    return 'retry';
  }

  // Another delivery is already working on this event.
  return 'duplicate';
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: 'stripe', eventId } },
    data: { status: 'processed', processedAt: new Date(), error: null },
  });
}

async function markFailed(eventId: string, message: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: 'stripe', eventId } },
    data: { status: 'failed', error: message, lastAttemptAt: new Date() },
  });
}

/**
 * An event that could not be applied yet, for example because the order it
 * belongs to does not exist. It stays in the ledger and is tried again, so the
 * state it waits for can arrive in the meantime.
 *
 * The event is marked as failed when it was tried too often: from then on it
 * waits for an operator instead of being tried again.
 */
async function markDeferred(eventId: string, message: string): Promise<void> {
  // The attempt is counted: an event that cannot be applied yet is tried
  // again, and the bound that stops the tries has to see them.
  await prisma.webhookEvent.updateMany({
    where: { provider: 'stripe', eventId },
    data: {
      status: 'deferred',
      error: message,
      lastAttemptAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  const after = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: 'stripe', eventId } },
    select: { attempts: true },
  });

  if ((after?.attempts ?? 0) >= MAX_ATTEMPTS) {
    await prisma.webhookEvent.update({
      where: { provider_eventId: { provider: 'stripe', eventId } },
      data: {
        status: 'failed',
        error: `${message} The event was tried ${MAX_ATTEMPTS} times, so it waits for an operator.`,
      },
    });
  }
}

/** Thrown when an event has to wait instead of failing. */
class DeferredWebhookError extends Error {}

/**
 * Gives the campaign slot of a cancelled order back to the pool.
 *
 * The redemption of the order is removed and the counter of the campaign is
 * corrected, so an order that was cancelled cannot exhaust a promotion.
 */
async function releaseCancelledOrderPromotion(order: {
  id: string;
  promotionId: string | null;
  promotionRedeemedAt: Date | null;
}): Promise<void> {
  const redemption = await prisma.promotionRedemption.findUnique({ where: { orderId: order.id } });
  if (!redemption) return;

  await prisma.promotionRedemption.delete({ where: { orderId: order.id } });
  if (order.promotionRedeemedAt && order.promotionId) {
    await prisma.promotion.updateMany({
      where: { id: order.promotionId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    await prisma.order.update({ where: { id: order.id }, data: { promotionRedeemedAt: null } });
  }
}

/**
 * Turns a paid order into running services.
 *
 * Every order line produces as many instances as its quantity, and the
 * idempotency key of each instance makes the step safe to repeat.
 */
export async function fulfilOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;

  // A cancelled order is never fulfilled. The campaign slot goes back into
  // the pool and the situation is written down, so nothing is created for an
  // order that was cancelled.
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    await releaseCancelledOrderPromotion(order);
    await audit({
      action: 'order.cancelled_not_fulfilled',
      targetType: 'order',
      targetId: order.id,
      meta: { status: order.status, total: order.total, currency: order.currency },
    });
    return;
  }

  // A renewal extends a service, it does not create one.
  const renewal = readRenewalMarker(order.requestedConfig);
  if (renewal) {
    const invoice = await prisma.invoice.findFirst({
      where: { orderId: order.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    await applyRenewalToSubscription({
      subscriptionId: renewal.subscriptionId,
      periodStart: invoice?.periodStart ?? null,
      periodEnd: invoice?.periodEnd ?? null,
      interval: renewal.interval,
      orderId: order.id,
    });
    // A mail service that is renewed comes back to work: the payment arrived,
    // so the mail of the customer starts again.
    await resumeMailServiceAfterRenewal(renewal.subscriptionId, order.id);
    await prisma.order.update({ where: { id: order.id }, data: { fulfillmentStatus: 'FULFILLED' } });
    return;
  }

  if (order.kind === 'UPGRADE') {
    await applyUpgradeOrder(order.id);
    return;
  }

  // An order that changes the plan of a mail service does not make a new
  // service: it changes the limits of the one the customer already has. The
  // change happens only now, when the money arrived.
  const planChange = mailCommerce.readMailPlanChange(order.requestedConfig);
  if (planChange) {
    await fulfilMailPlanChange(order.id, order.userId, planChange.serviceId);
    return;
  }

  // The price of an instance is the price that is really paid for it. A
  // promotion belongs to the order, so the catalogue price of the line is
  // not what the customer pays for the instance.
  const unitPrices = allocateUnitPrices(
    order.items.map((item) => ({ unitAmount: item.unitAmount, quantity: item.quantity, total: item.total })),
    order.total,
  );

  for (const [index, item] of order.items.entries()) {
    const subscription = await prisma.subscription.findUnique({ where: { orderItemId: item.id } });
    const config = (item.config ?? {}) as {
      ram?: number;
      cpu?: number;
      disk?: number;
      fulfilment?: string;
      mailDomain?: string | null;
      sealedVariables?: string | null;
    };

    // A line of mail is delivered by the mail system and not by the panel.
    // The two kinds of line progress on their own: the failure of one of them
    // never marks the other one as failed.
    if (await isMailLine(item.productId)) {
      await fulfilMailLine(order.id, order.userId, item, subscription?.id ?? null);
      continue;
    }

    // A virtual private server is built on Proxmox by a queue of its own.
    if (await isVpsLine(item.productId)) {
      await fulfilVpsLine(order.id, item, subscription?.id ?? null, order.userId);
      continue;
    }

    for (let unit = 0; unit < item.quantity; unit++) {
      // The key makes a redelivered webhook reuse the same instance.
      const provisioningKey = `order:${order.id}:item:${item.id}:unit:${unit}`;
      const existing = await prisma.instance.findUnique({ where: { provisioningKey } });
      if (existing) continue;

      const instance = await prisma.instance.create({
        data: {
          userId: order.userId,
          productId: item.productId,
          orderId: order.id,
          orderItemId: item.id,
          name: item.quantity > 1 ? `${item.name} ${unit + 1}` : item.name,
          status: 'PENDING',
          ram: config.ram ?? 512,
          cpu: config.cpu ?? 1,
          disk: config.disk ?? 5,
          price: unitPrices[index] ?? item.unitAmount,
          currency: order.currency,
          provisioningKey,
          // The values the customer gave for the variables of the product
          // travel with the instance, sealed. They are the secrets of the
          // customer, and the provisioning opens them for the container.
          customerVariables: config.sealedVariables ?? null,
        },
      });

      // A line with a single unit owns the subscription, so the instance
      // shows its billing state.
      if (subscription && item.quantity === 1) {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { instanceId: instance.id } });
      }

      await prisma.orderItem.update({
        where: { id: item.id },
        data: { fulfillmentStatus: 'PROVISIONING', fulfillmentError: null },
      });

      await enqueueProvisioning(instance.id, { reason: 'order paid' });
    }
  }

  // The state of the order is the state of its lines: an order whose lines
  // are all delivered is delivered, an order whose lines all failed failed,
  // and any other order is on its way.
  const states = await prisma.orderItem.findMany({
    where: { orderId: order.id },
    select: { fulfillmentStatus: true },
  });
  const allFulfilled = states.length > 0 && states.every((state) => state.fulfillmentStatus === 'FULFILLED');
  const allFailed = states.length > 0 && states.every((state) => state.fulfillmentStatus === 'FAILED');
  await prisma.order.update({
    where: { id: order.id },
    data: { fulfillmentStatus: allFulfilled ? 'FULFILLED' : allFailed ? 'FAILED' : 'PROVISIONING' },
  });
}

/** True when the product of a line is delivered as a virtual private server. */
async function isVpsLine(productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { fulfilment: true } });
  return product?.fulfilment === 'VPS';
}

/**
 * Makes the VPS of a paid line and puts it on the queue.
 *
 * The line carries the key and the name that were checked when the order was priced.
 * A failure is written on the line and never on the order.
 */
async function fulfilVpsLine(
  orderId: string,
  item: { id: string; productId: string; config: unknown },
  subscriptionId: string | null,
  userId: string,
): Promise<void> {
  const config = (item.config ?? {}) as {
    ram?: number;
    cpu?: number;
    disk?: number;
    vps?: { name?: string; sshPublicKey?: string; dedicatedIp?: boolean } | null;
  };
  try {
    if (!config.vps?.sshPublicKey || !config.vps.name || !config.ram || !config.cpu || !config.disk) {
      throw new Error('This line of a server has no key or no size.');
    }
    const service = await createVpsService({
      userId,
      productId: item.productId,
      orderItemId: item.id,
      subscriptionId,
      name: config.vps.name,
      ram: config.ram,
      cpu: config.cpu,
      disk: config.disk,
      sshPublicKey: config.vps.sshPublicKey,
      dedicatedIp: Boolean(config.vps.dedicatedIp),
    });
    await prisma.orderItem.update({ where: { id: item.id }, data: { fulfillmentStatus: 'PROVISIONING', fulfillmentError: null } });
    await enqueueVpsProvisioning(service.id, { reason: 'order paid' });
  } catch (error) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { fulfillmentStatus: 'FAILED', fulfillmentError: (error as Error).message },
    });
    await audit({
      action: 'vps.line_failed',
      targetType: 'order_item',
      targetId: item.id,
      meta: { orderId, error: (error as Error).message },
    });
  }
}

/** True when the product of a line is delivered as a mail service. */
async function isMailLine(productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { fulfilment: true },
  });
  return product?.fulfilment === 'EMAIL';
}

/**
 * Delivers a line of mail.
 *
 * The service of the line is created with a key that is built from the order
 * and the line, so a redelivered payment event finds it instead of making a
 * second one. The domain of the line waits for its proof, so the mail is
 * hosted only when the customer has shown that the domain is theirs.
 *
 * A failure of the line is written on the line itself and never on the
 * order, so the server of the same order is not marked as failed.
 */
async function fulfilMailLine(
  orderId: string,
  userId: string,
  item: { id: string; productId: string; config: unknown },
  subscriptionId: string | null,
): Promise<void> {
  const config = (item.config ?? {}) as { mailDomain?: string | null };
  const domain = config.mailDomain;
  if (!domain) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { fulfillmentStatus: 'FAILED', fulfillmentError: 'This line of mail has no domain.' },
    });
    return;
  }

  try {
    const { serviceId } = await mailCommerce.createMailServiceForOrderItem({
      orderId,
      itemId: item.id,
      userId,
      productId: item.productId,
      domain,
      subscriptionId,
    });
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { fulfillmentStatus: 'PROVISIONING', fulfillmentError: null },
    });
    await enqueueMailProvisioning(serviceId, { reason: 'order paid' });
  } catch (error) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { fulfillmentStatus: 'FAILED', fulfillmentError: (error as Error).message },
    });
    await audit({
      action: 'mail.line_failed',
      targetType: 'order_item',
      targetId: item.id,
      meta: { orderId, error: (error as Error).message },
    });
  }
}

/**
 * Brings a mail service back to work after a renewal.
 *
 * The mail of a customer that paid again is not left suspended, and the
 * period of grace of the service is cleared.
 */
async function resumeMailServiceAfterRenewal(subscriptionId: string, orderId: string): Promise<void> {
  const service = await prisma.mailService.findFirst({
    where: { subscriptionId },
    select: { id: true, status: true },
  });
  if (!service) return;
  if (service.status === 'ACTIVE' || service.status === 'PROVISIONING' || service.status === 'PENDING') return;
  await mailCommerce.resumeMailService(service.id).catch(() => undefined);
  await audit({
    action: 'mail.service_resumed_by_renewal',
    targetType: 'mail_service',
    targetId: service.id,
    meta: { orderId },
  });
}

/**
 * Applies a change of plan to a mail service.
 *
 * The limits of the service are the limits of the new plan, the subscription
 * of the service is the one of the new order line, and the subscription of the
 * old plan is cancelled at the end of the period that was paid for. Nothing
 * is deleted: a customer that goes to a smaller plan keeps what it has.
 */
async function fulfilMailPlanChange(
  orderId: string,
  userId: string,
  serviceId: string,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  const item = order?.items[0];
  if (!order || !item) {
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'FAILED' },
    });
    return;
  }

  try {
    const service = await prisma.mailService.findUnique({ where: { id: serviceId } });
    if (!service || service.userId !== userId) {
      throw new Error('The mail service of this order does not belong to this customer.');
    }

    await mailCommerce.applyMailPlanToService(serviceId, item.productId, userId);

    const newSubscription = await prisma.subscription.findUnique({ where: { orderItemId: item.id } });
    const oldSubscriptionId = service.subscriptionId;
    if (newSubscription && newSubscription.id !== oldSubscriptionId) {
      await prisma.mailService.update({
        where: { id: serviceId },
        data: { subscriptionId: newSubscription.id },
      });
    }
    if (oldSubscriptionId && oldSubscriptionId !== newSubscription?.id) {
      const oldSubscription = await prisma.subscription.findUnique({ where: { id: oldSubscriptionId } });
      if (oldSubscription) {
        // The old plan is cancelled at the end of the period that was paid
        // for, so the customer is not charged for it and is not charged for
        // the new one before the period ends.
        await cancelSubscription(oldSubscription, { immediate: false });
      }
    }

    await prisma.orderItem.update({
      where: { id: item.id },
      data: { fulfillmentStatus: 'FULFILLED', fulfillmentError: null },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'FULFILLED' },
    });
  } catch (error) {
    await prisma.orderItem.update({
      where: { id: item.id },
      data: { fulfillmentStatus: 'FAILED', fulfillmentError: (error as Error).message },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: 'FAILED' },
    });
    await audit({
      action: 'mail.plan_change_failed',
      targetType: 'mail_service',
      targetId: serviceId,
      meta: { orderId, error: (error as Error).message },
    });
  }
}

/**
 * The amount Stripe collected has to match the order. A mismatch means the
 * order was not paid as quoted, so nothing is provisioned.
 *
 * The check closes when the provider does not send an amount. A payment event
 * without an amount cannot be compared with the order, and a check that lets
 * it through is not a check: the order would be provisioned for a sum nobody
 * confirmed. The order total is in minor units, so the comparison is exact.
 */
async function verifyAmount(orderId: string, amountTotal: unknown): Promise<string | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return 'The order does not exist.';
  if (typeof amountTotal !== 'number' || !Number.isFinite(amountTotal)) {
    return 'The payment event does not carry the amount that was collected.';
  }
  if (amountTotal !== order.total) {
    return `Stripe collected ${amountTotal} but the order total is ${order.total}.`;
  }
  return null;
}

/**
 * Handles a payment that arrives for an order that was cancelled.
 *
 * Nothing is created for the order. The money is returned with the refund the
 * platform already uses, the campaign slot goes back into the pool and the
 * situation is written down. A refund that cannot be executed here is
 * reported, so an operator can return the money with the refund route of the
 * administration.
 */
async function handleCancelledOrderPayment(
  order: {
    id: string;
    userId: string;
    total: number;
    currency: string;
    status: string;
    stripePaymentIntentId: string | null;
    promotionId: string | null;
    promotionRedeemedAt: Date | null;
  },
  object: Record<string, unknown>,
): Promise<void> {
  const paymentIntentId = (object.payment_intent as string) ?? order.stripePaymentIntentId ?? null;

  // The money that arrived is returned, not the sum of the order. A refund of
  // a sum that was never collected is refused by the provider, and the money
  // of the customer would stay with the platform. When the two sums differ,
  // the difference is written down.
  const collected = typeof object.amount_total === 'number' ? object.amount_total : null;
  // The sum that pays for the order is the sum of the order. The tax the
  // provider charged on top of it is part of the money that is returned, but
  // it is not part of the sum of the order.
  const { amount: orderAmount } = readSessionAmounts(object);
  if (orderAmount !== null && orderAmount !== order.total) {
    await audit({
      action: 'order.amount_mismatch',
      targetType: 'order',
      targetId: order.id,
      meta: { collected: orderAmount, expected: order.total },
    });
  }
  const amount = collected ?? order.total;

  // The order is claimed before the provider is asked, so two deliveries that
  // arrive at the same time cannot both return the money. The claim is the
  // state of the order itself: only the delivery that wins it returns the
  // money.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: 'CANCELLED' },
    data: { status: 'REFUNDED' },
  });

  let refunded = false;
  if (claimed.count === 1) {
    refunded = await refundPayment({
      orderId: order.id,
      stripePaymentIntentId: paymentIntentId,
      amount,
      reason: 'the order was cancelled before the payment arrived',
    });
    if (!refunded) {
      // The provider could not return the money, so the order is not a
      // refunded one: the money is still with the platform, and the claim is
      // given back so the money can be returned later.
      await prisma.order.updateMany({
        where: { id: order.id, status: 'REFUNDED' },
        data: { status: 'CANCELLED' },
      });
    }
  }

  await releaseCancelledOrderPromotion(order);
  // A refunded order keeps the trace of the refund. A payment that arrives
  // late for an order that was already refunded must not erase it, because
  // the state that says the money was returned is what the guard of the
  // dead orders reads.
  if (claimed.count === 1) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: refunded ? 'REFUNDED' : 'CANCELLED' },
    });
  }
  await audit({
    action: refunded || order.status === 'REFUNDED'
      ? 'order.cancelled_payment_refunded'
      : 'order.cancelled_payment_received',
    targetType: 'order',
    targetId: order.id,
    meta: {
      userId: order.userId,
      amount,
      currency: order.currency,
      refunded,
      reason: 'the order was cancelled before the payment arrived',
    },
  });
}

async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data.object ?? {};

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const orderId =
        (object.client_reference_id as string) ?? (object.metadata as { orderId?: string })?.orderId;
      if (!orderId) break;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        // The order is not there yet. The event waits in the ledger, so it can
        // be replayed instead of being dropped.
        throw new DeferredWebhookError(`The order ${orderId} does not exist (yet).`);
      }

      const metadata = object.metadata as { orderKind?: string } | undefined;
      if (metadata?.orderKind === 'PROMOTION_CARD_CHECK') {
        if (event.type === 'checkout.session.completed') {
          await completeSponsoredCheckout(order, object, event.id);
        }
        break;
      }

      // A session that is not paid yet waits for the async confirmation.
      const paymentStatus = object.payment_status as string | undefined;
      if (paymentStatus === 'unpaid') break;

      // An order that was cancelled is never fulfilled. The money that arrives
      // for it is returned and the campaign slot goes back into the pool.
      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        await handleCancelledOrderPayment(order, object);
        break;
      }

      // The sum that pays for the order is the sum of the order, with or
      // without the tax the provider charged on top of it.
      const { amount, tax } = readSessionAmounts(object);
      const amountProblem = await verifyAmount(orderId, amount);
      if (amountProblem) {
        await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
        await audit({
          action: 'order.amount_mismatch',
          targetType: 'order',
          targetId: orderId,
          meta: { collected: amount, expected: order.total, tax },
        });
        throw new Error(amountProblem);
      }

      await markOrderPaid({
        orderId,
        stripePaymentIntentId: (object.payment_intent as string) ?? null,
        stripeSubscriptionId: (object.subscription as string) ?? null,
        stripeCustomerId: (object.customer as string) ?? null,
        amount: amount ?? undefined,
        tax,
      });
      await fulfilOrder(orderId);

      // The provider confirmed the money, so the customer is told. The id of
      // the event of the provider is the occurrence: the same payment that
      // arrives twice is one message.
      await notifyPaymentSucceeded({
        userId: order.userId,
        number: order.number,
        amount: order.total,
        currency: order.currency,
        occurrence: event.id,
      });
      break;
    }

    case 'checkout.session.async_payment_failed': {
      const orderId =
        (object.client_reference_id as string) ?? (object.metadata as { orderId?: string })?.orderId;
      if (!orderId) break;
      await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
      await prisma.payment.updateMany({ where: { orderId }, data: { status: 'FAILED' } });

      // The payment was refused by the provider. The customer is told, with
      // the reason the provider gave.
      const failed = await prisma.order.findUnique({ where: { id: orderId } });
      if (failed) {
        await notifyPaymentFailed({
          userId: failed.userId,
          number: failed.number,
          amount: failed.total,
          currency: failed.currency,
          reason: null,
          occurrence: event.id,
        });
      }
      break;
    }

    case 'checkout.session.expired': {
      const orderId =
        (object.client_reference_id as string) ?? (object.metadata as { orderId?: string })?.orderId;
      if (!orderId) break;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) break;
      // Only an order that is still waiting for its payment is released. An
      // order that was paid, refused or refunded is left exactly as it is:
      // the event is late, not the state of the order.
      if (order.status !== 'PENDING' && order.status !== 'AWAITING_PAYMENT') break;
      await prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
      // The campaign slot of the abandoned checkout goes back into the pool,
      // so a checkout nobody finished cannot hold a promotion hostage.
      await releaseCancelledOrderPromotion(order);
      await audit({
        action: 'order.checkout_expired',
        targetType: 'order',
        targetId: orderId,
        meta: { orderNumber: order.number, userId: order.userId },
      });
      // The checkout was abandoned, so the payment never happened. The
      // customer is told that the order was released.
      await notifyPaymentCanceled({
        userId: order.userId,
        number: order.number,
        occurrence: event.id,
      });
      break;
    }

    case 'payment_intent.payment_failed': {
      const intentId = object.id as string | undefined;
      if (!intentId) break;
      const reason = (object.last_payment_error as { message?: string })?.message ?? null;
      await prisma.payment.updateMany({
        where: { stripePaymentIntentId: intentId },
        data: {
          status: 'FAILED',
          failureMessage: reason,
        },
      });

      // The payment was refused. The customer is told, with the reason the
      // provider gave and with the link of the billing page.
      const refused = await prisma.payment.findFirst({
        where: { stripePaymentIntentId: intentId },
        include: { order: true },
      });
      if (refused?.order) {
        await notifyPaymentFailed({
          userId: refused.order.userId,
          number: refused.order.number,
          amount: refused.order.total,
          currency: refused.order.currency,
          reason,
          occurrence: event.id,
        });
      }
      break;
    }

    case 'invoice.paid': {
      const invoiceId = object.id as string;
      const subscriptionId = readInvoiceSubscriptionId(object) ?? undefined;
      const customerId = object.customer as string | undefined;

      const paid = typeof object.amount_paid === 'number' ? object.amount_paid : null;
      if (paid !== null) {
        const subscription = subscriptionId
          ? await prisma.subscription.findFirst({
              where: { stripeSubscriptionId: subscriptionId },
              include: { orderItem: true },
            })
          : null;

        // The invoice can arrive before the checkout of the same order. The
        // event then waits in the ledger and is tried again, so the money
        // that was collected is never lost.
        if (subscriptionId && !subscription) {
          throw new DeferredWebhookError(
            `The subscription ${subscriptionId} of invoice ${invoiceId} is not known yet.`,
          );
        }

        const order = subscription?.orderItem
          ? await prisma.order.findUnique({ where: { id: subscription.orderItem.orderId } })
          : null;
        const userId = order?.userId ?? subscription?.userId ?? (await resolveInvoiceUser(undefined, customerId));
        if (!userId) {
          throw new DeferredWebhookError(`The customer of invoice ${invoiceId} is not known yet.`);
        }

        await upsertInvoice({
          stripeInvoiceId: invoiceId,
          userId,
          orderId: order?.id ?? null,
          amount: paid,
          currency: (object.currency as string) ?? 'EUR',
          status: 'PAID',
          hostedUrl: (object.hosted_invoice_url as string) ?? null,
          pdfUrl: (object.invoice_pdf as string) ?? null,
          paidAt: new Date(),
          periodStart: typeof object.period_start === 'number' ? new Date(object.period_start * 1000) : null,
          periodEnd: typeof object.period_end === 'number' ? new Date(object.period_end * 1000) : null,
        });
        // The customer hears about the payment. The message follows the
        // preferences of the account and its state is the one of the mailer:
        // while no relay is configured, it is written to a file and nobody
        // receives it.
        const invoice = await prisma.invoice.findUnique({
          where: { stripeInvoiceId: invoiceId },
          include: { user: true },
        });
        if (invoice) {
          await notifyInvoicePaid({
            userId: invoice.userId,
            number: invoice.number,
            amount: invoice.amount,
            currency: invoice.currency,
            periodEnd: invoice.periodEnd,
            // The payment of the provider is the occurrence: the same
            // invoice paid twice is two messages, and the same payment
            // delivered twice by the provider is one.
            occurrence: typeof object.id === 'string' ? object.id : invoice.id,
          });
        }
      }

      if (subscriptionId) {
        // The period comes from the invoice, not from an approximation.
        const periodStart =
          typeof object.period_start === 'number' ? new Date(object.period_start * 1000) : undefined;
        const periodEnd =
          typeof object.period_end === 'number' ? new Date(object.period_end * 1000) : undefined;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            status: 'ACTIVE',
            ...(periodStart ? { currentPeriodStart: periodStart } : {}),
            ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
          },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const subscriptionId = readInvoiceSubscriptionId(object) ?? undefined;
      const invoiceId = object.id as string;
      if (subscriptionId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: 'PAST_DUE' },
        });
      }
      const dbInvoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: invoiceId } });
      if (dbInvoice) {
        await prisma.invoice.update({ where: { id: dbInvoice.id }, data: { status: 'OPEN' } });
        const customer = await prisma.user.findUnique({ where: { id: dbInvoice.userId } });
        if (customer) {
          const failure = object.last_payment_error as { message?: unknown } | undefined;
          await notifyInvoiceFailed({
            userId: customer.id,
            number: dbInvoice.number,
            amount: dbInvoice.amount,
            currency: dbInvoice.currency,
            reason: typeof failure?.message === 'string' ? failure.message : null,
            periodEnd: dbInvoice.periodEnd,
            occurrence: typeof object.id === 'string' ? object.id : dbInvoice.id,
          });
        }
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscriptionId = object.id as string;
      const stripeState = String(object.status ?? '').toUpperCase();
      // A state the platform does not know is never ACTIVE: the subscription
      // keeps the state it had, and the unknown state is written down.
      const state = SUBSCRIPTION_STATUS_BY_STRIPE_STATE[stripeState] ?? null;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          ...(state ? { status: state } : {}),
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
          ...(typeof object.current_period_start === 'number'
            ? { currentPeriodStart: new Date(object.current_period_start * 1000) }
            : {}),
          ...(typeof object.current_period_end === 'number'
            ? { currentPeriodEnd: new Date(object.current_period_end * 1000) }
            : {}),
        },
      });
      if (!state) {
        // The state that the provider sent is not one the platform knows. It
        // is written down, so an operator can see what the provider says.
        await audit({
          action: 'stripe.subscription_state_unknown',
          targetType: 'subscription',
          targetId: subscriptionId,
          meta: { state: stripeState },
        });
      }

      // The customer changed the subscription in the portal of the provider,
      // so the customer is told what the platform knows about it now. The
      // state of the provider and the plan of the cancellation are the
      // occurrence, so a delivery that comes twice is one message.
      const lines = await prisma.subscription.findMany({
        where: { stripeSubscriptionId: subscriptionId },
        select: {
          userId: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
          instance: { select: { name: true } },
        },
      });
      for (const line of lines) {
        await notifySubscriptionChanged({
          userId: line.userId,
          instanceName: line.instance?.name ?? 'the service',
          status: state ?? stripeState,
          periodEnd: line.currentPeriodEnd,
          cancelAtPeriodEnd: line.cancelAtPeriodEnd,
          occurrence: `${subscriptionId}:${stripeState}:${Boolean(object.cancel_at_period_end)}`,
        });
      }
      break;
    }

    default:
      break;
  }

  await audit({ action: `stripe.${event.type}`, targetType: 'webhook_event', targetId: event.id });
}

type ProcessOutcome = 'processed' | 'deferred' | 'failed';

/**
 * Processes an event and records the outcome.
 *
 * `processed` means the event was applied. `deferred` means it has to wait
 * and stays in the ledger, so it can be replayed. `failed` means the caller
 * has to answer with an error, so the provider retries the delivery.
 */
async function processEvent(event: StripeEvent): Promise<ProcessOutcome> {
  try {
    await handleStripeEvent(event);
    await markProcessed(event.id);
    return 'processed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof DeferredWebhookError) {
      await markDeferred(event.id, message);
      return 'deferred';
    }
    await markFailed(event.id, message);
    return 'failed';
  }
}

/**
 * The header Stripe sends with every delivery. It carries the timestamp of
 * the delivery and one or more signatures of the body.
 */
const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

/**
 * The signature of the delivery, read from the header of the request.
 *
 * The header is read as the text it is. A header that arrives more than once
 * is joined, and the provider refuses it as malformed: a delivery that
 * carries two signatures is not a delivery that can be trusted.
 */
function readSignatureHeader(request: FastifyRequest): string | undefined {
  const header = request.headers[STRIPE_SIGNATURE_HEADER];
  if (typeof header === 'string') return header;
  if (Array.isArray(header)) return header.join(',');
  return undefined;
}

/**
 * The reason a signature was refused.
 *
 * The three failures are told apart, because they need a different answer
 * from an operator: a header that is not there is a delivery that was sent
 * wrongly, an expired signature is a delivery that was replayed, and a
 * signature that does not match is a delivery that was not signed with our
 * secret.
 */
function signatureErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Unable to extract timestamp')) {
    return 'The Stripe-Signature header is malformed.';
  }
  if (message.includes('Timestamp outside the tolerance zone')) {
    return 'The signature of the delivery has expired.';
  }
  if (message.includes('No signatures found matching')) {
    return 'The signature of the delivery does not match the body.';
  }
  return 'Signature verification failed.';
}

/**
 * Verifies the signature of a delivery and extracts the event.
 *
 * The body is used exactly as it was received, and the signature comes from
 * the header of the request. The secret is the key that verifies the
 * signature, never the signature itself: a delivery that carries no valid
 * signature is refused, and the comparison is made in constant time by the
 * provider.
 */
async function readStripeEvent(
  raw: string,
  signatureHeader: string | undefined,
): Promise<StripeEvent | { error: string }> {
  if (stripeLive()) {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { error: 'The webhook secret is not configured.' };
    if (!signatureHeader) return { error: 'The Stripe-Signature header is missing.' };
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
    try {
      return stripe.webhooks.constructEvent(raw, signatureHeader, secret) as unknown as StripeEvent;
    } catch (error) {
      return { error: signatureErrorMessage(error) };
    }
  }
  try {
    return JSON.parse(raw) as StripeEvent;
  } catch {
    return { error: 'Invalid JSON.' };
  }
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/stripe', async (request: FastifyRequest, reply) => {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});

    if (!stripeLive() && !stripeTestGateway()) {
      // No Stripe configured: nothing to accept.
      return reply.code(200).send({ received: false, reason: 'Stripe is not configured.' });
    }

    const parsed = await readStripeEvent(raw, readSignatureHeader(request));
    if ('error' in parsed) {
      request.log.warn({ reason: parsed.error }, 'stripe webhook rejected');
      return reply.code(400).send({ received: false, reason: parsed.error });
    }
    const event = parsed;

    const outcome = await claimEvent('stripe', event.id, event.type, event.data.object ?? {});
    if (outcome === 'duplicate') {
      return reply.code(200).send({ received: true, duplicate: true });
    }

    const result = await processEvent(event);
    if (result === 'failed') {
      // The event stays in the ledger as failed and the provider retries it.
      request.log.error({ eventId: event.id }, 'stripe webhook processing failed');
      return reply.code(500).send({ received: false, reason: 'The event could not be processed and will be retried.' });
    }
    if (result === 'deferred') {
      request.log.warn({ eventId: event.id }, 'stripe webhook deferred');
      return reply.code(200).send({ received: true, deferred: true });
    }

    return reply.code(200).send({ received: true });
  });

  /**
   * Test gateway endpoint. It only exists when the local test gateway is
   * enabled, so it cannot be used to fake a payment in production. It also
   * requires the internal API token, so it is never a public way to mark an
   * order as paid.
   */
  app.post('/webhooks/stripe/test', async (request: FastifyRequest, reply) => {
    if (!stripeTestGateway()) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    }
    const token = request.headers['x-internal-token'];
    if (!env.internalToken || token !== env.internalToken) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'The internal token is required.' } });
    }
    const body = z
      .object({
        id: z.string().optional(),
        type: z.string().default('checkout.session.completed'),
        orderId: z.string(),
        subscriptionId: z.string().optional(),
        paymentIntentId: z.string().optional(),
        customerId: z.string().optional(),
        amount: z.number().int().optional(),
        paymentStatus: z.string().default('paid'),
      })
      .parse(typeof request.body === 'string' ? safeJsonParse(request.body) : request.body);

    const event: StripeEvent = {
      id: body.id ?? `evt_test_${body.orderId}_${Date.now()}`,
      type: body.type,
      data: {
        object: {
          id: body.subscriptionId ?? `sub_${body.orderId}`,
          client_reference_id: body.orderId,
          metadata: { orderId: body.orderId },
          payment_intent: body.paymentIntentId ?? `pi_${body.orderId}`,
          customer: body.customerId ?? `cus_${body.orderId}`,
          payment_status: body.paymentStatus,
          amount_total: body.amount,
          subscription: body.subscriptionId ?? `sub_${body.orderId}`,
        },
      },
    };

    const outcome = await claimEvent('stripe', event.id, event.type, event.data.object ?? {});
    if (outcome === 'duplicate') return reply.code(200).send({ received: true, duplicate: true });

    const result = await processEvent(event);
    if (result === 'failed') {
      return reply.code(500).send({ received: false, reason: 'The event could not be processed and will be retried.' });
    }
    return reply.code(200).send({ received: true, eventId: event.id, deferred: result === 'deferred' });
  });

  /**
   * The events that could not be processed. They stay in the ledger until they
   * succeed, so an operator can see them and replay them.
   */
  app.get('/webhooks/stripe/failed', async (request: FastifyRequest) => {
    const token = request.headers['x-internal-token'];
    if (!env.internalToken || token !== env.internalToken) {
      return { error: { code: 'unauthorized', message: 'The internal token is required.' } };
    }
    const failed = await prisma.webhookEvent.findMany({
      where: { provider: 'stripe', status: { in: ['failed', 'deferred'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, eventId: true, type: true, attempts: true, error: true, lastAttemptAt: true, createdAt: true },
    });
    return { failed };
  });

  /**
   * Replays the events that failed. The payload is stored in the ledger, so a
   * replay does not need the provider to deliver the event again.
   */
  app.post('/webhooks/stripe/replay', async (request: FastifyRequest) => {
    const token = request.headers['x-internal-token'];
    if (!env.internalToken || token !== env.internalToken) {
      return { error: { code: 'unauthorized', message: 'The internal token is required.' } };
    }
    const body = z
      .object({ eventId: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) })
      .parse(typeof request.body === 'string' ? safeJsonParse(request.body) : (request.body ?? {}));

    const events = await prisma.webhookEvent.findMany({
      where: {
        provider: 'stripe',
        status: { in: ['failed', 'deferred'] },
        ...(body.eventId ? { eventId: body.eventId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: body.limit,
    });

    const replayed: { eventId: string; ok: boolean }[] = [];
    for (const event of events) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
      });
      const outcome = await processEvent({
        id: event.eventId,
        type: event.type,
        data: { object: (event.payload ?? {}) as Record<string, unknown> },
      });
      replayed.push({ eventId: event.eventId, ok: outcome === 'processed' });
    }

    return { replayed };
  });
}

/**
 * Retries the events that failed or that were deferred, for the provider
 * deliveries that never came back. It is called by the worker on a schedule.
 *
 * The number of tries is bounded: an event that was tried too often waits for
 * an operator instead of being tried again.
 */
export async function retryFailedWebhookEvents(limit = 20): Promise<number> {
  const retryBefore = new Date(Date.now() - DEFER_RETRY_DELAY_MS);
  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: 'stripe',
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: 'failed' },
        {
          status: 'deferred',
          OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: retryBefore } }],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let recovered = 0;
  for (const event of events) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
    });
    const ok = await processEvent({
      id: event.eventId,
      type: event.type,
      data: { object: (event.payload ?? {}) as Record<string, unknown> },
    });
    if (ok) recovered += 1;
  }
  return recovered;
}
