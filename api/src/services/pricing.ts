import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { normalizeAmount } from '../lib/money.js';
import { deploymentAvailability, unavailableMessage } from './availability.js';
import type { BillingPeriod, Prisma, Product, ProductOption, ProductPrice } from '@prisma/client';

export interface ResourceConfig {
  ram: number;
  cpu: number;
  disk: number;
  optionCodes: string[];
}

export interface PricedItem extends ResourceConfig {
  productId: string;
  productSlug: string;
  name: string;
  quantity: number;
  unitAmount: number;
  total: number;
  currency: string;
  price: ProductPrice;
}

export interface PromotionResult {
  code: string;
  valid: boolean;
  reason?: string;
  discount: number;
}

/**
 * All prices are integer minor units. The rate card is:
 *   base (for the minimum configuration)
 * + ramPerGb  * extra gigabytes of memory above the product minimum
 * + cpuPerUnit * extra vCPU above the product minimum
 * + diskPerGb * extra gigabytes of storage above the product minimum
 * + selected paid options
 */
export function priceConfiguration(
  price: Pick<ProductPrice, 'baseAmount' | 'ramPerGb' | 'cpuPerUnit' | 'diskPerGb'>,
  product: Pick<Product, 'minRam' | 'minCpu' | 'minDisk'>,
  config: { ram: number; cpu: number; disk: number },
  options: ProductOption[] = [],
): number {
  const extraRamGb = Math.max(0, (config.ram - product.minRam) / 1024);
  return normalizeAmount(
    price.baseAmount +
      normalizeAmount(extraRamGb * price.ramPerGb) +
      normalizeAmount(Math.max(0, config.cpu - product.minCpu) * price.cpuPerUnit) +
      normalizeAmount(Math.max(0, config.disk - product.minDisk) * price.diskPerGb) +
      options.reduce((sum, option) => sum + option.amount, 0),
  );
}

/**
 * Keeps a value inside the limits of a product.
 */
