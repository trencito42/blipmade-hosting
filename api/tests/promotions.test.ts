import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import {
  applyPromotion,
  buildQuote,
  defaultLimitPerUser,
  promotionCap,
  promotionRisk,
  releasePromotionReservation,
  reservePromotion,
  resolvePromotion,
} from '../src/services/pricing.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

/**
 * The rules of a campaign.
 *
 * A campaign has two limits: how many times the code may be used at all and
 * how many times one account may use it. Both have to hold when the code is
 * resolved and when the slot is reserved, and the reservation has to be
 * atomic: two orders that arrive at the same moment may not both take the
 * last slot.
 *
 * A fixed-amount campaign carries a cap: the amount it takes off one order.
 * The server bounds it by what the order is worth, so a total is never
 * negative.
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

let orderCounter = 0;

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

async function seedPromotion(data: {
  code: string;
  type?: 'PERCENT' | 'FIXED';
  value?: number;
  maxRedemptions?: number | null;
  maxPerUser?: number | null;
}) {
  return prisma.promotion.create({
    data: {
      code: data.code,
      type: data.type ?? 'PERCENT',
      value: data.value ?? 1000,
      maxRedemptions: data.maxRedemptions ?? null,
      maxPerUser: data.maxPerUser ?? null,
      active: true,
    },
  });
}

/** An order of an account, with the state the campaign counts it by. */
async function seedOrder(userId: string, status: 'PENDING' | 'PAID' | 'FULFILLED' = 'PENDING'): Promise<string> {
  orderCounter += 1;
  const order = await prisma.order.create({
    data: {
      number: `BM-${String(orderCounter).padStart(5, '0')}`,
      userId,
      status,
      total: 149,
      discount: 0,
      currency: 'EUR',
    },
  });
  return order.id;
}

/** A slot of the campaign that an account already holds. */
async function seedRedemption(promotionId: string, userId: string, orderId: string): Promise<void> {
  await prisma.promotionRedemption.create({
    data: { promotionId, userId, orderId, amount: 149 },
  });
}

/** A staff member with the given permissions, logged in. */
async function createStaff(email: string, permissions: string[]): Promise<{ client: TestClient; userId: string }> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(VALID_PASSWORD),
      role: 'STAFF',
      firstName: 'Test',
      lastName: 'Staff',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });

  const client = makeClient(app);
  const response = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (response.status !== 200) throw new Error(`Could not log ${email} in: ${response.status}`);
  return { client, userId: user.id };
}

const ITEMS = [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }];

describe('the limit per account', () => {
  it('refuses the code when the account already used it', async () => {
    const promotion = await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.once@example.test');
    const orderId = await seedOrder(userId, 'PAID');
    await seedRedemption(promotion.id, userId, orderId);

    const resolved = await resolvePromotion('ONCE', userId);

    expect(resolved.valid).toBe(false);
    expect(resolved.reason).toMatch(/already been used on your account/i);
    expect(resolved.discount).toBe(0);
  });

  it('accepts the code when the account has not used it yet', async () => {
    await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.fresh@example.test');

    const resolved = await resolvePromotion('ONCE', userId);

    expect(resolved.valid).toBe(true);
    expect(resolved.reason).toBeUndefined();
  });

  it('does not discount the order once the account reached the limit', async () => {
    await seedProduct();
    const promotion = await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.quote@example.test');
    const orderId = await seedOrder(userId, 'PAID');
    await seedRedemption(promotion.id, userId, orderId);

    const quote = await buildQuote(ITEMS, 'ONCE', userId);

    expect(quote.discount).toBe(0);
    expect(quote.total).toBe(150);
    expect(quote.promotion?.valid).toBe(false);
  });

  it('refuses the reservation when the account already holds a slot', async () => {
    const promotion = await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.reserve@example.test');
    const firstOrder = await seedOrder(userId, 'PENDING');
    await reservePromotion({ promotionId: promotion.id, userId, orderId: firstOrder, amount: 149 });

    const secondOrder = await seedOrder(userId, 'PENDING');

    await expect(
      reservePromotion({ promotionId: promotion.id, userId, orderId: secondOrder, amount: 149 }),
    ).rejects.toThrow(/already been used on your account/i);

    const redemptions = await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } });
    expect(redemptions).toBe(1);
  });

  it('gives the slot back when the reservation is released', async () => {
    const promotion = await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.released@example.test');
    const firstOrder = await seedOrder(userId, 'PENDING');
    await reservePromotion({ promotionId: promotion.id, userId, orderId: firstOrder, amount: 149 });

    await releasePromotionReservation(firstOrder);
    const secondOrder = await seedOrder(userId, 'PENDING');

    await expect(
      reservePromotion({ promotionId: promotion.id, userId, orderId: secondOrder, amount: 149 }),
    ).resolves.toBeUndefined();
  });
});

