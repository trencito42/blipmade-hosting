import { useState } from 'react';
import { useMenuKit } from '../lib/menu-actions';
import type { MenuItem } from '../context-menu';
import { del, get, patch, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams, useRouter } from '../router';
import { useSession } from '../session';
import {
  CardList,
  ConfirmDialog,
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
  billingAddress: Record<string, string | null> | null;
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
              <Link to={`/admin/customers/${encodeURIComponent(customerId)}/account-action`} className={suspended ? denseGhost : denseDanger}>
                {suspended ? 'Reinstate customer' : 'Suspend customer'}
              </Link>
            ) : (
              <button type="button" disabled title={'Your role does not allow "customers.write".'} className={denseDanger}>
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
        </div>
      </Panel>

    </>
  );
}

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const [section, setSection] = useState<'overview' | 'services' | 'billing' | 'support' | 'security' | 'growth'>('overview');
  const session = useAdminSession();
  const staff = session.staff;

  const state = useAsync(
    (signal) => get<{ customer: AdminCustomerDetail }>(`/admin/customers/${id}`, undefined, signal),
    [id],
  );

  const customer = state.data?.customer;
  const suspended = Boolean(customer?.suspendedAt);
  const mayWrite = can(staff, 'customers.write');
  const mayCollect = can(staff, 'orders.write');
  const menuKit = useMenuKit();
  // The records of this customer: each menu is the one of the same record in its own list.
  const instanceActions = (instance: DetailInstance): MenuItem[] => [
    menuKit.go('open', 'Open service control', 'arrowUR', `/admin/services/${encodeURIComponent(instance.id)}`),
    menuKit.copy('copy-id', 'instance ID', instance.id, { separated: true }),
    menuKit.copy('copy-name', 'instance name', instance.name),
    ...(can(staff, 'services.write') ? [menuKit.go('limits', 'Change resources…', 'bolt', `/admin/services/${encodeURIComponent(instance.id)}/limits/edit`, { separated: true })] : []),
  ];
  const orderActions = (order: DetailOrder): MenuItem[] => {
    const items: MenuItem[] = [
      menuKit.go('open', 'Open order', 'arrowUR', `/admin/orders/${encodeURIComponent(order.id)}`),
      menuKit.copy('copy-number', 'order number', order.number, { separated: true }),
      menuKit.copy('copy-id', 'order ID', order.id),
    ];
    if (mayCollect && order.total > 0 && (order.status === 'paid' || order.status === 'fulfilled')) {
      items.push(
        menuKit.go('refund-part', 'Refund part…', 'card', `/admin/orders/${encodeURIComponent(order.id)}/partial-refund`, { separated: true }),
        menuKit.go('refund', 'Refund in full…', 'card', `/admin/orders/${encodeURIComponent(order.id)}/refund`, { danger: true }),
      );
    }
    return items;
  };
  const ticketActions = (ticket: DetailTicket): MenuItem[] => [
    menuKit.go('open', 'Open conversation', 'chat', `/admin/tickets/${encodeURIComponent(ticket.id)}`),
    menuKit.copy('copy-number', 'ticket number', `#${ticket.number}`, { separated: true }),
    menuKit.copy('copy-link', 'ticket link', `${window.location.origin}/admin/tickets/${encodeURIComponent(ticket.id)}`),
  ];
  // There is no invoice page for the staff: the number and the id are what a billing question needs.
  const invoiceActions = (invoice: DetailInvoice): MenuItem[] => [
    menuKit.copy('copy-number', 'invoice number', invoice.number),
    menuKit.copy('copy-id', 'invoice ID', invoice.id),
  ];

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
            <div className="rounded-2xl bg-s2 p-3.5 sm:col-span-2 lg:col-span-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Billing address</dt>
              <dd className="mt-1 text-[14px] text-ink">{customer.billingAddress ? Object.values(customer.billingAddress).filter(Boolean).join(', ') : DASH}</dd>
            </div>
          </dl>

          {suspended && (
            <p className="rounded-2xl bg-warn/12 px-4 py-3 text-[13.5px] text-ink2">
              Suspended on {fmtDate(customer.suspendedAt)}. Every session of this account was ended.
            </p>
          )}
        </div>
      </Panel>

      <nav aria-label="Customer record sections" className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <div className="flex min-w-max gap-1.5">
          {([
            ['overview', 'Overview'],
            ['services', 'Services'],
            ['billing', 'Billing'],
            ['support', 'Support'],
            ['growth', 'Growth'],
            ['security', 'Account & security'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={section === key ? 'page' : undefined}
              onClick={() => setSection(key)}
              className={section === key
                ? 'rounded-xl bg-acc px-4 py-2.5 text-[13.5px] font-semibold text-on-acc'
                : denseGhost}
            >{label}</button>
          ))}
        </div>
      </nav>
      {section === 'overview' && (
        <RiskPanel customerId={customer.id} mayWrite={mayWrite} onChanged={state.reload} />
      )}
      {section === 'growth' && <CustomerGrowth customerId={customer.id} />}
      {section === 'security' && (
        <>
      <AccountAccess
        customerId={customer.id}
        suspended={suspended}
        masked={masked}
        instanceCount={instanceCount}
        mayWrite={mayWrite}
        onChanged={state.reload}
      />

      {mayWrite && <AccountTools customerId={customer.id} />}
        </>
      )}
      {section === 'billing' && <CreditSummary customerId={customer.id} />}
      {section === 'billing' && mayWrite && <CreditPanel customerId={customer.id} />}
      {section === 'services' && (
        <>
      <SubscriptionsPanel customerId={customer.id} mayWrite={mayWrite} />
      <PanelAccessPanel customerId={customer.id} mayWrite={can(staff, 'services.write')} />

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
              rowActions={instanceActions}
              rowLabel={(instance) => `instance ${instance.name}`}
              columns={[
                {
                  key: 'name',
                  header: 'Instance',
                  truncate: true,
                  render: (instance: DetailInstance) => (
                    <span className="block min-w-0">
                      <Link to={`/admin/services/${instance.id}`} className="block truncate font-bold tracking-[-0.02em] text-ink hover:text-acc" title={instance.name}>{instance.name}</Link>
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
            <CardList<DetailInstance> rows={customer.instances} rowKey={(instance) => instance.id} rowActions={instanceActions} rowLabel={(instance) => `instance ${instance.name}`}>
              {(instance) => (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/admin/services/${instance.id}`} className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-acc" title={instance.name}>{instance.name}</Link>
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

        </>
      )}
      {section === 'billing' && (
        <>
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
              rowActions={invoiceActions}
              rowLabel={(invoice) => `invoice ${invoice.number}`}
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
                ...(mayCollect
                  ? [{
                      key: 'collect',
                      header: '',
                      align: 'right' as const,
                      nowrap: true,
                      render: (invoice: DetailInvoice) => <CollectionConfirm invoice={invoice} onDone={state.reload} />,
                    }]
                  : []),
              ]}
            />
            <CardList<DetailInvoice> rows={customer.invoices} rowKey={(invoice) => invoice.id} rowActions={invoiceActions} rowLabel={(invoice) => `invoice ${invoice.number}`}>
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
                    {mayCollect && <CollectionConfirm invoice={invoice} onDone={state.reload} />}
                  </div>
                </div>
              )}
            </CardList>
              <TruncationNote shown={customer.invoices.length} total={customer.counts?.invoices} />
          </div>
        )}
      </Panel>

        </>
      )}
      {section === 'support' && (
        <>
      <NotesPanel customerId={customer.id} mayWrite={mayWrite} />
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
              rowActions={ticketActions}
              rowLabel={(ticket) => `ticket #${ticket.number}`}
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
            <CardList<DetailTicket> rows={customer.tickets} rowKey={(ticket) => ticket.id} rowActions={ticketActions} rowLabel={(ticket) => `ticket #${ticket.number}`}>
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

        </>
      )}
      {section === 'billing' && (
        <>
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
              rowActions={orderActions}
              rowLabel={(order) => `order ${order.number}`}
              columns={[
                {
                  key: 'number',
                  header: 'Number',
                  nowrap: true,
                  render: (order: DetailOrder) => <Link to={`/admin/orders/${order.id}`} className="font-mono text-[13px] text-acc hover:underline">{order.number}</Link>,
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
            <CardList<DetailOrder> rows={customer.orders} rowKey={(order) => order.id} rowActions={orderActions} rowLabel={(order) => `order ${order.number}`}>
              {(order) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/admin/orders/${order.id}`} className="block truncate font-mono text-[13.5px] text-acc" title={order.number}>{order.number}</Link>
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

        </>
      )}
      <p className="px-1 text-[13.5px] text-ink3">
        <Link to="/admin/customers" className="font-bold text-acc hover:underline">
          Back to the customer list
        </Link>
      </p>
    </div>
  );
}

/** What the staff does to the account itself: the name, the address, the password link, the sessions. */
function AccountTools({ customerId }: { customerId: string }) {
  const base = `/admin/customers/${encodeURIComponent(customerId)}`;
  return (
    <Panel title="Account tools" description="Each action is written to the audit log.">
      <div className="flex flex-wrap gap-2">
        <Link to={`${base}/profile/edit`} className={denseGhost}>Edit the name</Link>
        <Link to={`${base}/security`} className={denseGhost}>Security actions</Link>
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
        {mayWrite && <div><Link to={`/admin/customers/${encodeURIComponent(customerId)}/notes/new`} className={denseGhost}>New note</Link></div>}
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

interface Risk { score: number; level: 'low' | 'medium' | 'high'; decision: 'approved' | 'review' | 'blocked' | 'unreviewed'; signals: { id: string; weight: number; text: string }[] }

/** How much to look twice at this account, and why. It decides nothing: it lists what looks unusual. */
function RiskPanel({ customerId, mayWrite, onChanged }: { customerId: string; mayWrite: boolean; onChanged: () => void }) {
  const state = useAsync<{ risk: Risk }>((signal) => get<{ risk: Risk }>(`/admin/customers/${customerId}/risk`, undefined, signal), [customerId]);
  const risk = state.data?.risk;
  const toast = useToast();
  const [decision, setDecision] = useState<'approved' | 'review' | 'blocked' | 'clear' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Risk" description="Signals from what the account does. A guide for where to look, not a verdict.">
      {state.loading && !state.data ? (
        <LoadingBlock rows={1} label="Reading the signals" />
      ) : state.error || !risk ? (
        <ErrorState title="The signals could not be read" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold uppercase ${risk.level === 'high' ? 'bg-bad/15 text-bad' : risk.level === 'medium' ? 'bg-warn/15 text-warn' : 'bg-acc-bg text-acc'}`}>{risk.level}</span>
            <span className="font-mono text-[15px] font-semibold text-ink">{risk.score} / 100</span>
            <StatusPill status={risk.decision === 'blocked' ? 'failed' : risk.decision === 'approved' ? 'active' : risk.decision === 'review' ? 'pending' : 'unknown'} label={risk.decision} />
          </div>
          {mayWrite && <div className="flex flex-wrap gap-2"><button type="button" className={denseGhost} onClick={() => { setReason(''); setDecision('approved'); }}>Approve</button><button type="button" className={denseGhost} onClick={() => { setReason(''); setDecision('review'); }}>Needs review</button><button type="button" className={denseDanger} onClick={() => { setReason(''); setDecision('blocked'); }}>Block account</button>{risk.decision !== 'unreviewed' && <button type="button" className={denseGhost} onClick={() => { setReason(''); setDecision('clear'); }}>Clear decision</button>}</div>}
          {risk.signals.length === 0 ? (
            <p className="text-[13.5px] text-ink2">Nothing looks unusual.</p>
          ) : (
            <ul className="grid gap-1.5">
              {risk.signals.map((signal) => (
                <li key={signal.id} className="flex items-start justify-between gap-3 rounded-2xl bg-s2 px-4 py-2.5 text-[13.5px] text-ink2">
                  <span>{signal.text}</span>
                  <span className={`shrink-0 font-mono text-[12.5px] ${signal.weight < 0 ? 'text-acc' : 'text-ink3'}`}>{signal.weight > 0 ? '+' : ''}{signal.weight}</span>
                </li>
              ))}
            </ul>
          )}
          <ConfirmWithReason open={decision !== null} title={decision === 'blocked' ? 'Block this customer?' : `Mark risk as ${decision ?? 'reviewed'}?`} description={decision === 'blocked' ? 'The account is suspended and every active session is revoked. Services are not deleted.' : 'The decision, reason and operator are stored in the customer notes and audit log.'} confirmLabel={decision === 'blocked' ? 'Block account' : 'Save decision'} reasonLabel="Reason" reason={reason} onReasonChange={setReason} busy={busy} error={reason.trim().length < 5 ? 'Write at least five characters.' : null} onCancel={() => setDecision(null)} onConfirm={() => { if (!decision || reason.trim().length < 5) return; setBusy(true); post(`/admin/customers/${customerId}/risk-decision`, { decision, reason: reason.trim() }).then(() => { toast.push('Risk decision saved.', 'ok'); setDecision(null); state.reload(); onChanged(); }, (error) => toast.push(error instanceof Error ? error.message : 'That did not work.', 'error')).finally(() => setBusy(false)); }} />
        </div>
      )}
    </Panel>
  );
}

interface CreditState { entries: { id: string; kind: string; amount: number; currency: string; reason: string; actorEmail: string | null; createdAt: string }[]; providerBalance: number | null; canCredit: boolean }

/** A credit for the customer. It goes to their balance at the payment provider, which takes it off their next invoice by itself. */
/** The credit balance at the top of the page, so it is not found only by scrolling to the Credit panel. */
function CreditSummary({ customerId }: { customerId: string }) {
  const state = useAsync<CreditState>((signal) => get<CreditState>(`/admin/customers/${customerId}/credit`, undefined, signal), [customerId]);
  const balance = state.data?.providerBalance ?? 0;
  if (balance === 0) return null;
  return (
    <p role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[14px] text-ink">
      <strong>{balance < 0 ? `${(-balance / 100).toFixed(2)} in credit` : `${(balance / 100).toFixed(2)} owed by the customer`}</strong> at the payment provider. {balance < 0 ? 'It is taken off their next invoice.' : ''}
    </p>
  );
}

function CreditPanel({ customerId }: { customerId: string }) {
  const state = useAsync<CreditState>((signal) => get<CreditState>(`/admin/customers/${customerId}/credit`, undefined, signal), [customerId]);
  const data = state.data;
  return (
    <Panel title="Credit" description="Money the platform gives the customer. It is taken off their next invoice.">
      {state.loading && !data ? <LoadingBlock rows={1} label="Loading the credit" /> : state.error || !data ? (
        <ErrorState title="The credit could not be read" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />
      ) : (
        <div className="grid gap-3">
          <p className="text-[14px] text-ink2">
            Balance at the payment provider: {data.providerBalance === null ? 'not available' : data.providerBalance < 0 ? `${(-data.providerBalance / 100).toFixed(2)} in credit` : data.providerBalance === 0 ? 'none' : `${(data.providerBalance / 100).toFixed(2)} owed by the customer`}.
          </p>
          {data.canCredit ? (
            <div><Link to={`/admin/customers/${encodeURIComponent(customerId)}/credit/adjust`} className={denseDanger}>Give credit</Link></div>
          ) : (
            <p className="text-[13px] text-ink3">A credit needs a customer at the payment provider (they have not started a checkout yet).</p>
          )}
          {data.entries.length > 0 && (
            <ul className="grid gap-1.5">
              {data.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-2.5 text-[13.5px] text-ink2">
                  <span>{entry.kind === 'credit' ? 'Credit' : 'Refund'} · {entry.reason} <span className="text-ink3">— {entry.actorEmail ?? 'staff'}, {fmtDate(entry.createdAt)}</span></span>
                  <span className="font-mono font-semibold text-ink">{(entry.amount / 100).toFixed(2)} {entry.currency}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * Marks an invoice as paid when the money arrived outside the payment provider.
 *
 * Only an open invoice shows the button. The reference of the payment is required and goes to the
 * audit log; the server pays the invoice and extends the period of the service once, and confirming
 * the same invoice again does nothing.
 */
function CollectionConfirm({ invoice, onDone }: { invoice: DetailInvoice; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  if (invoice.status.toLowerCase() !== 'open') return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await post(`/admin/invoices/${invoice.id}/confirm-collection`, { reference: reference.trim() });
      toast.push(`Invoice ${invoice.number} is paid.`, 'ok');
      setOpen(false);
      setReference('');
      onDone();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={denseGhost} onClick={() => setOpen(true)}>Mark as paid</button>
      <ConfirmWithReason
        open={open}
        title={`Mark invoice ${invoice.number} as paid?`}
        description="Use this only when the money arrived outside the payment provider, for example a bank transfer. The invoice becomes paid and the period of the service is extended once."
        confirmLabel="Mark as paid"
        reasonLabel="Reference of the payment"
        reason={reference}
        onReasonChange={setReference}
        onCancel={() => setOpen(false)}
        onConfirm={() => { if (reference.trim().length >= 3) void confirm(); }}
        busy={busy}
        error={reference.trim().length < 3 ? 'Write the reference of the payment, at least three characters.' : null}
        destructive={false}
      />
    </>
  );
}

interface PanelAccess { userId: number | null; externalId: string | null; hasCredential: boolean; credentialSource: string | null; credentialUsedAt: string | null; bridgeEnabled: boolean }

/**
 * The game panel account of the customer and the key that opens it.
 *
 * The key is never shown, only whether there is one, where it came from and when it was last used.
 * An operator can paste a key when the bridge of the panel is not installed, or forget the stored
 * one. The key goes to the server over the session and is stored encrypted.
 */
function PanelAccessPanel({ customerId, mayWrite }: { customerId: string; mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ panel: PanelAccess }>((signal) => get(`/admin/customers/${customerId}/panel`, undefined, signal), [customerId]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const panel = state.data?.panel;

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      toast.push(message, 'ok');
      setToken('');
      setForgetting(false);
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Game panel access" description="The panel account of this customer and the key the platform uses for it. The key is never shown.">
      {state.loading ? <LoadingBlock rows={2} label="Loading the panel account" /> : state.error || !panel ? <ErrorState title="The panel account could not be read" message={state.error?.message ?? 'No answer.'} onRetry={state.reload} /> : (
        <div className="grid gap-3">
          <dl className="grid gap-2 text-[13.5px] sm:grid-cols-2">
            <div className="rounded-2xl bg-s2 px-4 py-3"><dt className="text-ink3">Panel account</dt><dd className="text-ink">{panel.userId ?? 'None yet'}</dd></div>
            <div className="rounded-2xl bg-s2 px-4 py-3"><dt className="text-ink3">Stored key</dt><dd className="text-ink">{panel.hasCredential ? `Yes (${panel.credentialSource ?? 'unknown source'}), last used ${panel.credentialUsedAt ? fmtDate(panel.credentialUsedAt) : 'never'}` : 'No'}</dd></div>
            <div className="rounded-2xl bg-s2 px-4 py-3 sm:col-span-2"><dt className="text-ink3">Key bridge of the panel</dt><dd className="text-ink">{panel.bridgeEnabled ? 'Installed: keys are issued by the panel.' : 'Not installed: a key has to be pasted here.'}</dd></div>
          </dl>
          {mayWrite && panel.userId !== null && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-[12.5px] font-medium text-ink">New key
                <input className={denseInput} type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Client key from the panel" />
              </label>
              <button type="button" className={denseGhost} disabled={busy || token.trim().length < 20} onClick={() => void run(() => post(`/admin/customers/${customerId}/panel/credential`, { token: token.trim() }), 'The key is stored.')}>Store key</button>
              {panel.hasCredential && <button type="button" className={denseDanger} disabled={busy} onClick={() => setForgetting(true)}>Forget key</button>}
            </div>
          )}
          {mayWrite && panel.userId === null && <p className="text-[13px] text-ink2">This customer has no panel account yet. It is created with their first game server.</p>}
        </div>
      )}
      <ConfirmDialog
        open={forgetting}
        title="Forget the stored key?"
        description="The next operation on this customer's servers asks for a new key. Nothing is deleted on the panel."
        confirmLabel="Forget key"
        busy={busy}
        onCancel={() => setForgetting(false)}
        onConfirm={() => void run(() => del(`/admin/customers/${customerId}/panel/credential`), 'The key is forgotten.')}
      />
    </Panel>
  );
}

function CustomerGrowth({ customerId }: { customerId: string }) {
  const state = useAsync<{ facts: { key: string; value: string; source: string }[]; tags: string[]; marketing: { marketing: boolean; marketingOptInAt: string | null } | null }>(
    (signal) => get(`/admin/customers/${encodeURIComponent(customerId)}/crm`, undefined, signal),
    [customerId],
  );
  return (
    <Panel title="Customer 360 facts" description="Billing, consent, Discord and support. Campaigns stay on the CRM desk and never send without consent.">
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading facts" />
        : state.error ? <ErrorState title="Facts could not be loaded" message={state.error.message} onRetry={state.reload} />
        : (
          <dl className="grid gap-2 sm:grid-cols-2">
            {(state.data?.facts ?? []).map((fact) => (
              <div key={`${fact.source}:${fact.key}`} className="rounded-2xl bg-s2 px-4 py-3">
                <dt className="text-[12.5px] text-ink3">{fact.key} · {fact.source}</dt>
                <dd className="text-[14px] text-ink">{fact.value}</dd>
              </div>
            ))}
            <div className="rounded-2xl bg-s2 px-4 py-3">
              <dt className="text-[12.5px] text-ink3">marketing</dt>
              <dd className="text-[14px] text-ink">{state.data?.marketing?.marketing ? 'opt-in' : 'suppressed or unset'}</dd>
            </div>
          </dl>
        )}
    </Panel>
  );
}
