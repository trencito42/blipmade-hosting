import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import {
  breakdownForPeriod,
  breakdownOfResources,
  DEFAULT_RESOURCE_RATES,
  monthsOfPeriod,
  priceConfiguration,
  priceOfResources,
  resourceRates,
  saveResourceRates,
  validateConfiguration,
} from '../src/services/pricing.js';
import { canHoldProcessor, DEFAULT_CPU_OVERSUBLICATION, DEFAULT_NODE_CORES, nodeCpuCapacity, processorRefusal } from '../src/services/capacity.js';

/**
 * The price of the resources.
 *
 * One card for the whole platform: the fee of the instance, plus the price of
 * the memory, of the processor and of the storage. The same resources cost
 * the same in every product, in every category and for every egg, and the
 * price of an order is calculated by the server and never by the page.
 */

let app: FastifyInstance;

// The sale of hosted mail is closed by default. A line of mail is priced
// like any other line, so the sale is opened for the file of the test.
const originalMailSales = process.env.MAIL_SALES_ENABLED;

beforeAll(async () => {
  process.env.MAIL_SALES_ENABLED = 'true';
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
  if (originalMailSales === undefined) delete process.env.MAIL_SALES_ENABLED;
  else process.env.MAIL_SALES_ENABLED = originalMailSales;
});

beforeEach(async () => {
  await resetDatabase();
});

/** The card the brief announces: 200 cents a gigabyte, 75 a processor, 5 a gigabyte of disk and 49 of fee. */
const CARD = { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 };

/**
 * A product of the platform.
 *
 * The prices of the row are the ones of an old card: a server is priced by
 * the card of the platform and not by the row, so the row proves that the
 * card is the one that counts.
 */
async function seedProduct(overrides: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 0.5,
      minDisk: 5,
      defaultRam: 1024,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 16384,
      maxCpu: 8,
      maxDisk: 200,
      deployable: true,
      eggId: 1,
      prices: {
        create: [
          {
            period: 'MONTHLY',
            baseAmount: 149,
            ramPerGb: 60,
            cpuPerUnit: 40,
            diskPerGb: 2,
            currency: 'EUR',
          },
          {
            period: 'YEARLY',
            baseAmount: 149,
            ramPerGb: 60,
            cpuPerUnit: 40,
            diskPerGb: 2,
            currency: 'EUR',
          },
        ],
      },
      ...overrides,
    } as never,
  });
}

/** A plan of hosted mail: it is a subscription of a service and it keeps its base. */
async function seedMailPlan() {
  return prisma.product.create({
    data: {
      slug: 'mail-basic',
      name: 'Mail Basic',
      category: 'EMAIL_HOSTING',
      description: 'A mailbox with a domain.',
      icon: 'mail',
      fulfilment: 'EMAIL',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 512,
      defaultCpu: 1,
      defaultDisk: 5,
      maxRam: 512,
      maxCpu: 1,
      maxDisk: 5,
      deployable: true,
      visible: true,
      mailMaxDomains: 2,
      mailMaxMailboxes: 5,
      mailMaxAliases: 50,
      mailMaxForwarding: 5,
      mailTotalStorageMb: 5120,
      mailMailboxQuotaMb: 1024,
      mailSendLimit: 200,
      mailSendInterval: 'HOURLY',
      prices: {
        create: {
          period: 'MONTHLY',
          baseAmount: 499,
          ramPerGb: 0,
          cpuPerUnit: 0,
          diskPerGb: 0,
          currency: 'EUR',
        },
      },
    } as never,
  });
}

