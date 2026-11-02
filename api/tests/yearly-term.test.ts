import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, resetDatabase } from './helpers.js';
import { forgetYearlyDiscount, priceItems } from '../src/services/pricing.js';

/**
 * The yearly term of a server.
 *
 * A server is priced by its resources, so a year is twelve months of the rate
 * card and the product needs no yearly row of its own. The period that is
 * written on the order is the one that was asked for, because the renewal and
 * the interval of the subscription follow it.
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
  forgetYearlyDiscount();
});

async function seedWordPress() {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A product used by the yearly term test.',
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
      visible: true,
      deployable: true,
      eggId: 3,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR', active: true } },
    } as never,
  });
}

async function quote(period?: 'MONTHLY' | 'YEARLY') {
  const response = await makeClient(app).request('POST', '/api/catalog/quote', {
    items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10, optionCodes: [] }],
    ...(period ? { period } : {}),
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe('the yearly term of a server with a monthly price row only', () => {
  it('quotes a year as twelve months when there is no reduction', async () => {
    await seedWordPress();
    const month = await quote();
    const year = await quote('YEARLY');
    expect(month.period).toBe('MONTHLY');
    expect(year.period).toBe('YEARLY');
    expect(year.total).toBe(month.total * 12);
  });

  it('takes the reduction off the resources of the year', async () => {
    await seedWordPress();
    await prisma.setting.create({ data: { key: 'pricing.yearly_discount_percent', value: { value: 10 } } });
    forgetYearlyDiscount();
    const month = await quote();
    const year = await quote('YEARLY');
    expect(year.total).toBe(Math.round(month.total * 12 * 0.9));
    expect(year.items[0].breakdown.discount).toBe(-(month.total * 12 - year.total));
  });

  it('leaves the monthly quote alone when a reduction is set', async () => {
    await seedWordPress();
    const before = await quote();
    await prisma.setting.create({ data: { key: 'pricing.yearly_discount_percent', value: { value: 25 } } });
    forgetYearlyDiscount();
    expect((await quote()).total).toBe(before.total);
  });

  it('writes the period that was asked for on the priced line', async () => {
    await seedWordPress();
    const [monthly] = await priceItems([{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10, optionCodes: [] } as never], 'MONTHLY');
    const [yearly] = await priceItems([{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10, optionCodes: [] } as never], 'YEARLY');
    expect(monthly.price.period).toBe('MONTHLY');
    expect(yearly.price.period).toBe('YEARLY');
    expect(yearly.unitAmount).toBe(monthly.unitAmount * 12);
  });

  it('prefers a yearly row of the product when it has one', async () => {
    const product = await seedWordPress();
    await prisma.productPrice.create({ data: { productId: product.id, period: 'YEARLY', baseAmount: 149, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR', active: true } });
    const [yearly] = await priceItems([{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10, optionCodes: [] } as never], 'YEARLY');
    expect(yearly.price.period).toBe('YEARLY');
  });

  it('refuses a monthly quote of a product that has no price', async () => {
    const product = await seedWordPress();
    await prisma.productPrice.updateMany({ where: { productId: product.id }, data: { active: false } });
    const response = await makeClient(app).request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10, optionCodes: [] }],
      period: 'YEARLY',
    });
    expect(response.status).toBe(404);
  });
});

describe('an instance bought for a year', () => {
  async function yearlyInstance(price: number, period: 'YEARLY' | 'MONTHLY' = 'YEARLY') {
    const { hashPassword } = await import('../src/lib/password.js');
    const { nextOrderNumber } = await import('../src/services/order-numbers.js');
    const product = await seedWordPress();
    const user = await prisma.user.create({
      data: { email: `year-${Date.now()}@example.com`, passwordHash: await hashPassword('Passw0rd!long-enough'), firstName: 'Y', lastName: 'T', emailVerifiedAt: new Date() },
    });
    const order = await prisma.order.create({
      data: { number: await nextOrderNumber(), userId: user.id, status: 'FULFILLED', total: 4488, discount: 0, currency: 'EUR' },
    });
    const item = await prisma.orderItem.create({
      data: { orderId: order.id, productId: product.id, name: 'WordPress', quantity: 1, unitAmount: 4488, total: 4488, config: { ram: 1024, cpu: 1, disk: 10, period } as never },
    });
    return prisma.instance.create({
      data: { userId: user.id, productId: product.id, orderId: order.id, orderItemId: item.id, name: 'site', status: 'ONLINE', ram: 1024, cpu: 1, disk: 10, price, currency: 'EUR' },
      include: { product: true, orderItem: true },
    });
  }

  it('keeps the monthly price of the configuration when the corrections run', async () => {
    const { reconcileInstancePrices } = await import('../src/services/billing.js');
    const instance = await yearlyInstance(374);
    expect((await quote()).total).toBe(374);
    const result = await reconcileInstancePrices({ dryRun: true });
    expect(result.differences.find((entry) => entry.instanceId === instance.id)).toBeUndefined();
  });

  it('corrects a yearly instance to the monthly equivalent, not to the sum of the year', async () => {
    const { reconcileInstancePrices } = await import('../src/services/billing.js');
    const instance = await yearlyInstance(1);
    const month = (await quote()).total;
    await reconcileInstancePrices();
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.price).toBe(month);
  });

  it('refuses a change of resources and says why', async () => {
    const { quoteResourceChange } = await import('../src/services/upgrades.js');
    const instance = await yearlyInstance(374);
    await expect(quoteResourceChange(instance, { ram: 2048, cpu: 2, disk: 20 })).rejects.toThrow(/billed yearly/);
  });

  it('still prices the change of a monthly instance', async () => {
    const { quoteResourceChange } = await import('../src/services/upgrades.js');
    const instance = await yearlyInstance(374, 'MONTHLY');
    const result = await quoteResourceChange(instance, { ram: 2048, cpu: 2, disk: 20 });
    expect(result.priceDelta).toBeGreaterThan(0);
  });

  it('renews for a year with the monthly row of the product', async () => {
    const { configurationPrice } = await import('../src/services/billing.js');
    const product = await seedWordPress();
    const month = await configurationPrice(product, { ram: 1024, cpu: 1, disk: 10 }, 'MONTHLY');
    const year = await configurationPrice(product, { ram: 1024, cpu: 1, disk: 10 }, 'YEARLY');
    expect(year).toBe((month ?? 0) * 12);
  });
});
