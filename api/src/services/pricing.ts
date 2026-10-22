import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { normalizeAmount } from '../lib/money.js';
import type { BillingPeriod, Product, ProductOption, ProductPrice } from '@prisma/client';

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
  price: ProductPrice,
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
    if (!product.deployable) throw badRequest(`${product.name} is not available to order yet.`);

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
      OR: [
        { order: { status: { in: ['PAID', 'FULFILLED'] } } },
        { order: { status: { in: ['PENDING', 'AWAITING_PAYMENT'] }, createdAt: { gte: cutoff } } },
      ],
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
 */
export async function reservePromotion(params: {
  promotionId: string;
  userId: string;
  orderId: string;
  amount: number;
}): Promise<void> {
  const promotion = await prisma.promotion.findUnique({ where: { id: params.promotionId } });
  if (!promotion) throw badRequest('This code is not valid.');

  await prisma.$transaction(async (tx) => {
    const existing = await tx.promotionRedemption.findUnique({ where: { orderId: params.orderId } });
    if (existing) return;

    if (promotion.maxRedemptions !== null) {
      const cutoff = new Date(Date.now() - PROMOTION_RESERVATION_MS);
      const used = await tx.promotionRedemption.count({
        where: {
          promotionId: params.promotionId,
          OR: [
            { order: { status: { in: ['PAID', 'FULFILLED'] } } },
            { order: { status: { in: ['PENDING', 'AWAITING_PAYMENT'] }, createdAt: { gte: cutoff } } },
          ],
        },
      });
      if (used >= promotion.maxRedemptions) {
        throw badRequest('This code has reached its redemption limit.');
      }
    }

    if (promotion.maxPerUser !== null) {
      const cutoff = new Date(Date.now() - PROMOTION_RESERVATION_MS);
      const usedByUser = await tx.promotionRedemption.count({
        where: {
          promotionId: params.promotionId,
          userId: params.userId,
          OR: [
            { order: { status: { in: ['PAID', 'FULFILLED'] } } },
            { order: { status: { in: ['PENDING', 'AWAITING_PAYMENT'] }, createdAt: { gte: cutoff } } },
          ],
        },
      });
      if (usedByUser >= promotion.maxPerUser) {
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
  });
}

/** Releases the reservation of an order that will never be paid. */
export async function releasePromotionReservation(orderId: string): Promise<void> {
  await prisma.promotionRedemption.deleteMany({ where: { orderId } });
}

/**
 * Applies a promotion to a subtotal. Percentages and fixed amounts are both
 * expressed in minor units; a percentage is stored as basis points (1/100 of a
 * percent) so the whole calculation stays in integers.
 */
export function applyPromotion(
  subtotal: number,
  promotion: { type: 'PERCENT' | 'FIXED'; value: number } | null,
): number {
  if (!promotion) return 0;
  if (promotion.type === 'PERCENT') {
    // value is in basis points: 1000 = 10%.
    return Math.min(subtotal, normalizeAmount((subtotal * promotion.value) / 10_000));
  }
  return Math.min(subtotal, normalizeAmount(promotion.value));
}

export interface QuoteResult {
  items: PricedItem[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  promotion: { code: string; valid: boolean; reason?: string };
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
): Promise<QuoteResult> {
  const priced = await priceItems(items);
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
    promotion: { code: resolved.code, valid: resolved.valid, ...(resolved.reason ? { reason: resolved.reason } : {}) },
    promotionRecord,
  };
}
