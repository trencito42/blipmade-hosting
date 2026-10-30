/**
 * The summary of what an account pays.
 *
 * Everything the customer subscribes to has a subscription: a server, a plan of
 * mail, a VPS. The monthly total is therefore made from the subscriptions, not
 * from the servers only. The rules are written here, apart from the route, so
 * they can be tested without a database.
 *
 * - A subscription that renews counts: it is active, in trial or past due (the
 *   amount is still owed), and it is not set to end with its period.
 * - A period that is not a month is brought to a month: a year is a twelfth a
 *   month. A period whose dates are not known is taken as a month.
 * - Amounts in different currencies are never added together. The summary
 *   carries one total for each currency, and `currency` names the one that holds
 *   the most.
 * - The next renewal is the nearest end of a period that is still to come, among
 *   the subscriptions that renew and cost something. It is not the latest end.
 * - A server is counted by the price of the service, which is the price of its
 *   configuration and is kept right by the reconciliation of the prices. The
 *   subscription of a server only says that the server renews. A plan of mail and a VPS
 *   have no such price, so their subscription is what is counted.
 * - A server that has no subscription of its own is counted by its price as well, so an
 *   account whose servers predate the subscriptions is not shown as paying nothing.
 */

export interface SummarySubscription {
  id: string;
  status: string;
  amount: number;
  currency: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  instanceId: string | null;
}

export interface SummaryInstance {
  id: string;
  price: number;
  currency: string;
  cancelledAt: Date | null;
}

export interface BillingSummary {
  /** The currency that holds the largest monthly total. */
  currency: string;
  /** The monthly total in `currency`, in cents. */
  monthlyEstimate: number;
  /** One monthly total for each currency. */
  monthlyByCurrency: { currency: string; amount: number }[];
  /** The nearest end of a period that is still to come, among the subscriptions that renew, whatever they cost. */
  nextPeriodEnd: Date | null;
  /** The nearest renewal that costs something, or nothing when there is none. */
  nextRenewal: { at: Date; amount: number; currency: string; subscriptionId: string } | null;
}

const RENEWING_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);
const DAY_MS = 24 * 60 * 60 * 1000;

/** How many months a period covers: 12 for a year, 1 for a month, and 1 when the dates are not known. */
export function monthsInPeriod(start: Date | null, end: Date | null): number {
  if (!start || !end) return 1;
  const days = (end.getTime() - start.getTime()) / DAY_MS;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.max(1, Math.round(days / 30.44));
}

/** True when the subscription goes on to charge again after its period. */
export function renews(subscription: Pick<SummarySubscription, 'status' | 'cancelAtPeriodEnd'>): boolean {
  return RENEWING_STATUSES.has(subscription.status) && !subscription.cancelAtPeriodEnd;
}

export function summarizeBilling(
  subscriptions: SummarySubscription[],
  instances: SummaryInstance[],
  now: Date = new Date(),
  fallbackCurrency = 'EUR',
): BillingSummary {
  const totals = new Map<string, number>();
  const add = (currency: string, amount: number) => totals.set(currency, (totals.get(currency) ?? 0) + amount);

  const withSubscription = new Set(subscriptions.map((subscription) => subscription.instanceId).filter(Boolean));
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));

  let nextRenewal: BillingSummary['nextRenewal'] = null;
  let nextPeriodEnd: Date | null = null;
  for (const subscription of subscriptions) {
    if (!renews(subscription)) continue;
    const service = subscription.instanceId ? instanceById.get(subscription.instanceId) : undefined;
    if (service) {
      // The price of a service is already a price of a month.
      add(service.currency, service.price);
    } else {
      const months = monthsInPeriod(subscription.currentPeriodStart, subscription.currentPeriodEnd);
      add(subscription.currency, Math.round(subscription.amount / months));
    }

    const end = subscription.currentPeriodEnd;
    if (end && end.getTime() >= now.getTime() && (!nextPeriodEnd || end.getTime() < nextPeriodEnd.getTime())) nextPeriodEnd = end;
    if (end && end.getTime() >= now.getTime() && subscription.amount > 0) {
      if (!nextRenewal || end.getTime() < nextRenewal.at.getTime()) {
        nextRenewal = { at: end, amount: subscription.amount, currency: subscription.currency, subscriptionId: subscription.id };
      }
    }
  }

  for (const instance of instances) {
    if (instance.cancelledAt || withSubscription.has(instance.id) || instance.price <= 0) continue;
    add(instance.currency, instance.price);
  }

  const monthlyByCurrency = [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
  const primary = monthlyByCurrency[0];

  return {
    currency: primary?.currency ?? fallbackCurrency,
    monthlyEstimate: primary?.amount ?? 0,
    monthlyByCurrency,
    nextPeriodEnd,
    nextRenewal,
  };
}