describe('the card of the platform', () => {
  // Area 1: the price of a configuration is the card, exactly.
  it('prices a configuration with the card of the platform', () => {
    // The six prices the brief announces, each with the configuration that
    // produces it under the card: the fee of the instance, plus the memory,
    // the processor and the storage.
    const cases: { ram: number; cpu: number; disk: number; expected: number }[] = [
      { ram: 512, cpu: 0.5, disk: 5, expected: 212 },
      { ram: 1024, cpu: 1, disk: 10, expected: 374 },
      { ram: 1024, cpu: 2, disk: 40, expected: 599 },
      { ram: 4096, cpu: 2, disk: 25, expected: 1124 },
      { ram: 8192, cpu: 4, disk: 50, expected: 2199 },
      { ram: 16384, cpu: 8, disk: 70, expected: 4199 },
    ];
    for (const testCase of cases) {
      expect(priceOfResources(testCase, CARD)).toBe(testCase.expected);
    }
  });

  it('uses the card of the platform when no card was written', () => {
    expect(DEFAULT_RESOURCE_RATES).toEqual(CARD);
  });

  it('reads the card from the settings of the platform', async () => {
    await saveResourceRates(CARD);
    const rates = await resourceRates();
    expect(rates).toEqual(CARD);
  });

  // Area 7: the fee of the instance is charged once, whatever it holds.
  it('charges the fee of the instance once, whatever the instance holds', () => {
    const small = priceOfResources({ ram: 512, cpu: 0.5, disk: 5 }, CARD);
    const big = priceOfResources({ ram: 16384, cpu: 8, disk: 70 }, CARD);
    expect(small - 49).toBe(163);
    expect(big - 49).toBe(4150);
  });

  // Area 2: a half vCPU is sold, a quarter is refused.
  it('sells a half of a processor and refuses a quarter of one', () => {
    const product = { minRam: 512, maxRam: 8192, minCpu: 0.5, maxCpu: 4, minDisk: 5, maxDisk: 100 };
    expect(() => validateConfiguration(product, { ram: 512, cpu: 0.5, disk: 5 })).not.toThrow();
    expect(() => validateConfiguration(product, { ram: 512, cpu: 1.5, disk: 5 })).not.toThrow();
    expect(() => validateConfiguration(product, { ram: 512, cpu: 0.25, disk: 5 })).toThrow();
    expect(() => validateConfiguration(product, { ram: 512, cpu: 0.75, disk: 5 })).toThrow();
  });

  it('sells a half of a processor through the quote of the catalog', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 0.5, disk: 5 }],
    });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(212);
  });

  it('refuses a quarter of a processor through the quote of the catalog', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 0.25, disk: 5 }],
    });
    expect(response.status).toBe(400);
  });

  // Area 3: the rounding is half-up, once, on the total.
  it('rounds a price that ends in half a cent up', () => {
    // Half a gigabyte of memory and half a processor: 49 + 100 + 37.5 + 25 =
    // 211.5 cents exactly. A half goes up.
    expect(priceOfResources({ ram: 512, cpu: 0.5, disk: 5 }, CARD)).toBe(212);
  });

  it('rounds a price that ends below a half down', () => {
    // 1056 MiB of memory is 1.03125 GB, which is 206.25 cents: 49 + 206.25 +
    // 75 + 25 = 355.25 cents exactly. A quarter goes down.
    expect(priceOfResources({ ram: 1056, cpu: 1, disk: 5 }, CARD)).toBe(355);
  });

  it('rounds once, on the total of the configuration', () => {
    // Every part is rounded down and the minor unit that is left over goes to
    // the part that lost the most, so the parts add up to the total.
    const breakdown = breakdownOfResources({ ram: 512, cpu: 0.5, disk: 5 }, CARD);
    expect(breakdown.ram + breakdown.cpu + breakdown.disk + breakdown.base).toBe(breakdown.total);
    expect(breakdown.total).toBe(212);
  });

  // Area 4: the same resources cost the same in every product.
  it('charges the same price for the same resources in every product', async () => {
    await seedProduct();
    await seedProduct({
      slug: 'valheim',
      name: 'Valheim',
      category: 'GAMES',
      minRam: 4096,
      minCpu: 2,
      minDisk: 25,
      defaultRam: 8192,
      defaultCpu: 4,
      defaultDisk: 50,
      prices: {
        create: { period: 'MONTHLY', baseAmount: 0, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' },
      },
    });

    const client = makeClient(app);
    const blog = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
    });
    const game = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'valheim', ram: 4096, cpu: 2, disk: 25 }],
    });

    expect(blog.status).toBe(200);
    expect(game.status).toBe(200);
    expect(blog.body.total).toBe(1124);
    expect(game.body.total).toBe(1124);
  });

  // Area 5: a year is twelve months of the card.
  it('prices a year as twelve months of the card', () => {
    const price = { baseAmount: 0, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 };
    const product = { minRam: 512, minCpu: 0.5, minDisk: 5, fulfilment: 'SERVER' };
    const config = { ram: 4096, cpu: 2, disk: 25 };
    const monthly = priceConfiguration(price, product, config, [], CARD, 'MONTHLY');
    const yearly = priceConfiguration(price, product, config, [], CARD, 'YEARLY');
    expect(monthly).toBe(1124);
    expect(yearly).toBe(1124 * 12);
    expect(monthsOfPeriod('YEARLY')).toBe(12);
    expect(monthsOfPeriod('MONTHLY')).toBe(1);
  });

  // Area 6: the breakdown adds up to the price of the line.
  it('breaks the price of a line down into parts that add up', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
    });

    expect(response.status).toBe(200);
    const breakdown = response.body.items[0].breakdown;
    expect(breakdown).not.toBeNull();
    expect(breakdown.ram).toBe(800);
    expect(breakdown.cpu).toBe(150);
    expect(breakdown.disk).toBe(125);
    expect(breakdown.base).toBe(49);
    expect(breakdown.total).toBe(1124);
    expect(breakdown.ram + breakdown.cpu + breakdown.disk + breakdown.base + breakdown.options).toBe(response.body.total);
  });

  it('breaks the price of a year down into twelve months of the same parts', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
      period: 'YEARLY',
    });

    expect(response.status).toBe(200);
    const breakdown = response.body.items[0].breakdown;
    expect(breakdown.ram).toBe(800 * 12);
    expect(breakdown.cpu).toBe(150 * 12);
    expect(breakdown.disk).toBe(125 * 12);
    expect(breakdown.base).toBe(49 * 12);
    expect(breakdown.total).toBe(response.body.total);
  });

  // Area 8: a plan of mail keeps its own base price.
  it('keeps the base price of a plan of mail', async () => {
    await seedMailPlan();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'mail-basic', mailDomain: 'example.com' }],
    });

    expect(response.status).toBe(200);
    // A plan is a subscription of a service: the plan is what the customer
    // buys, so it keeps its own base and it is not broken into resources.
    expect(response.body.total).toBe(499);
    expect(response.body.items[0].breakdown).toBeNull();
  });

  // Area 9: the catalog shows the price of the smallest configuration.
  it('shows the price of the smallest configuration in the catalog', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/wordpress');

    expect(response.status).toBe(200);
    const product = response.body.product;
    expect(product.price.amount).toBe(212);
    expect(product.pricing.minimum.amount).toBe(212);
    expect(product.pricing.rates.baseFee).toBe(49);
    expect(product.pricing.breakdown.minimum.total).toBe(212);
    // The price of the catalog is a number, never a promise: the products are
    // serialized one by one, because the card of the platform is read from
    // the settings.
    expect(typeof product.price.amount).toBe('number');
    expect(product.pricing.recommended.amount).toBe(374);
  });

  // Area 10: the quote and the order are the same price.
  it('charges the order the price it quoted', async () => {
    await seedProduct();
    const { client } = await registerAndLogin(app, 'buyer@blipmade.test');
    const quoted = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
    });
    const ordered = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
    });

    expect(quoted.status).toBe(200);
    expect(ordered.status).toBe(201);
    expect(ordered.body.order.total).toBe(quoted.body.total);
    expect(ordered.body.order.total).toBe(1124);
  });

  // Area 11: the card of the platform is written in the settings and in the rows.
  it('writes the card in the settings and in every row of a server', async () => {
    await seedProduct();
    await seedMailPlan();
    const { client } = await createAdmin(app, 'card@blipmade.test');

    const saved = await client.request('PUT', '/api/admin/pricing/rates', {
      ramPerGb: 300,
      cpuPerUnit: 100,
      diskPerGb: 7,
      baseFee: 99,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.rates).toEqual({ ramPerGb: 300, cpuPerUnit: 100, diskPerGb: 7, baseFee: 99 });

    const setting = await prisma.setting.findUnique({ where: { key: 'pricing_resources' } });
    expect(setting?.value).toMatchObject({ ramPerGb: 300, cpuPerUnit: 100, diskPerGb: 7, baseFee: 99 });

    // The rows of the servers show the card that is really used.
    const rows = await prisma.productPrice.findMany({ include: { product: true } });
    const server = rows.find((row) => row.product.fulfilment === 'SERVER')!;
    const mail = rows.find((row) => row.product.fulfilment === 'EMAIL')!;
    expect(server.ramPerGb).toBe(300);
    expect(server.cpuPerUnit).toBe(100);
    expect(server.diskPerGb).toBe(7);
    // A plan of mail is not a server: it keeps its own rates.
    expect(mail.ramPerGb).toBe(0);

    // The quote follows the card that was just written.
    const quote = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 0.5, disk: 5 }],
    });
    // 99 + 150 + 50 + 35 = 334.
    expect(quote.body.total).toBe(334);
  });

  // Area 12: a change of the card does not touch the prices the customers have.
  it('does not touch the prices of the running instances when the card changes', async () => {
    await seedProduct();
    const { client, userId } = await createAdmin(app, 'keeper@blipmade.test');
    const instance = await prisma.instance.create({
      data: {
        userId,
        productId: (await prisma.product.findUniqueOrThrow({ where: { slug: 'wordpress' } })).id,
        name: 'kept',
        status: 'ONLINE',
        ram: 4096,
        cpu: 2,
        disk: 25,
        price: 1124,
        currency: 'EUR',
      },
    });

    const saved = await client.request('PUT', '/api/admin/pricing/rates', {
      ramPerGb: 300,
      cpuPerUnit: 100,
      diskPerGb: 7,
      baseFee: 99,
    });
    expect(saved.status).toBe(200);

    // The instance keeps the price it was sold at.
    const after = await prisma.instance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.price).toBe(1124);

    // The reconciliation is an action of the operator, not something that
    // happens on its own.
    const reconciled = await client.request('POST', '/api/admin/instances/reconcile-prices');
    expect(reconciled.status).toBe(200);
    expect(reconciled.body.corrected).toBe(1);
    const reconciledInstance = await prisma.instance.findUniqueOrThrow({ where: { id: instance.id } });
    // 99 + 1200 + 200 + 175 = 1674 cents, the price of the configuration under
    // the card that was just written.
    expect(reconciledInstance.price).toBe(1674);
  });

  // Area 13: the capacity of a node.
  it('sells the cores of a node multiplied by the factor of the oversubscription', async () => {
    await prisma.setting.create({
      data: { key: 'capacity.node_cores', value: { 1: 8 } },
    });
    const capacity = await nodeCpuCapacity(1);
    expect(capacity.declared).toBe(true);
    expect(capacity.cores).toBe(8);
    expect(capacity.sellableVcpu).toBe(8 * DEFAULT_CPU_OVERSUBLICATION);
    expect(capacity.allocatedVcpu).toBe(0);
    expect(capacity.freeVcpu).toBe(32);
  });

  it('sells a small number of cores when the operator declared none', async () => {
    const capacity = await nodeCpuCapacity(7);
    expect(capacity.declared).toBe(false);
    expect(capacity.cores).toBe(DEFAULT_NODE_CORES);
    expect(capacity.sellableVcpu).toBe(DEFAULT_NODE_CORES * DEFAULT_CPU_OVERSUBLICATION);
  });

  it('refuses a node that cannot hold the processors of an instance', async () => {
    await prisma.setting.create({
      data: { key: 'capacity.node_cores', value: { 1: 1 } },
    });
    const capacity = await nodeCpuCapacity(1);
    // A node of one core sells four shared processors.
    expect(canHoldProcessor(capacity, 4)).toBe(true);
    expect(canHoldProcessor(capacity, 4.5)).toBe(false);
    expect(processorRefusal(capacity, 4.5)).toContain('shared processors are sold');
    expect(processorRefusal(capacity, 4.5)).toContain('this instance asks for 4.5');
  });

  // Area 15: the configurator shows the breakdown and the tax of the invoice.
  it('sends the breakdown and the tax of the invoice with the quote', async () => {
    await seedProduct();
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
    });

    expect(response.status).toBe(200);
    expect(response.body.items[0].breakdown.total).toBe(response.body.total);
    expect(response.body.tax).toBeTruthy();
    // Without a rate and a tax identifier, the invoice carries no tax and the
    // quote says why.
    expect(response.body.tax.applies).toBe(false);
    expect(response.body.tax.amount).toBe(0);
    expect(response.body.tax.total).toBe(response.body.total);
    expect(response.body.tax.note).toBeTruthy();
  });

  it('adds the tax of the platform to the quote when it is configured', async () => {
    await seedProduct();
    await prisma.setting.createMany({
      data: [
        { key: 'billing.tax_rate', value: '21' },
        { key: 'billing.tax_id', value: 'RO123456789' },
      ],
    });
    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 4096, cpu: 2, disk: 25 }],
    });

    expect(response.status).toBe(200);
    expect(response.body.tax.applies).toBe(true);
    expect(response.body.tax.rate).toBe(21);
    // A fifth of 1124 cents, rounded to the nearest cent.
    expect(response.body.tax.amount).toBe(236);
    expect(response.body.tax.total).toBe(1360);
  });

  // Area 16: a configuration outside the limits of the product is refused.
  it('refuses a configuration outside the limits of the product', async () => {
    await seedProduct();
    const client = makeClient(app);

    const tooSmall = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 256, cpu: 1, disk: 5 }],
    });
    const tooBig = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 32768, cpu: 1, disk: 5 }],
    });
    const tooManyProcessors = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 16, disk: 5 }],
    });

    expect(tooSmall.status).toBe(400);
    expect(tooBig.status).toBe(400);
    expect(tooManyProcessors.status).toBe(400);
  });
});

describe('the breakdown of a period', () => {
  it('multiplies the parts of a month for a year and leaves the add-ons alone', () => {
    const breakdown = breakdownForPeriod({ ram: 4096, cpu: 2, disk: 25 }, CARD, 'YEARLY', 500);
    expect(breakdown.ram).toBe(800 * 12);
    expect(breakdown.cpu).toBe(150 * 12);
    expect(breakdown.disk).toBe(125 * 12);
    expect(breakdown.base).toBe(49 * 12);
    expect(breakdown.options).toBe(500);
    expect(breakdown.total).toBe(1124 * 12 + 500);
  });
});
