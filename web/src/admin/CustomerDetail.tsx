import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import {
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Panel,
  StatusPill,
  useToast,
} from '../ui-app';
import { ConfirmWithReason, DASH, LiveRegion, TruncationNote, can, denseDanger, denseGhost, fmtDate, maskEmail, useAdminSession } from './Overview';

/**
 * Staff customer record — GET /api/admin/customers/:id
 *
 * Suspending calls POST /api/admin/customers/:id/suspend with a reason. The
 * server signs the customer out of every session and blocks new sign-ins; it
 * does not stop their instances, and the confirmation says exactly that.
 */

interface DetailInstance {
  id: string;
  name: string;
  status: string;
  price: number;
  product: { name: string; slug: string };
  node: number | null;
  createdAt: string;
  subscriptionStatus: string | null;
}

interface DetailInvoice {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
}

interface DetailTicket {
  id: string;
  number: number;
  subject: string;
  status: string;
  createdAt: string;
}

interface DetailOrder {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
}

interface AdminCustomerDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  emailVerified: boolean;
  suspendedAt: string | null;
  pterodactylUserId: string | null;
  totalSpent: number;
  instances: DetailInstance[];
  invoices: DetailInvoice[];
  tickets: DetailTicket[];
  orders: DetailOrder[];
  /** The number of rows each list really holds, so a cut-off list says so. */
  counts: { invoices: number; tickets: number; orders: number; payments: number };
}

/**
 * The access of the account: the button that suspends it and the dialog that
 * asks for the reason.
 *
 * The state of the dialog lives here and not in the page. The record of a
 * customer holds hundreds of rows, and a letter that is typed in the reason
 * field of the dialog has no business drawing all of them again. The page
 * only learns that the account changed, and reads it once more.
 */
