import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import { dispatchPendingEvents } from '../src/services/notification-dispatch.js';
import { sweepSubscriptions } from '../src/services/billing.js';

/**
 * The money of a subscription and the messages about it.
 *
 * The customer hears about a term before it is over, about the grace that
 * runs after it, and about the warning that the service is going to be
 * suspended. The invoice that is due is reminded too.
 *
 * Every one of these messages is written once per period: the sweep runs
 * often, and a customer who is told every day about the same week is a
 * customer who stops reading the messages of the platform.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

const DAY = 24 * 60 * 60 * 1000;

/** A date as the customer sees it in the message. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seedSubscription(options: {
  email: string;
  status?: 'ACTIVE' | 'PAST_DUE' | 'INCOMPLETE' | 'TRIALING';
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  stripeSubscriptionId?: string | null;
}) {
  const { client, userId } = await registerAndLogin(app, options.email);
  const product = await prisma.product.create({
    data: {
      slug: `product-${options.email}`,
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 1024,
      defaultCpu: 1,
      defaultDisk: 10,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'service',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
    },
  });
  const periodEnd = options.periodEnd ?? new Date(Date.now() + 30 * DAY);
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      instanceId: instance.id,
      status: options.status ?? 'ACTIVE',
      amount: 149,
      currency: 'EUR',
      currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
      stripeSubscriptionId: options.stripeSubscriptionId ?? null,
    },
  });
  return { client, userId, instance, subscription };
}

describe('a change of the subscription in the portal of the provider is told to the customer', () => {
  it('tells the customer that the cancellation is planned', async () => {
    const { userId, subscription } = await seedSubscription({
      email: 'changed@example.com',
      stripeSubscriptionId: 'sub_changed',
    });
    const webhook = makeClient(app);

    const answer = await webhook.request('POST', '/api/webhooks/stripe', {
      id: 'evt_changed',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_changed',
          status: 'active',
          cancel_at_period_end: true,
        },
      },
    });
    expect(answer.status).toBe(200);

    const events = await prisma.notificationEvent.findMany({ where: { type: 'subscription.changed' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      service: 'service',
      change: 'the cancellation is planned for the end of the period',
    });

    // The provider sends the same state again. The customer has been told
    // already, so there is no second message.
    await webhook.request('POST', '/api/webhooks/stripe', {
      id: 'evt_changed_again',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_changed',
          status: 'active',
          cancel_at_period_end: true,
        },
      },
    });

    expect(await prisma.notificationEvent.count({ where: { type: 'subscription.changed' } })).toBe(1);

    // The state of the provider is the state of the platform now.
    const updated = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updated?.cancelAtPeriodEnd).toBe(true);
  });
});

describe('the grace of a subscription is told to the customer', () => {
  it('tells the customer that the service still works, once', async () => {
    const periodEnd = new Date(Date.now() - 2 * DAY);
    await seedSubscription({ email: 'grace@example.com', status: 'PAST_DUE', periodEnd });

    await sweepSubscriptions();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'subscription.grace_period' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      service: 'service',
      graceUntil: dayOf(new Date(periodEnd.getTime() + 7 * DAY)),
    });

    // The sweep runs often, and the grace is told once.
    await sweepSubscriptions();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'subscription.grace_period' } }),
    ).toBe(1);
  });

  it('warns the customer before the service is suspended, once', async () => {
    const periodEnd = new Date(Date.now() - 6 * DAY);
    await seedSubscription({ email: 'warning@example.com', status: 'PAST_DUE', periodEnd });

    await sweepSubscriptions();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'subscription.suspension_warning' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      service: 'service',
      graceUntil: dayOf(new Date(periodEnd.getTime() + 7 * DAY)),
    });

    await sweepSubscriptions();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'subscription.suspension_warning' } }),
    ).toBe(1);
  });
});

describe('the invoice that is due is reminded to the customer', () => {
  it('reminds the customer once, and the reminder follows the group of the customer', async () => {
    const { client, userId } = await registerAndLogin(app, 'invoice@example.com');
    const dueDate = new Date(Date.now() + 3 * DAY);
    await prisma.invoice.create({
      data: {
        number: 'INV-2026-0001',
        userId,
        status: 'OPEN',
        amount: 14900,
        total: 14900,
        currency: 'EUR',
        dueDate,
        periodStart: new Date(dueDate.getTime() - 30 * DAY),
        periodEnd: dueDate,
      },
    });

    await sweepSubscriptions();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'invoice.reminder_due' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({
      number: 'INV-2026-0001',
      amount: '€149.00',
      currency: 'EUR',
      dueAt: dayOf(dueDate),
    });

    // The sweep runs again, and the invoice is not reminded twice.
    await sweepSubscriptions();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'invoice.reminder_due' } }),
    ).toBe(1);

    // The reminder is an optional message, so the customer can switch it off.
    await prisma.notificationPreference.create({
      data: { userId, ordersBilling: false, billing: false },
    });
    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({
      where: { kind: 'invoice.reminder_due' },
    });
    expect(deliveries).toHaveLength(0);
    expect(
      await prisma.notification.count({ where: { userId, category: 'ordersBilling' } }),
    ).toBe(0);
  });
});
