/**
 * Vendor-independent domain registration contracts.
 * No live registrar is called. Fixture prices are not sellable terms.
 */

export type DomainCommerceAction = 'register' | 'renew' | 'transfer';
export type DomainCommerceState = 'available' | 'taken' | 'unsupported' | 'disabled';

export const QUOTE_TTL_MS = 15 * 60_000;

export interface DomainOffer {
  domain: string;
  tld: string;
  state: DomainCommerceState;
  action: DomainCommerceAction;
  amount: number | null;
  currency: 'EUR';
  note: string;
  quotedAt: string;
  expiresAt: string;
}

export interface DomainCommerceProvider {
  id: string;
  label: string;
  lookup(domain: string): Promise<DomainOffer>;
}

const FIXTURE: Record<string, { state: DomainCommerceState; amount: number | null; note: string }> = {
  'available.example': { state: 'available', amount: 1299, note: 'Fixture only. Not a real registrar quote.' },
  'taken.example': { state: 'taken', amount: null, note: 'Fixture only. This name is treated as registered.' },
};

function quoteTimes(now = Date.now()): { quotedAt: string; expiresAt: string } {
  return { quotedAt: new Date(now).toISOString(), expiresAt: new Date(now + QUOTE_TTL_MS).toISOString() };
}

function split(domain: string): { domain: string; tld: string } | null {
  const trimmed = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9][a-z0-9.-]{0,250}\.[a-z]{2,24}$/.test(trimmed)) return null;
  const tld = trimmed.slice(trimmed.lastIndexOf('.') + 1);
  return { domain: trimmed, tld };
}

export const fixtureProvider: DomainCommerceProvider = {
  id: 'fixture',
  label: 'Deterministic fixture (not a reseller)',
  async lookup(raw) {
    const parsed = split(raw);
    if (!parsed) {
      return {
        domain: raw,
        tld: '',
        state: 'unsupported',
        action: 'register',
        amount: null,
        currency: 'EUR',
        note: 'That is not a domain name this contract can look up.',
        ...quoteTimes(),
      };
    }
    const hit = FIXTURE[parsed.domain];
    if (hit) return { ...parsed, action: 'register', currency: 'EUR', ...hit, ...quoteTimes() };
    return {
      ...parsed,
      state: 'disabled',
      action: 'register',
      amount: null,
      currency: 'EUR',
      note: 'No approved registrar is connected. Availability is not invented.',
      ...quoteTimes(),
    };
  },
};

export function domainCommerceEnabled(): boolean {
  return process.env.DOMAIN_COMMERCE_ENABLED === 'true';
}

export function quoteStillValid(offer: Pick<DomainOffer, 'expiresAt'>, now = Date.now()): boolean {
  return Date.parse(offer.expiresAt) > now;
}
