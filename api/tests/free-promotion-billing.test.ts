import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { markOrderPaid } from '../src/services/stripe.js';
import { sweepSubscriptions } from '../src/services/billing.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

let app: Awaited<ReturnType<typeof getApp>>;

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

describe('a first term covered completely by a promotion', () => {
  it('records the paid term without claiming a Stripe card or automatic renewal', async () => {
    const { client, userId } = await registerAndLogin(app, 'free-term@example.com');
    const product = await prisma.product.create({
      data: {
        slug: 'free-term-test', name: 'Test app', category: 'DEVELOPER_TOOLS',
        description: 'A test product.', icon: 'code',
        minRam: 512, minCpu: 1, minDisk: 5,
        defaultRam: 1024, defaultCpu: 1, defaultDisk: 10,
        maxRam: 8192, maxCpu: 4, maxDisk: 100,
        visible: true, deployable: true, eggId: 1,
        prices: { create: { period: 'MONTHLY', baseAmount: 149, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR' } },
      } as never,
    });
    const order = await prisma.order.create({
      data: {
        number: 'BM-FREE-TERM', userId, total: 0, discount: 349, currency: 'EUR',
        billingAddress: { fullName: 'Test Customer', companyName: '', line1: '1 Test St', line2: '', city: 'Bucharest', region: '', postalCode: '010101', country: 'RO', taxId: '' },
        items: { create: { productId: product.id, name: 'Test app', quantity: 1, unitAmount: 349, total: 349, currency: 'EUR', config: { period: 'MONTHLY' } } },
      },
      include: { items: true },
    });

    const [subscription] = await markOrderPaid({ orderId: order.id, amount: 0 });
    const invoice = await prisma.invoice.findFirst({ where: { orderId: order.id } });
    expect(subscription?.status).toBe('ACTIVE');
    expect(subscription?.amount).toBe(0);
    expect(subscription?.stripeSubscriptionId).toBeNull();
    expect(subscription?.currentPeriodStart).toBeTruthy();
    expect(subscription?.currentPeriodEnd?.getTime()).toBe(invoice?.periodEnd?.getTime());
    expect(invoice?.status).toBe('PAID');
    expect(invoice?.total).toBe(0);
    expect(invoice?.billingAddress).toMatchObject({ fullName: 'Test Customer', country: 'RO' });

    const summary = await client.request('GET', '/api/billing/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.currentPeriodEnd).toBeTruthy();
    expect(summary.body.paymentMethod).toBeNull();
    expect(summary.body.hasStripeCustomer).toBe(false);
    expect(summary.body.subscriptions[0].stripeManaged).toBe(false);
  });

  it('writes a payable renewal when Stripe has no subscription for the free term', async () => {
    const { userId } = await registerAndLogin(app, 'free-renewal@example.com');
    const product = await prisma.product.create({
      data: {
        slug: 'free-renewal-test', name: 'Test app', category: 'DEVELOPER_TOOLS',
        description: 'A test product.', icon: 'code',
        minRam: 512, minCpu: 1, minDisk: 5,
        defaultRam: 1024, defaultCpu: 1, defaultDisk: 10,
        maxRam: 8192, maxCpu: 4, maxDisk: 100,
        visible: true, deployable: true, eggId: 1,
        prices: { create: { period: 'MONTHLY', baseAmount: 149, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR' } },
      } as never,
    });
    const instance = await prisma.instance.create({
      data: { userId, productId: product.id, name: 'Test app', status: 'ONLINE', ram: 1024, cpu: 1, disk: 10, price: 0, currency: 'EUR' },
    });
    const end = new Date(Date.now() - 60_000);
    const subscription = await prisma.subscription.create({
      data: { userId, instanceId: instance.id, status: 'ACTIVE', amount: 0, currency: 'EUR', currentPeriodStart: new Date(end.getTime() - 30 * 86400_000), currentPeriodEnd: end },
    });
    const testEnvironment = env as unknown as { stripeEnabled: boolean };
    const wasEnabled = testEnvironment.stripeEnabled;
    testEnvironment.stripeEnabled = true;
    try {
      await sweepSubscriptions();
      const invoices = await prisma.invoice.findMany({ where: { userId, status: 'OPEN' } });
      expect(invoices).toHaveLength(1);
      expect(invoices[0]?.total).toBeGreaterThan(0);
      expect((await prisma.subscription.findUnique({ where: { id: subscription.id } }))?.status).toBe('PAST_DUE');
      await sweepSubscriptions();
      expect(await prisma.invoice.count({ where: { userId, status: 'OPEN' } })).toBe(1);
    } finally {
      testEnvironment.stripeEnabled = wasEnabled;
    }
  });
});
