import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

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

async function seedProduct(overrides: Record<string, unknown> = {}) {
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
      prices: {
        create: {
          period: 'MONTHLY',
          baseAmount: 149,
          ramPerGb: 60,
          cpuPerUnit: 40,
          diskPerGb: 2,
          currency: 'EUR',
        },
      },
      ...overrides,
    } as never,
  });
}

describe('server-side pricing', () => {
  it('charges a server by the resources it uses', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
    });

    expect(response.status).toBe(200);
    // The fee of the instance at 49 cents, half a gigabyte of memory at 200
    // cents, one processor at 75 cents and five gigabytes of disk at 5 cents.
    expect(response.body.subtotal).toBe(249);
    expect(response.body.total).toBe(249);
    expect(response.body.items[0].unitAmount).toBe(249);
  });

  it('charges every resource, and not only the ones above the minimum', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 2048, cpu: 2, disk: 10 }],
    });

    expect(response.status).toBe(200);
    // The fee of the instance at 49 cents, two gigabytes of memory at 200
    // cents, two processors at 75 cents and ten gigabytes of disk at 5 cents.
    expect(response.body.total).toBe(649);
  });

  it('charges the same price for the same resources in every product', async () => {
    // Two products with another minimum, another default and another base.
    // The price of the resources is the same, because the price of a server is
    // the price of what it uses and the card of the platform is one card for
    // every product.
    await seedProduct();
    await seedProduct({
      slug: 'minecraft',
      name: 'Minecraft',
      category: 'GAMES',
      minRam: 2048,
      minDisk: 20,
      defaultRam: 4096,
      defaultDisk: 30,
      prices: {
        create: {
          period: 'MONTHLY',
          baseAmount: 0,
          ramPerGb: 0,
          cpuPerUnit: 0,
          diskPerGb: 0,
          currency: 'EUR',
        },
      },
    });

    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'minecraft', ram: 4096, cpu: 1, disk: 30 }],
    });

    expect(response.status).toBe(200);
    // The fee of the instance at 49 cents, four gigabytes of memory at 200
    // cents, one processor at 75 cents and thirty gigabytes of disk at 5 cents.
    expect(response.body.total).toBe(1074);
  });

  it('keeps every amount an integer number of minor units', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 1536, cpu: 1, disk: 7 }],
    });

    expect(Number.isInteger(response.body.total)).toBe(true);
    expect(Number.isInteger(response.body.subtotal)).toBe(true);
  });

  it('rejects a configuration below the product minimum', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 128, cpu: 1, disk: 5 }],
    });
    expect(response.status).toBe(400);
  });

  it('rejects a configuration above the product maximum', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 65536, cpu: 1, disk: 5 }],
    });
    expect(response.status).toBe(400);
  });

  it('refuses to quote a product that is not deployable', async () => {
    await seedProduct({ deployable: false });
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
    });
    expect(response.status).toBe(400);
  });

  it('adds paid options to the total', async () => {
    const product = await seedProduct();
    await prisma.productOption.create({
      data: { productId: product.id, code: 'backup', name: 'Daily backups', amount: 200, currency: 'EUR' },
    });

    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5, optionCodes: ['backup'] }],
    });

    expect(response.status).toBe(200);
    // The resources of the configuration and the add-on.
    expect(response.body.total).toBe(449);
  });

  it('applies a percentage promotion', async () => {
    await seedProduct();
    await prisma.promotion.create({ data: { code: 'SAVE10', type: 'PERCENT', value: 1000 } });

    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
      promotionCode: 'SAVE10',
    });

    expect(response.status).toBe(200);
    expect(response.body.promotion.valid).toBe(true);
    expect(response.body.discount).toBe(25);
    expect(response.body.total).toBe(224);
  });

  it('reports an unknown promotion without failing the quote', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
      promotionCode: 'NOPE',
    });

    expect(response.status).toBe(200);
    expect(response.body.promotion.valid).toBe(false);
    expect(response.body.promotion.reason).toBeTruthy();
    expect(response.body.discount).toBe(0);
  });

  it('has no promotion at all when no code was typed', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
    });

    expect(response.status).toBe(200);
    // A field that was left empty must not look like a code that was refused.
    expect(response.body.promotion).toBeNull();
    expect(response.body.discount).toBe(0);
  });
});

describe('catalog', () => {
  it('lists only visible products for a customer', async () => {
    await seedProduct();
    await prisma.product.create({
      data: {
        slug: 'hidden',
        name: 'Hidden product',
        category: 'BOTS',
        description: 'Not ready yet.',
        icon: 'bot',
        minRam: 512,
        minCpu: 1,
        minDisk: 5,
        visible: false,
        deployable: false,
      },
    });

    const { client } = await registerAndLogin(app, 'catalog@example.com');
    const response = await client.request('GET', '/api/catalog/products');
    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0].slug).toBe('wordpress');
  });

  it('returns the price with the product', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'catalog2@example.com');
    const response = await client.request('GET', '/api/catalog/products/wordpress');
    expect(response.status).toBe(200);
    // The starting price of the catalogue is the price of the smallest
    // configuration of the product, and a server is priced by its resources.
    expect(response.body.product.price.amount).toBe(249);
    expect(response.body.product.price.currency).toBe('EUR');
  });
});
