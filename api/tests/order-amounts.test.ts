import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import {
  allocateLineTotals,
  allocateOrderAmounts,
  allocateUnitPrices,
} from '../src/services/order-amounts.js';
import { buildCheckoutLineItems } from '../src/services/stripe.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The amount that is really paid for an order.
 *
 * A promotion belongs to the order and not to a line, so the amount that is
 * due has to be split over the lines before it can be collected. Without the
 * split the payment provider is given the catalogue price, the amount
 * collected does not match the amount quoted, and the order is refused by the
 * amount check of the webhook.
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

function sumOfChunks(chunks: { quantity: number; unitAmount: number }[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.quantity * chunk.unitAmount, 0);
}

describe('the split of an order total over its lines', () => {
  it('adds up to exactly the order total', () => {
    const lines = [
      { unitAmount: 149, quantity: 1, total: 149 },
      { unitAmount: 189, quantity: 1, total: 189 },
    ];

    const chunks = allocateOrderAmounts(lines, 200);

    expect(sumOfChunks(chunks)).toBe(200);
  });

  it('gives nothing to collect when the promotion covers the whole order', () => {
    const lines = [{ unitAmount: 149, quantity: 1, total: 149 }];

    const chunks = allocateOrderAmounts(lines, 0);

    expect(sumOfChunks(chunks)).toBe(0);
  });

  it('keeps the exact total when a line covers several units', () => {
    const lines = [
      { unitAmount: 149, quantity: 3, total: 447 },
      { unitAmount: 99, quantity: 1, total: 99 },
    ];

    const chunks = allocateOrderAmounts(lines, 275);

    expect(sumOfChunks(chunks)).toBe(275);
    // Every unit of a line shares one price, so the parts of a line are at
    // most two.
    expect(chunks.length).toBeLessThanOrEqual(3);
  });

  it('never charges more than the catalogue price of a line', () => {
    const lines = [
      { unitAmount: 149, quantity: 1, total: 149 },
      { unitAmount: 189, quantity: 1, total: 189 },
    ];

    const chunks = allocateOrderAmounts(lines, 200);

    for (const chunk of chunks) {
      expect(chunk.unitAmount).toBeLessThanOrEqual(lines[chunk.lineIndex].unitAmount);
    }
  });

  it('gives every line the amount that is due for it', () => {
    const lines = [
      { unitAmount: 149, quantity: 1, total: 149 },
      { unitAmount: 189, quantity: 1, total: 189 },
    ];

    const totals = allocateLineTotals(lines, 338);

    expect(totals[0] + totals[1]).toBe(338);
    expect(totals[1]).toBeGreaterThan(totals[0]);
  });

  it('gives every unit of a line the price that is due', () => {
    const lines = [{ unitAmount: 149, quantity: 1, total: 149 }];

    expect(allocateUnitPrices(lines, 75)).toEqual([75]);
  });
});

describe('the line items of the checkout', () => {
  it('collect the order total and not the catalogue price', () => {
    const items = [
      {
        id: 'item_1',
        name: 'WordPress',
        quantity: 1,
        unitAmount: 149,
        total: 149,
        currency: 'EUR',
        config: { ram: 512, cpu: 1, disk: 5 },
      },
      {
        id: 'item_2',
        name: 'Discord Bot',
        quantity: 1,
        unitAmount: 189,
        total: 189,
        currency: 'EUR',
        config: { ram: 512, cpu: 1, disk: 5 },
      },
    ] as never;

    const lineItems = buildCheckoutLineItems(items, 200);

    const collected = lineItems.reduce((sum, item) => {
      const price = item.price_data as { unit_amount: number };
      return sum + price.unit_amount * (item.quantity ?? 1);
    }, 0);

    expect(collected).toBe(200);
  });
});

async function seedProduct() {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A product used by the promotion test.',
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
        create: {
          period: 'MONTHLY',
          baseAmount: 149,
          ramPerGb: 60,
          cpuPerUnit: 40,
          diskPerGb: 2,
          currency: 'EUR',
          active: true,
        },
      },
    } as never,
  });
}

async function seedPromotion(code: string, value: number) {
  return prisma.promotion.create({
    data: { code, type: 'PERCENT', value, active: true },
  });
}

describe('an order paid with a promotion', () => {
  it('quotes the discounted total', async () => {
    await seedProduct();
    await seedPromotion('HALF', 5000);
    const { client } = await registerAndLogin(app, 'promotion.half@example.test');

    const response = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
      promotionCode: 'HALF',
    });

    expect(response.status).toBe(201);
    // 249 cents, half of it taken away: 125 cents off, 124 cents to pay.
    expect(response.body.order.total).toBe(124);
    expect(response.body.order.discount).toBe(125);
    expect(response.body.order.items[0].unitAmount).toBe(249);
  });

  it('confirms an order that a promotion covers completely, without a payment', async () => {
    await seedProduct();
    const promotion = await seedPromotion('FULL', 10000);
    const { client, userId } = await registerAndLogin(app, 'promotion.full@example.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
      promotionCode: 'FULL',
    });
    expect(created.status).toBe(201);
    expect(created.body.order.total).toBe(0);
    expect(created.body.order.discount).toBe(249);

    const checkout = await client.request('POST', `/api/orders/${created.body.order.id}/checkout`);

    expect(checkout.status).toBe(200);
    expect(checkout.body.url).toBeNull();
    expect(checkout.body.free).toBe(true);
    expect(checkout.body.message).toMatch(/no payment was due/i);

    const order = await prisma.order.findUnique({ where: { id: created.body.order.id } });
    expect(order?.status).toBe('PAID');
    expect(order?.fulfillmentStatus).toBe('PROVISIONING');
    expect(order?.promotionRedeemedAt).not.toBeNull();

    // The instance carries the price that is really paid, not the catalogue
    // price of the line.
    const instances = await prisma.instance.findMany({ where: { orderId: order?.id } });
    expect(instances).toHaveLength(1);
    expect(instances[0].price).toBe(0);

    const subscriptions = await prisma.subscription.findMany({ where: { userId } });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].amount).toBe(0);

    // The campaign slot is consumed when the order is confirmed.
    const updated = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(updated?.usedCount).toBe(1);
  });

  it('does not send a paid order to the payment provider again', async () => {
    await seedProduct();
    await seedPromotion('FULL', 10000);
    const { client } = await registerAndLogin(app, 'promotion.paid@example.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
      promotionCode: 'FULL',
    });

    const first = await client.request('POST', `/api/orders/${created.body.order.id}/checkout`);
    expect(first.status).toBe(200);
    expect(first.body.free).toBe(true);

    // The order is paid now, so there is nothing left to collect.
    const second = await client.request('POST', `/api/orders/${created.body.order.id}/checkout`);
    expect(second.status).toBe(400);
  });

  it('sends an unpaid order to the payment provider with the discounted amount', async () => {
    await seedProduct();
    await seedPromotion('HALF', 5000);
    const { client } = await registerAndLogin(app, 'promotion.unpaid@example.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
      promotionCode: 'HALF',
    });

    const checkout = await client.request('POST', `/api/orders/${created.body.order.id}/checkout`);
    expect(checkout.status).toBe(200);
    expect(checkout.body.url).not.toBeNull();

    const order = await prisma.order.findUnique({ where: { id: created.body.order.id } });
    expect(order?.total).toBe(75);
    expect(order?.status).toBe('AWAITING_PAYMENT');
  });
});
