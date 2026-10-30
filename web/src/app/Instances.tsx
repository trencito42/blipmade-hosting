import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { get, type CatalogProduct, type Instance } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import {
  ButtonLink,
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Segmented,
  SoftButton,
  StatusPill,
  TextInput,
} from '../ui-app';
import { catalogPath, formatPrice, periodLabel, productIcon } from '../lib/pricing';
import { deployPathFor, isOrderable, startingConfiguration } from '../lib/pricing-contract';

/**
 * Instance list. Filters are applied to the real list returned by
 * GET /api/instances. The desktop table and the phone card list render the
 * exact same rows.
 */

/** Purchased memory, never live usage. */
function fmtRam(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${mb} MB`;
  const gb = Math.round((mb / 1024) * 100) / 100;
  return `${gb} GB`;
}

/** The name of a state, written the way the pill of the table writes it. */
function stateLabel(state: string): string {
  return state.replace(/_/g, ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

/**
 * The state of an instance, as the customer sees it.
 *
 * The state comes from the node. When the node could not be asked, the last
 * known state is kept and the customer is told that it is not fresh any more:
 * a node that is quiet is not a service that is broken.
 */
function InstanceStatus({ instance }: { instance: Instance }) {
  return (
    <span className="inline-flex flex-col items-start gap-1 sm:items-end">
      <StatusPill status={instance.status} />
      {instance.runtime?.stale ? (
        <span className="text-[11.5px] text-ink3">Last known state · node not reachable</span>
      ) : null}
    </span>
  );
}

function limitsOf(instance: Instance): string {
  return `${fmtRam(instance.ram)} · ${instance.cpu} vCPU · ${instance.disk} GB`;
}

/**
 * The state of a customer without instances. It is not a dead end: it shows
 * what can be deployed right now, so the customer picks a product instead of
 * being sent to one by surprise.
 */
function NoInstances() {
  const catalog = useAsync<{ products: CatalogProduct[] }>(
    (signal) => get<{ products: CatalogProduct[] }>('/catalog/products', undefined, signal),
    [],
  );

  // Only the products the platform can really deliver are worth offering.
  const deployable = useMemo(
    () => (catalog.data?.products ?? []).filter((product) => isOrderable(product) && product.visible),
    [catalog.data],
  );

  return (
    <div className="grid gap-4">
      <EmptyState
        title="You have no apps or databases yet."
        description="Pick a product from the catalog. You choose the resources on the next screen and the server sets the price."
        action={
          <ButtonLink to="/app/deploy">
            <Icon name="rocket" size={16} />
            Choose a product
          </ButtonLink>
        }
      />

      {catalog.loading ? (
        <LoadingBlock rows={2} label="Loading the catalog" />
      ) : catalog.error ? (
        <ErrorState
          title="The catalog could not be loaded"
          message={catalog.error.message}
          onRetry={catalog.reload}
        />
      ) : deployable.length === 0 ? (
        <EmptyState
          title="Nothing can be deployed right now."
          description="The catalog is empty at the moment. Please check back later."
          action={
            <ButtonLink to={catalogPath()}>Browse the public catalog</ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-2.5">
          {deployable.map((product) => (
            <li
              key={product.slug}
              className="grid gap-3 rounded-2xl bg-s2 p-4 sm:flex sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[28%] bg-s3 text-acc">
                  <Icon name={productIcon(product.icon)} size={20} />
                </span>
                <div className="w-0 min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink">{product.name}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink2">{product.description}</p>
                  <p className="mt-1 font-mono text-[13px] text-ink3">
                    {product.price
                      ? `From ${formatPrice(product.price.amount, product.price.currency)} ${periodLabel(product.price.period)}`
                      : 'Not priced yet'}
                  </p>
                </div>
              </div>
              <ButtonLink to={deployPathFor(product.slug, startingConfiguration(product))} aria-label={`Deploy ${product.name}`} className="w-full shrink-0 sm:w-auto">
                Deploy
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Instances() {
  const { data, loading, error, reload } = useAsync(
    (signal) => get<{ instances: Instance[] }>('/instances', undefined, signal),
    [],
  );

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<'newest' | 'name' | 'price'>('newest');

  const instances = useMemo(() => data?.instances ?? [], [data]);

  // Only offer filters for statuses that actually exist in the list.
  const statuses = useMemo(() => {
    const seen: string[] = [];
    for (const instance of instances) if (!seen.includes(instance.status)) seen.push(instance.status);
    return seen;
  }, [instances]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = instances.filter((instance) => {
      const matchesQuery = !needle || instance.name.toLowerCase().includes(needle) || instance.product.name.toLowerCase().includes(needle);
      const matchesStatus = status === 'all' || instance.status === status;
      return matchesQuery && matchesStatus;
    });
    if (sort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'price') return [...found].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return [...found].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [instances, query, status, sort]);

  const filtersActive = query.trim().length > 0 || status !== 'all';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold tracking-[-0.035em] text-ink">Apps &amp; Databases</h2>
          <p className="text-[13.5px] text-ink3">Manage your deployed applications and databases.</p>
        </div>
        {/* The selector of the customer area, so the customer picks the
            product instead of being sent to one by surprise. */}
        <ButtonLink to="/app/deploy" className="w-full sm:w-auto lg:hidden">
          <Icon name="rocket" size={16} />
          Deploy new
        </ButtonLink>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-end">
          <TextInput
            label="Search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or product"
            autoComplete="off"
          />
          <label className="grid gap-1.5 text-[13.5px] font-medium text-ink">
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="h-12 rounded-xl border border-line bg-card px-3 text-[15px] font-normal text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              <option value="newest">Newest first</option>
              <option value="name">Name</option>
              <option value="price">Price: high to low</option>
            </select>
          </label>
        </div>

        {/* The band of filters is the shared selector of the interface: it
            scrolls sideways on a phone and its right edge fades, so it is
            clear that there is more to swipe. */}
        <Segmented
          role="group"
          ariaLabel="Filter instances by status"
          options={[
            { value: 'all', label: 'All' },
            ...statuses.map((value) => ({ value, label: stateLabel(value) })),
          ]}
          value={status}
          onChange={setStatus}
        />
      </div>

      {loading ? (
        <LoadingBlock rows={4} label="Loading your instances" />
      ) : error ? (
        <ErrorState title="We could not load your instances" message={error.message} onRetry={reload} />
      ) : instances.length === 0 ? (
        <NoInstances />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No instances match your filters."
          description="Clear the search or pick another status to see your instances again."
          action={
            <SoftButton
              onClick={() => {
                setQuery('');
                setStatus('all');
              }}
            >
              Clear filters
            </SoftButton>
          }
        />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'instance',
                header: 'Instance',
                truncate: true,
                width: '24%',
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="block min-w-0 rounded-lg font-bold text-ink transition-colors duration-[180ms] hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <span className="block truncate">{instance.name}</span>
                    <span className="block truncate text-[12.5px] font-normal text-ink3">{instance.product.name}</span>
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                nowrap: true,
                render: (instance: Instance) => <InstanceStatus instance={instance} />,
              },
              {
                key: 'limits',
                header: 'Resources',
                nowrap: true,
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="font-mono text-[13px] text-ink2 transition-colors duration-[180ms] hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    {limitsOf(instance)}
                  </Link>
                ),
              },
              {
                key: 'price',
                header: 'Price',
                align: 'right',
                nowrap: true,
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="text-ink transition-colors duration-[180ms] hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
                  </Link>
                ),
              },
              {
                key: 'address',
                header: 'Address',
                truncate: true,
                width: '24%',
                render: (instance: Instance) =>
                  instance.url ? (
                    <a
                      href={instance.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate rounded-lg font-mono text-[12.5px] text-acc underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      title={instance.url}
                    >
                      {instance.url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span className="text-[13px] text-ink3">Not published yet</span>
                  ),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                nowrap: true,
                render: (instance: Instance) => (
                  <Link
                    to={`/app/instances/${instance.id}`}
                    aria-label={`Manage ${instance.name}`}
                    className="inline-flex h-9 items-center rounded-full bg-s3 px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-s4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    Manage
                  </Link>
                ),
              },
            ]}
            rows={filtered}
            rowKey={(instance: Instance) => instance.id}
          />

          <CardList rows={filtered} rowKey={(instance: Instance) => instance.id}>
            {(instance: Instance) => (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    to={`/app/instances/${instance.id}`}
                    className="w-0 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <span className="block truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink">{instance.name}</span>
                    <span className="block truncate text-[12.5px] text-ink3">{instance.product.name}</span>
                  </Link>
                  {/* The status gets a line of its own on a phone, so a long
                      name is not cut to make room for the pill. */}
                  <div className="w-full sm:w-auto">
                    <InstanceStatus instance={instance} />
                  </div>
                </div>
                <p className="font-mono text-[13px] text-ink2">{limitsOf(instance)}</p>
                <div className="flex items-center justify-between gap-3">
                  <Money amount={instance.price ?? 0} currency={instance.currency} period="month" />
                  <span className="truncate font-mono text-[12.5px] text-ink3">{instance.url ? instance.url.replace(/^https?:\/\//, '') : 'Not published yet'}</span>
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