export function clampConfiguration(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A configuration of a product and what it costs.
 */
export interface PricedConfiguration {
  ram: number;
  cpu: number;
  disk: number;
  amount: number;
}

/**
 * The price book of a product: the two configurations the catalog talks about
 * and what they cost.
 *
 *   minimum      the smallest configuration; its price is the starting price
 *                the catalog shows
 *   recommended  the configuration the platform recommends; its price is the
 *                price of a bigger deployment
 *
 * Both are calculated with the same function that prices an order, so a price
 * can never mean two things. The add-ons are not part of the book: they are
 * chosen by the customer and are priced when they are picked.
 */
export function priceBook(
  product: Pick<
    Product,
    'minRam' | 'minCpu' | 'minDisk' | 'defaultRam' | 'defaultCpu' | 'defaultDisk' | 'maxRam' | 'maxCpu' | 'maxDisk'
  >,
  price: Pick<ProductPrice, 'baseAmount' | 'ramPerGb' | 'cpuPerUnit' | 'diskPerGb' | 'currency' | 'period'>,
): {
  currency: string;
  period: BillingPeriod;
  minimum: PricedConfiguration;
  recommended: PricedConfiguration;
} {
  const minimum = {
    ram: clampConfiguration(product.minRam, product.minRam, product.maxRam),
    cpu: clampConfiguration(product.minCpu, product.minCpu, product.maxCpu),
    disk: clampConfiguration(product.minDisk, product.minDisk, product.maxDisk),
  };
  const recommended = {
    ram: clampConfiguration(product.defaultRam, product.minRam, product.maxRam),
    cpu: clampConfiguration(product.defaultCpu, product.minCpu, product.maxCpu),
    disk: clampConfiguration(product.defaultDisk, product.minDisk, product.maxDisk),
  };
  return {
    currency: price.currency,
    period: price.period,
    minimum: { ...minimum, amount: priceConfiguration(price, product, minimum) },
    recommended: { ...recommended, amount: priceConfiguration(price, product, recommended) },
  };
}

export function validateConfiguration(
  product: Pick<Product, 'minRam' | 'maxRam' | 'minCpu' | 'maxCpu' | 'minDisk' | 'maxDisk'>,
  config: { ram: number; cpu: number; disk: number },
): void {
  const check = (value: number, min: number, max: number, label: string) => {
    if (!Number.isInteger(value)) throw badRequest(`${label} must be a whole number.`, { [label.toLowerCase()]: 'Not a whole number.' });
    if (value < min) throw badRequest(`${label} must be at least ${min}.`, { [label.toLowerCase()]: `Minimum is ${min}.` });
    if (value > max) throw badRequest(`${label} must be at most ${max}.`, { [label.toLowerCase()]: `Maximum is ${max}.` });
  };
  check(config.ram, product.minRam, product.maxRam, 'Memory');
  check(config.cpu, product.minCpu, product.maxCpu, 'CPU');
  check(config.disk, product.minDisk, product.maxDisk, 'Storage');
}

export async function loadPrice(
  productId: string,
  period: BillingPeriod = 'MONTHLY',
): Promise<ProductPrice> {
  const price = await prisma.productPrice.findFirst({
    where: { productId, period, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!price) throw notFound('This product has no active price.');
  return price;
}

export async function loadOptions(
  productId: string,
  codes: string[],
): Promise<ProductOption[]> {
  if (!codes.length) return [];
  return prisma.productOption.findMany({
    where: { code: { in: codes }, active: true, OR: [{ productId }, { productId: null }] },
  });
}

export async function priceItems(
  items: { productSlug: string; ram: number; cpu: number; disk: number; optionCodes?: string[]; quantity?: number }[],
  period: BillingPeriod = 'MONTHLY',
): Promise<PricedItem[]> {
  const slugs = [...new Set(items.map((item) => item.productSlug))];
  const products = await prisma.product.findMany({ where: { slug: { in: slugs } } });
  const productBySlug = new Map(products.map((product) => [product.slug, product]));

  const priced: PricedItem[] = [];

  for (const item of items) {
    const product = productBySlug.get(item.productSlug);
    if (!product) throw notFound(`Unknown product: ${item.productSlug}`);
    // The same rule as the catalog: a product that the panel cannot build is
    // not orderable, whatever the flag of the catalog row says.
    const availability = deploymentAvailability(product);
    if (!availability.orderable) throw badRequest(unavailableMessage(product, availability));

    validateConfiguration(product, { ram: item.ram, cpu: item.cpu, disk: item.disk });

    const price = await loadPrice(product.id, period);
    const optionCodes = item.optionCodes ?? [];
    const options = await loadOptions(product.id, optionCodes);
    const found = new Set(options.map((option) => option.code));
    const missing = optionCodes.filter((code) => !found.has(code));
    if (missing.length) throw badRequest(`Unknown option: ${missing.join(', ')}`);

    const unitAmount = priceConfiguration(price, product, { ram: item.ram, cpu: item.cpu, disk: item.disk }, options);
    const quantity = Math.max(1, item.quantity ?? 1);
    priced.push({
      productId: product.id,
      productSlug: product.slug,
      name: product.name,
      ram: item.ram,
      cpu: item.cpu,
      disk: item.disk,
      optionCodes,
      quantity,
      unitAmount,
      total: unitAmount * quantity,
      currency: price.currency,
      price,
    });
  }

  return priced;
}

/**
 * How long an unpaid order keeps a promotion reserved. After that the
 * reservation is ignored, so an abandoned checkout cannot hold a campaign
 * hostage.
 */
export const PROMOTION_RESERVATION_MS = 48 * 60 * 60 * 1000;

/**
 * The redemptions that hold a campaign slot right now: the paid orders and
 * the reservations of the orders that are still awaiting payment and have not
 * expired yet.
 *
 * The rule lives here so the resolution of a code and the reservation of a
 * slot always count the same redemptions.
 */
function effectiveRedemptions(cutoff: Date): Prisma.PromotionRedemptionWhereInput {
  return {
    OR: [
      { order: { status: { in: ['PAID', 'FULFILLED'] } } },
      { order: { status: { in: ['PENDING', 'AWAITING_PAYMENT'] }, createdAt: { gte: cutoff } } },
    ],
  };
}

/**
 * Counts the redemptions that currently consume a campaign: the paid orders
 * and the reservations of orders that are still awaiting payment and have not
 * expired yet.
 */
export async function countEffectiveRedemptions(
  promotionId: string,
  userId?: string | null,
): Promise<number> {
  const cutoff = new Date(Date.now() - PROMOTION_RESERVATION_MS);
  return prisma.promotionRedemption.count({
    where: {
      promotionId,
      ...(userId ? { userId } : {}),
      ...effectiveRedemptions(cutoff),
    },
  });
}

export async function resolvePromotion(
  code: string | undefined | null,
  userId?: string | null,
): Promise<PromotionResult> {
  if (!code) return { code: '', valid: false, discount: 0 };
  const promotion = await prisma.promotion.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!promotion) return { code, valid: false, reason: 'This code is not valid.', discount: 0 };
  if (!promotion.active) return { code: promotion.code, valid: false, reason: 'This code is no longer active.', discount: 0 };
  if (promotion.startsAt && promotion.startsAt > new Date()) {
    return { code: promotion.code, valid: false, reason: 'This code is not active yet.', discount: 0 };
  }
  if (promotion.endsAt && promotion.endsAt < new Date()) {
    return { code: promotion.code, valid: false, reason: 'This code has expired.', discount: 0 };
  }
  if (promotion.maxRedemptions !== null) {
    const used = await countEffectiveRedemptions(promotion.id);
    if (used >= promotion.maxRedemptions) {
      return { code: promotion.code, valid: false, reason: 'This code has reached its redemption limit.', discount: 0 };
    }
  }
  if (promotion.maxPerUser !== null && userId) {
    const usedByUser = await countEffectiveRedemptions(promotion.id, userId);
    if (usedByUser >= promotion.maxPerUser) {
      return { code: promotion.code, valid: false, reason: 'This code has already been used on your account.', discount: 0 };
    }
  }
  return { code: promotion.code, valid: true, discount: 0 };
}

/**
 * Reserves a promotion for an order. The reservation is what holds the slot
 * while the customer pays; it becomes a redemption when the payment lands and
 * it is released when the order is cancelled.
 *
 * The reservation is atomic. The row of the campaign is locked for the
 * transaction, so two orders that arrive at the same moment are counted one
 * after the other: the second one sees the slot the first one took and is
 * refused when the limit is reached. Without the lock both would read the
 * same count and both would write, and the limit would be exceeded.
 */
export async function reservePromotion(params: {
  promotionId: string;
  userId: string;
  orderId: string;
  amount: number;
}): Promise<void> {
  const promotion = await prisma.promotion.findUnique({ where: { id: params.promotionId } });
  if (!promotion) throw badRequest('This code is not valid.');

  await prisma.$transaction(
    async (tx) => {
      // The lock of the campaign. Every reservation of this campaign waits
      // for it, so the count below and the write that follows cannot be
      // separated by another reservation of the same campaign.
      await tx.$queryRaw`SELECT "id" FROM "Promotion" WHERE "id" = ${params.promotionId} FOR UPDATE`;

      // The campaign is read again under the lock, so the limits that are
      // applied are the limits of the campaign as it is right now.
      const current = await tx.promotion.findUnique({ where: { id: params.promotionId } });
      if (!current) throw badRequest('This code is not valid.');

      const existing = await tx.promotionRedemption.findUnique({ where: { orderId: params.orderId } });
      if (existing) return;

      const cutoff = new Date(Date.now() - PROMOTION_RESERVATION_MS);

      if (current.maxRedemptions !== null) {
        const used = await tx.promotionRedemption.count({
          where: { promotionId: params.promotionId, ...effectiveRedemptions(cutoff) },
        });
        if (used >= current.maxRedemptions) {
          throw badRequest('This code has reached its redemption limit.');
        }
      }

      if (current.maxPerUser !== null) {
        const usedByUser = await tx.promotionRedemption.count({
          where: { promotionId: params.promotionId, userId: params.userId, ...effectiveRedemptions(cutoff) },
        });
        if (usedByUser >= current.maxPerUser) {
          throw badRequest('This code has already been used on your account.');
        }
      }

      await tx.promotionRedemption.create({
        data: {
          promotionId: params.promotionId,
          userId: params.userId,
          orderId: params.orderId,
          amount: params.amount,
        },
      });
    },
    { timeout: 15_000, maxWait: 15_000 },
  );
}

/** Releases the reservation of an order that will never be paid. */
export async function releasePromotionReservation(orderId: string): Promise<void> {
  await prisma.promotionRedemption.deleteMany({ where: { orderId } });
}

/**
 * The amount of a promotion: what it takes off an order.
 */
export interface PromotionAmount {
  type: 'PERCENT' | 'FIXED';
  value: number;
}

/**
 * The most a promotion may take off a single order.
 *
 * Every campaign carries a cap:
 *
 *   fixed    the amount the operator set for the campaign is its cap: that is
 *            what it takes off one order and the most it may ever take
 *   percent  the campaign has no absolute amount, so the server derives the
 *            safe bound: the subtotal of the order
 *
 * The subtotal is the outer bound of every campaign, so a promotion can
 * never take more than the order is worth and a total can never be negative.
 */
export function promotionCap(subtotal: number, promotion: PromotionAmount | null): number {
  if (!promotion) return 0;
  // What the order is worth.
  const bound = normalizeAmount(subtotal);
  if (promotion.type === 'FIXED') {
    // The cap of a fixed-amount campaign is the amount it was created with.
    return Math.min(bound, normalizeAmount(promotion.value));
  }
  return bound;
}

/**
 * Applies a promotion to a subtotal. Percentages and fixed amounts are both
 * expressed in minor units; a percentage is stored as basis points (1/100 of a
 * percent) so the whole calculation stays in integers.
 *
 * The discount is never bigger than the cap of the campaign and never bigger
 * than the subtotal, so the total of the order can never be negative.
 */
export function applyPromotion(subtotal: number, promotion: PromotionAmount | null): number {
  if (!promotion) return 0;
  const cap = promotionCap(subtotal, promotion);
  if (cap <= 0) return 0;
  if (promotion.type === 'PERCENT') {
    // value is in basis points: 1000 = 10%.
    return Math.min(cap, normalizeAmount((subtotal * promotion.value) / 10_000));
  }
  return Math.min(cap, normalizeAmount(promotion.value));
}

export interface QuoteResult {
  items: PricedItem[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  /**
   * The promotion of the quote.
   *
   * It is null when the customer did not type a code. A code that was typed
   * and is not valid comes back with the reason, so a screen never shows an
   * error for a field that was left empty.
   */
  promotion: { code: string; valid: boolean; reason?: string } | null;
  promotionRecord: { id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number } | null;
}

/**
 * Builds a server-side quote. This is the only place prices are calculated:
 * the client renders the result and never derives an amount itself.
 */
export async function buildQuote(
  items: { productSlug: string; ram: number; cpu: number; disk: number; optionCodes?: string[]; quantity?: number }[],
  promotionCode?: string | null,
  userId?: string | null,
  period: BillingPeriod = 'MONTHLY',
): Promise<QuoteResult> {
  const priced = await priceItems(items, period);
  const subtotal = priced.reduce((sum, item) => sum + item.total, 0);
  const currency = priced[0]?.currency ?? 'EUR';

  const resolved = await resolvePromotion(promotionCode, userId);
  let discount = 0;
  let promotionRecord: QuoteResult['promotionRecord'] = null;

  if (resolved.valid && resolved.code) {
    const record = await prisma.promotion.findUnique({ where: { code: resolved.code } });
    if (record) {
      discount = applyPromotion(subtotal, record);
      promotionRecord = { id: record.id, code: record.code, type: record.type, value: record.value };
    }
  }

  return {
    items: priced,
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount),
    currency,
    promotion: resolved.code
      ? { code: resolved.code, valid: resolved.valid, ...(resolved.reason ? { reason: resolved.reason } : {}) }
      : null,
    promotionRecord,
  };
}
