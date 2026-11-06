/**
 * Vendor-independent domain registration contracts.
 * No live registrar is called. Fixture prices are not sellable terms.
 */

export type DomainCommerceAction = 'register' | 'renew' | 'transfer';
export type DomainCommerceState = 'available' | 'taken' | 'unsupported' | 'disabled';

export interface DomainOffer {
  domain: string;
  tld: string;
  state: DomainCommerceState;
  action: DomainCommerceAction;
  amount: number | null;
  currency: 'EUR';
  note: string;
}

export interface DomainCommerceProvider {
  id: string;
  label: string;
  lookup(domain: string): Promise<DomainOffer>;
}

const FIXTURE: Record<string, Omit<DomainOffer, 'domain' | 'tld' | 'action' | 'currency'>> = {
  'available.example': { state: 'available', amount: 1299, note: 'Fixture only. Not a real registrar quote.' },
  'taken.example': { state: 'taken', amount: null, note: 'Fixture only. This name is treated as registered.' },
};

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
      };
    }
    const hit = FIXTURE[parsed.domain];
    if (hit) return { ...parsed, action: 'register', currency: 'EUR', ...hit };
    return {
      ...parsed,
      state: 'disabled',
      action: 'register',
      amount: null,
      currency: 'EUR',
      note: 'No approved registrar is connected. Availability is not invented.',
    };
  },
};

export function domainCommerceEnabled(): boolean {
  return process.env.DOMAIN_COMMERCE_ENABLED === 'true';
}
