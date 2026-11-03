import { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Money, Panel, Segmented, StatusPill, useToast } from '../ui-app';
import { ConfirmDialog } from '../ui-app';
import { denseInput } from './Overview';
import { ConfirmWithReason, DASH, LiveRegion, can, denseDanger, denseGhost, fmtDate, maskEmail, useAdminSession } from './Overview';
import type { TableColumn } from '../lib/table';

/**
 * Staff order list — GET /api/admin/orders?status=
 *
 * The status filter is sent with the value the API stores (upper case). The
 * API answers with the lower-case form, which is what the table shows.
 *
 * A paid order can be refunded from here. The refund is the money of the
 * customer, so it asks for a reason and shows the amount before it is sent.
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
  /** What was given back in parts, in cents. */
  refundedPart?: number;
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

/** Only a paid order holds money that can be given back. */
/** The part of an order that went back to the customer, when it was not refunded in full. */
function PartRefund({ order }: { order: AdminOrder }) {
  if (!order.refundedPart || order.status === 'refunded') return null;
  return <span className="rounded-full bg-s3 px-2 py-0.5 text-[11.5px] font-semibold text-ink2">{(order.refundedPart / 100).toFixed(2)} {order.currency} refunded</span>;
}

function canBeRefunded(order: AdminOrder): boolean {
  return order.total > 0 && (order.status === 'paid' || order.status === 'fulfilled');
}

export default function Orders() {
  const session = useAdminSession();
  const staff = session.staff;
  const mayWrite = can(staff, 'orders.write');
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [pageCursors, setPageCursors] = useState<string[]>([]);
  const cursor = pageCursors[pageCursors.length - 1];
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPageCursors([]); }, [status, query]);
  const [showEmails, setShowEmails] = useState(false);
  const [partBusy, setPartBusy] = useState(false);

  const state = useAsync(
    (signal) => get<{ orders: AdminOrder[]; total?: number; pagination?: { hasMore: boolean; nextCursor: string | null } }>('/admin/orders', {
      status: status || undefined,
      search: query || undefined,
      cursor,
      limit: 50,
    }, signal),
    [status, query, cursor],
  );

  const orders = state.data?.orders ?? [];
  const total = state.data?.total;
  const pagination = state.data?.pagination;
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  const itemsLabel = (order: AdminOrder) =>
    order.items.length
      ? order.items.map((item) => `${item.name} ×${item.quantity}`).join(', ')
      : DASH;

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  const refundButton = (order: AdminOrder) =>
    mayWrite && canBeRefunded(order) ? (
      <span className="inline-flex gap-1.5">
      <Link to={`/admin/orders/${encodeURIComponent(order.id)}/partial-refund`} className={denseGhost}>Refund part</Link>
      <Link to={`/admin/orders/${encodeURIComponent(order.id)}/refund`} className={denseDanger}>Refund</Link>
      </span>
    ) : null;

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
          <label className="grid gap-1 text-[13.5px] font-medium text-ink">
            Search orders
            <input type="search" inputMode="search" autoComplete="off" value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order number, customer or product"
              className={denseInput} />
          </label>
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
                    nowrap: true,
                    render: (order: AdminOrder) =>
                      order.customer?.id ? (
                        <Link
                          to={`/admin/orders/${order.id}`}
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
                    truncate: true,
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
                    nowrap: true,
                    render: (order: AdminOrder) => (
                    <span className="block max-w-[260px] truncate text-ink2" title={itemsLabel(order)}>
                      {itemsLabel(order)}
                    </span>
                  ),
                  },
                  {
                    key: 'total',
                    header: 'Total',
                    align: 'right',
                    nowrap: true,
                    render: (order: AdminOrder) => <Money amount={order.total} currency={order.currency} />,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    nowrap: true,
                    render: (order: AdminOrder) => <span className="inline-flex flex-wrap items-center gap-1.5"><StatusPill status={order.status} /><PartRefund order={order} /></span>,
                  },
                  {
                    key: 'created',
                    header: 'Date',
                    nowrap: true,
                    render: (order: AdminOrder) => <span className="text-ink2">{fmtDate(order.createdAt)}</span>,
                  },
                  ...(mayWrite
                    ? ([
                        {
                          key: 'action',
                          header: 'Action',
                          align: 'right',
                          nowrap: true,
                          render: (order: AdminOrder) => refundButton(order),
                        },
                      ] satisfies TableColumn<AdminOrder>[])
                    : []),
                ]}
              />
              <CardList<AdminOrder> rows={orders} rowKey={(order) => order.id}>
                {(order) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <Link to={`/admin/orders/${order.id}`} className="truncate font-mono text-[13.5px] text-acc" title={order.number}>{order.number}</Link>
                        <p
                          className="truncate text-[13px] text-ink2"
                          title={order.customer?.name ?? email(order.customer?.email ?? '')}
                        >
                          {order.customer?.name ?? email(order.customer?.email ?? '')}
                        </p>
                      </div>
                      <span className="grid justify-items-end gap-1"><StatusPill status={order.status} /><PartRefund order={order} /></span>
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
                    {refundButton(order) && (
                      <div className="mt-3 flex flex-wrap gap-2">{refundButton(order)}</div>
                    )}
                  </div>
                )}
              </CardList>
              <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink2" role="navigation" aria-label="Order pages">
                 <span>Page {pageCursors.length + 1} · {orders.length} shown{typeof total === 'number' ? ` · ${total} matching orders` : ''}</span>
                 <div className="flex gap-2">
                   <button type="button" className={denseGhost} disabled={pageCursors.length === 0 || state.loading} onClick={() => setPageCursors((current) => current.slice(0, -1))}>Previous</button>
                   <button type="button" className={denseGhost} disabled={!pagination?.hasMore || !pagination.nextCursor || state.loading} onClick={() => {
                     if (pagination?.nextCursor) setPageCursors((current) => [...current, pagination.nextCursor!]);
                   }}>Next</button>
                 </div>
               </div>
            </div>
          )}
        </div>
      </Panel>

      {!mayWrite && (
        <p className="px-1 text-[13px] text-ink3">
          Your role does not hold &quot;orders.write&quot;, so the orders are read-only for you.
        </p>
      )}

    </div>
  );
}
