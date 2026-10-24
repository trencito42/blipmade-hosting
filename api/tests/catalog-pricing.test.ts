import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The price book of the catalog.
 *
 * The catalog shows a starting price. That price is the price of the
 * smallest configuration, and the configurator has to start from exactly that
 * configuration. The recommended configuration is a bigger one and it has its
 * own price, which is never the same number under two meanings.
 *
 * The book is calculated with the function that prices an order, so the
 * numbers of the catalog and the numbers of the quote cannot drift apart.
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

/**
 * A product of the live catalog: 512 MB and 5 GB are the smallest, 1 GB and
 * 10 GB are the recommended ones.
 */
async function seedWordPress() {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A product used by the price book test.',
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
      prices: {
        create: { period: 'MONTHLY', baseAmount: 149, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR', active: true },
      },
    } as never,
  });
}

async function quote(client: ReturnType<typeof makeClient>, ram: number, cpu: number, disk: number) {
  const response = await client.request('POST', '/api/catalog/quote', {
    items: [{ productSlug: 'wordpress', ram, cpu, disk, optionCodes: [] }],
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe('the price book of the catalog', () => {
  it('prices the smallest configuration with the starting price', async () => {
    await seedWordPress();

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/wordpress');

    expect(response.status).toBe(200);
    const product = response.body.product;
    expect(product.price.amount).toBe(149);
    expect(product.pricing.minimum).toMatchObject({ ram: 512, cpu: 1, disk: 5, amount: 149 });
    expect(product.pricing.recommended).toMatchObject({ ram: 1024, cpu: 1, disk: 10, amount: 189 });
  });

  it('gives the same amounts as the quote of the same configurations', async () => {
    await seedWordPress();

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/wordpress');
    const product = response.body.product;

    const minimum = await quote(client, 512, 1, 5);
    const recommended = await quote(client, 1024, 1, 10);

    expect(product.pricing.minimum.amount).toBe(minimum.total);
    expect(product.pricing.recommended.amount).toBe(recommended.total);
  });

  it('keeps the starting price and the recommended price apart', async () => {
    await seedWordPress();

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/wordpress');
    const product = response.body.product;

    // 149 for the smallest configuration, 189 for the recommended one:
    // 512 MB is free, the extra 512 MB cost 30 and the extra 5 GB cost 10.
    expect(product.pricing.minimum.amount).toBe(149);
    expect(product.pricing.recommended.amount).toBe(189);
    expect(product.pricing.recommended.amount).not.toBe(product.pricing.minimum.amount);
  });

  it('sends the same book to the list and to the single product', async () => {
    await seedWordPress();

    const client = makeClient(app);
    const list = await client.request('GET', '/api/catalog/products');
    const single = await client.request('GET', '/api/catalog/products/wordpress');

    expect(list.body.products[0].pricing).toEqual(single.body.product.pricing);
  });

  it('gives the same amounts as the quote when the product has two active prices', async () => {
    await seedWordPress();
    // A second active price for the same period, newer than the first one.
    // The catalog and the order have to answer with the newer one.
    await prisma.productPrice.create({
      data: {
        productId: (await prisma.product.findUnique({ where: { slug: 'wordpress' } }))!.id,
        period: 'MONTHLY',
        baseAmount: 249,
        currency: 'EUR',
        active: true,
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/wordpress');
    const product = response.body.product;

    expect(product.price.amount).toBe(249);
    expect(product.pricing.minimum.amount).toBe(249);

    const minimum = await quote(client, 512, 1, 5);
    expect(product.pricing.minimum.amount).toBe(minimum.total);
  });

  it('gives the same amounts as the quote when two prices have the same date', async () => {
    await seedWordPress();
    const product = await prisma.product.findUnique({ where: { slug: 'wordpress' } });
    const first = await prisma.productPrice.findFirst({ where: { productId: product!.id } });
    // A second price for the same period, with the same date. The identifier
    // breaks the tie, the same way in the catalog and in the order.
    await prisma.productPrice.create({
      data: {
        productId: product!.id,
        period: 'MONTHLY',
        baseAmount: 349,
        currency: 'EUR',
        active: true,
        createdAt: first!.createdAt,
      },
    });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/wordpress');
    const product2 = response.body.product;

    const minimum = await quote(client, 512, 1, 5);

    // The two sides have to answer with the same number, whichever row they
    // choose.
    expect(product2.price.amount).toBe(minimum.total);
    expect(product2.pricing.minimum.amount).toBe(minimum.total);
  });

  it('has no book for a product without a price', async () => {
    await prisma.product.create({
      data: {
        slug: 'draft-bot',
        name: 'draft-bot',
        category: 'BOTS',
        description: 'A product without a price.',
        icon: 'bot',
        visible: false,
        deployable: false,
      } as never,
    });

    // A product without a price is not an offer for the public, so only the
    // staff area sees it.
    const { client } = await createAdmin(app);
    const response = await client.request('GET', '/api/catalog/products/draft-bot');

    expect(response.status).toBe(200);
    expect(response.body.product.price).toBeNull();
    expect(response.body.product.pricing).toBeNull();
  });
});
