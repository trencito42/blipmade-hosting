import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';
import {
  breakdownForPeriod,
  DEFAULT_RESOURCE_RATES,
  forgetYearlyDiscount,
  optionsAmountForPeriod,
  priceConfiguration,
  yearlyDiscountOf,
  yearlyDiscountPercent,
} from '../src/services/pricing.js';

/**
 * The reduction of a yearly term.
 *
 * Zero means no reduction, and that is the default, so nothing changes for a
 * platform that never sets it. The reduction applies to the resources of a
 * game server and never to a monthly term, to the add-ons or to a plan of mail.
 */

let app: FastifyInstance;

const product = { minRam: 1024, minCpu: 100, minDisk: 5120, fulfilment: 'SERVER' };
const price = { baseAmount: 0, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 };
const config = { ram: 4096, cpu: 200, disk: 10240 };

async function staffWith(email: string, permissions: string[]): Promise<TestClient> {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'Test', lastName: 'Staff', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  const response = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (response.status !== 200) throw new Error(`Could not log ${email} in: ${response.status}`);
  return client;
}

describe('the arithmetic of the yearly reduction', () => {
  it('gives nothing to a monthly term', () => {
    expect(yearlyDiscountOf(10_000, 'MONTHLY', 20)).toBe(0);
  });

  it('takes the percentage of a year', () => {
    expect(yearlyDiscountOf(12_000, 'YEARLY', 10)).toBe(1_200);
  });

  it('clamps a value that the registry would have refused', () => {
    expect(yearlyDiscountOf(12_000, 'YEARLY', 90)).toBe(6_000);
    expect(yearlyDiscountOf(12_000, 'YEARLY', -5)).toBe(0);
    expect(yearlyDiscountOf(12_000, 'YEARLY', 2.5)).toBe(0);
  });

  it('leaves the price of a year as twelve months when there is no reduction', () => {
    const month = priceConfiguration(price, product, config, [], DEFAULT_RESOURCE_RATES, 'MONTHLY');
    expect(priceConfiguration(price, product, config, [], DEFAULT_RESOURCE_RATES, 'YEARLY')).toBe(month * 12);
  });

  it('reduces the resources of a year and not the add-ons', () => {
    const options = [{ amount: 500, recurring: false }] as never;
    const full = priceConfiguration(price, product, config, options, DEFAULT_RESOURCE_RATES, 'YEARLY', 0);
    const reduced = priceConfiguration(price, product, config, options, DEFAULT_RESOURCE_RATES, 'YEARLY', 10);
    const resources = full - 500;
    expect(reduced).toBe(full - Math.round(resources / 10));
  });

  it('never reduces a monthly term', () => {
    const month = priceConfiguration(price, product, config, [], DEFAULT_RESOURCE_RATES, 'MONTHLY', 0);
    expect(priceConfiguration(price, product, config, [], DEFAULT_RESOURCE_RATES, 'MONTHLY', 30)).toBe(month);
  });

  it('keeps the breakdown adding up to the price that is quoted', () => {
    const options = [{ amount: 500 }] as never;
    for (const percent of [0, 5, 10, 33, 50]) {
      const quoted = priceConfiguration(price, product, config, options, DEFAULT_RESOURCE_RATES, 'YEARLY', percent);
      const parts = breakdownForPeriod(config, DEFAULT_RESOURCE_RATES, 'YEARLY', optionsAmountForPeriod(options, 'YEARLY'), percent);
      expect(parts.total).toBe(quoted);
      expect(parts.ram + parts.cpu + parts.disk + parts.base + parts.options + (parts.discount ?? 0)).toBe(parts.total);
    }
  });

  it('does not show a discount line when there is none', () => {
    expect(breakdownForPeriod(config, DEFAULT_RESOURCE_RATES, 'YEARLY', 0, 0).discount).toBeUndefined();
    expect(breakdownForPeriod(config, DEFAULT_RESOURCE_RATES, 'MONTHLY', 0, 40).discount).toBeUndefined();
  });

  it('does not reduce a plan of mail or of a server on its own price list', () => {
    const own = { baseAmount: 1000, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 };
    for (const fulfilment of ['EMAIL', 'VPS']) {
      const base = priceConfiguration(own, { ...product, fulfilment }, config, [], DEFAULT_RESOURCE_RATES, 'YEARLY', 0);
      expect(priceConfiguration(own, { ...product, fulfilment }, config, [], DEFAULT_RESOURCE_RATES, 'YEARLY', 25)).toBe(base);
    }
  });
});

describe('the setting of the yearly reduction', () => {
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

  it('is zero when nothing is set', async () => {
    expect(await yearlyDiscountPercent()).toBe(0);
  });

  it('is written by the owner of the pricing and read by the pricing', async () => {
    const owner = await staffWith('pricer@blipmade.test', ["settings.read", "settings.write", "pricing.read", "pricing.write"]);
    const response = await owner.request('PUT', '/api/admin/settings', { 'pricing.yearly_discount_percent': { value: 15 } });
    expect(response.status).toBe(200);
    expect(await yearlyDiscountPercent()).toBe(15);
    const removed = await owner.request('DELETE', '/api/admin/settings/pricing.yearly_discount_percent');
    expect(removed.status).toBe(200);
    expect(await yearlyDiscountPercent()).toBe(0);
  });

  it('is refused to settings.write alone', async () => {
    const other = await staffWith('settings@blipmade.test', ['settings.read', 'settings.write']);
    const response = await other.request('PUT', '/api/admin/settings', { 'pricing.yearly_discount_percent': { value: 15 } });
    expect(response.status).toBe(403);
    expect(await yearlyDiscountPercent()).toBe(0);
  });

  it('refuses a value outside 0 to 50 and a value that is not a whole number', async () => {
    const owner = await staffWith('pricer2@blipmade.test', ["settings.read", "settings.write", "pricing.read", "pricing.write"]);
    for (const value of [-1, 51, 7.5, '10']) {
      const response = await owner.request('PUT', '/api/admin/settings', { 'pricing.yearly_discount_percent': { value } });
      expect(response.status).toBe(400);
    }
    expect(await yearlyDiscountPercent()).toBe(0);
  });

  it('ignores a stored value that is out of range', async () => {
    await prisma.setting.create({ data: { key: 'pricing.yearly_discount_percent', value: { value: 99 } } });
    forgetYearlyDiscount();
    expect(await yearlyDiscountPercent()).toBe(0);
  });
});
