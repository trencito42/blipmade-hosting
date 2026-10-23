import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import * as client from './pterodactyl/client.js';
import { resolveCustomerCredential } from './panel/credentials.js';
import { stripeLive, stripeTestGateway } from './stripe.js';

/**
 * The billing sweep.
 *
 * It runs on a schedule and does three things:
 *
 *   1. a subscription that was cancelled for the end of the period is
 *      withdrawn once the period is over;
 *   2. a subscription that was not paid is suspended after a grace period;
 *   3. a subscription that is due is renewed, and a local invoice is written
 *      for the renewal.
 *
 * Every action is recorded, so the operator can see what happened without
 * reading the logs.
 */

/** How many days a customer has to pay before the service is suspended. */
const GRACE_PERIOD_DAYS = 7;

/** How long a month is, used when the provider does not tell us. */
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** Whether the sweep may remove the server of a cancelled subscription. */
async function autoDeleteEnabled(): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key: 'auto_delete_cancelled_instances' } });
  if (!setting) return false;
  return (setting.value as { enabled?: boolean } | null)?.enabled === true;
}

/**
 * Stops a running container, if the platform is allowed to.
 *
 * The stop uses the client key of the customer that owns the instance, the
 * same key every other customer operation uses. The administrative key of the
 * panel cannot be used on a client endpoint, and a key that can do everything
 * is not scoped to one customer.
 */
async function stopInstance(instance: {
  id: string;
  pterodactylUuid: string | null;
  userId: string;
}): Promise<void> {
  if (!instance.pterodactylUuid) return;
  try {
    const credential = await resolveCustomerCredential(instance.userId);
    await client.sendPower(client.clientToken(credential.token), instance.pterodactylUuid, 'stop');
  } catch {
    // A container that cannot be stopped is reported by the status page.
  }
}

/** Removes the server of a withdrawn subscription. */
async function withdraw(subscriptionId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { instance: { select: { id: true, pterodactylUuid: true, pterodactylServerId: true, userId: true } } },
  });
  if (!subscription || !subscription.instance) return;

  const instance = subscription.instance;
  await stopInstance(instance);
  await prisma.instance.update({
    where: { id: instance.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  await prisma.instanceEvent.create({
    data: {
      instanceId: instance.id,
      type: 'cancelled',
      message: 'The paid period ended and the service was withdrawn.',
    },
  });

  if (await autoDeleteEnabled()) {
    const { deleteServer } = await import('./pterodactyl/application.js');
    if (instance.pterodactylServerId) {
      await deleteServer(instance.pterodactylServerId).catch(() => undefined);
    }
  }

  await audit({
    action: 'subscription.withdrawn',
    targetType: 'subscription',
    targetId: subscription.id,
    meta: { instanceId: instance.id },
  });
}

/** Renews a subscription that is due and writes the invoice for it. */
async function renew(subscriptionId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { orderItem: { include: { order: true } } },
  });
  if (!subscription) return;

  const start = subscription.currentPeriodEnd ?? new Date();
  const end = new Date(start.getTime() + PERIOD_MS);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      currentPeriodStart: start,
      currentPeriodEnd: end,
      status: 'ACTIVE',
      lastRenewalCheckAt: new Date(),
    },
  });

  // The local invoice is the document the customer sees, so it is written for
  // every renewal, whether the provider sends one or not.
  const count = await prisma.invoice.count();
  await prisma.invoice.create({
    data: {
      number: `BM-INV-${String(count + 1).padStart(5, '0')}`,
      userId: subscription.userId,
      orderId: subscription.orderItem?.orderId ?? null,
      stripeInvoiceId: null,
      status: 'PAID',
      amount: subscription.amount,
      tax: 0,
      total: subscription.amount,
      currency: subscription.currency,
      paidAt: new Date(),
      periodStart: start,
      periodEnd: end,
    },
  });

  await audit({
    action: 'subscription.renewed',
    targetType: 'subscription',
    targetId: subscription.id,
    meta: { amount: subscription.amount, periodEnd: end.toISOString() },
  });
}

/**
 * Compares the local subscriptions with the provider. A subscription that the
 * provider knows about is corrected locally, so the platform does not keep a
 * state that the provider already abandoned.
 */
