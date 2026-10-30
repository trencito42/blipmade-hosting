import { describe, expect, it } from 'vitest';
import { monthsInPeriod, renews, summarizeBilling, type SummarySubscription } from '../src/lib/billing-summary.js';

const NOW = new Date('2026-11-01T00:00:00Z');
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000);

function subscription(overrides: Partial<SummarySubscription> = {}): SummarySubscription {
  return {
    id: 'sub',
    status: 'ACTIVE',
    amount: 299,
    currency: 'EUR',
    currentPeriodStart: day(-10),
    currentPeriodEnd: day(20),
    cancelAtPeriodEnd: false,
    instanceId: null,
    ...overrides,
  };
}

describe('the months of a period', () => {
  it('counts a month, a year, and a period that has no dates as one month', () => {
    expect(monthsInPeriod(day(0), day(30))).toBe(1);
    expect(monthsInPeriod(day(0), day(365))).toBe(12);
    expect(monthsInPeriod(null, day(30))).toBe(1);
    expect(monthsInPeriod(day(10), day(0))).toBe(1);
  });
});

describe('which subscriptions renew', () => {
  it('renews while it is active, in trial or past due, and not set to end', () => {
    expect(renews({ status: 'ACTIVE', cancelAtPeriodEnd: false })).toBe(true);
    expect(renews({ status: 'TRIALING', cancelAtPeriodEnd: false })).toBe(true);
    expect(renews({ status: 'PAST_DUE', cancelAtPeriodEnd: false })).toBe(true);
    expect(renews({ status: 'ACTIVE', cancelAtPeriodEnd: true })).toBe(false);
    expect(renews({ status: 'CANCELLED', cancelAtPeriodEnd: false })).toBe(false);
    expect(renews({ status: 'INCOMPLETE', cancelAtPeriodEnd: false })).toBe(false);
  });
});

describe('the monthly total of an account', () => {
  it('counts a plan of mail that has no server', () => {
    const summary = summarizeBilling([subscription({ amount: 299 })], [], NOW);
    expect(summary.monthlyEstimate).toBe(299);
    expect(summary.currency).toBe('EUR');
  });

  it('adds servers, mail and a VPS together', () => {
    const summary = summarizeBilling(
      [
        subscription({ id: 'a', instanceId: 'i1', amount: 249 }),
        subscription({ id: 'b', amount: 299 }),
        subscription({ id: 'c', amount: 1199 }),
      ],
      [{ id: 'i1', price: 249, currency: 'EUR', cancelledAt: null }],
      NOW,
    );
    // The server is counted once: by its subscription, not again by its price.
    expect(summary.monthlyEstimate).toBe(249 + 299 + 1199);
  });

  it('counts a server by the price of the service, not by what its subscription says', () => {
    const summary = summarizeBilling(
      [subscription({ id: 'a', instanceId: 'i1', amount: 149 })],
      [{ id: 'i1', price: 699, currency: 'EUR', cancelledAt: null }],
      NOW,
    );
    expect(summary.monthlyEstimate).toBe(699);
  });

  it('counts a server that has no subscription by its price', () => {
    const summary = summarizeBilling([], [{ id: 'i1', price: 500, currency: 'EUR', cancelledAt: null }], NOW);
    expect(summary.monthlyEstimate).toBe(500);
  });

  it('does not count a cancelled server or one set to end with its period', () => {
    const summary = summarizeBilling(
      [subscription({ id: 'a', instanceId: 'i1', cancelAtPeriodEnd: true }), subscription({ id: 'b', status: 'CANCELLED' })],
      [{ id: 'i2', price: 400, currency: 'EUR', cancelledAt: day(-1) }],
      NOW,
    );
    expect(summary.monthlyEstimate).toBe(0);
  });

  it('represents a free plan as nothing to pay', () => {
    const summary = summarizeBilling([subscription({ amount: 0 })], [], NOW);
    expect(summary.monthlyEstimate).toBe(0);
    // Nothing is charged, so there is no renewal to pay, but the term still ends on a day.
    expect(summary.nextRenewal).toBeNull();
    expect(summary.nextPeriodEnd).toEqual(day(20));
  });

  it('brings a year to a month and does not treat it as a monthly charge', () => {
    const summary = summarizeBilling(
      [subscription({ amount: 12000, currentPeriodStart: day(-100), currentPeriodEnd: day(265) })],
      [],
      NOW,
    );
    expect(summary.monthlyEstimate).toBe(1000);
  });

  it('never adds amounts in different currencies', () => {
    const summary = summarizeBilling([subscription({ id: 'a', amount: 500, currency: 'EUR' }), subscription({ id: 'b', amount: 900, currency: 'USD' })], [], NOW);
    expect(summary.monthlyByCurrency).toEqual([
      { currency: 'USD', amount: 900 },
      { currency: 'EUR', amount: 500 },
    ]);
    expect(summary.currency).toBe('USD');
    expect(summary.monthlyEstimate).toBe(900);
  });

  it('keeps a payment that is past due in the total, because it is still owed', () => {
    expect(summarizeBilling([subscription({ status: 'PAST_DUE', amount: 700 })], [], NOW).monthlyEstimate).toBe(700);
  });
});

describe('the next renewal', () => {
  it('is the nearest end that is still to come, not the latest', () => {
    const summary = summarizeBilling(
      [
        subscription({ id: 'far', currentPeriodEnd: day(300) }),
        subscription({ id: 'near', currentPeriodEnd: day(5) }),
        subscription({ id: 'past', currentPeriodEnd: day(-3) }),
      ],
      [],
      NOW,
    );
    expect(summary.nextRenewal?.subscriptionId).toBe('near');
    expect(summary.nextRenewal?.at).toEqual(day(5));
    expect(summary.nextPeriodEnd).toEqual(day(5));
  });

  it('ignores a subscription that ends with its period', () => {
    const summary = summarizeBilling(
      [subscription({ id: 'ending', currentPeriodEnd: day(2), cancelAtPeriodEnd: true }), subscription({ id: 'next', currentPeriodEnd: day(9) })],
      [],
      NOW,
    );
    expect(summary.nextRenewal?.subscriptionId).toBe('next');
  });

  it('is nothing when no subscription renews', () => {
    expect(summarizeBilling([], [], NOW).nextRenewal).toBeNull();
    expect(summarizeBilling([subscription({ status: 'CANCELLED' })], [], NOW).nextRenewal).toBeNull();
  });
});
