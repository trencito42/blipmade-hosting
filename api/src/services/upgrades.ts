import { prisma } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { priceConfiguration, validateConfiguration } from './pricing.js';
import { refundPayment, updateSubscriptionAmount } from './stripe.js';
import * as pteroApp from './pterodactyl/application.js';
import type { Instance, Order, Product } from '@prisma/client';

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
  const count = await prisma.order.count();
  const order = await prisma.order.create({
    data: {
      number: `BM-${String(count + 1).padStart(5, '0')}`,
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
 * The panel is updated first. If it refuses, the database is left untouched,
 * the payment is refunded and the order is marked as failed, so the customer
 * is never charged for a change that did not happen.
 */
export async function applyUpgradeOrder(orderId: string): Promise<{ applied: boolean; reason: string | null }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { instance: { include: { product: true } } },
  });
  if (!order) return { applied: false, reason: 'Order not found.' };
  if (order.kind !== 'UPGRADE') return { applied: false, reason: 'This order is not a resource change.' };
  if (!order.instance) return { applied: false, reason: 'The instance of this order no longer exists.' };
  if (order.fulfillmentStatus === 'FULFILLED') return { applied: true, reason: null };

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
      await prisma.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: 'FAILED', status: 'FAILED' },
      });
      await prisma.instanceEvent.create({
        data: {
          instanceId: instance.id,
          type: 'resources',
          message: `The paid resource change could not be applied: ${reason}`,
        },
      });
      const refunded = await refundPayment({
        orderId: order.id,
        stripePaymentIntentId: order.stripePaymentIntentId,
        amount: order.total,
        reason: 'the panel rejected the change',
      });
      await audit({
        action: 'instance.upgrade_failed',
        targetType: 'order',
        targetId: order.id,
        meta: { instanceId: instance.id, reason, refunded },
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
