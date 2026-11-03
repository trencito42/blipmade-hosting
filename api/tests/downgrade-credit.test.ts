import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * A downgrade credit is a provider balance transaction plus one local row.
 * It is written after the panel accepts the new limits, and a refused panel
 * change does not create it.
 */

const credit = vi.hoisted(() => ({
  give: vi.fn(async () => 'txn_downgrade'),
  builds: 0,
  refuse: false,
}));

vi.mock('../src/services/stripe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/stripe.js')>();
  return { ...actual, giveBalanceCredit: credit.give };
});

vi.mock('../src/services/pterodactyl/application.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/pterodactyl/application.js')>();
  return {
    ...actual,
    updateServerBuild: vi.fn(async () => {
      credit.builds += 1;
      if (credit.refuse) throw new Error('the panel rejected the limits');
      return {};
    }),
  };
});

const { prisma } = await import('../src/db.js');
const { applyUpgradeOrder, settleFreeUpgradeOrder } = await import('../src/services/upgrades.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

let app: FastifyInstance;
let number = 0;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  credit.give.mockClear();
  credit.give.mockImplementation(async () => 'txn_downgrade');
  credit.builds = 0;
  credit.refuse = false;
});

async function seed(discount: number) {
  const { userId } = await registerAndLogin(app, 'downgrade-credit@blipmade.test');
  const product = await prisma.product.create({
    data: {
      slug: 'downgrade-credit-app',
      name: 'App',
      category: 'BOTS',
      description: 'For the credit test.',
      icon: 'cpu',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 100, currency: 'EUR' } },
    },
  });
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'app',
      status: 'ONLINE',
      ram: 2048,
      cpu: 2,
      disk: 20,
      price: 400,
      currency: 'EUR',
      pterodactylServerId: 77,
      pterodactylUuid: 'uuid-77',
    },
  });
  number += 1;
  const order = await prisma.order.create({
    data: {
      number: `BM-DOWN-${number}`,
      userId,
      kind: 'UPGRADE',
      status: 'PAID',
      instanceId: instance.id,
      requestedConfig: { ram: 1024, cpu: 1, disk: 10 },
      total: 0,
      discount,
      currency: 'EUR',
      paidAt: new Date(),
    },
  });
  await prisma.payment.create({
    data: {
      userId,
      orderId: order.id,
      amount: 400,
      currency: 'EUR',
      status: 'SUCCEEDED',
      stripeCustomerId: 'cus_downgrade',
    },
  });
  return { userId, order, actor: { id: userId, email: 'downgrade-credit@blipmade.test' } };
}

describe('downgrade balance credit', () => {
  it('credits once after the panel accepts the smaller limits', async () => {
    const { order } = await seed(250);
    const result = await applyUpgradeOrder(order.id);
    expect(result.applied).toBe(true);
    expect(credit.builds).toBe(1);
    expect(credit.give).toHaveBeenCalledTimes(1);
    expect(credit.give).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_downgrade',
      amount: 250,
      idempotencyKey: `resize-credit:${order.id}`,
    }));
    const rows = await prisma.moneyAdjustment.findMany({ where: { orderId: order.id, kind: 'credit' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerRef).toBe('txn_downgrade');
    expect(rows[0]?.amount).toBe(250);

    await applyUpgradeOrder(order.id);
    expect(credit.give).toHaveBeenCalledTimes(1);
    expect(await prisma.moneyAdjustment.count({ where: { orderId: order.id, kind: 'credit' } })).toBe(1);
  });

  it('does not credit when the panel refuses the change', async () => {
    const { order } = await seed(250);
    credit.refuse = true;
    const result = await applyUpgradeOrder(order.id);
    expect(result.applied).toBe(false);
    expect(credit.give).not.toHaveBeenCalled();
    expect(await prisma.moneyAdjustment.count({ where: { orderId: order.id } })).toBe(0);
    const stored = await prisma.instance.findUniqueOrThrow({ where: { id: order.instanceId! } });
    expect(stored.ram).toBe(2048);
  });

  it('does not credit while the order is only marked paid', async () => {
    const { order, actor } = await seed(250);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PENDING' } });
    await settleFreeUpgradeOrder(order.id, actor);
    expect(credit.give).not.toHaveBeenCalled();
    expect(await prisma.moneyAdjustment.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });
});