function AccountAccess({
  customerId,
  suspended,
  masked,
  instanceCount,
  mayWrite,
  onChanged,
}: {
  customerId: string;
  suspended: boolean;
  /** The address of the customer, with the middle hidden. */
  masked: string;
  instanceCount: number;
  mayWrite: boolean;
  /** The page reads the customer again, because the account changed. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const suspend = useAction(async (next: boolean) => {
    return post<{ customer: { id: string; suspended: boolean } }>(`/admin/customers/${customerId}/suspend`, {
      suspended: next,
      reason: reason.trim(),
    });
  });

  const openDialog = () => {
    setReason('');
    setReasonError(null);
    setDialogOpen(true);
  };

  const confirm = async () => {
    if (!reason.trim()) {
      setReasonError('Give a reason. It is written to the audit log.');
      return;
    }
    const next = !suspended;
    const result = await suspend.run(next);
    if (!result) return;
    setDialogOpen(false);
    setReason('');
    onChanged();
    toast.push(next ? 'Customer suspended' : 'Customer reinstated', 'ok');
  };

  return (
    <>
      <Panel
        title="Account access"
        description={
          mayWrite
            ? 'Every change is confirmed and recorded in the audit log with your reason.'
            : 'Your role cannot change the state of this account.'
        }
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {mayWrite ? (
              <button
                type="button"
                onClick={openDialog}
                className={suspended ? denseGhost : denseDanger}
              >
                {suspended ? 'Reinstate customer' : 'Suspend customer'}
              </button>
            ) : (
              <button
                type="button"
                disabled
                title={'Your role does not allow "customers.write".'}
                className={denseDanger}
              >
                {suspended ? 'Reinstate customer' : 'Suspend customer'}
              </button>
            )}
            {!mayWrite && (
              <p className="text-[13px] text-ink3">Your role does not allow &quot;customers.write&quot;.</p>
            )}
          </div>
          {suspend.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {suspend.error}
            </p>
          )}
        </div>
      </Panel>

      <ConfirmWithReason
        open={dialogOpen}
        title={suspended ? 'Reinstate this customer' : 'Suspend this customer'}
        description={
          suspended
            ? `Reinstating lets ${masked} sign in again. The change is recorded in the audit log.`
            : `Suspending ${masked} ends every session of this account now and blocks new sign-ins. Their ${instanceCount} instance${
                instanceCount === 1 ? '' : 's'
              } keep running. The change is recorded in the audit log.`
        }
        confirmLabel={suspended ? 'Reinstate customer' : 'Suspend customer'}
        reasonLabel="Reason (required)"
        reason={reason}
        onReasonChange={(value) => {
          setReason(value);
          if (reasonError) setReasonError(null);
        }}
        onConfirm={confirm}
        onCancel={() => setDialogOpen(false)}
        busy={suspend.pending}
        error={reasonError}
        destructive={!suspended}
      />
    </>
  );
}

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const session = useAdminSession();
  const staff = session.staff;

  const state = useAsync(
    (signal) => get<{ customer: AdminCustomerDetail }>(`/admin/customers/${id}`, undefined, signal),
    [id],
  );

  const customer = state.data?.customer;
  const suspended = Boolean(customer?.suspendedAt);
  const mayWrite = can(staff, 'customers.write');

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

  if (state.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading the customer" />
      </div>
    );
  }

  if (state.error || !customer) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="This customer could not be loaded"
          message={state.error?.message ?? 'The customer does not exist.'}
          onRetry={state.reload}
        />
        <p className="px-1 text-[14px] text-ink2">
          <Link to="/admin/customers" className="font-bold text-acc hover:underline">
            Back to the customer list
          </Link>
        </p>
      </div>
    );
  }

  const masked = maskEmail(customer.email);
  const instanceCount = customer.instances.length;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`Customer ${customer.name ?? customer.id} loaded`} />
      <Panel title={customer.name ?? 'No name'} description="Everything the API returns about this account.">
        <div className="grid gap-3">
          <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">E-mail</dt>
              <dd className="mt-1 truncate font-mono text-[13.5px] text-ink" title={masked}>
                {masked}
              </dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Customer id</dt>
              <dd className="mt-1 font-mono text-[12px] break-all text-ink">{customer.id}</dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Role</dt>
              <dd className="mt-1 text-[14px] capitalize text-ink">{customer.role}</dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Verified</dt>
              <dd className="mt-1 text-[14px] text-ink">
                {customer.emailVerified ? (
                  <StatusPill status="active" label="Verified" />
                ) : (
                  <StatusPill status="pending" label="Unverified" />
                )}
              </dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Joined</dt>
              <dd className="mt-1 text-[14px] text-ink">{fmtDate(customer.createdAt)}</dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Total spent</dt>
              <dd className="mt-1 text-[14px] text-ink">
                <Money amount={customer.totalSpent} />
              </dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Instances</dt>
              <dd className="mt-1 font-mono tabular-nums text-[14px] text-ink">{instanceCount}</dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Pterodactyl user</dt>
              <dd className="mt-1 font-mono text-[13.5px] text-ink">{customer.pterodactylUserId ?? DASH}</dd>
            </div>
            <div className="rounded-2xl bg-s2 p-3.5">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Account state</dt>
              <dd className="mt-1 text-[14px] text-ink">
                {suspended ? (
                  <StatusPill status="suspended" label="Suspended" />
                ) : (
                  <StatusPill status="active" label="Active" />
                )}
              </dd>
            </div>
          </dl>

          {suspended && (
            <p className="rounded-2xl bg-warn/12 px-4 py-3 text-[13.5px] text-ink2">
              Suspended on {fmtDate(customer.suspendedAt)}. Every session of this account was ended.
            </p>
          )}
        </div>
      </Panel>

      <AccountAccess
        customerId={customer.id}
        suspended={suspended}
        masked={masked}
        instanceCount={instanceCount}
        mayWrite={mayWrite}
        onChanged={state.reload}
      />

      <Panel title="Instances" description={`${instanceCount} instance${instanceCount === 1 ? '' : 's'} on this account.`}>
        {!customer.instances.length ? (
          <EmptyState
            title="No instances."
            description="This customer has nothing running yet. Instances appear here as soon as one is deployed."
          />
        ) : (
          <div className="grid gap-3">
            <DataTable<DetailInstance>
              rows={customer.instances}
              rowKey={(instance) => instance.id}
              columns={[
                {
                  key: 'name',
                  header: 'Instance',
                  truncate: true,
                  render: (instance: DetailInstance) => (
                    <span className="block min-w-0">
                      <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={instance.name}>
                        {instance.name}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink3" title={instance.product.name}>
                        {instance.product.name}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (instance: DetailInstance) => <StatusPill status={instance.status} />,
                },
                {
                  key: 'price',
                  header: 'Price',
                  align: 'right',
                  nowrap: true,
                  render: (instance: DetailInstance) => <Money amount={instance.price} period="month" />,
                },
                {
                  key: 'subscription',
                  header: 'Subscription',
                  nowrap: true,
                  render: (instance: DetailInstance) => <span className="text-ink2">{instance.subscriptionStatus ?? DASH}</span>,
                },
                {
                  key: 'node',
                  header: 'Pterodactyl id',
                  nowrap: true,
                  render: (instance: DetailInstance) => <span className="font-mono text-[12.5px] text-ink2">{instance.node ?? DASH}</span>,
                },
                {
                  key: 'created',
                  header: 'Created',
                  nowrap: true,
                  render: (instance: DetailInstance) => <span className="text-ink2">{fmtDate(instance.createdAt)}</span>,
                },
              ]}
            />
            <CardList<DetailInstance> rows={customer.instances} rowKey={(instance) => instance.id}>
              {(instance) => (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={instance.name}>
                        {instance.name}
                      </p>
                      <p className="truncate text-[12.5px] text-ink3" title={instance.product.name}>
                        {instance.product.name}
                      </p>
                    </div>
                    <StatusPill status={instance.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                    <div>
                      <dt className="text-ink3">Price</dt>
                      <dd className="min-w-0 break-words">
                        <Money amount={instance.price} period="month" />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink3">Subscription</dt>
                      <dd className="text-ink">{instance.subscriptionStatus ?? DASH}</dd>
                    </div>
                    <div>
                      <dt className="text-ink3">Pterodactyl id</dt>
                      <dd className="font-mono text-ink">{instance.node ?? DASH}</dd>
                    </div>
                    <div>
                      <dt className="text-ink3">Created</dt>
                      <dd className="text-ink">{fmtDate(instance.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </CardList>
          </div>
        )}
      </Panel>

      <Panel title="Invoices" description={`${customer.invoices.length} invoice${customer.invoices.length === 1 ? '' : 's'}.`}>
        {!customer.invoices.length ? (
          <EmptyState
            title="No invoices."
            description="Nothing has been billed to this account. Invoices appear here after the first payment."
          />
        ) : (
          <div className="grid gap-3">
            <DataTable<DetailInvoice>
              rows={customer.invoices}
              rowKey={(invoice) => invoice.id}
              columns={[
                {
                  key: 'number',
                  header: 'Number',
                  nowrap: true,
                  render: (invoice: DetailInvoice) => <span className="font-mono text-[13px] text-ink">{invoice.number}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (invoice: DetailInvoice) => <StatusPill status={invoice.status} />,
                },
                {
                  key: 'total',
                  header: 'Total',
                  align: 'right',
                  nowrap: true,
                  render: (invoice: DetailInvoice) => <Money amount={invoice.total} currency={invoice.currency} />,
                },
                {
                  key: 'created',
                  header: 'Date',
                  nowrap: true,
                  render: (invoice: DetailInvoice) => <span className="text-ink2">{fmtDate(invoice.createdAt)}</span>,
                },
              ]}
            />
            <CardList<DetailInvoice> rows={customer.invoices} rowKey={(invoice) => invoice.id}>
              {(invoice) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13.5px] text-ink" title={invoice.number}>
                      {invoice.number}
                    </p>
                    <p className="text-[12.5px] text-ink3">{fmtDate(invoice.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Money amount={invoice.total} currency={invoice.currency} />
                    <StatusPill status={invoice.status} />
                  </div>
                </div>
              )}
            </CardList>
              <TruncationNote shown={customer.invoices.length} total={customer.counts?.invoices} />
          </div>
        )}
      </Panel>

      <Panel title="Tickets" description={`${customer.tickets.length} ticket${customer.tickets.length === 1 ? '' : 's'}.`}>
        {!customer.tickets.length ? (
          <EmptyState
            title="No tickets."
            description="This customer has not contacted support. Tickets appear here as soon as they open one."
          />
        ) : (
          <div className="grid gap-3">
            <DataTable<DetailTicket>
              rows={customer.tickets}
              rowKey={(ticket) => ticket.id}
              columns={[
                {
                  key: 'number',
                  header: 'Number',
                  nowrap: true,
                  render: (ticket: DetailTicket) => (
                    <Link
                      to={`/admin/tickets?ticket=${ticket.id}`}
                      className="font-mono text-[13px] text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      #{ticket.number}
                    </Link>
                  ),
                },
                {
                  key: 'subject',
                  header: 'Subject',
                  truncate: true,
                  render: (ticket: DetailTicket) => (
                    <span className="block truncate text-ink" title={ticket.subject}>
                      {ticket.subject}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (ticket: DetailTicket) => <StatusPill status={ticket.status} />,
                },
                {
                  key: 'created',
                  header: 'Opened',
                  nowrap: true,
                  render: (ticket: DetailTicket) => <span className="text-ink2">{fmtDate(ticket.createdAt)}</span>,
                },
              ]}
            />
            <CardList<DetailTicket> rows={customer.tickets} rowKey={(ticket) => ticket.id}>
              {(ticket) => (
                <Link to={`/admin/tickets?ticket=${ticket.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-medium tracking-[-0.02em] text-ink" title={ticket.subject}>
                      {ticket.subject}
                    </p>
                      <p className="font-mono text-[12.5px] text-ink3">#{ticket.number} · {fmtDate(ticket.createdAt)}</p>
                    </div>
                    <StatusPill status={ticket.status} />
                  </div>
                </Link>
              )}
            </CardList>
              <TruncationNote shown={customer.tickets.length} total={customer.counts?.tickets} />
          </div>
        )}
      </Panel>

      <Panel title="Orders" description={`${customer.orders.length} order${customer.orders.length === 1 ? '' : 's'}.`}>
        {!customer.orders.length ? (
          <EmptyState
            title="No orders."
            description="This customer has not ordered anything. Orders appear here as soon as one is placed."
          />
        ) : (
          <div className="grid gap-3">
            <DataTable<DetailOrder>
              rows={customer.orders}
              rowKey={(order) => order.id}
              columns={[
                {
                  key: 'number',
                  header: 'Number',
                  nowrap: true,
                  render: (order: DetailOrder) => <span className="font-mono text-[13px] text-ink">{order.number}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (order: DetailOrder) => <StatusPill status={order.status} />,
                },
                {
                  key: 'total',
                  header: 'Total',
                  align: 'right',
                  nowrap: true,
                  render: (order: DetailOrder) => <Money amount={order.total} currency={order.currency} />,
                },
                {
                  key: 'created',
                  header: 'Date',
                  nowrap: true,
                  render: (order: DetailOrder) => <span className="text-ink2">{fmtDate(order.createdAt)}</span>,
                },
              ]}
            />
            <CardList<DetailOrder> rows={customer.orders} rowKey={(order) => order.id}>
              {(order) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13.5px] text-ink" title={order.number}>
                      {order.number}
                    </p>
                    <p className="text-[12.5px] text-ink3">{fmtDate(order.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Money amount={order.total} currency={order.currency} />
                    <StatusPill status={order.status} />
                  </div>
                </div>
              )}
            </CardList>
              <TruncationNote shown={customer.orders.length} total={customer.counts?.orders} />
          </div>
        )}
      </Panel>

      <p className="px-1 text-[13.5px] text-ink3">
        <Link to="/admin/customers" className="font-bold text-acc hover:underline">
          Back to the customer list
        </Link>
      </p>
    </div>
  );
}
