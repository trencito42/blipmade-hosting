import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { ErrorState, LoadingBlock, Money, Panel, PrimaryButton, StatusPill, useToast } from '../ui-app';

interface OrderItem {
  id: string;
  name: string;
  productSlug: string;
  quantity: number;
  unitAmount: number;
  total: number;
  fulfillmentStatus: string;
  fulfillmentError: string | null;
}

interface OrderDetail {
  id: string;
  number: string;
  status: string;
  total: number;
  discount: number;
  currency: string;
  createdAt: string;
  items: OrderItem[];
}

const STATUS: Record<string, { tone: string; label: string }> = {
  PENDING: { tone: 'pending', label: 'Waiting for payment' },
  AWAITING_PAYMENT: { tone: 'pending', label: 'Waiting for payment' },
  PAID: { tone: 'available', label: 'Paid' },
  FULFILLED: { tone: 'available', label: 'Delivered' },
  CANCELLED: { tone: 'failed', label: 'Cancelled' },
  REFUNDED: { tone: 'failed', label: 'Refunded' },
};

const FULFILMENT: Record<string, string> = {
  PENDING: 'Waiting',
  PROVISIONING: 'Being set up',
  FULFILLED: 'Delivered',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
};

const day = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * One order: what was bought, what it costs, whether it was paid and whether each line was delivered. Every value is
 * the one of the server. An order that waits for payment can be paid from here; nothing else on this page changes anything.
 */
export default function OrderView() {
  const { id = '' } = useParams();
  const toast = useToast();
  const state = useAsync<{ order: OrderDetail }>((signal) => get<{ order: OrderDetail }>(`/orders/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const [paying, setPaying] = useState(false);
  const order = state.data?.order;

  if (state.loading && !state.data) return <LoadingBlock rows={4} label="Loading the order" />;
  if (state.error || !order) {
    return <ErrorState title="The order could not be found" message={state.error?.message ?? 'It is not on this account.'} onRetry={state.reload} />;
  }
  const status = STATUS[order.status] ?? { tone: 'pending', label: order.status.toLowerCase().replace(/_/g, ' ') };
  const waiting = order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT';

  const pay = async () => {
    setPaying(true);
    try {
      const checkout = await post<{ url: string | null; message?: string }>(`/orders/${encodeURIComponent(order.id)}/checkout`);
      if (checkout.url) location.assign(checkout.url);
      else toast.push(checkout.message ?? 'Checkout is unavailable.', 'error');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Checkout could not be opened.', 'error');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/app/billing" className="text-[13.5px] text-ink3 hover:text-ink">← Back to billing</Link>
      </div>
      <Panel
        title={`Order ${order.number}`}
        description={`Placed ${day(order.createdAt)}`}
        action={<StatusPill status={status.tone} label={status.label} />}
      >
        <dl className="grid gap-3 text-[13.5px] sm:grid-cols-3">
          <div><dt className="text-ink3">Total</dt><dd className="mt-0.5 font-mono text-[18px] font-semibold text-ink"><Money amount={order.total} currency={order.currency} /></dd></div>
          {order.discount > 0 && <div><dt className="text-ink3">Discount</dt><dd className="mt-0.5 font-mono text-[16px] text-ink"><Money amount={order.discount} currency={order.currency} /></dd></div>}
          <div><dt className="text-ink3">Lines</dt><dd className="mt-0.5 font-mono text-[16px] text-ink">{order.items.length}</dd></div>
        </dl>
        {waiting && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="min-w-0 flex-1 text-[13.5px] text-ink2">Complete checkout to activate the services of this order. The invoice appears after the payment is confirmed.</p>
            <PrimaryButton onClick={() => void pay()} disabled={paying}>{paying ? 'Opening checkout…' : 'Pay now'}</PrimaryButton>
          </div>
        )}
      </Panel>
      <Panel title="What was ordered">
        <ul className="grid">
          {order.items.map((item) => (
            <li key={item.id} className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="break-words text-[14.5px] font-semibold text-ink">{item.name}</p>
                <p className="text-[12.5px] text-ink3">
                  {item.quantity} × <Money amount={item.unitAmount} currency={order.currency} />
                  {' · '}
                  {FULFILMENT[item.fulfillmentStatus] ?? item.fulfillmentStatus.toLowerCase()}
                </p>
                {item.fulfillmentError && <p role="alert" className="mt-1 text-[12.5px] text-bad">{item.fulfillmentError}</p>}
              </div>
              <p className="font-mono text-[14px] font-semibold text-ink"><Money amount={item.total} currency={order.currency} /></p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
