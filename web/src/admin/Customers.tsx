import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill } from '../ui-app';
import type { TableColumn } from '../lib/table';
import { DASH, LiveRegion, TruncationNote, denseGhost, denseInput, fmtDate, maskEmail } from './Overview';

/**
 * Staff customer list — GET /api/admin/customers?search=
 *
 * E-mail addresses are masked by default. Revealing one is a local view
 * toggle only: the API has no endpoint that records a reveal, so nothing is
 * written to the audit log and the button says so.
 */

interface AdminCustomer {
  id: string;
  email: string;
  name: string | null;
  role?: string;
  tags?: string[];
  createdAt: string;
  verified: boolean;
  suspended: boolean;
  instanceCount: number;
  orderCount: number;
  ticketCount: number;
  monthlyValue: number;
}

export default function Customers() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [showEmails, setShowEmails] = useState(false);
  const [role, setRole] = useState<'all' | 'customer' | 'staff'>('all');
  const [tag, setTag] = useState('');
  const tagsState = useAsync((signal) => get<{ tags: { tag: string; count: number }[] }>('/admin/tags', undefined, signal), []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const state = useAsync(
    (signal) => get<{ customers: AdminCustomer[]; total?: number }>('/admin/customers', { search: query || undefined, role, tag: tag || undefined }, signal),
    [query, role, tag],
  );

  const customers = state.data?.customers ?? [];
  const total = state.data?.total;
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  const columns: TableColumn<AdminCustomer>[] = [
    {
      key: 'customer',
      header: 'Customer',
      truncate: true,
      render: (customer: AdminCustomer) => (
        <Link
          to={`/admin/customers/${customer.id}`}
          className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <span className="block truncate text-[14px] font-medium tracking-[-0.02em] text-ink" title={customer.name ?? 'No name'}>
            {customer.name ?? 'No name'}
            {customer.role && customer.role !== 'customer' && (
              <span className="ml-2 rounded-full bg-s3 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">{customer.role}</span>
            )}
            {(customer.tags ?? []).map((entry) => (
              <span key={entry} className="ml-2 rounded-full bg-s3 px-2 py-0.5 align-middle text-[11px] font-semibold text-ink2">{entry}</span>
            ))}
            {customer.suspended && (
              <span className="ml-2 align-middle">
                <StatusPill status="suspended" label="Suspended" />
              </span>
            )}
          </span>
          <span className="block truncate font-mono text-[12.5px] text-ink3" title={email(customer.email)}>
            {email(customer.email)}
          </span>
        </Link>
      ),
    },
    {
      key: 'instances',
      header: 'Instances',
      align: 'right',
      nowrap: true,
      render: (customer: AdminCustomer) => <span className="font-mono tabular-nums text-ink2">{customer.instanceCount}</span>,
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      nowrap: true,
      render: (customer: AdminCustomer) => <span className="font-mono tabular-nums text-ink2">{customer.orderCount}</span>,
    },
    {
      key: 'tickets',
      header: 'Tickets',
      align: 'right',
      nowrap: true,
      render: (customer: AdminCustomer) => <span className="font-mono tabular-nums text-ink2">{customer.ticketCount}</span>,
    },
    {
      key: 'value',
      header: 'Monthly value',
      align: 'right',
      nowrap: true,
      render: (customer: AdminCustomer) => <Money amount={customer.monthlyValue} period="month" />,
    },
    {
      key: 'verified',
      header: 'Verified',
      nowrap: true,
      render: (customer: AdminCustomer) =>
        customer.verified ? (
          <StatusPill status="active" label="Verified" />
        ) : (
          <StatusPill status="pending" label="Unverified" />
        ),
    },
    {
      key: 'created',
      header: 'Created',
      nowrap: true,
      render: (customer: AdminCustomer) => <span className="text-ink2">{fmtDate(customer.createdAt)}</span>,
    },
  ];

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${customers.length} customer${customers.length === 1 ? '' : 's'}`} />
      <Panel
        title="Customers"
        description="Search by name or e-mail address. Every row links to the customer record."
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
          <Field label="Accounts" htmlFor="customer-role">
            <select id="customer-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className={denseInput}>
              <option value="all">Everyone</option>
              <option value="customer">Customers</option>
              <option value="staff">Staff and administrators</option>
            </select>
          </Field>
          {(tagsState.data?.tags.length ?? 0) > 0 && (
            <Field label="Tag" htmlFor="customer-tag">
              <select id="customer-tag" value={tag} onChange={(event) => setTag(event.target.value)} className={denseInput}>
                <option value="">Any tag</option>
                {tagsState.data!.tags.map((entry) => <option key={entry.tag} value={entry.tag}>{entry.tag} ({entry.count})</option>)}
              </select>
            </Field>
          )}
          <Field label="Search" htmlFor="customer-search" hint="Matches the name or the e-mail address.">
            <input
              id="customer-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or e-mail address"
              className={denseInput}
            />
          </Field>

          {state.loading ? (
            <LoadingBlock rows={4} label="Loading customers" />
          ) : state.error ? (
            <ErrorState
              title="The customer list could not be loaded"
              message={state.error.message}
              onRetry={state.reload}
            />
          ) : !customers.length ? (
            <EmptyState
              title={query ? 'No account matches that search.' : 'No accounts yet.'}
              description={
                query
                  ? 'Try a different name or e-mail address.'
                  : 'Accounts appear here as soon as they register.'
              }
            />
          ) : (
            <div className="grid gap-3">
              <DataTable<AdminCustomer>
                rows={customers}
                rowKey={(customer) => customer.id}
                columns={columns}
              />
              <CardList<AdminCustomer> rows={customers} rowKey={(customer) => customer.id}>
                {(customer) => (
                  <Link to={`/admin/customers/${customer.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p
                          className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink"
                          title={customer.name ?? 'No name'}
                        >
                          {customer.name ?? 'No name'}
                        </p>
                        <p className="truncate font-mono text-[12.5px] text-ink3" title={email(customer.email)}>
                          {email(customer.email)}
                        </p>
                      </div>
                      {customer.suspended ? (
                        <StatusPill status="suspended" label="Suspended" />
                      ) : customer.verified ? (
                        <StatusPill status="active" label="Verified" />
                      ) : (
                        <StatusPill status="pending" label="Unverified" />
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                      <div>
                        <dt className="text-ink3">Instances</dt>
                        <dd className="font-mono tabular-nums text-ink">{customer.instanceCount}</dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Orders</dt>
                        <dd className="font-mono tabular-nums text-ink">{customer.orderCount}</dd>
                      </div>
                      <div>
                        <dt className="text-ink3">Tickets</dt>
                        <dd className="font-mono tabular-nums text-ink">{customer.ticketCount}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink3">Monthly</dt>
                        <dd>
                          {/* The label already says the period, and the period suffix
                              does not fit next to the amount on a narrow phone. */}
                          <Money amount={customer.monthlyValue} />
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[12.5px] text-ink3">Joined {fmtDate(customer.createdAt)}</p>
                  </Link>
                )}
              </CardList>
              <TruncationNote shown={customers.length} total={total} />
            </div>
          )}

          <p className="px-1 text-[12.5px] text-ink3">
            Monthly value is the sum of the live instances of that customer. Values the API does not return are shown as {DASH}.
          </p>
        </div>
      </Panel>
    </div>
  );
}
