import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import { loadResourcePrice, optionsAmountForPeriod, priceConfiguration, termOfSubscription } from '../src/services/pricing.js';
import { quoteVpsPlanChange, vpsBillingMismatches } from '../src/services/vps-plan.js';
import { vpsView } from '../src/services/vps.js';

/**
 * The yearly term of the plans that have a fixed price: hosted mail and a
 * virtual server. A plan without a yearly row is sold for a year at twelve
 * months of every figure of its monthly row, and the add-ons that recur are
 * twelve months of themselves.
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

function vpsPlan(slug: string, amount: number, extra: { yearly?: number } = {}) {
  return prisma.product.create({
    data: {
      slug, name: slug, category: 'VPS', fulfilment: 'VPS', description: 'x', icon: 'server', visible: true, deployable: true,
      defaultRam: 1024, defaultCpu: 1, defaultDisk: 20, minRam: 1024, maxRam: 1024, minCpu: 1, maxCpu: 1, minDisk: 20, maxDisk: 20,
      prices: {
        create: [
          { period: 'MONTHLY', baseAmount: amount, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' },
          ...(extra.yearly ? [{ period: 'YEARLY' as const, baseAmount: extra.yearly, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' }] : []),
        ],
      },
    } as never,
  });
}

async function boughtVps(period: 'MONTHLY' | 'YEARLY', subscriptionAmount: number, dedicatedIp = false) {
  const user = await prisma.user.create({
    data: { email: `y${Date.now()}${Math.random()}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'Y', lastName: 'Y', emailVerifiedAt: new Date() },
  });
  const plan = await vpsPlan('vps-start', 249);
  await vpsPlan('vps-plus', 349);
  await prisma.productOption.create({ data: { code: 'dedicated-ipv4', name: 'ip', description: 'ip', amount: 399, productId: null, recurring: true } });
  const order = await prisma.order.create({ data: { number: `Y-${Date.now()}`, userId: user.id, total: subscriptionAmount } });
  const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: plan.id, name: 'VPS', unitAmount: subscriptionAmount, total: subscriptionAmount, config: { period } as never } });
  const subscription = await prisma.subscription.create({
    data: { userId: user.id, orderItemId: item.id, status: 'ACTIVE', amount: subscriptionAmount, stripeSubscriptionId: 'sub_y', stripeSubscriptionItemId: 'si_y' },
  });
  const service = await prisma.vpsService.create({
    data: { userId: user.id, productId: plan.id, orderItemId: item.id, subscriptionId: subscription.id, name: 'box', status: 'ACTIVE', slot: 1, vmid: 1001, privateIp: '10.78.0.101', ram: 1024, cpu: 1, disk: 20, sshPublicKey: 'k', dedicatedIp },
  });
  return { service, plan };
}

describe('the price of a year of a plan with a fixed price', () => {
  it('is twelve months of the monthly row when the plan has no yearly row', async () => {
    const plan = await vpsPlan('vps-start', 249);
    const year = await loadResourcePrice(plan.id, 'YEARLY', 'VPS');
    expect(year.period).toBe('YEARLY');
    expect(year.baseAmount).toBe(249 * 12);
  });

  it('is the yearly row when the plan has one', async () => {
    const plan = await vpsPlan('vps-start', 249, { yearly: 2500 });
    const year = await loadResourcePrice(plan.id, 'YEARLY', 'VPS');
    expect(year.baseAmount).toBe(2500);
  });

  it('carries twelve months of an add-on that recurs and one of an add-on that does not', () => {
    expect(optionsAmountForPeriod([{ amount: 399, recurring: true }], 'YEARLY')).toBe(399 * 12);
    expect(optionsAmountForPeriod([{ amount: 399, recurring: false }], 'YEARLY')).toBe(399);
    expect(optionsAmountForPeriod([{ amount: 399, recurring: true }], 'MONTHLY')).toBe(399);
  });

  it('prices a year of a VPS with its dedicated address as twelve months of both', async () => {
    const plan = await vpsPlan('vps-start', 249);
    const year = await loadResourcePrice(plan.id, 'YEARLY', 'VPS');
    const total = priceConfiguration(year, plan, { ram: 1024, cpu: 1, disk: 20 }, [{ amount: 399, recurring: true }] as never, undefined, 'YEARLY');
    expect(total).toBe((249 + 399) * 12);
  });
});

describe('what the storefront says about a year', () => {
  it('lists a yearly price and a yearly address for the plans of a VPS', async () => {
    await vpsPlan('vps-start', 249);
    await prisma.productOption.create({ data: { code: 'dedicated-ipv4', name: 'ip', description: 'ip', amount: 399, productId: null, recurring: true } });
    const response = await makeClient(app).request('GET', '/api/vps/plans');
    expect(response.status).toBe(200);
    const [plan] = response.body.plans;
    expect(plan.price.amount).toBe(249);
    expect(plan.yearlyPrice.amount).toBe(249 * 12);
  });

  it('lists the yearly price of a plan of mail that has no yearly row', async () => {
    const plan = await prisma.product.create({
      data: {
        slug: 'mail-solo', name: 'Solo', category: 'EMAIL_HOSTING', fulfilment: 'EMAIL', description: 'x', icon: 'mail', visible: true, deployable: true,
        mailMaxDomains: 1, mailMaxMailboxes: 5, mailMaxAliases: 10, mailMaxForwarding: 10, mailTotalStorageMb: 10240, mailMailboxQuotaMb: 1024, mailSendLimit: 500, mailSendInterval: 'HOURLY',
        prices: { create: { period: 'MONTHLY', baseAmount: 500, currency: 'EUR', active: true } },
      } as never,
    });
    expect(plan.id).toBeTruthy();
    const response = await makeClient(app).request('GET', '/api/mail/plans');
    expect(response.status).toBe(200);
    const listed = response.body.plans.find((entry: { slug: string }) => entry.slug === 'mail-solo');
    expect(listed.prices.map((price: { period: string; amount: number }) => [price.period, price.amount])).toEqual([['MONTHLY', 500], ['YEARLY', 6000]]);
  });
});

describe('a VPS that was bought for a year', () => {
  it('says the contract is yearly', async () => {
    const { service } = await boughtVps('YEARLY', 249 * 12);
    const full = await prisma.vpsService.findUniqueOrThrow({ where: { id: service.id }, include: { product: { select: { slug: true, name: true } }, subscription: { include: { orderItem: { select: { config: true } } } } } });
    expect((await vpsView(full, false)).contract?.interval).toBe('YEARLY');
    expect(termOfSubscription(full.subscription)).toBe('YEARLY');
  });

  it('is not changed to another plan, and the quote says why', async () => {
    const { service } = await boughtVps('YEARLY', 249 * 12);
    const quote = await quoteVpsPlanChange(service.id, 'vps-plus');
    expect(quote.blocked).toMatch(/billed yearly/);
  });

  it('can still be changed when it is paid by the month', async () => {
    const { service } = await boughtVps('MONTHLY', 249);
    expect((await quoteVpsPlanChange(service.id, 'vps-plus')).blocked).toBeNull();
  });

  it('is not listed as a billing mismatch for paying twelve months', async () => {
    await boughtVps('YEARLY', 249 * 12);
    expect((await vpsBillingMismatches()).filter((entry) => entry.kind === 'AMOUNT_DIFFERS')).toEqual([]);
  });

  it('is listed when the year is billed for another sum', async () => {
    await boughtVps('YEARLY', 249);
    expect((await vpsBillingMismatches()).filter((entry) => entry.kind === 'AMOUNT_DIFFERS')).toHaveLength(1);
  });

  it('counts the dedicated address twelve times in the expected year', async () => {
    await boughtVps('YEARLY', (249 + 399) * 12, true);
    expect((await vpsBillingMismatches()).filter((entry) => entry.kind === 'AMOUNT_DIFFERS')).toEqual([]);
  });
});
