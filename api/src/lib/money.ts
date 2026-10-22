/**
 * All monetary values are integer minor units (EUR cents).
 * These helpers exist so no module ever does arithmetic on a float amount.
 */

export const DEFAULT_CURRENCY = 'EUR';

export function formatMoney(minor: number, currency = DEFAULT_CURRENCY, locale = 'en-IE'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

/** Clamps a computed amount to a non-negative integer number of minor units. */
export function normalizeAmount(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return Math.max(0, Math.round(minor));
}