export async function reconcileWithProvider(): Promise<number> {
  if (!stripeLive()) return 0;
  const { retrieveStripeSubscription } = await import('./stripe.js');
  const subscriptions = await prisma.subscription.findMany({
    where: { stripeSubscriptionId: { not: null }, status: { not: 'CANCELLED' } },
    take: 100,
  });

  let corrected = 0;
  for (const subscription of subscriptions) {
    if (!subscription.stripeSubscriptionId) continue;
    const remote = await retrieveStripeSubscription(subscription.stripeSubscriptionId);
    if (!remote) continue;
    if (
      remote.currentPeriodEnd &&
      subscription.currentPeriodEnd &&
      remote.currentPeriodEnd.getTime() !== subscription.currentPeriodEnd.getTime()
    ) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { currentPeriodStart: remote.currentPeriodStart, currentPeriodEnd: remote.currentPeriodEnd },
      });
      corrected += 1;
    }
  }
  return corrected;
}

/**
 * Runs the billing sweep. It is safe to run often, because every action is
 * guarded by the state of the subscription.
 */
export async function sweepSubscriptions(): Promise<{ renewed: number; suspended: number; withdrawn: number }> {
  const now = new Date();
  const graceStart = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  let renewed = 0;
  let suspended = 0;
  let withdrawn = 0;

  // 1. The period is over and the subscription was cancelled.
  const due = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAST_DUE', 'INCOMPLETE', 'TRIALING'] },
      currentPeriodEnd: { lte: now },
    },
    select: { id: true, cancelAtPeriodEnd: true },
    take: 100,
  });

  for (const subscription of due) {
    if (subscription.cancelAtPeriodEnd) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await withdraw(subscription.id);
      withdrawn += 1;
      continue;
    }

    // 2. The subscription is overdue: the service is suspended.
    const record = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: {
        instance: { select: { id: true, status: true, pterodactylUuid: true, pterodactylServerId: true, userId: true } },
      },
    });
    if (!record) continue;

    if (record.currentPeriodEnd && record.currentPeriodEnd.getTime() < graceStart.getTime()) {
      if (record.instance && record.instance.status !== 'SUSPENDED') {
        await stopInstance(record.instance);
        await prisma.instance.update({
          where: { id: record.instance.id },
          data: { status: 'SUSPENDED', suspendedAt: new Date() },
        });
        await prisma.instanceEvent.create({
          data: {
            instanceId: record.instance.id,
            type: 'suspended',
            message: 'The service was suspended because the invoice was not paid.',
          },
        });
        await audit({
          action: 'instance.suspended',
          targetType: 'instance',
          targetId: record.instance.id,
          meta: { reason: 'payment overdue' },
        });
        suspended += 1;
      }
      await prisma.subscription.update({
        where: { id: record.id },
        data: { status: 'PAST_DUE', lastRenewalCheckAt: new Date() },
      });
      continue;
    }

    // 3. The period is over and the service is still fine: it is renewed.
    if (stripeTestGateway() || !stripeLive()) {
      await renew(record.id);
      renewed += 1;
    } else {
      await prisma.subscription.update({
        where: { id: record.id },
        data: { lastRenewalCheckAt: new Date() },
      });
    }
  }

  if (withdrawn || suspended || renewed) {
    await audit({
      action: 'billing.swept',
      meta: { renewed, suspended, withdrawn },
    });
  }

  return { renewed, suspended, withdrawn };
}

/**
 * Releases the promotion reservations of the orders that were never paid.
 * A reservation only holds a campaign for a limited time, so an abandoned
 * checkout cannot keep a promotion hostage.
 */
export async function releaseStalePromotionReservations(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const stale = await prisma.promotionRedemption.findMany({
    where: {
      order: {
        status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CANCELLED'] },
        createdAt: { lt: cutoff },
      },
    },
    select: { orderId: true },
    take: 200,
  });
  if (!stale.length) return 0;
  const result = await prisma.promotionRedemption.deleteMany({
    where: { orderId: { in: stale.map((entry) => entry.orderId) } },
  });
  return result.count;
}

export const billingEnvironment = {
  gracePeriodDays: GRACE_PERIOD_DAYS,
  stripeLive: stripeLive(),
  environment: env.NODE_ENV,
};
