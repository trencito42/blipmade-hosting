import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The refund of a paid resource change that the panel refuses.
 *
 * A change that was paid for and that the panel refuses must not leave the
 * customer charged for something they did not get. The money is returned, the
 * order says what really happened, and a change that is applied a second time
 * never asks for the same money a second time.
 */

const mocks = vi.hoisted(() => ({
  refundCreate: vi.fn(async () => ({ id: 're_test', status: 'succeeded' as const })),
  panel: {
    /** The error the panel raises, when it refuses the new limits. */
    buildError: null as string | null,
    /** How often the panel was asked to change the limits. */
    builds: 0,
    /** How many applications of the order reached the panel. */
    arrivals: 0,
    /** The promise the panel holds an application with, when the test asks for it. */
    hold: null as Promise<void> | null,
    /** The function that releases the held applications. */
    release: null as (() => void) | null,
  },
}));

// The payment provider is replaced, so the test needs no Stripe account. The
// refund of the platform still runs, with the provider replaced by this one.
vi.mock('stripe', () => {
  class FakeStripe {
    refunds = { create: mocks.refundCreate };
  }
  return { default: FakeStripe };
});

// The panel is replaced as well, because it is the panel that refuses the
// limits of the change, which is what makes the refund necessary.
vi.mock('../src/services/pterodactyl/application.js', () => ({
  updateServerBuild: vi.fn(async () => {
    mocks.panel.builds += 1;
    // The panel holds an application until the test releases it, so both
    // applications of the order read the order before the first one writes
    // to it. That is the race the guard has to stop.
    if (mocks.panel.hold) {
      mocks.panel.arrivals += 1;
      if (mocks.panel.arrivals >= 2) mocks.panel.release?.();
      await mocks.panel.hold;
    }
    if (mocks.panel.buildError) throw new Error(mocks.panel.buildError);
    return {};
  }),
  updateServerDetails: vi.fn(async () => ({})),
  updateServerStartup: vi.fn(async () => ({})),
  setServerEnvironment: vi.fn(async () => undefined),
  deleteServer: vi.fn(async () => undefined),
  listNodes: vi.fn(async () => []),
  listAllocations: vi.fn(async () => []),
  ping: vi.fn(async () => false),
}));

vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => false),
  clientToken: vi.fn(() => 'test-client-token'),
  sendPower: vi.fn(async () => undefined),
  sendCommand: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  ClientApiError: class ClientApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
const { applyUpgradeOrder, decideUpgradeRefund } = await import('../src/services/upgrades.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

let app: FastifyInstance;

const ORIGINAL_STRIPE_ENABLED = env.stripeEnabled;

/**
 * The provider is switched on and off again, because the platform only asks
 * it for a refund when it is configured.
 */
function setStripeEnabled(value: boolean): void {
  Object.defineProperty(env, 'stripeEnabled', { value, configurable: true, writable: true, enumerable: true });
}

let orderNumber = 0;

/**
 * A customer with a running service and a resource change that was paid for.
 */
async function seedPaidUpgrade(): Promise<{ instanceId: string; orderId: string }> {
  const { userId } = await registerAndLogin(app, 'upgrade-refund@blipmade.test');
  const product = await prisma.product.create({
    data: {
      slug: 'wordpress',
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
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });

  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'wordpress',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 189,
      currency: 'EUR',
      pterodactylServerId: 42,
      pterodactylUuid: 'uuid-42',
    },
  });

  orderNumber += 1;
  const order = await prisma.order.create({
    data: {
      number: `BM-UPGRADE-${orderNumber}`,
      userId,
      kind: 'UPGRADE',
      status: 'PAID',
      instanceId: instance.id,
      requestedConfig: { ram: 2048, cpu: 1, disk: 10 },
      total: 60,
      currency: 'EUR',
      stripePaymentIntentId: 'pi_upgrade_refund',
      paidAt: new Date(),
    },
  });
  await prisma.payment.create({
    data: {
      userId,
      orderId: order.id,
      amount: 60,
      currency: 'EUR',
      status: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_upgrade_refund',
    },
  });

  return { instanceId: instance.id, orderId: order.id };
}

describe('the decision to return the money of a resource change', () => {
  it('does not return the money of an order that was refunded already', () => {
    const decision = decideUpgradeRefund({
      status: 'REFUNDED',
      fulfillmentStatus: 'FAILED',
      stripePaymentIntentId: 'pi_upgrade_refund',
      paymentStatus: 'REFUNDED',
    });

    expect(decision.refund).toBe(false);
    expect(decision.reason).toBe('already_refunded');
  });

  it('does not return the money of a payment that was refunded already', () => {
    const decision = decideUpgradeRefund({
      status: 'PAID',
      fulfillmentStatus: 'FAILED',
      stripePaymentIntentId: 'pi_upgrade_refund',
      paymentStatus: 'REFUNDED',
    });

    expect(decision.refund).toBe(false);
    expect(decision.reason).toBe('already_refunded');
  });

  it('returns the money of a paid change that was refused', () => {
    const decision = decideUpgradeRefund({
      status: 'PAID',
      fulfillmentStatus: 'FAILED',
      stripePaymentIntentId: 'pi_upgrade_refund',
      paymentStatus: 'SUCCEEDED',
    });

    expect(decision.refund).toBe(true);
    expect(decision.reason).toBe('refund');
  });

  it('does not return the money of a change that was not refused', () => {
    const decision = decideUpgradeRefund({
      status: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      stripePaymentIntentId: 'pi_upgrade_refund',
      paymentStatus: 'SUCCEEDED',
    });

    expect(decision.refund).toBe(false);
    expect(decision.reason).toBe('change_not_failed');
  });

  it('does not return money that was never collected', () => {
    const withoutIntent = decideUpgradeRefund({
      status: 'PAID',
      fulfillmentStatus: 'FAILED',
      stripePaymentIntentId: null,
      paymentStatus: 'SUCCEEDED',
    });
    expect(withoutIntent.refund).toBe(false);
    expect(withoutIntent.reason).toBe('no_payment_intent');

    const failedPayment = decideUpgradeRefund({
      status: 'PAID',
      fulfillmentStatus: 'FAILED',
      stripePaymentIntentId: 'pi_upgrade_refund',
      paymentStatus: 'FAILED',
    });
    expect(failedPayment.refund).toBe(false);
    expect(failedPayment.reason).toBe('payment_not_settled');
  });
});

