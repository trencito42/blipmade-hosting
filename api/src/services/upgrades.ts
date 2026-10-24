import { prisma } from '../db.js';
import { nextOrderNumber } from './order-numbers.js';
import { badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { priceConfiguration, validateConfiguration } from './pricing.js';
import { refundPayment, updateSubscriptionAmount } from './stripe.js';
import * as pteroApp from './pterodactyl/application.js';
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

export interface ResourceQuote {
  currentPrice: number;
  newPrice: number;
  priceDelta: number;
  currency: string;
  /** True when the customer has to pay for the change. */
  requiresPayment: boolean;
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
export async function quoteResourceChange(
  instance: InstanceWithProduct,
  request: ResourceRequest,
): Promise<ResourceQuote> {
  const price = await prisma.productPrice.findFirst({
    where: { productId: instance.productId, period: 'MONTHLY', active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!price) throw badRequest('This product has no active price.');

  validateConfiguration(instance.product, request);

  const newPrice = priceConfiguration(price, instance.product, request);
  const priceDelta = newPrice - instance.price;

  return {
    currentPrice: instance.price,
    newPrice,
    priceDelta,
    currency: price.currency,
    // A change that costs more has to be paid for before it is applied.
    requiresPayment: priceDelta > 0,
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
  const order = await prisma.order.create({
    data: {
      // The number comes from the counter of the platform, so an upgrade order
      // and a normal order can never carry the same number.
      number: await nextOrderNumber(),
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
  if (order.fulfillmentStatus === 'FULFILLED') return { applied: true, reason: null };

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
  const price = await prisma.productPrice.findFirst({
    where: { productId: instance.productId, period: 'MONTHLY', active: true },
    orderBy: { createdAt: 'desc' },
  });
  const newPrice = price
    ? priceConfiguration(price, instance.product, request)
    : instance.price;

  await prisma.instance.update({
    where: { id: instance.id },
    data: { ram: request.ram, cpu: request.cpu, disk: request.disk, price: newPrice },
  });

  // The subscription now bills the new amount. A provider failure here does
  // not undo the change, but it is recorded so it can be corrected.
  const subscription = await prisma.subscription.findFirst({ where: { instanceId: instance.id } });
  if (subscription) {
    try {
      await updateSubscriptionAmount(subscription, newPrice);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { amount: newPrice },
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
        meta: { instanceId: instance.id, price: newPrice, reason },
      });
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { fulfillmentStatus: 'FULFILLED', status: 'FULFILLED' },
  });
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
    meta: { instanceId: instance.id, ...request, price: newPrice },
  });

  return { applied: true, reason: null };
}

/**
 * Settles a change that costs less than the service the customer already has.
 *
 * There is no money to collect: the difference is credited on the next
 * invoice, so the platform settles the order itself. The order is marked as
 * paid here, because `applyUpgradeOrder` only applies a change that was paid
 * for.
 */
export async function settleFreeUpgradeOrder(
  orderId: string,
  actor: { id: string; email: string },
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw badRequest('Order not found.');
  if (order.status === 'PAID' || order.status === 'FULFILLED') return;

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'PAID', paidAt: new Date() },
  });
  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'instance.upgrade_credited',
    targetType: 'order',
    targetId: orderId,
    meta: { total: order.total, discount: order.discount, reason: 'the change costs less, so there is nothing to collect' },
  });
}
