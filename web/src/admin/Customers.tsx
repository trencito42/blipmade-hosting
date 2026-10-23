import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill } from '../ui-app';
import { DASH, LiveRegion, denseGhost, denseInput, fmtDate, maskEmail } from './Overview';

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

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const state = useAsync(
    (signal) => get<{ customers: AdminCustomer[] }>('/admin/customers', { search: query || undefined }, signal),
    [query],
  );

  const customers = state.data?.customers ?? [];
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  const columns = [
    {
      key: 'customer',
      header: 'Customer',
      render: (customer: AdminCustomer) => (
        <Link
          to={`/admin/customers/${customer.id}`}
          className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <span className="block truncate text-[14px] font-bold tracking-[-0.02em] text-ink" title={customer.name ?? 'No name'}>
            {customer.name ?? 'No name'}
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
      render: (customer: AdminCustomer) => <span className="font-mono tabular-nums text-ink2">{customer.instanceCount}</span>,
    },
    {
      key: 'orders',
      header: 'Orders',
      render: (customer: AdminCustomer) => <span className="font-mono tabular-nums text-ink2">{customer.orderCount}</span>,
    },
    {
      key: 'tickets',
      header: 'Tickets',
      render: (customer: AdminCustomer) => <span className="font-mono tabular-nums text-ink2">{customer.ticketCount}</span>,
    },
    {
      key: 'value',
      header: 'Monthly value',
      render: (customer: AdminCustomer) => <Money amount={customer.monthlyValue} period="month" />,
    },
    {
      key: 'verified',
      header: 'Verified',
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
      render: (customer: AdminCustomer) => <span className="text-ink2">{fmtDate(customer.createdAt)}</span>,
    },
  ];

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${customers.length} customer${customers.length === 1 ? '' : 's'}`} />
      <Panel
        title="Customers"
        description="Search by name or e-mail address. Every row links to the customer record."
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
              title={query ? 'No customer matches that search.' : 'No customers yet.'}
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
                      <div className="min-w-0">
                        <p
                          className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink"
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
