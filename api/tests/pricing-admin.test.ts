import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { priceConfiguration } from '../src/services/pricing.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;
let seq = 0;

async function staff(permissions: string[]) {
  seq += 1;
  const user = await prisma.user.create({ data: { email: `pa${seq}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'P', lastName: 'A', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
}

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
});

describe('the add-ons of the catalogue', () => {
  it('creates, edits and retires an add-on, keeps its code, and records every change', async () => {
    const { client } = await createAdmin(app);
    const created = await client.request('POST', '/api/admin/options', { code: 'extra-backup', name: 'Extra backup', amount: 150 });
    expect(created.status).toBe(201);
    const id = created.body.option.id;

    expect((await client.request('POST', '/api/admin/options', { code: 'extra-backup', name: 'Again', amount: 1 })).status).toBe(409);
    expect((await client.request('PATCH', `/api/admin/options/${id}`, { code: 'renamed' })).status).toBe(400);
    expect((await client.request('PATCH', `/api/admin/options/${id}`, { amount: -5 })).status).toBe(400);
    expect((await client.request('PATCH', `/api/admin/options/${id}`, {})).status).toBe(400);

    const changed = await client.request('PATCH', `/api/admin/options/${id}`, { amount: 199, active: false });
    expect(changed.status).toBe(200);
    expect(changed.body.changes).toEqual([{ field: 'amount', from: 150, to: 199 }, { field: 'active', from: true, to: false }]);
    const stored = await prisma.productOption.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ code: 'extra-backup', amount: 199, active: false });

    const history = await client.request('GET', '/api/admin/pricing/history');
    const actions = history.body.history.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['option.created', 'option.updated']));
  });

  it('needs pricing.write, and pricing.read is enough to look', async () => {
    const reader = await staff(['pricing.read']);
    expect((await reader.request('GET', '/api/admin/options')).status).toBe(200);
    expect((await reader.request('POST', '/api/admin/options', { code: 'nope', name: 'Nope', amount: 1 })).status).toBe(403);
    const writer = await staff(['settings.write', 'products.write']);
    expect((await writer.request('POST', '/api/admin/options', { code: 'nope', name: 'Nope', amount: 1 })).status).toBe(403);
    expect(await prisma.productOption.count()).toBe(0);
  });
});

describe('the history of the prices', () => {
  it('keeps the rates before and after, and leaves the services that exist at the price they were sold at', async () => {
    const { client } = await createAdmin(app);
    const product = await prisma.product.create({ data: { slug: 'hist', name: 'Hist', category: 'BOTS', description: 'A product for the history.', icon: 'bot', eggId: 1, prices: { create: { period: 'MONTHLY', baseAmount: 0, ramPerGb: 100, cpuPerUnit: 200, diskPerGb: 10, currency: 'EUR' } } } });
    const user = await prisma.user.create({ data: { email: 'holder@blipmade.test', passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'H', lastName: 'O', emailVerifiedAt: new Date() } });
    const instance = await prisma.instance.create({ data: { userId: user.id, productId: product.id, name: 'old', status: 'ONLINE', pterodactylServerId: 41, pterodactylUuid: 'u41', ram: 1024, cpu: 1, disk: 10, price: 400 } });
    const subscription = await prisma.subscription.create({ data: { userId: user.id, instanceId: instance.id, status: 'ACTIVE', amount: 400 } });

    const rates = await client.request('PUT', '/api/admin/pricing/rates', { ramPerGb: 250 });
    expect(rates.status).toBe(200);

    const stored = await prisma.auditLog.findFirstOrThrow({ where: { action: 'pricing.rates_updated' } });
    const meta = stored.meta as { before: { ramPerGb: number }; after: { ramPerGb: number } };
    expect(meta.after.ramPerGb).toBe(250);
    expect(meta.before.ramPerGb).not.toBe(250);

    // A price that was sold stays: the holder pays what they agreed until the operator reconciles on purpose.
    expect((await prisma.instance.findUniqueOrThrow({ where: { id: instance.id } })).price).toBe(400);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).amount).toBe(400);

    const history = await client.request('GET', '/api/admin/pricing/history');
    expect(history.body.history[0].action).toBe('pricing.rates_updated');
  });

  it('records the row before and after when a price row is edited', async () => {
    const { client } = await createAdmin(app);
    const mail = await prisma.product.create({ data: { slug: 'mail-h', name: 'Mail H', category: 'EMAIL_HOSTING', fulfilment: 'EMAIL', description: 'A mail plan for the history.', icon: 'mail', prices: { create: { period: 'MONTHLY', baseAmount: 500, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' } } }, include: { prices: true } });
    const response = await client.request('PUT', `/api/admin/pricing/${mail.prices[0].id}`, { baseAmount: 650 });
    expect(response.status).toBe(200);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'pricing.updated' } });
    expect(entry.meta).toMatchObject({ before: { baseAmount: 500 }, after: { baseAmount: 650 } });
  });
});

describe('the reconciliation of the prices of the services', () => {
  it('lists what would change in a dry run, writes nothing, and corrects only when asked', async () => {
    const { client } = await createAdmin(app);
    const product = await prisma.product.create({ data: { slug: 'recon', name: 'Recon', category: 'BOTS', description: 'A product for the reconciliation.', icon: 'bot', eggId: 1, prices: { create: { period: 'MONTHLY', baseAmount: 0, ramPerGb: 100, cpuPerUnit: 200, diskPerGb: 10, currency: 'EUR' } } } });
    const user = await prisma.user.create({ data: { email: 'recon@blipmade.test', passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'R', lastName: 'C', emailVerifiedAt: new Date() } });
    const instance = await prisma.instance.create({ data: { userId: user.id, productId: product.id, name: 'wrong', status: 'ONLINE', pterodactylServerId: 61, pterodactylUuid: 'u61', ram: 2048, cpu: 2, disk: 20, price: 1 } });

    const dry = await client.request('POST', '/api/admin/instances/reconcile-prices', { dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ dryRun: true, corrected: 0, wouldCorrect: 1 });
    expect(dry.body.differences[0]).toMatchObject({ instanceId: instance.id, previousPrice: 1 });
    expect((await prisma.instance.findUniqueOrThrow({ where: { id: instance.id } })).price).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'instance.price_reconciled' } })).toBe(0);

    expect((await client.request('POST', '/api/admin/instances/reconcile-prices', { dryRun: 'yes' })).status).toBe(400);
    const real = await client.request('POST', '/api/admin/instances/reconcile-prices', {});
    expect(real.body).toMatchObject({ dryRun: false, corrected: 1 });
    expect((await prisma.instance.findUniqueOrThrow({ where: { id: instance.id } })).price).toBeGreaterThan(1);
    expect(await prisma.auditLog.count({ where: { action: 'instance.price_reconciled' } })).toBe(1);
  });

  it('needs pricing.write', async () => {
    const reader = await staff(['pricing.read']);
    expect((await reader.request('POST', '/api/admin/instances/reconcile-prices', { dryRun: true })).status).toBe(403);
  });
});

describe('the arithmetic of a price', () => {
  const rates = { ramPerGb: 333, cpuPerUnit: 111, diskPerGb: 7, baseFee: 0 };
  const product = { minRam: 512, minCpu: 0.5, minDisk: 5, fulfilment: 'SERVER' };
  const row = { baseAmount: 0, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 };

  it('is a whole number of cents for halves of a processor and fractions of a gigabyte', () => {
    for (const config of [{ ram: 512, cpu: 0.5, disk: 5 }, { ram: 1536, cpu: 1.5, disk: 7 }, { ram: 700, cpu: 0.5, disk: 11 }]) {
      const amount = priceConfiguration(row, product, config, [], rates);
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThan(0);
    }
  });

  it('prices a year as twelve months of the card, with the add-ons counted once', () => {
    const config = { ram: 2048, cpu: 1.5, disk: 20 };
    const option = { id: 'o', productId: null, code: 'x', name: 'x', description: null, amount: 399, currency: 'EUR', recurring: true, active: true };
    const monthly = priceConfiguration(row, product, config, [], rates, 'MONTHLY');
    expect(priceConfiguration(row, product, config, [], rates, 'YEARLY')).toBe(monthly * 12);
    expect(priceConfiguration(row, product, config, [option], rates, 'YEARLY')).toBe(monthly * 12 + 399);
    expect(priceConfiguration(row, product, config, [option], rates, 'MONTHLY')).toBe(monthly + 399);
  });

  it('changes with the rates the caller gives, never with a hidden one', () => {
    const config = { ram: 1024, cpu: 1, disk: 10 };
    const cheap = priceConfiguration(row, product, config, [], rates);
    const dear = priceConfiguration(row, product, config, [], { ...rates, ramPerGb: 666 });
    expect(dear - cheap).toBe(333);
  });
});