describe('the atomic reservation of a slot', () => {
  it('refuses the slot that would pass the cap of the campaign', async () => {
    const promotion = await seedPromotion({ code: 'ONE', maxRedemptions: 1 });
    const { userId: firstUser } = await registerAndLogin(app, 'promotion.cap.first@example.test');
    const { userId: secondUser } = await registerAndLogin(app, 'promotion.cap.second@example.test');
    const firstOrder = await seedOrder(firstUser, 'PENDING');

    await reservePromotion({ promotionId: promotion.id, userId: firstUser, orderId: firstOrder, amount: 149 });

    const secondOrder = await seedOrder(secondUser, 'PENDING');
    await expect(
      reservePromotion({ promotionId: promotion.id, userId: secondUser, orderId: secondOrder, amount: 149 }),
    ).rejects.toThrow(/redemption limit/i);

    const redemptions = await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } });
    expect(redemptions).toBe(1);
  });

  it('does not let two reservations at the same moment pass the cap of the campaign', async () => {
    const promotion = await seedPromotion({ code: 'ONE', maxRedemptions: 1 });
    const { userId: firstUser } = await registerAndLogin(app, 'promotion.race.first@example.test');
    const { userId: secondUser } = await registerAndLogin(app, 'promotion.race.second@example.test');
    const firstOrder = await seedOrder(firstUser, 'PENDING');
    const secondOrder = await seedOrder(secondUser, 'PENDING');

    const results = await Promise.allSettled([
      reservePromotion({ promotionId: promotion.id, userId: firstUser, orderId: firstOrder, amount: 149 }),
      reservePromotion({ promotionId: promotion.id, userId: secondUser, orderId: secondOrder, amount: 149 }),
    ]);

    const refused = results.filter((result) => result.status === 'rejected');
    expect(refused).toHaveLength(1);
    expect(String((refused[0] as PromiseRejectedResult).reason)).toMatch(/redemption limit/i);

    const redemptions = await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } });
    expect(redemptions).toBe(1);
  });

  it('does not let two reservations of one account at the same moment pass the limit per account', async () => {
    const promotion = await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.race.user@example.test');
    const firstOrder = await seedOrder(userId, 'PENDING');
    const secondOrder = await seedOrder(userId, 'PENDING');

    const results = await Promise.allSettled([
      reservePromotion({ promotionId: promotion.id, userId, orderId: firstOrder, amount: 149 }),
      reservePromotion({ promotionId: promotion.id, userId, orderId: secondOrder, amount: 149 }),
    ]);

    const refused = results.filter((result) => result.status === 'rejected');
    expect(refused).toHaveLength(1);
    expect(String((refused[0] as PromiseRejectedResult).reason)).toMatch(/already been used on your account/i);

    const redemptions = await prisma.promotionRedemption.count({ where: { promotionId: promotion.id, userId } });
    expect(redemptions).toBe(1);
  });

  it('gives the same order only one slot', async () => {
    const promotion = await seedPromotion({ code: 'ONCE', maxPerUser: 1 });
    const { userId } = await registerAndLogin(app, 'promotion.sameorder@example.test');
    const orderId = await seedOrder(userId, 'PENDING');

    await reservePromotion({ promotionId: promotion.id, userId, orderId, amount: 149 });
    await reservePromotion({ promotionId: promotion.id, userId, orderId, amount: 149 });

    const redemptions = await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } });
    expect(redemptions).toBe(1);
  });
});

