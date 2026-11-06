/**
 * Stripe repeating coupons last a number of calendar months.
 * Blipmade promotions discount billing periods: one yearly term is twelve months.
 * Stripe caps repeating coupons at 12 months. Arrangements that need more fail closed.
 */

import type { BillingPeriod } from '@prisma/client';
import { monthsOfPeriod, periodOfConfig } from './pricing.js';

export const STRIPE_MAX_COUPON_MONTHS = 12;

export type PromotionCouponSpec =
  | { duration: 'once'; duration_in_months?: undefined; months: 0; periods: 0; period: BillingPeriod }
  | { duration: 'repeating'; duration_in_months: number; months: number; periods: number; period: BillingPeriod };

export function promotionCouponSpec(input: {
  recurringPeriods: number | null | undefined;
  period: BillingPeriod | string;
  itemPeriods?: Array<BillingPeriod | string>;
}): PromotionCouponSpec {
  const unique = new Set((input.itemPeriods ?? [input.period]).map((row) => (row === 'YEARLY' ? 'YEARLY' : row === 'MONTHLY' ? 'MONTHLY' : null)));
  if (unique.has(null)) throw new Error('Only monthly and yearly terms can carry a repeating promotion.');
  if (unique.size > 1) throw new Error('A repeating promotion cannot mix monthly and yearly lines.');
  const period: BillingPeriod = unique.has('YEARLY') ? 'YEARLY' : 'MONTHLY';
  const periods = input.recurringPeriods && input.recurringPeriods > 0 ? input.recurringPeriods : 0;
  if (periods === 0) return { duration: 'once', months: 0, periods: 0, period };
  if (!Number.isInteger(periods) || periods < 1) throw new Error('Discounted billing periods must be a whole number of 1 or more.');
  const months = periods * monthsOfPeriod(period);
  if (months > STRIPE_MAX_COUPON_MONTHS) {
    throw new Error(
      `${periods} ${period === 'YEARLY' ? 'yearly' : 'monthly'} billing period(s) need ${months} calendar months. Stripe repeating coupons last at most ${STRIPE_MAX_COUPON_MONTHS} months.`,
    );
  }
  return { duration: 'repeating', duration_in_months: months, months, periods, period };
}

export function couponSpecFromOrderItems(
  recurringPeriods: number | null | undefined,
  items: Array<{ config?: unknown }>,
): PromotionCouponSpec {
  if (!items.length) throw new Error('A sponsored subscription needs at least one order line.');
  return promotionCouponSpec({
    recurringPeriods,
    period: periodOfConfig(items[0]?.config),
    itemPeriods: items.map((item) => periodOfConfig(item.config)),
  });
}

/** Remaining discounted invoices after the first (coupon-covered) invoice. */
export function remainingRenewalsAfterFirst(spec: PromotionCouponSpec): number {
  if (spec.duration === 'once') return 0;
  return Math.max(0, spec.periods - 1);
}

/** A refund of a discounted invoice does not extend the coupon. Remaining periods stay as Stripe recorded them. */
export function refundDoesNotExtendCoupon(remainingAfterRefund: number, remainingBeforeRefund: number): boolean {
  return remainingAfterRefund === remainingBeforeRefund;
}
