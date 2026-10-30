import { freeDedicatedAddress, validSshKey, validVpsName } from './vps.js';
import { randomToken } from '../lib/tokens.js';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { normalizeAmount } from '../lib/money.js';

import {
  breakdownOfResources,
  DEFAULT_RESOURCE_RATES,
  exactPrice,
  PRICE_DENOMINATOR,
  priceOfResources,
  RAM_UNIT_MB,
  CPU_UNIT,
  type ResourceBreakdown,
  type ResourceRates,
} from '../lib/resource-pricing.js';
import { deploymentAvailability, unavailableMessage } from './availability.js';
import { assertValidMailDomain } from './mail.js';
import { checkCustomerVariables, parseCustomerVariableSpecs, sealVariables } from './instance-credentials.js';
import type { BillingPeriod, Prisma, Product, ProductFulfilment, ProductOption, ProductPrice } from '@prisma/client';

export interface ResourceConfig {
  ram: number;
  cpu: number;
  disk: number;
  optionCodes: string[];
}

/**
 * A line of an order, as the customer asks for it.
 *
 * A line of servers carries the resources it wants. A line of mail carries
 * the domain it wants and no resources at all: the plan of the line is the
 * configuration of the line. The two are told apart by the product, not by
 * the customer: the platform decides what a line means.
 */
export interface OrderLineInput {
  productSlug: string;
  ram?: number;
  cpu?: number;
  disk?: number;
  optionCodes?: string[];
  quantity?: number;
  /** The domain of mail the line brings. */
  mailDomain?: string;
  /** The values of the variables the product asks the customer for. */
  variables?: Record<string, string>;
  /** The public key and the name of a virtual private server. */
  sshPublicKey?: string;
  vpsName?: string;
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
  /** What the platform delivers for this line. */
  fulfilment: ProductFulfilment;
  /** The domain of mail the line brings, when the line is a line of mail. */
  mailDomain?: string;
  /** The name and the key of a virtual private server, when the line is one. */
  vps?: { name: string; sshPublicKey: string; dedicatedIp: boolean };
  /** The values the customer gave for the variables of the product, sealed. */
  sealedVariables?: string;
  /**
   * The price of the line, broken down into what it is made of.
   *
   * It is there for the lines of servers: a line of mail is a plan, and the
   * plan is not broken into resources. The parts add up to the price of the
   * line, so the customer sees a breakdown that adds up.
   */
  breakdown?: ResourceBreakdown;
}

export interface PromotionResult {
  code: string;
  valid: boolean;
  reason?: string;
  discount: number;
}

/**
 * All prices are integer minor units. The rate card of the platform is:
 *
 *   baseFee      for the instance itself, whatever it holds
 * + ramPerGb  * gigabytes of memory
 * + cpuPerUnit * vCPU
 * + diskPerGb * gigabytes of storage
 *
 * and nothing else. The same resources cost the same in every product, in
 * every category and for every egg: a customer who took the cheapest entry of
 * the catalog and put something else in it would pay for the resources they
 * really use.
 *
 * A **plan of mail** is priced differently: a plan is a subscription of a
 * service, and the plan itself is what the customer buys, so it keeps its own
 * base price.
 */
export function priceConfiguration(
  price: Pick<ProductPrice, 'baseAmount' | 'ramPerGb' | 'cpuPerUnit' | 'diskPerGb'>,
  product: { minRam: number; minCpu: number; minDisk: number; fulfilment: string },
  config: { ram: number; cpu: number; disk: number },
  options: ProductOption[] = [],
  rates: ResourceRates = DEFAULT_RESOURCE_RATES,
  period: BillingPeriod = 'MONTHLY',
): number {
  const addons = options.reduce((sum, option) => sum + option.amount, 0);

  // A plan of mail is a subscription of a service: the plan is what the
  // customer buys, and the resources of the plan are part of it.
  if (product.fulfilment === 'EMAIL' || product.fulfilment === 'VPS') {
    const extraRamGb = Math.max(0, (config.ram - product.minRam) / 1024);
    return normalizeAmount(
      price.baseAmount +
        normalizeAmount(extraRamGb * price.ramPerGb) +
        normalizeAmount(Math.max(0, config.cpu - product.minCpu) * price.cpuPerUnit) +
        normalizeAmount(Math.max(0, config.disk - product.minDisk) * price.diskPerGb) +
        addons,
    );
  }

  // The card of the resources is the price of a month. A year is twelve
  // months of that card, and the options of the configuration are added
  // once, as they are part of the configuration and not of the month.
  return normalizeAmount(
    normalizeAmount(priceOfResources(config, rates) * monthsOfPeriod(period)) + addons,
  );
}

