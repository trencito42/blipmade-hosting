import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';

/**
 * Tells the customer that the platform gave their account credit. The provider takes it off the next invoice, so
 * it is said where a payment is made and where the money of the account is shown. Nothing is shown without credit.
 */
export function CreditNotice({ className = '' }: { className?: string }) {
  const state = useAsync<{ credit: number; currency: string }>((signal) => get<{ credit: number; currency: string }>('/billing/credit', undefined, signal), []);
  const credit = state.data?.credit ?? 0;
  if (credit <= 0) return null;
  return (
    <div role="status" className={`rounded-2xl bg-acc-bg px-4 py-3 text-[14px] text-ink ${className}`}>
      <strong>You have {(credit / 100).toFixed(2)} {state.data?.currency} in credit.</strong> It is taken off your next invoice automatically.
    </div>
  );
}
