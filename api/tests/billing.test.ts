import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The billing sweep: renewals, suspensions of services that were not paid for
 * and withdrawals at the end of a paid period.
 */
vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => false),
  clientToken: vi.fn(() => 'test-client-token'),
  sendPower: vi.fn(async () => undefined),
  sendCommand: vi.fn(async () => undefined),
}));

vi.mock('../src/services/pterodactyl/application.js', () => ({
  deleteServer: vi.fn(async () => undefined),
}));

const { prisma } = await import('../src/db.js');
const { releaseStalePromotionReservations, sweepSubscriptions } = await import('../src/services/billing.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedSubscription(options: {
  status?: 'ACTIVE' | 'PAST_DUE' | 'TRIALING';
  cancelAtPeriodEnd?: boolean;
  periodEndedDaysAgo?: number;
  instanceStatus?: 'ONLINE' | 'SUSPENDED';
}) {
  const { userId } = await registerAndLogin(await getApp(), `billing-${Date.now()}@example.com`);
  const product = await prisma.product.create({
    data: {
      slug: `product-${Date.now()}`,
      name: 'Service',
      category: 'WEB_CMS',
      description: 'A service.',
      icon: 'globe',
      deployable: true,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });

  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'service',
      status: options.instanceStatus ?? 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
    },
  });

  const endedAt = new Date(Date.now() - (options.periodEndedDaysAgo ?? 1) * 24 * 60 * 60 * 1000);
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      instanceId: instance.id,
      status: options.status ?? 'ACTIVE',
      amount: 149,
      currency: 'EUR',
      currentPeriodStart: new Date(endedAt.getTime() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: endedAt,
      cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
    },
  });

  return { instance, subscription };
}

describe('billing sweep', () => {
  it('withdraws a service whose paid period ended after a cancellation', async () => {
    const { instance, subscription } = await seedSubscription({ cancelAtPeriodEnd: true });

    const result = await sweepSubscriptions();

    expect(result.withdrawn).toBe(1);
    const updatedSubscription = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updatedSubscription?.status).toBe('CANCELLED');

    const updatedInstance = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updatedInstance?.status).toBe('CANCELLED');
    expect(updatedInstance?.cancelledAt).toBeTruthy();
  });

  it('suspends a service whose payment is overdue', async () => {
    const { instance, subscription } = await seedSubscription({ status: 'PAST_DUE', periodEndedDaysAgo: 30 });

    const result = await sweepSubscriptions();

    expect(result.suspended).toBe(1);
    const updatedInstance = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updatedInstance?.status).toBe('SUSPENDED');
    expect(updatedInstance?.suspendedAt).toBeTruthy();

    const updatedSubscription = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updatedSubscription?.status).toBe('PAST_DUE');
  });

  it('renews a service whose period ended and writes the invoice', async () => {
    const { instance, subscription } = await seedSubscription({ periodEndedDaysAgo: 1 });

    const result = await sweepSubscriptions();

    expect(result.renewed).toBe(1);
    const updated = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updated?.status).toBe('ACTIVE');
    expect(updated?.currentPeriodEnd?.getTime()).toBeGreaterThan(Date.now());

    const invoices = await prisma.invoice.findMany({ where: { userId: subscription.userId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe('PAID');
    expect(invoices[0]?.amount).toBe(149);

    const unchangedInstance = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchangedInstance?.status).toBe('ONLINE');
  });

  it('leaves a service alone while its period is still running', async () => {
    const { userId } = await registerAndLogin(await getApp(), 'running@example.com');
    const product = await prisma.product.create({
      data: {
        slug: 'running-product',
        name: 'Service',
        category: 'WEB_CMS',
        description: 'A service.',
        icon: 'globe',
        deployable: true,
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
    await prisma.subscription.create({
      data: {
        userId,
        instanceId: instance.id,
        status: 'ACTIVE',
        amount: 149,
        currency: 'EUR',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await sweepSubscriptions();

    expect(result.renewed).toBe(0);
    expect(result.suspended).toBe(0);
    expect(result.withdrawn).toBe(0);
    const invoices = await prisma.invoice.count();
    expect(invoices).toBe(0);
  });

  it('releases the reservation of an order that was never paid', async () => {
    const { userId } = await registerAndLogin(await getApp(), 'reservation@example.com');
    const promotion = await prisma.promotion.create({
      data: { code: 'OLD', type: 'PERCENT', value: 1000 },
    });
    const order = await prisma.order.create({
      data: {
        number: 'BM-90001',
        userId,
        status: 'PENDING',
        total: 100,
        currency: 'EUR',
        createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
      },
    });
    await prisma.promotionRedemption.create({
      data: { promotionId: promotion.id, userId, orderId: order.id, amount: 10 },
    });

    const released = await releaseStalePromotionReservations();

    expect(released).toBe(1);
    const remaining = await prisma.promotionRedemption.count({ where: { orderId: order.id } });
    expect(remaining).toBe(0);
  });
});