/**
 * The number of months a period of billing covers.
 *
 * The card of the resources is the price of a month. A year covers twelve
 * months, so the price of a year is the price of the twelve months of the
 * same card.
 */
export function monthsOfPeriod(period: BillingPeriod): number {
  return period === 'YEARLY' ? 12 : 1;
}

/**
 * The breakdown of a configuration for the period it was priced for.
 *
 * The card of the resources is the price of a month, so a year is twelve
 * months of the same breakdown. The add-ons are priced once and they are not
 * multiplied.
 */
export function breakdownForPeriod(
  config: { ram: number; cpu: number; disk: number },
  rates: ResourceRates,
  period: BillingPeriod,
  optionsAmount = 0,
): ResourceBreakdown {
  const months = monthsOfPeriod(period);
  const monthly = breakdownOfResources(config, rates);
  return {
    ram: monthly.ram * months,
    cpu: monthly.cpu * months,
    disk: monthly.disk * months,
    base: monthly.base * months,
    options: optionsAmount,
    total: monthly.total * months + optionsAmount,
  };
}


/** The setting where the rate card of the platform is kept. */
export const RESOURCE_RATES_KEY = 'pricing_resources';

// The arithmetic of the price lives in its own module, so the site of the platform can
// read it without a database. It is exported from here as well, because this is
// the module every other part of the server imports.
export {
  breakdownOfResources,
  DEFAULT_RESOURCE_RATES,
  exactPrice,
  PRICE_DENOMINATOR,
  priceOfResources,
  RAM_UNIT_MB,
  CPU_UNIT,
};
export type { ResourceBreakdown, ResourceRates };

/** How long the rate card is kept in memory. */
const RATES_CACHE_MS = 30_000;

let cachedRates: { rates: ResourceRates; at: number } | null = null;

/**
 * The rate card of the platform.
 *
 * The card is one card for every product, and it lives in the settings so
 * that the operator can change it in one place. A card that is not readable
 * is replaced by the default one: the platform never refuses to price
 * because of a setting that is wrong.
 */
export async function resourceRates(): Promise<ResourceRates> {
  if (cachedRates && Date.now() - cachedRates.at < RATES_CACHE_MS) return cachedRates.rates;
  let rates = DEFAULT_RESOURCE_RATES;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: RESOURCE_RATES_KEY } });
    const value = setting?.value as Record<string, unknown> | undefined;
    if (value && typeof value === 'object') {
      const read = (name: keyof ResourceRates, fallback: number): number => {
        const raw = value[name];
        return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : fallback;
      };
      rates = {
        ramPerGb: read('ramPerGb', DEFAULT_RESOURCE_RATES.ramPerGb),
        cpuPerUnit: read('cpuPerUnit', DEFAULT_RESOURCE_RATES.cpuPerUnit),
        diskPerGb: read('diskPerGb', DEFAULT_RESOURCE_RATES.diskPerGb),
        baseFee: read('baseFee', DEFAULT_RESOURCE_RATES.baseFee),
      };
    }
  } catch {
    rates = DEFAULT_RESOURCE_RATES;
  }
  cachedRates = { rates, at: Date.now() };
  return rates;
}

/**
 * Writes the rate card of the platform.
 *
 * The card of every product of a server is written with it, so the rows of the
 * prices show the card that is really used.
 */
