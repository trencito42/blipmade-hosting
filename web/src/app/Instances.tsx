import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { get, type Instance } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Money, StatusPill, TextInput } from '../ui-app';

/**
 * Instance list. Filters are applied to the real list returned by
 * GET /api/instances. The desktop table and the phone card list render the
 * exact same rows.
 */

const primaryLink =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/** Purchased memory, never live usage. */
function fmtRam(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${mb} MB`;
  const gb = Math.round((mb / 1024) * 100) / 100;
  return `${gb} GB`;
}

function limitsOf(instance: Instance): string {
  return `${fmtRam(instance.ram)} · ${instance.cpu} vCPU · ${instance.disk} GB disk`;
}

export default function Instances() {
  const { data, loading, error, reload } = useAsync(
    (signal) => get<{ instances: Instance[] }>('/instances', undefined, signal),
    [],
  );

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const instances = useMemo(() => data?.instances ?? [], [data]);

  // Only offer filters for statuses that actually exist in the list.
  const statuses = useMemo(() => {
    const seen: string[] = [];
    for (const instance of instances) if (!seen.includes(instance.status)) seen.push(instance.status);
    return seen;
  }, [instances]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return instances.filter((instance) => {
      const matchesQuery = !needle || instance.name.toLowerCase().includes(needle);
      const matchesStatus = status === 'all' || instance.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [instances, query, status]);

  const filtersActive = query.trim().length > 0 || status !== 'all';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[19px] font-extrabold tracking-[-0.035em] text-ink">Instances</h2>
          <p className="text-[13.5px] text-ink3">Your apps and databases, with the limits you bought.</p>
        </div>
        <Link to="/app/deploy/wordpress" className={primaryLink}>
          <Icon name="rocket" size={16} />
          Deploy new
        </Link>
      </div>

      <div className="grid gap-3">
        <TextInput
          label="Search instances"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
          autoComplete="off"
        />

        <div role="group" aria-label="Filter by status" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 bm-hide-scroll sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            type="button"
            aria-pressed={status === 'all'}
            onClick={() => setStatus('all')}
            className={`h-11 shrink-0 rounded-full px-5 text-[14.5px] font-bold transition-colors duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc ${
              status === 'all' ? 'bg-ink text-bg' : 'bg-s1 text-ink2 hover:bg-s2 hover:text-ink'
            }`}
          >
            All
          </button>
          {statuses.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={`h-11 shrink-0 rounded-full px-5 text-[14.5px] font-bold capitalize transition-colors duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc ${
                status === value ? 'bg-ink text-bg' : 'bg-s1 text-ink2 hover:bg-s2 hover:text-ink'
              }`}
            >
              {value.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingBlock rows={4} label="Loading your instances" />
      ) : error ? (
        <ErrorState title="We could not load your instances" message={error.message} onRetry={reload} />
      ) : instances.length === 0 ? (
        <EmptyState
          title="No instances yet. Pick an app."
          description="Deploy an app or database and it runs on the resources you choose."
          action={
            <Link to="/app/deploy/wordpress" className={primaryLink}>
              Browse the catalog
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No instances match your filters."
          description="Clear the search or pick another status to see your instances again."
          action={
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatus('all');
              }}
              className="inline-flex h-11 items-center justify-center rounded-full bg-s3 px-5 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:ring-2 focus-visible:ring-acc"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'instance',
                header: 'Instance',
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="block min-w-0 rounded-lg font-bold text-ink transition-colors duration-[180ms] hover:text-acc focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <span className="block truncate">{instance.name}</span>
                    <span className="block truncate text-[12.5px] font-normal text-ink3">{instance.product.name}</span>
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (instance: Instance) => <StatusPill status={instance.status} />,
              },
              {
                key: 'limits',
                header: 'Limits',
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="font-mono text-[13px] text-ink2 transition-colors duration-[180ms] hover:text-acc focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    {limitsOf(instance)}
                  </Link>
                ),
              },
              {
                key: 'price',
                header: 'Price',
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="text-ink transition-colors duration-[180ms] hover:text-acc focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
                  </Link>
                ),
              },
              {
                key: 'node',
                header: 'Node',
                render: (instance: Instance) => (
                  <span className="text-[13.5px] text-ink2">{instance.node?.name ?? '—'}</span>
                ),
              },
            ]}
            rows={filtered}
            rowKey={(instance: Instance) => instance.id}
          />

          <CardList rows={filtered} rowKey={(instance: Instance) => instance.id}>
            {(instance: Instance) => (
              <div className="grid gap-2">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <span className="block truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink">{instance.name}</span>
                    <span className="block truncate text-[12.5px] text-ink3">{instance.product.name}</span>
                  </Link>
                  <StatusPill status={instance.status} />
                </div>
                <p className="font-mono text-[13px] text-ink2">{limitsOf(instance)}</p>
                <div className="flex items-center justify-between gap-3">
                  <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
                  <span className="truncate text-[13px] text-ink3">{instance.node?.name ?? '—'}</span>
                </div>
              </div>
            )}
          </CardList>

          {filtersActive && (
            <p className="px-1 text-[13px] text-ink3" aria-live="polite">
              Showing {filtered.length} of {instances.length} instances.
            </p>
          )}
        </>
      )}
    </div>
  );
}
