import type { DomainCommerceAction, DomainOffer } from './domain-commerce.js';

export type RegistrationState =
  | 'quoted'
  | 'pending_register'
  | 'registered'
  | 'pending_renew'
  | 'pending_transfer'
  | 'transferred'
  | 'expired'
  | 'failed'
  | 'refund_pending'
  | 'cancelled';

export type RegistrationEvent =
  | 'submit'
  | 'provider_ok'
  | 'provider_fail'
  | 'expire'
  | 'renew'
  | 'transfer'
  | 'refund'
  | 'cancel';

const ALLOWED: Record<RegistrationState, Partial<Record<RegistrationEvent, RegistrationState>>> = {
  quoted: { submit: 'pending_register', cancel: 'cancelled' },
  pending_register: { provider_ok: 'registered', provider_fail: 'failed', cancel: 'cancelled' },
  registered: { renew: 'pending_renew', transfer: 'pending_transfer', expire: 'expired', cancel: 'cancelled' },
  pending_renew: { provider_ok: 'registered', provider_fail: 'failed' },
  pending_transfer: { provider_ok: 'transferred', provider_fail: 'failed' },
  transferred: { expire: 'expired' },
  expired: { renew: 'pending_renew' },
  failed: { refund: 'refund_pending', submit: 'pending_register', cancel: 'cancelled' },
  refund_pending: { provider_ok: 'cancelled', provider_fail: 'failed' },
  cancelled: {},
};

export function nextRegistrationState(state: RegistrationState, event: RegistrationEvent): RegistrationState | null {
  return ALLOWED[state][event] ?? null;
}

export function sellingAllowed(enabled: boolean, offer: DomainOffer): boolean {
  return enabled && offer.state === 'available' && offer.amount !== null && offer.domain.endsWith('.example');
}

export function quoteToRegistration(userId: string, offer: DomainOffer, action: DomainCommerceAction): {
  userId: string;
  domain: string;
  action: DomainCommerceAction;
  state: RegistrationState;
  amount: number | null;
  providerId: string;
} {
  return {
    userId,
    domain: offer.domain,
    action,
    state: 'quoted',
    amount: offer.amount,
    providerId: 'fixture',
  };
}
