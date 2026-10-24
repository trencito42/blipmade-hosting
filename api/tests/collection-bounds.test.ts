/**
 * The bounds of the collections that come from the client.
 *
 * zod checks the length of an array before it walks the elements, and a
 * record has no such limit in this version of zod, so the number of the
 * keys is counted before the values are read. Without the bounds, a body
 * with a very large collection is read as a whole, and the validation of it
 * costs as much as the collection is big.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';

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

async function seedProduct() {
  return prisma.product.create({
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
      options: { create: [{ code: 'extra-storage', name: 'Extra storage', amount: 100 }] },
    },
  });
}

/** A line of a quote or of an order. */
function line() {
  return { productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 };
}

describe('the bounds of the collections of a request', () => {
  it('refuses a quote with too many lines', async () => {
    await seedProduct();
    const client = makeClient(app);

    const response = await client.request('POST', '/api/catalog/quote', {
      items: Array.from({ length: 21 }, () => line()),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('refuses a quote with too many option codes', async () => {
    await seedProduct();
    const client = makeClient(app);

    // The same option, many times: the option exists, so only the bound of
    // the array can refuse the request.
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ ...line(), optionCodes: Array.from({ length: 51 }, () => 'extra-storage') }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('refuses an order with too many lines', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer@example.com');

    const response = await client.request('POST', '/api/orders', {
      items: Array.from({ length: 21 }, () => line()),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('refuses a body of settings with too many keys', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const body: Record<string, string> = {};
    for (let index = 0; index < 201; index += 1) body[`setting_${index}`] = 'value';

    const response = await client.request('PUT', '/api/admin/settings', body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');

    // Nothing was written.
    expect(await prisma.setting.count()).toBe(0);
  });

  it('accepts the ordinary sizes', async () => {
    await seedProduct();
    const client = makeClient(app);

    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ ...line(), optionCodes: ['extra-storage'] }],
    });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].optionCodes).toEqual(['extra-storage']);
  });
});
