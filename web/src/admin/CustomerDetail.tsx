import { useState } from 'react';
import { del, get, patch, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams, useRouter } from '../router';
import { useSession } from '../session';
import {
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  TextArea,
  TextInput,
  Panel,
  StatusPill,
  useToast,
} from '../ui-app';
import { ConfirmWithReason, DASH, LiveRegion, TruncationNote, can, denseDanger, denseGhost, fmtDate, maskEmail, useAdminSession } from './Overview';
import { denseInput } from './Overview';

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
  const { refresh } = useSession();
  const { navigate } = useRouter();
  const [acting, setActing] = useState(false);

  /** Opens the customer area as this customer, for an hour. The page says so on every screen. */
  const actAs = async () => {
    setActing(true);
    try {
      await post(`/admin/customers/${customerId}/impersonate`);
      await refresh();
      navigate('/app');
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
      setActing(false);
    }
  };

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
            {mayWrite && (
              <button type="button" onClick={() => void actAs()} disabled={acting} className={denseGhost}>
                {acting ? 'Opening…' : 'Act as this customer'}
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

      {mayWrite && <AccountTools customerId={customer.id} name={customer.name ?? ''} emailVerified={customer.emailVerified} onChanged={state.reload} />}
      <NotesPanel customerId={customer.id} mayWrite={mayWrite} />
      <SubscriptionsPanel customerId={customer.id} mayWrite={mayWrite} />

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

/** What the staff does to the account itself: the name, the address, the password link, the sessions. */
function AccountTools({ customerId, name, emailVerified, onChanged }: { customerId: string; name: string; emailVerified: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [first = '', ...rest] = name.split(' ');
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(rest.join(' '));
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, work: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await work();
      toast.push(message, 'ok');
      onChanged();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Account tools" description="Each action is written to the audit log.">
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <TextInput label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          <TextInput label="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          <button type="button" className={denseGhost} disabled={busy !== null || !firstName.trim() || !lastName.trim()} onClick={() => void run('name', () => patch(`/admin/customers/${customerId}/name`, { firstName, lastName }), 'The name was saved.')}>Save name</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {!emailVerified && (
            <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run('verify', () => post(`/admin/customers/${customerId}/verify-email`), 'The address is marked as verified.')}>Mark email verified</button>
          )}
          <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run('reset', () => post(`/admin/customers/${customerId}/send-password-reset`), 'The reset link was queued for the customer.')}>Send password reset link</button>
          <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run('reset2fa', () => post(`/admin/customers/${customerId}/reset-2fa`), 'Two-factor was reset and the sessions were closed.')}>Reset two-factor</button>
          <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => void run('sessions', () => post(`/admin/customers/${customerId}/revoke-sessions`), 'Every session of the customer was closed.')}>Sign out everywhere</button>
        </div>
      </div>
    </Panel>
  );
}

interface AdminSubscription {
  id: string;
  name: string;
  kind: string;
  status: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Every subscription of the customer, with the two things the staff can do to one: end it at the end of the period, or take that back. */
function SubscriptionsPanel({ customerId, mayWrite }: { customerId: string; mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ subscriptions: AdminSubscription[] }>((signal) => get<{ subscriptions: AdminSubscription[] }>(`/admin/customers/${customerId}/subscriptions`, undefined, signal), [customerId]);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, action: 'cancel' | 'resume') => {
    setBusy(id);
    try {
      await post(`/admin/subscriptions/${id}/${action}`);
      toast.push(action === 'cancel' ? 'The subscription ends at the end of the paid period.' : 'The subscription continues.', 'ok');
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(null);
    }
  };
  const rows = state.data?.subscriptions ?? [];
  return (
    <Panel title="Subscriptions" description="Apps, servers, VPS and mail plans of this customer.">
      {state.loading && !state.data ? (
        <LoadingBlock rows={2} label="Loading the subscriptions" />
      ) : state.error ? (
        <ErrorState title="The subscriptions could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-ink2">No subscription.</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-semibold text-ink">{row.name} <span className="font-normal text-ink3">· {row.kind}</span></p>
                <p className="text-[12.5px] text-ink3">
                  <Money amount={row.amount} currency={row.currency} /> · {row.cancelAtPeriodEnd ? 'ends' : 'renews'} {row.currentPeriodEnd ? fmtDate(row.currentPeriodEnd) : DASH}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={row.status} label={row.status} />
                {mayWrite && (row.cancelAtPeriodEnd ? (
                  <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void act(row.id, 'resume')}>Resume</button>
                ) : (
                  <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => void act(row.id, 'cancel')}>End at period end</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface Note { id: string; body: string; authorEmail: string | null; createdAt: string }

/** Private notes and tags on the customer. The customer never sees them. */
function NotesPanel({ customerId, mayWrite }: { customerId: string; mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ notes: Note[]; tags: string[] }>((signal) => get<{ notes: Note[]; tags: string[] }>(`/admin/customers/${customerId}/notes`, undefined, signal), [customerId]);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const tags = state.data?.tags ?? [];
  return (
    <Panel title="Notes and tags" description="Private, for the team. The customer does not see them.">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {tags.length === 0 && <span className="text-[13.5px] text-ink3">No tag.</span>}
          {tags.map((entry) => (
            <span key={entry} className="inline-flex items-center gap-1 rounded-full bg-s3 px-3 py-1 text-[12.5px] font-semibold text-ink">
              {entry}
              {mayWrite && <button type="button" aria-label={`Remove the tag ${entry}`} className="text-ink3 hover:text-ink" onClick={() => void run(() => put(`/admin/customers/${customerId}/tags`, { tags: tags.filter((item) => item !== entry) }))}>×</button>}
            </span>
          ))}
          {mayWrite && (
            <form className="flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); if (tag.trim()) void run(() => put(`/admin/customers/${customerId}/tags`, { tags: [...tags, tag.trim()] }).then(() => setTag(''))); }}>
              <input aria-label="New tag" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="add a tag" className={`${denseInput} w-32`} />
              <button type="submit" className={denseGhost} disabled={busy || !tag.trim()}>Add</button>
            </form>
          )}
        </div>
        {mayWrite && (
          <div className="grid gap-2">
            <TextArea label="New note" value={body} onChange={(event) => setBody(event.target.value)} rows={2} />
            <div><button type="button" className={denseGhost} disabled={busy || !body.trim()} onClick={() => void run(() => post(`/admin/customers/${customerId}/notes`, { body }).then(() => setBody('')))}>Add the note</button></div>
          </div>
        )}
        {state.loading && !state.data ? <LoadingBlock rows={1} label="Loading the notes" /> : (
          <ul className="grid gap-2">
            {(state.data?.notes ?? []).map((note) => (
              <li key={note.id} className="rounded-2xl bg-s2 px-4 py-3">
                <p className="whitespace-pre-line text-[14px] text-ink">{note.body}</p>
                <p className="mt-1 flex items-center justify-between gap-2 text-[12px] text-ink3">
                  <span>{note.authorEmail ?? 'staff'} · {fmtDate(note.createdAt)}</span>
                  {mayWrite && <button type="button" className="hover:text-ink" onClick={() => void run(() => del(`/admin/customers/${customerId}/notes/${note.id}`))}>Delete</button>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
