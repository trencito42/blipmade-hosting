import { useEffect, useMemo, useState } from 'react';
import { ProductTile } from '../ui';
import { Icon, type IconName } from '../icons';
import { get, type Instance } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingBlock,
  Money,
  Panel,
  StatTile,
  StatusPill,
} from '../ui-app';
import { catalogPath, useDeployableProducts } from '../lib/pricing';
import { deployPathFor, startingConfiguration } from '../lib/pricing-contract';

/**
 * Customer overview. Reads the real instance list only: every number on this
 * page comes from GET /api/instances. Nothing here is simulated.
 *
 * A new account gets one onboarding panel instead of three empty panels, and
 * an account with services gets the facts that are worth a panel.
 */

const KNOWN_ICONS: readonly IconName[] = [
  'arrow', 'arrowUR', 'check', 'search', 'menu', 'close', 'eye', 'eyeOff', 'globe', 'db',
  'folder', 'term', 'chart', 'card', 'rocket', 'shield', 'restart', 'box', 'bolt', 'bot',
  'mon', 'flow', 'code', 'doc',
];

function productIcon(icon: string): IconName {
  return KNOWN_ICONS.includes(icon as IconName) ? (icon as IconName) : 'box';
}

/** Purchased memory, never live usage. */
function fmtRam(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${mb} MB`;
  const gb = Math.round((mb / 1024) * 100) / 100;
  return `${gb} GB`;
}

function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Reasons this instance needs the customer to act. Empty when all is well. */
function attentionReasons(instance: Instance): string[] {
  const reasons: string[] = [];
  if (instance.status === 'failed') reasons.push('Status is failed.');
  else if (instance.status === 'degraded') reasons.push('Status is degraded.');
  else if (instance.status === 'suspended') reasons.push('Status is suspended.');
  if (instance.subscription?.status === 'past_due') reasons.push('Subscription payment is past due.');
  return reasons;
}

interface InstanceEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

interface ActivityRow {
  instanceId: string;
  instanceName: string;
  event: InstanceEvent;
}

/**
 * The events endpoint is per instance, so the overview asks each of the most
 * recent instances for its latest event. Failures are reported, never hidden.
 */
function useRecentActivity(instances: Instance[] | undefined) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [nonce, setNonce] = useState(0);

  const ids = useMemo(() => (instances ?? []).slice(0, 5).map((instance) => instance.id), [instances]);
  const key = ids.join(',');

  useEffect(() => {
    if (!instances) return;
    if (!ids.length) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await get<{ events: InstanceEvent[] }>(`/instances/${id}/events`, undefined, controller.signal);
          return { id, events: res.events ?? [], ok: true };
        } catch {
          return { id, events: [] as InstanceEvent[], ok: false };
        }
      }),
    ).then((results) => {
      if (!active) return;
      const names = new Map<string, string>(instances.map((instance) => [instance.id, instance.name] as const));
      const latest: ActivityRow[] = [];
      for (const result of results) {
        const sorted = result.events
          .slice()
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        const event = sorted[0];
        if (event) latest.push({ instanceId: result.id, instanceName: names.get(result.id) ?? result.id, event });
      }
      latest.sort((a, b) => Date.parse(b.event.createdAt) - Date.parse(a.event.createdAt));
      setRows(latest);
      const allFailed = results.every((result) => !result.ok);
      setError(allFailed ? new Error('The activity feed could not be loaded from the API.') : null);
      setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { loading, error, rows, reload: () => setNonce((n) => n + 1) };
}

export default function Overview() {
  const { data, loading, error, reload } = useAsync(
    (signal) => get<{ instances: Instance[] }>('/instances', undefined, signal),
    [],
  );

  const instances = data?.instances;
  const activity = useRecentActivity(instances);
  const { products: deployable, loading: catalogLoading } = useDeployableProducts();

  const attention = (instances ?? []).filter((instance) => attentionReasons(instance).length > 0);
  const total = (instances ?? []).reduce((sum, instance) => sum + (instance.price ?? 0), 0);
  const currency = instances?.[0]?.currency ?? 'EUR';
  const count = instances?.length ?? 0;

  if (loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your dashboard" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="We could not load your dashboard"
        message={error.message}
        onRetry={reload}
      />
    );
  }

  // A new account gets one panel that explains the next step, not three empty
  // panels that each say there is nothing here.
  if (count === 0) {
    return (
      <div className="grid gap-4">
        <Panel
          title="Deploy your first app"
          description="Pick an app, choose the resources, and it runs on its own."
        >
          <p className="text-[15px] leading-relaxed text-ink2">
            Every service is billed monthly for the memory, CPU and storage you choose. Nothing is billed before you
            order, and you can change the size of a service whenever you need more room.
          </p>

          {/* The next step is one button on a phone, both of them within reach
              of a thumb instead of side by side in a narrow row. */}
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
            <ButtonLink to="/app/deploy" className="w-full sm:w-auto">
              <Icon name="rocket" size={16} />
              Choose an app
            </ButtonLink>
            <ButtonLink to={catalogPath()} variant="soft" className="w-full sm:w-auto">
              Browse the public catalog
            </ButtonLink>
          </div>

          {catalogLoading ? (
            <p className="mt-4 text-[13px] text-ink3">Loading the catalog…</p>
          ) : deployable.length > 0 ? (
            <>
              <p className="mt-5 text-[13px] text-ink3">Ready to deploy right now:</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {deployable.slice(0, 4).map((product) => (
                  <Link
                    key={product.id}
                    to={deployPathFor(product.slug, startingConfiguration(product))}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-s2 p-3 transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <ProductTile slug={product.slug} icon={product.icon} size={36} />
                    <span className="w-0 min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-ink">{product.name}</span>
                      <span className="block truncate text-[12.5px] text-ink3">{product.description}</span>
                    </span>
                    {/* The price gets a line of its own on a phone, so the
                        name of the product is not cut to make room for it. */}
                    {product.price && (
                      <span className="w-full sm:w-auto">
                        <Money amount={product.price.amount} currency={product.price.currency} period="month" />
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
              Nothing can be ordered at the moment. The catalog on the site lists what is coming, and we will let you
              know when the first app is ready.
            </p>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {attention.length > 0 && (
        <Panel title="Needs attention">
          <div className="grid gap-1.5">
            {attention.map((instance) => (
              <ListRow
                key={instance.id}
                to={`/app/instances/${instance.id}`}
                title={instance.name}
                meta={attentionReasons(instance).join(' ')}
                right={<StatusPill status={instance.status} />}
              />
            ))}
          </div>
        </Panel>
      )}

      {/* The facts of the account, with the monthly total in the row where it
          belongs instead of a panel of its own. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon="box" label="Services" value={count} hint={count === 1 ? 'one app or database' : 'apps and databases'} />
        <StatTile icon="card" label="Monthly total" value={<Money amount={total} currency={currency} />} hint="What your services cost per month" />
        <StatTile
          icon={attention.length === 0 ? 'heart' : 'warn'}
          label="Needs attention"
          value={attention.length}
          hint={attention.length === 0 ? 'Everything is running' : 'Open the service below'}
        />
      </div>

      <Panel title="Your services">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {instances!.map((instance) => (
            <article key={instance.id} className="grid content-start gap-3 rounded-2xl bg-s2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <ProductTile slug={instance.product.slug} icon={instance.product.icon} />
                  <div className="w-0 min-w-0 flex-1">
                    <Link
                      to={`/app/instances/${instance.id}`}
                      className="block truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink transition-colors duration-[180ms] hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      {instance.name}
                    </Link>
                    <p className="truncate text-[13px] text-ink3">{instance.product.name}</p>
                  </div>
                </div>
                {/* On a phone the status gets a line of its own, so a long
                    name is not cut to make room for the pill. */}
                <div className="w-full sm:w-auto">
                  <StatusPill status={instance.status} />
                </div>
              </div>

              <ul aria-label="Purchased limits" className="flex flex-wrap gap-1.5 font-mono text-[12.5px] text-ink">
                {[fmtRam(instance.ram), `${instance.cpu} vCPU`, `${instance.disk} GB disk`].map((limit) => (
                  <li key={limit} className="rounded-lg bg-s3 px-2.5 py-1">{limit}</li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {instance.url ? (
                  <a
                    href={instance.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="-ml-2 inline-flex min-h-11 max-w-full items-center rounded-2xl px-2 text-[13.5px] font-medium text-acc underline underline-offset-2 transition-colors duration-[180ms] hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <span className="truncate">{instance.url}</span>
                  </a>
                ) : (
                  <span className="text-[13.5px] text-ink3">No public URL yet</span>
                )}
                <span className="text-[14px] text-ink2"><Money amount={instance.price ?? 0} currency={instance.currency} period="month" /></span>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Recent activity" description="The latest event of each service.">
        {activity.loading ? (
          <LoadingBlock rows={2} label="Loading recent activity" />
        ) : activity.error ? (
          <ErrorState title="Activity unavailable" message={activity.error.message} onRetry={activity.reload} />
        ) : activity.rows.length === 0 ? (
          <EmptyState title="No activity yet." description="Events appear here when something changes on a service." />
        ) : (
          <div className="grid gap-1.5">
            {activity.rows.map((row) => (
              <ListRow
                key={row.instanceId}
                to={`/app/instances/${row.instanceId}`}
                title={row.instanceName}
                meta={<><span className="text-ink2">{row.event.type.replace(/_/g, ' ')}</span> · {row.event.message}</>}
                right={<span className="font-mono text-[12px] text-ink3">{fmtDate(row.event.createdAt)}</span>}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
