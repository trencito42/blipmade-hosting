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
  it('charges the base amount for the minimum configuration', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
    });

    expect(response.status).toBe(200);
    expect(response.body.subtotal).toBe(149);
    expect(response.body.total).toBe(149);
    expect(response.body.items[0].unitAmount).toBe(149);
  });

  it('charges extra memory, cpu and storage above the minimum', async () => {
    await seedProduct();
    const client = makeClient(app);
    // The product minimum is 512 MB, 1 vCPU and 5 GB. 2048 MB is 1.5 GB above
    // the minimum: 90. One extra vCPU: 40. Five extra GB: 10.
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 2048, cpu: 2, disk: 10 }],
    });

    expect(response.status).toBe(200);
    // 149 base + 90 for the extra memory + 40 for the extra vCPU + 10 for 5 GB.
    expect(response.body.total).toBe(289);
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
    expect(response.body.total).toBe(349);
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
    expect(response.body.discount).toBe(15);
    expect(response.body.total).toBe(134);
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
    expect(response.body.product.price.amount).toBe(149);
    expect(response.body.product.price.currency).toBe('EUR');
  });
});