describe('the cap of a fixed-amount campaign', () => {
  it('never takes more than the order is worth', () => {
    // A campaign of 500 cents on an order of 149 cents takes the order, not
    // more: the order total is 0 and never below.
    expect(applyPromotion(149, { type: 'FIXED', value: 500 })).toBe(149);
    expect(Math.max(0, 149 - applyPromotion(149, { type: 'FIXED', value: 500 }))).toBe(0);
  });

  it('takes the amount it was created with', () => {
    expect(applyPromotion(149, { type: 'FIXED', value: 50 })).toBe(50);
    expect(promotionCap(149, { type: 'FIXED', value: 50 })).toBe(50);
  });

  it('is bound by the order when the amount is larger than the order', () => {
    expect(promotionCap(149, { type: 'FIXED', value: 500 })).toBe(149);
  });

  it('binds a percentage campaign by the order total', () => {
    expect(promotionCap(149, { type: 'PERCENT', value: 10_000 })).toBe(149);
    expect(applyPromotion(149, { type: 'PERCENT', value: 10_000 })).toBe(149);
    expect(applyPromotion(149, { type: 'PERCENT', value: 5_000 })).toBe(75);
  });

  it('quotes an order that a fixed campaign covers without a negative total', async () => {
    await seedProduct();
    await seedPromotion({ code: 'BIGFIXED', type: 'FIXED', value: 5000 });
    const client = makeClient(app);

    const response = await client.request('POST', '/api/catalog/quote', {
      items: ITEMS,
      promotionCode: 'BIGFIXED',
    });

    expect(response.status).toBe(200);
    expect(response.body.subtotal).toBe(150);
    // The campaign takes the order and not more than the order.
    expect(response.body.discount).toBe(150);
    expect(response.body.total).toBe(0);
    expect(response.body.total).toBeGreaterThanOrEqual(0);
  });
});

describe('the admin route and the limit per account', () => {
  it('creates a campaign with a limit per account', async () => {
    const { client } = await createAdmin(app, 'admin.promotions@example.test');

    const response = await client.request('POST', '/api/admin/promotions', {
      code: 'LAUNCH',
      type: 'PERCENT',
      value: 1000,
      maxRedemptions: 25,
      maxPerUser: 2,
    });

    expect(response.status).toBe(201);
    expect(response.body.promotion.maxPerUser).toBe(2);

    const promotion = await prisma.promotion.findUnique({ where: { code: 'LAUNCH' } });
    expect(promotion?.maxPerUser).toBe(2);

    // The list shows the limit, so the operator sees what is set.
    const list = await client.request('GET', '/api/admin/promotions');
    expect(list.status).toBe(200);
    expect(list.body.promotions[0].maxPerUser).toBe(2);
  });

  it('creates a campaign without a limit per account', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.nolimit@example.test');

    const response = await client.request('POST', '/api/admin/promotions', {
      code: 'OPEN',
      type: 'PERCENT',
      value: 1000,
    });

    expect(response.status).toBe(201);
    const promotion = await prisma.promotion.findUnique({ where: { code: 'OPEN' } });
    expect(promotion?.maxPerUser).toBeNull();
  });

  it('gives a campaign that takes the whole order a limit of one use per account', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.full@example.test');

    const response = await client.request('POST', '/api/admin/promotions', {
      code: 'FULL100',
      type: 'PERCENT',
      value: 10000,
      maxRedemptions: 25,
    });

    expect(response.status).toBe(201);
    expect(response.body.promotion.maxPerUser).toBe(1);

    const promotion = await prisma.promotion.findUnique({ where: { code: 'FULL100' } });
    expect(promotion?.maxPerUser).toBe(1);
  });

  it('keeps the limit of a campaign that takes the whole order when the operator asks for one', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.full.limit@example.test');

    const response = await client.request('POST', '/api/admin/promotions', {
      code: 'FULL100LIMITED',
      type: 'PERCENT',
      value: 10000,
      maxRedemptions: 25,
      maxPerUser: 3,
    });

    expect(response.status).toBe(201);
    expect(response.body.promotion.maxPerUser).toBe(3);
  });

  it('shows the risk of a campaign that gives the whole order away without a limit per account', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.risk@example.test');
    await prisma.promotion.create({
      data: {
        code: 'RISKY',
        type: 'PERCENT',
        value: 10000,
        maxRedemptions: 25,
        maxPerUser: null,
        active: true,
      },
    });

    const list = await client.request('GET', '/api/admin/promotions');

    expect(list.status).toBe(200);
    const risky = list.body.promotions.find((entry: { code: string }) => entry.code === 'RISKY');
    expect(risky?.warning).toMatch(/no limit per account/i);
  });

  it('refuses a limit per account that is not a positive whole number', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.invalid@example.test');

    for (const maxPerUser of [0, -1, 1.5]) {
      const response = await client.request('POST', '/api/admin/promotions', {
        code: `BAD${Math.abs(maxPerUser).toString().replace('.', '')}`,
        type: 'PERCENT',
        value: 1000,
        maxPerUser,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_failed');
    }

    const promotions = await prisma.promotion.count();
    expect(promotions).toBe(0);
  });

  it('changes the limit per account of a campaign', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.change@example.test');
    const promotion = await seedPromotion({ code: 'LAUNCH', maxPerUser: 1 });

    const response = await client.request('PATCH', `/api/admin/promotions/${promotion.id}`, { maxPerUser: 3 });

    expect(response.status).toBe(200);
    const updated = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(updated?.maxPerUser).toBe(3);
  });

  it('clears the limit per account of a campaign', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.clear@example.test');
    const promotion = await seedPromotion({ code: 'LAUNCH', maxPerUser: 1 });

    const response = await client.request('PATCH', `/api/admin/promotions/${promotion.id}`, { maxPerUser: null });

    expect(response.status).toBe(200);
    const updated = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(updated?.maxPerUser).toBeNull();
  });

  it('refuses to change the limit to a number that is not a positive whole number', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.invalidchange@example.test');
    const promotion = await seedPromotion({ code: 'LAUNCH', maxPerUser: 2 });

    const response = await client.request('PATCH', `/api/admin/promotions/${promotion.id}`, { maxPerUser: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
    const unchanged = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(unchanged?.maxPerUser).toBe(2);
  });

  it('refuses to change a campaign that does not exist', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.missing@example.test');

    const response = await client.request('PATCH', '/api/admin/promotions/does-not-exist', { maxPerUser: 1 });

    expect(response.status).toBe(404);
  });

  it('needs the permission to change the limit per account', async () => {
    const { client: staff } = await createStaff('staff.promotions@example.test', ['promotions.read']);
    const promotion = await seedPromotion({ code: 'LAUNCH', maxPerUser: 1 });

    const response = await staff.request('PATCH', `/api/admin/promotions/${promotion.id}`, { maxPerUser: 5 });

    expect(response.status).toBe(403);
    const unchanged = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(unchanged?.maxPerUser).toBe(1);
  });

  it('refuses a fixed-amount campaign without an amount', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.fixed@example.test');

    const response = await client.request('POST', '/api/admin/promotions', {
      code: 'NOCAP',
      type: 'FIXED',
      value: 0,
    });

    expect(response.status).toBe(400);
    const promotions = await prisma.promotion.count();
    expect(promotions).toBe(0);
  });

  it('creates a fixed-amount campaign with its cap', async () => {
    const { client } = await createAdmin(app, 'admin.promotions.fixedok@example.test');

    const response = await client.request('POST', '/api/admin/promotions', {
      code: 'FIVEOFF',
      type: 'FIXED',
      value: 500,
      maxPerUser: 1,
    });

    expect(response.status).toBe(201);
    expect(response.body.promotion.value).toBe(500);
    expect(response.body.promotion.maxPerUser).toBe(1);
  });
});

