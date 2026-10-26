import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The life of a service, as the customer hears about it.
 *
 * The building of a service, the end of its term, its cancellation, the
 * deletion of its data, the moment it is started again after a suspension and
 * the change of its resources are all told to the customer.
 *
 * The panel is faked at its boundary, so the test never reaches the panel of
 * the platform and the flow of the platform is the flow that is tested.
 */
const panel = vi.hoisted(() => ({
  /** When the panel refuses the new limits of a service. */
  buildFails: false,
}));

vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => false),
  clientToken: vi.fn(() => 'test-client-token'),
  sendPower: vi.fn(async () => undefined),
  sendCommand: vi.fn(async () => undefined),
}));

vi.mock('../src/services/pterodactyl/application.js', () => ({
  deleteServer: vi.fn(async () => undefined),
  updateServerBuild: vi.fn(async () => {
    if (panel.buildFails) throw new Error('The panel refused the new limits.');
    return {};
  }),
}));

vi.mock('../src/services/panel/credentials.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/panel/credentials.js')>(
    '../src/services/panel/credentials.js',
  );
  return {
    ...actual,
    resolveCustomerCredential: vi.fn(async (userId: string) => ({
      token: 'test-client-token',
      panelUserId: 4,
      externalId: `blipmade_acc_${userId}`,
      source: 'bootstrap',
    })),
  };
});

import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import { processCancelledInstances, scheduleInstanceDeletion, sweepSubscriptions } from '../src/services/billing.js';
import { applyUpgradeOrder, createUpgradeOrder, quoteResourceChange } from '../src/services/upgrades.js';
import { provisionInstance } from '../src/services/provisioning.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  panel.buildFails = false;
  await resetDatabase();
});

const DAY = 24 * 60 * 60 * 1000;

/** A date as the customer sees it in the message. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A service of a customer, with the subscription that pays for it.
 *
 * The service is deployed, so the routes of the panel can be used without a
 * panel behind them.
 */
async function seedService(options: {
  email: string;
  status?: 'ONLINE' | 'SUSPENDED';
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  deployed?: boolean;
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
      status: options.status ?? 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylUuid: options.deployed === false ? null : 'server-uuid',
      pterodactylServerId: options.deployed === false ? null : 12,
      provisioningKey: `key-${options.email}`,
    },
    include: { product: true },
  });
  const periodEnd = options.periodEnd ?? new Date(Date.now() + 30 * DAY);
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      instanceId: instance.id,
      status: 'ACTIVE',
      amount: 149,
      currency: 'EUR',
      currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
    },
  });
  return { client, userId, instance, subscription };
}

describe('the building of a service is told to the customer', () => {
  it('tells the customer that the service is being built, once', async () => {
    const { userId, instance } = await seedService({ email: 'building@example.com' });

    // The panel refuses the account of the customer, so the building stops
    // after the first step. The message about the beginning is written before
    // the panel is asked: the customer hears that the service is on its way.
    await expect(provisionInstance(instance.id)).rejects.toBeTruthy();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.provisioning_started' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({ service: 'service', plan: 'WordPress' });

    // A run that is repeated does not tell the customer twice.
    await expect(provisionInstance(instance.id)).rejects.toBeTruthy();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.provisioning_started' } }),
    ).toBe(1);
  });
});

describe('the cancellation of a service is told to the customer', () => {
  it('tells the customer that the service was canceled, once', async () => {
    const { client, userId, instance } = await seedService({ email: 'canceled@example.com' });

    const answer = await client.request('POST', `/api/instances/${instance.id}/cancel`);
    expect(answer.status).toBe(204);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.canceled' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({ service: 'service' });

    // A second request does not change anything, so it does not tell the
    // customer anything either.
    const again = await client.request('POST', `/api/instances/${instance.id}/cancel`);
    expect(again.status).toBe(204);
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.canceled' } }),
    ).toBe(1);
  });
});

