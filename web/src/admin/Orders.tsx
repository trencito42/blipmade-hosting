import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Money, Panel, Segmented, StatusPill, useToast } from '../ui-app';
import { ConfirmDialog } from '../ui-app';
import { denseInput } from './Overview';
import { ConfirmWithReason, DASH, LiveRegion, TruncationNote, can, denseDanger, denseGhost, fmtDate, maskEmail, useAdminSession } from './Overview';
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
  return order.status === 'paid' || order.status === 'fulfilled';
}

export default function Orders() {
  const session = useAdminSession();
  const staff = session.staff;
  const mayWrite = can(staff, 'orders.write');
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [showEmails, setShowEmails] = useState(false);
  const [refunding, setRefunding] = useState<AdminOrder | null>(null);
  const [partial, setPartial] = useState<AdminOrder | null>(null);
  const [partAmount, setPartAmount] = useState('');
  const [partReason, setPartReason] = useState('');
  const [partBusy, setPartBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

  const state = useAsync(
    (signal) => get<{ orders: AdminOrder[]; total?: number }>('/admin/orders', { status: status || undefined }, signal),
    [status],
  );

  const refund = useAction(async (order: AdminOrder) => {
    return post<{ order: { id: string; status: string; amount: number; currency: string } }>(
      `/admin/orders/${order.id}/refund`,
      { reason: reason.trim() },
    );
  });

  const orders = state.data?.orders ?? [];
  const total = state.data?.total;
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

  const confirmRefund = async () => {
    if (!refunding) return;
    setReasonTouched(true);
    if (reason.trim().length < 3) return;
    const result = await refund.run(refunding);
    if (!result) return;
    toast.push(`${refunding.number} refunded`, 'ok');
    setRefunding(null);
    setReason('');
    setReasonTouched(false);
    state.reload();
  };

  const refundButton = (order: AdminOrder) =>
    mayWrite && canBeRefunded(order) ? (
      <span className="inline-flex gap-1.5">
      <button type="button" className={denseGhost} onClick={() => { setPartReason(''); setPartAmount(''); setPartial(order); }}>Refund part</button>
      <button
        type="button"
        onClick={() => {
          setReason('');
          setReasonTouched(false);
          setRefunding(order);
        }}
        className={denseDanger}
      >
        Refund
      </button>
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
              <TruncationNote shown={orders.length} total={total} />
            </div>
          )}
        </div>
      </Panel>

      {!mayWrite && (
        <p className="px-1 text-[13px] text-ink3">
          Your role does not hold &quot;orders.write&quot;, so the orders are read-only for you.
        </p>
      )}

      <ConfirmDialog
        open={partial !== null}
        title={partial ? `Refund part of ${partial.number}` : 'Refund part'}
        description={partial ? `The order was ${(partial.total / 100).toFixed(2)} ${partial.currency}. Write the amount to give back and why. It goes back to the card at the payment provider, and cannot be undone.` : undefined}
        confirmLabel={partBusy ? 'Refunding…' : 'Refund this amount'}
        busy={partBusy}
        onCancel={() => setPartial(null)}
        onConfirm={() => {
          const amount = Math.round(Number(partAmount.replace(',', '.')) * 100);
          if (!partial || !Number.isFinite(amount) || amount < 1 || partReason.trim().length < 5) {
            toast.push('Write an amount, and a reason of at least 5 characters.', 'error');
            return;
          }
          setPartBusy(true);
          post(`/admin/orders/${partial.id}/partial-refund`, { amount, reason: partReason.trim() })
            .then(() => { toast.push('The refund was made.', 'ok'); setPartial(null); state.reload(); })
            .catch((failure: Error) => toast.push(failure.message, 'error'))
            .finally(() => setPartBusy(false));
        }}
      >
        <div className="grid gap-3">
          <label className="grid gap-1 text-[13.5px] font-medium text-ink">Amount ({partial?.currency})<input value={partAmount} onChange={(event) => setPartAmount(event.target.value)} inputMode="decimal" placeholder="5.00" className={denseInput} /></label>
          <label className="grid gap-1 text-[13.5px] font-medium text-ink">Reason<input value={partReason} onChange={(event) => setPartReason(event.target.value)} className={denseInput} /></label>
        </div>
      </ConfirmDialog>

      <ConfirmWithReason
        open={refunding !== null}
        title={`Refund ${refunding?.number ?? ''}`}
        description={
          refunding
            ? `${refunding.number} gives ${(refunding.total / 100).toFixed(2)} ${refunding.currency} back to the customer. The money is returned by the payment provider and the order is marked as refunded. The reason is kept in the audit journal.`
            : undefined
        }
        confirmLabel="Refund the order"
        reasonLabel="Why is the order refunded?"
        reason={reason}
        onReasonChange={(value) => {
          setReason(value);
          setReasonTouched(true);
        }}
        onConfirm={confirmRefund}
        onCancel={() => {
          setRefunding(null);
          setReason('');
          setReasonTouched(false);
        }}
        busy={refund.pending}
        error={
          reasonTouched && reason.trim().length < 3
            ? 'Write a reason of at least three characters. It is kept in the audit journal.'
            : (refund.error ?? null)
        }
      />
    </div>
  );
}