export async function saveResourceRates(rates: ResourceRates): Promise<ResourceRates> {
  const value: ResourceRates = {
    ramPerGb: Math.max(0, Math.trunc(rates.ramPerGb)),
    cpuPerUnit: Math.max(0, Math.trunc(rates.cpuPerUnit)),
    diskPerGb: Math.max(0, Math.trunc(rates.diskPerGb)),
    baseFee: Math.max(0, Math.trunc(rates.baseFee)),
  };
  const document = {
    ramPerGb: value.ramPerGb,
    cpuPerUnit: value.cpuPerUnit,
    diskPerGb: value.diskPerGb,
    baseFee: value.baseFee,
  };
  await prisma.setting.upsert({
    where: { key: RESOURCE_RATES_KEY },
    create: { key: RESOURCE_RATES_KEY, value: document },
    update: { value: document },
  });
  await prisma.productPrice.updateMany({
    where: { product: { fulfilment: 'SERVER' } },
    data: { ramPerGb: value.ramPerGb, cpuPerUnit: value.cpuPerUnit, diskPerGb: value.diskPerGb },
  });
  cachedRates = { rates: value, at: Date.now() };
  return value;
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
  product: {
    minRam: number;
    minCpu: number;
    minDisk: number;
    defaultRam: number;
    defaultCpu: number;
    defaultDisk: number;
    maxRam: number;
    maxCpu: number;
    maxDisk: number;
    fulfilment: string;
  },
  price: Pick<ProductPrice, 'baseAmount' | 'ramPerGb' | 'cpuPerUnit' | 'diskPerGb' | 'currency' | 'period'>,
  rates: ResourceRates = DEFAULT_RESOURCE_RATES,
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
    minimum: { ...minimum, amount: priceConfiguration(price, product, minimum, [], rates) },
    recommended: { ...recommended, amount: priceConfiguration(price, product, recommended, [], rates) },
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
  check(config.disk, product.minDisk, product.maxDisk, 'Storage');

  // The processor is a share of a processor, and a share may be a half. The
  // memory is counted in megabytes and the storage in gigabytes, so both are
  // whole numbers; the processor is in hundredths, and the step of the
  // selector is a half.
  const parts = Math.round(config.cpu * CPU_UNIT);
  if (parts % 50 !== 0) {
    throw badRequest('CPU must be a whole or a half vCPU.', { cpu: 'Use a whole or a half vCPU.' });
  }
  if (config.cpu < product.minCpu) {
    throw badRequest(`CPU must be at least ${product.minCpu}.`, { cpu: `Minimum is ${product.minCpu}.` });
  }
  if (config.cpu > product.maxCpu) {
    throw badRequest(`CPU must be at most ${product.maxCpu}.`, { cpu: `Maximum is ${product.maxCpu}.` });
  }
}

/**
 * The price row that prices an order for a period.
 *
 * The catalog and the order have to answer with the same row, or the price
 * that was shown to the customer is not the price that is charged. The newest
 * active row of the period wins. When the product has no active price for
 * the period, the newest active row of any period is used, so the catalog
 * can still show a price.
 */
export function priceRowFor<
  T extends { id: string; period: string; active: boolean; createdAt: Date },
>(prices: T[], period: BillingPeriod = 'MONTHLY'): T | undefined {
  const active = prices
    .filter((price) => price.active)
    .sort((a, b) => {
      const byDate = b.createdAt.getTime() - a.createdAt.getTime();
      if (byDate !== 0) return byDate;
      // Two rows with the same date: the identifier breaks the tie, the same
      // way on both sides, so the catalog and the order cannot disagree.
      return a.id.localeCompare(b.id);
    });
  return active.find((price) => price.period === period) ?? active[0];
}

