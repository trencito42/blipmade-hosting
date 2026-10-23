import { useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Money, Panel, Segmented, StatusPill } from '../ui-app';
import { DASH, LiveRegion, denseGhost, fmtDate, maskEmail } from './Overview';

/**
 * Staff order list — GET /api/admin/orders?status=
 *
 * The status filter is sent with the value the API stores (upper case). The
 * API answers with the lower-case form, which is what the table shows.
 */

interface AdminOrderItem {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

interface AdminOrder {
  id: string;
  number: string;
  status: string;
  total: number;
  discount: number;
  currency: string;
  createdAt: string;
  customer: { id: string; email: string; name: string | null };
  items: AdminOrderItem[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { value: 'PAID', label: 'Paid' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export default function Orders() {
  const [status, setStatus] = useState('');
  const [showEmails, setShowEmails] = useState(false);

  const state = useAsync(
    (signal) => get<{ orders: AdminOrder[] }>('/admin/orders', { status: status || undefined }, signal),
    [status],
  );

  const orders = state.data?.orders ?? [];
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  const itemsLabel = (order: AdminOrder) =>
    order.items.length
      ? order.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')
      : DASH;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${orders.length} order${orders.length === 1 ? '' : 's'}`} />
      <Panel
        title="Orders"
        description="Every order with its status, items and total. Amounts are minor units from the API."
        actionBelow
        action={
          <button
            type="button"
            aria-pressed={showEmails}
            onClick={() => setShowEmails((value) => !value)}
            title="Revealing addresses is a local view change. The API has no endpoint that records a reveal."
            className={showEmails ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
          >
            <Icon name={showEmails ? 'eyeOff' : 'eye'} size={16} />
            {showEmails ? 'Mask e-mails' : 'Show e-mails'}
          </button>
        }
      >
        <div className="grid gap-3">
          <Segmented
            ariaLabel="Filter orders by status"
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
          />

          {state.loading ? (
            <LoadingBlock rows={4} label="Loading orders" />
          ) : state.error ? (
            <ErrorState title="The order list could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !orders.length ? (
            <EmptyState
              title={status ? 'No order with that status.' : 'No orders yet.'}
              description={status ? 'Pick another status to see more.' : 'Orders appear here as soon as they are placed.'}
            />
          ) : (
            <div className="grid gap-3">
              <DataTable<AdminOrder>
                rows={orders}
                rowKey={(order) => order.id}
                columns={[
                  {
                    key: 'number',
                    header: 'Number',
                    render: (order: AdminOrder) =>
                      order.customer?.id ? (
                        <Link
                          to={`/admin/customers/${order.customer.id}`}
                          className="font-mono text-[13px] text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        >
                          {order.number}
                        </Link>
                      ) : (
                        <span className="font-mono text-[13px] text-ink">{order.number}</span>
                      ),
                  },
                  {
                    key: 'customer',
                    header: 'Customer',
                    render: (order: AdminOrder) => (
                      <span className="block min-w-0">
                        <span className="block truncate text-ink" title={order.customer?.name ?? 'No name'}>
                          {order.customer?.name ?? 'No name'}
                        </span>
                        <span className="block truncate font-mono text-[12.5px] text-ink3" title={email(order.customer?.email ?? '')}>
                          {email(order.customer?.email ?? '')}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'items',
                    header: 'Items',
                    render: (order: AdminOrder) => (
                    <span className="block max-w-[260px] truncate text-ink2" title={itemsLabel(order)}>
                      {itemsLabel(order)}
                    </span>
                  ),
                  },
                  {
                    key: 'total',
                    header: 'Total',
                    render: (order: AdminOrder) => <Money amount={order.total} currency={order.currency} />,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (order: AdminOrder) => <StatusPill status={order.status} />,
                  },
                  {
                    key: 'created',
                    header: 'Date',
                    render: (order: AdminOrder) => <span className="text-ink2">{fmtDate(order.createdAt)}</span>,
                  },
                ]}
              />
              <CardList<AdminOrder> rows={orders} rowKey={(order) => order.id}>
                {(order) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[13.5px] text-ink" title={order.number}>
                          {order.number}
                        </p>
                        <p
                          className="truncate text-[13px] text-ink2"
                          title={order.customer?.name ?? email(order.customer?.email ?? '')}
                        >
                          {order.customer?.name ?? email(order.customer?.email ?? '')}
                        </p>
                      </div>
                      <StatusPill status={order.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <div className="col-span-2 min-w-0">
                        <dt className="text-ink3">Items</dt>
                        <dd className="truncate text-ink" title={itemsLabel(order)}>
                          {itemsLabel(order)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Total</dt>
                        <dd>
                          <Money amount={order.total} currency={order.currency} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Date</dt>
                        <dd className="text-ink">{fmtDate(order.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </CardList>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