describe('a paid resource change that the panel refuses', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    setStripeEnabled(ORIGINAL_STRIPE_ENABLED);
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    mocks.refundCreate.mockClear();
    mocks.refundCreate.mockImplementation(async () => ({ id: 're_test', status: 'succeeded' as const }));
    mocks.panel.buildError = null;
    mocks.panel.builds = 0;
    mocks.panel.arrivals = 0;
    mocks.panel.hold = null;
    mocks.panel.release = null;
    setStripeEnabled(true);
  });

  afterEach(async () => {
    setStripeEnabled(ORIGINAL_STRIPE_ENABLED);
  });

  it('returns the money and leaves the order in the state that tells the truth', async () => {
    const { instanceId, orderId } = await seedPaidUpgrade();
    mocks.panel.buildError = 'the panel rejected the limits';

    const result = await applyUpgradeOrder(orderId);

    expect(result.applied).toBe(false);

    // The money is back with the customer, so the order says so. The
    // fulfilment stays failed, because the change itself did not happen.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('REFUNDED');
    expect(order?.fulfillmentStatus).toBe('FAILED');

    // The payment says the same thing.
    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment?.status).toBe('REFUNDED');

    // The service keeps the resources it had.
    const instance = await prisma.instance.findUnique({ where: { id: instanceId } });
    expect(instance?.ram).toBe(1024);
    expect(instance?.price).toBe(189);

    // The journal says that the money was returned.
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'instance.upgrade_refunded', targetId: orderId },
    });
    expect(entry).toBeTruthy();
    expect((entry?.meta as { refunded?: boolean })?.refunded).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'instance.upgrade_refund_failed' } })).toBe(0);

    // The customer is told that the money is back.
    const events = await prisma.instanceEvent.findMany({ where: { instanceId } });
    expect(events.some((event) => event.message.includes('returned to you'))).toBe(true);
  });

  it('does not return the money a second time when the change is applied again', async () => {
    const { orderId } = await seedPaidUpgrade();
    mocks.panel.buildError = 'the panel rejected the limits';

    const first = await applyUpgradeOrder(orderId);
    expect(first.applied).toBe(false);

    const second = await applyUpgradeOrder(orderId);
    expect(second.applied).toBe(false);
    expect(second.reason).toMatch(/returned already/i);

    // The provider was asked once, not twice.
    expect(mocks.refundCreate).toHaveBeenCalledTimes(1);

    // The journal holds one refund and one skipped refund.
    expect(
      await prisma.auditLog.count({ where: { action: 'instance.upgrade_refunded', targetId: orderId } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'instance.upgrade_refund_skipped', targetId: orderId } }),
    ).toBe(1);

    // The order still says that the money is back with the customer.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('REFUNDED');
  });

  it('does not return the money twice when the order is applied twice at the same time', async () => {
    const { orderId } = await seedPaidUpgrade();
    mocks.panel.buildError = 'the panel rejected the limits';

    // Both applications read the order before the first one writes to it.
    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.panel.hold = hold;
    mocks.panel.release = release;

    await Promise.all([applyUpgradeOrder(orderId), applyUpgradeOrder(orderId)]);

    // The provider was asked once, so the same money is not returned twice.
    expect(mocks.refundCreate).toHaveBeenCalledTimes(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'instance.upgrade_refunded', targetId: orderId } }),
    ).toBe(1);

    // The local state tells the truth: the money is back with the customer.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('REFUNDED');
    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment?.status).toBe('REFUNDED');
  });

  it('keeps the money with the platform when the refund cannot be executed', async () => {
    const { orderId } = await seedPaidUpgrade();
    mocks.panel.buildError = 'the panel rejected the limits';
    mocks.refundCreate.mockRejectedValue(new Error('the provider refused the refund'));

    const result = await applyUpgradeOrder(orderId);

    expect(result.applied).toBe(false);

    // The money is still with the platform, so the order stays paid and an
    // operator has to return it.
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');
    expect(order?.fulfillmentStatus).toBe('FAILED');

    // The payment was not refunded.
    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment?.status).toBe('SUCCEEDED');

    // The journal says that the money was not returned.
    const failure = await prisma.auditLog.findFirst({
      where: { action: 'instance.upgrade_refund_failed', targetId: orderId },
    });
    expect(failure).toBeTruthy();
    expect((failure?.meta as { refunded?: boolean })?.refunded).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'instance.upgrade_refunded' } })).toBe(0);
  });
});
