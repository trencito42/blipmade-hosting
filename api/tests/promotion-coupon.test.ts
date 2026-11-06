import { describe, expect, it } from 'vitest';
import {
  couponSpecFromOrderItems,
  promotionCouponSpec,
  refundDoesNotExtendCoupon,
  remainingRenewalsAfterFirst,
} from '../src/services/promotion-coupon.js';

describe('promotion Stripe coupon duration', () => {
  it('maps 1, 2 and 3 monthly billing periods to calendar months', () => {
    expect(promotionCouponSpec({ recurringPeriods: 1, period: 'MONTHLY' })).toMatchObject({ duration: 'repeating', duration_in_months: 1, periods: 1 });
    expect(promotionCouponSpec({ recurringPeriods: 2, period: 'MONTHLY' })).toMatchObject({ duration: 'repeating', duration_in_months: 2 });
    expect(promotionCouponSpec({ recurringPeriods: 3, period: 'MONTHLY' })).toMatchObject({ duration: 'repeating', duration_in_months: 3 });
    expect(remainingRenewalsAfterFirst(promotionCouponSpec({ recurringPeriods: 3, period: 'MONTHLY' }))).toBe(2);
  });

  it('maps one yearly billing period to 12 months', () => {
    expect(promotionCouponSpec({ recurringPeriods: 1, period: 'YEARLY' })).toMatchObject({ duration: 'repeating', duration_in_months: 12, months: 12 });
  });

  it('fails closed for yearly terms Stripe cannot represent and for mixed lines', () => {
    expect(() => promotionCouponSpec({ recurringPeriods: 2, period: 'YEARLY' })).toThrow(/24 calendar months/);
    expect(() => promotionCouponSpec({ recurringPeriods: 3, period: 'YEARLY' })).toThrow(/36 calendar months/);
    expect(() => promotionCouponSpec({ recurringPeriods: 2, period: 'WEEKLY' })).toThrow(/Only monthly and yearly/);
    expect(() => promotionCouponSpec({ recurringPeriods: 2, period: 'MONTHLY', itemPeriods: ['MONTHLY', 'YEARLY'] })).toThrow(/mix monthly and yearly/);
  });

  it('uses once when there are no discounted periods', () => {
    expect(promotionCouponSpec({ recurringPeriods: 0, period: 'MONTHLY' }).duration).toBe('once');
    expect(couponSpecFromOrderItems(null, [{ config: { period: 'YEARLY' } }]).duration).toBe('once');
  });

  it('does not extend the coupon after a refund of a discounted invoice', () => {
    expect(refundDoesNotExtendCoupon(2, 2)).toBe(true);
    expect(refundDoesNotExtendCoupon(3, 2)).toBe(false);
  });
});