describe('the risk of a campaign', () => {
  it('names the risk of a campaign that gives the whole order away without a limit per account', () => {
    const risk = promotionRisk({ type: 'PERCENT', value: 10_000, maxRedemptions: 25, maxPerUser: null });

    expect(risk).toBeTruthy();
    expect(risk).toMatch(/no limit per account/i);
  });

  it('names the risk of a campaign without a limit per account', () => {
    const risk = promotionRisk({ type: 'PERCENT', value: 1_000, maxRedemptions: 25, maxPerUser: null });

    expect(risk).toBeTruthy();
    expect(risk).toMatch(/no limit per account/i);
  });

  it('says nothing about a campaign that has a limit per account', () => {
    expect(promotionRisk({ type: 'PERCENT', value: 10_000, maxRedemptions: 25, maxPerUser: 1 })).toBeNull();
  });

  it('names the risk of a campaign without any limit', () => {
    // A campaign that gives the whole order away and has neither a total
    // limit nor a limit per account gives every order away.
    const risk = promotionRisk({ type: 'PERCENT', value: 10_000, maxRedemptions: null, maxPerUser: null });
    expect(risk).toMatch(/no limit per account/i);
  });

  it('says nothing about a campaign that has a limit per account', () => {
    expect(promotionRisk({ type: 'PERCENT', value: 10_000, maxRedemptions: null, maxPerUser: 1 })).toBeNull();
  });

  it('gives a campaign that takes the whole order a limit of one use per account', () => {
    expect(defaultLimitPerUser({ type: 'PERCENT', value: 10_000 })).toBe(1);
  });

  it('leaves the limit of a campaign that takes something off the order alone', () => {
    expect(defaultLimitPerUser({ type: 'PERCENT', value: 1_000 })).toBeNull();
    expect(defaultLimitPerUser({ type: 'FIXED', value: 500 })).toBeNull();
  });

  it('keeps the limit the operator asked for', () => {
    expect(defaultLimitPerUser({ type: 'PERCENT', value: 10_000, maxPerUser: 3 })).toBe(3);
  });
});