export async function loadPrice(
  productId: string,
  period: BillingPeriod = 'MONTHLY',
): Promise<ProductPrice> {
  const price = await prisma.productPrice.findFirst({
    where: { productId, period, active: true },
    // The same order as the catalog: the newest row, and the identifier
    // breaks the tie between two rows with the same date.
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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
  items: OrderLineInput[],
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
    // not orderable, whatever the flag of the catalog row says. A product of
    // mail needs no panel, but it needs the sale of the mail to be open.
    const availability = deploymentAvailability(product, { emailSalesEnabled: env.MAIL_SALES_ENABLED });
    if (!availability.orderable) throw badRequest(unavailableMessage(product, availability));

    // A line of mail has no resources: the plan of the line is the whole
    // configuration, so the price of the line is the price of the plan.
    // A line of servers has to fit the limits of its product.
    const isMail = product.fulfilment === 'EMAIL';
    // A virtual private server is a plan with fixed resources, like a plan of mail.
    const isVps = product.fulfilment === 'VPS';
    const config = isMail || isVps
      ? { ram: product.minRam, cpu: product.minCpu, disk: product.minDisk }
      : { ram: item.ram ?? product.minRam, cpu: item.cpu ?? product.minCpu, disk: item.disk ?? product.minDisk };
    if (!isMail && !isVps) validateConfiguration(product, config);

    // A line of a VPS carries the key that opens it and the name it will have. Both are
    // checked here, where the price is made, so a paid order never fails for a bad key.
    let vps: PricedItem['vps'];
    if (isVps) {
      const dedicatedIp = (item.optionCodes ?? []).includes('dedicated-ipv4');
      if (dedicatedIp && !(await freeDedicatedAddress())) {
        throw badRequest('No dedicated address is free right now. Use the shared address, or ask us for one.');
      }
      vps = {
        sshPublicKey: validSshKey(item.sshPublicKey),
        name: validVpsName(item.vpsName, `server-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`),
        dedicatedIp,
      };
    }

    // A line of mail names the domain it brings. The domain is checked here,
    // in the place that prices the order, so a line of mail cannot be created
    // with a domain that the platform would refuse later.
    let mailDomain: string | undefined;
    if (isMail) {
      if (!item.mailDomain) {
        throw badRequest('Enter the domain you want to use for hosted mail.', { mailDomain: 'Enter a domain.' });
      }
      mailDomain = assertValidMailDomain(item.mailDomain);
    }

    // The values the customer gives for the variables of the product are
    // checked here, in the place that prices the line, and they are sealed
    // before they are written anywhere: they are the secrets of the customer.
    const specs = parseCustomerVariableSpecs(product.customerVariables);
    const accepted = checkCustomerVariables(specs, item.variables);
    const sealedVariables = Object.keys(accepted).length > 0 ? sealVariables(accepted) : undefined;

    const price = await loadPrice(product.id, period);
    const optionCodes = item.optionCodes ?? [];
    const options = await loadOptions(product.id, optionCodes);
    const found = new Set(options.map((option) => option.code));
    const missing = optionCodes.filter((code) => !found.has(code));
    if (missing.length) throw badRequest(`Unknown option: ${missing.join(', ')}`);

    const rates = await resourceRates();
    const unitAmount = priceConfiguration(price, product, config, options, rates, period);
    const quantity = isVps ? 1 : Math.max(1, item.quantity ?? 1);
    // The line of a server is broken down into what it is made of, so the
    // customer sees the price of the memory, of the processor, of the storage
    // and of the instance itself. The parts add up to the price of the line.
    const breakdown = isMail || isVps
      ? undefined
      : breakdownForPeriod(
          config,
          rates,
          period,
          options.reduce((sum, option) => sum + option.amount, 0),
        );
    priced.push({
      productId: product.id,
      productSlug: product.slug,
      name: product.name,
      sealedVariables,
      ram: config.ram,
      cpu: config.cpu,
      disk: config.disk,
      optionCodes,
      quantity,
      unitAmount,
      total: unitAmount * quantity,
      currency: price.currency,
      price,
      fulfilment: product.fulfilment,
      mailDomain,
      ...(vps ? { vps } : {}),
      ...(breakdown ? { breakdown } : {}),
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
/**
 * The risk of a campaign, in words an operator can act on.
 *
 * A campaign with a total limit but without a limit per account can be used
 * by the same account as often as the total limit allows. The limit is
 * enforced when it is set — this is not a hole in the platform — but the risk
 * has to be visible to the operator who manages the campaigns, because a
 * campaign that gives the whole order away is worth a lot of money.
 */
export function promotionRisk(promotion: {
  type: string;
  value: number;
  maxRedemptions: number | null;
  maxPerUser: number | null;
}): string | null {
  const givesEverything = promotion.type === 'PERCENT' && promotion.value >= 10_000;
  if (promotion.maxPerUser === null && promotion.maxRedemptions !== null) {
    return givesEverything
      ? 'This campaign gives the whole order away and has no limit per account, so the same account can use it as often as the total limit allows.'
      : 'This campaign has no limit per account, so the same account can use it as often as the total limit allows.';
  }
  if (givesEverything && promotion.maxPerUser === null) {
    return 'This campaign gives the whole order away and has no limit per account.';
  }
  return null;
}

/**
 * The limit per account a campaign gets when the operator did not say.
 *
 * A campaign that takes the whole order away gets a limit of one use per
 * account, because a campaign that a customer can use again and again is
 * never what an operator means when the discount is a hundred percent. The
 * operator can still ask for another number, and a campaign that takes
 * something off the order keeps the limit it was given.
 */
export function defaultLimitPerUser(promotion: { type: string; value: number; maxPerUser?: number | null }): number | null {
  // A limit the operator asked for is kept, and so is the explicit decision
  // that there is no limit at all: only a campaign that says nothing about
  // the limit gets the default.
  if (promotion.maxPerUser !== undefined) return promotion.maxPerUser;
  const givesEverything = promotion.type === 'PERCENT' && promotion.value >= 10_000;
  return givesEverything ? 1 : null;
}

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
  items: OrderLineInput[],
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