describe('the service that is started again is told to the customer', () => {
  it('tells the customer that the service works again, once', async () => {
    const { client, userId, instance } = await seedService({
      email: 'unsuspended@example.com',
      status: 'SUSPENDED',
    });

    const answer = await client.request('POST', `/api/instances/${instance.id}/power`, {
      signal: 'start',
    });
    expect(answer.status).toBe(200);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.unsuspended' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({ service: 'service' });

    // The service is not suspended any more, so a second start tells the
    // customer nothing new.
    await client.request('POST', `/api/instances/${instance.id}/power`, { signal: 'start' });
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.unsuspended' } }),
    ).toBe(1);
  });
});

describe('the end of the term of a service is told to the customer', () => {
  it('tells the customer that the term is over, once', async () => {
    const periodEnd = new Date(Date.now() - DAY);
    await seedService({ email: 'expired@example.com', periodEnd });

    await sweepSubscriptions();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.expired' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ service: 'service' });

    // The sweep runs often, and the term is told once.
    await sweepSubscriptions();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.expired' } }),
    ).toBe(1);
  });

  it('tells the customer that the term ends before it is over', async () => {
    const periodEnd = new Date(Date.now() + 3 * DAY);
    await seedService({ email: 'expiring@example.com', periodEnd, cancelAtPeriodEnd: true });

    await sweepSubscriptions();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.expiring' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ service: 'service', expiresAt: dayOf(periodEnd) });

    await sweepSubscriptions();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.expiring' } }),
    ).toBe(1);
  });

  it('tells the customer that the term is renewed before it is over', async () => {
    const periodEnd = new Date(Date.now() + 3 * DAY);
    await seedService({ email: 'renewal@example.com', periodEnd });

    await sweepSubscriptions();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.renewal_reminder' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ service: 'service', renewsAt: dayOf(periodEnd) });

    await sweepSubscriptions();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.renewal_reminder' } }),
    ).toBe(1);
  });
});

describe('the deletion of the data of a service is told to the customer', () => {
  it('tells the customer that the data is gone, once', async () => {
    const { userId, instance } = await seedService({ email: 'deleted@example.com' });

    await prisma.setting.create({
      data: { key: 'auto_delete_cancelled_instances', value: { enabled: true, retentionDays: 30 } },
    });
    await scheduleInstanceDeletion(instance.id);

    // The retention ends now, and not in thirty days.
    const setting = await prisma.setting.findUnique({
      where: { key: 'cancelled_instance_retention' },
    });
    const records = (setting?.value ?? {}) as Record<string, { scheduledFor: string }>;
    records[instance.id]!.scheduledFor = new Date(Date.now() - DAY).toISOString();
    await prisma.setting.update({
      where: { key: 'cancelled_instance_retention' },
      data: { value: records as never },
    });

    await processCancelledInstances();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.deleted' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({ service: 'service' });

    // The service is gone, and the sweep does not tell it twice.
    await processCancelledInstances();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'service.deleted' } }),
    ).toBe(1);
  });
});

describe('the change of the resources of a service is told to the customer', () => {
  it('tells the customer that the change went through', async () => {
    const { userId, instance } = await seedService({ email: 'upgraded@example.com' });
    const request = { ram: 2048, cpu: 2, disk: 20 };
    const quote = await quoteResourceChange(instance, request);
    const order = await createUpgradeOrder(
      instance,
      request,
      quote,
      { id: userId, email: 'upgraded@example.com' },
    );
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    const result = await applyUpgradeOrder(order.id);
    expect(result.applied).toBe(true);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.upgrade_completed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      service: 'service',
      change: 'Resources changed to 2048 MB, 2 vCPU, 20 GB.',
    });
  });

  it('tells the customer that the change did not go through', async () => {
    const { userId, instance } = await seedService({ email: 'upgrade-failed@example.com' });
    const request = { ram: 2048, cpu: 2, disk: 20 };
    const quote = await quoteResourceChange(instance, request);
    const order = await createUpgradeOrder(
      instance,
      request,
      quote,
      { id: userId, email: 'upgrade-failed@example.com' },
    );
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    panel.buildFails = true;
    const result = await applyUpgradeOrder(order.id);
    expect(result.applied).toBe(false);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'service.upgrade_failed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      service: 'service',
      reason: 'The panel refused the new limits.',
    });
  });
});
