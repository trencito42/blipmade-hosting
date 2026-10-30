import { useEffect, useMemo, useState } from 'react';
import { ProductTile } from '../ui';
import { Icon, type IconName } from '../icons';
import { get, type AccountBillingSummary, type Instance, type MailServiceView, type VpsServerView } from '../lib/api';
import { describeEvent, type ServiceEvent } from '../lib/activity';
import { countLine, latePayments, serviceRows, type ServiceRow } from '../lib/services';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { ButtonLink, EmptyState, ErrorState, ListRow, LoadingBlock, Money, Panel, StatTile, StatusPill } from '../ui-app';
import { catalogPath, useDeployableProducts } from '../lib/pricing';
import { deployPathFor, startingConfiguration } from '../lib/pricing-contract';

/**
 * The overview of the account.
 *
 * It reads the real data of the account: the apps and databases, the servers, the
 * plans of mail and the summary of what the account pays. A source that cannot be
 * read is said to be unavailable; it is never drawn as zero.
 */

function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : fmtDate(iso);
}

/** The mark of a service: the logo of an app, or the icon of a server or of mail. */
function ServiceTile({ row, size = 40 }: { row: ServiceRow; size?: number }) {
  if (row.kind === 'app') return <ProductTile slug={row.slug ?? ''} icon={row.icon ?? 'box'} size={size} />;
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-xl bg-acc-bg text-acc">
      <Icon name={(row.icon as IconName) ?? 'box'} size={Math.round(size * 0.42)} />
    </span>
  );
}

interface ActivityRow {
  key: string;
  to: string;
  title: string;
  detail: string | null;
  serviceName: string;
  at: string;
}

/**
 * The events endpoint belongs to one app, so the overview asks the most recent apps for
 * their latest event. It says what it covers, and a failure is reported, not hidden.
 */
function useRecentActivity(instances: Instance[] | undefined) {
  const [state, setState] = useState<{ loading: boolean; error: Error | null; rows: ActivityRow[] }>({ loading: true, error: null, rows: [] });
  const [nonce, setNonce] = useState(0);
  const ids = useMemo(() => (instances ?? []).slice(0, 5).map((instance) => instance.id), [instances]);
  const key = ids.join(',');

  useEffect(() => {
    if (!instances) return;
    if (!ids.length) {
      setState({ loading: false, error: null, rows: [] });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await get<{ events: ServiceEvent[] }>(`/instances/${id}/events`, undefined, controller.signal);
          return { id, events: res.events ?? [], ok: true };
        } catch {
          return { id, events: [] as ServiceEvent[], ok: false };
        }
      }),
    ).then((results) => {
      if (!active) return;
      const names = new Map(instances.map((instance) => [instance.id, instance.name] as const));
      const rows: ActivityRow[] = [];
      for (const result of results) {
        const latest = result.events.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        if (!latest) continue;
        const name = names.get(result.id) ?? 'The service';
        const text = describeEvent(latest, name);
        rows.push({ key: result.id, to: `/app/instances/${result.id}`, title: text.title, detail: text.detail, serviceName: name, at: latest.createdAt });
      }
      rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      setState({
        loading: false,
        error: results.every((result) => !result.ok) ? new Error('The activity could not be loaded from the API.') : null,
        rows,
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { ...state, reload: () => setNonce((value) => value + 1) };
}

/** The sum of money of the account, one line for each currency. */
function MonthlyCost({ summary }: { summary: AccountBillingSummary }) {
  const lines = summary.monthlyByCurrency && summary.monthlyByCurrency.length > 1 ? summary.monthlyByCurrency : null;
  if (!lines) return <Money amount={summary.monthlyEstimate} currency={summary.currency} />;
  return (
    <span className="grid gap-1 text-[20px]">
      {lines.map((line) => (
        <Money key={line.currency} amount={line.amount} currency={line.currency} />
      ))}
    </span>
  );
}

function ServiceLine({ row }: { row: ServiceRow }) {
  return (
    <li>
      <Link
        to={row.to}
        className="grid items-center gap-x-4 gap-y-2 rounded-2xl bg-s2 p-3.5 transition-colors duration-150 hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc md:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1.3fr)_minmax(86px,auto)] md:p-3"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ServiceTile row={row} />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{row.name}</span>
            <span className="block truncate text-[12.5px] text-ink3">{row.typeLabel}</span>
          </span>
        </span>
        <span className="justify-self-start md:justify-self-auto">
          <StatusPill status={row.status} label={row.statusLabel ?? undefined} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-mono text-[12.5px] text-ink2">{row.limits.join(' · ')}</span>
          {row.address && <span className="block truncate font-mono text-[12px] text-ink3">{row.address.replace(/^https?:\/\//, '')}</span>}
        </span>
        <span className="text-[13.5px] text-ink2 md:text-right">
          {row.price !== null && row.currency ? <Money amount={row.price} currency={row.currency} period="mo" /> : <span className="text-ink3">—</span>}
        </span>
      </Link>
    </li>
  );
}

export default function Overview() {
  const instancesState = useAsync((signal) => get<{ instances: Instance[] }>('/instances', undefined, signal), []);
  const summaryState = useAsync((signal) => get<AccountBillingSummary>('/billing/summary', undefined, signal), []);
  const serversState = useAsync((signal) => get<{ servers: VpsServerView[] }>('/vps', undefined, signal), []);
  const mailState = useAsync((signal) => get<{ services: MailServiceView[] }>('/mail/services', undefined, signal), []);

  const instances = instancesState.data?.instances;
  const activity = useRecentActivity(instances);
  const { products: deployable, loading: catalogLoading } = useDeployableProducts();

  const rows = useMemo(
    () =>
      serviceRows({
        instances: instances ?? [],
        servers: serversState.data?.servers ?? [],
        mail: mailState.data?.services ?? [],
        summary: summaryState.data ?? null,
      }),
    [instances, serversState.data, mailState.data, summaryState.data],
  );

  // The sources are read apart, so one that fails is said to be unavailable and the rest still show.
  const unavailable = [
    serversState.error ? 'servers' : null,
    mailState.error ? 'email hosting' : null,
    summaryState.error ? 'billing' : null,
  ].filter(Boolean) as string[];

  const problems = rows.filter((row) => row.problem);
  const late = latePayments(summaryState.data ?? null).filter((subscription) => !rows.some((row) => row.problem && row.id === subscription.serviceId));

  if (instancesState.loading || (serversState.loading && mailState.loading && summaryState.loading)) {
    return <LoadingBlock rows={3} label="Loading your dashboard" />;
  }
  if (instancesState.error) {
    return <ErrorState title="We could not load your dashboard" message={instancesState.error.message} onRetry={instancesState.reload} />;
  }

  // A new account gets one panel that explains the next step.
  if (rows.length === 0) {
    return (
      <div className="grid gap-4">
        <Panel title="Welcome to Blipmade" description="Pick what you want to run, choose the resources, and it starts on its own.">
          <p className="max-w-[60ch] text-[14px] leading-relaxed text-ink2">
            Services are billed monthly for the resources you choose. Nothing is billed before you order, and you can change the size of a service later.
          </p>
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
            <ButtonLink to="/app/deploy" className="w-full sm:w-auto">
              <Icon name="rocket" size={16} />
              Deploy your first service
            </ButtonLink>
            <ButtonLink to="/app/vps/new" variant="soft" className="w-full sm:w-auto">
              Order a server
            </ButtonLink>
          </div>
          {catalogLoading ? (
            <p className="mt-4 text-[13px] text-ink3">Loading the catalog…</p>
          ) : deployable.length > 0 ? (
            <>
              <p className="mt-5 text-[13px] font-medium text-ink3">Ready to deploy now</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {deployable.slice(0, 4).map((product) => (
                  <Link
                    key={product.id}
                    to={deployPathFor(product.slug, startingConfiguration(product))}
                    className="flex items-center gap-3 rounded-2xl bg-s2 p-3 transition-colors duration-150 hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <ProductTile slug={product.slug} icon={product.icon} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{product.name}</span>
                      {product.price && (
                        <span className="block text-[12.5px] text-ink3">
                          From <Money amount={product.price.amount} currency={product.price.currency} period="mo" />
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-[13px]">
                <Link to={catalogPath()} className="text-acc underline underline-offset-4">
                  See the whole catalog
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-4 rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">Nothing can be ordered at the moment.</p>
          )}
        </Panel>
      </div>
    );
  }

  const next = summaryState.data?.nextRenewal ?? null;

  return (
    <div className="grid gap-4">
      {(problems.length > 0 || late.length > 0) && (
        <Panel title="Needs attention" description="These need you. Each one opens the place where you can fix it.">
          <div className="grid gap-1.5">
            {problems.map((row) => (
              <ListRow key={row.key} to={row.to} title={row.name} meta={row.problem} right={<StatusPill status={row.status} label={row.statusLabel ?? undefined} />} />
            ))}
            {late.map((subscription) => (
              <ListRow
                key={subscription.id}
                to="/app/billing"
                title={subscription.instanceName ?? 'A subscription'}
                meta="The payment is past due."
                right={<StatusPill status="past_due" label="Payment due" />}
              />
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon="box" label="Services" value={rows.length} hint={countLine(rows)} />
        {summaryState.data ? (
          <StatTile icon="card" label="Monthly cost" value={<MonthlyCost summary={summaryState.data} />} hint="From your active subscriptions" />
        ) : (
          <StatTile icon="card" label="Monthly cost" value="Unavailable" hint="The billing summary could not be loaded" />
        )}
        <StatTile
          icon={problems.length + late.length === 0 ? 'heart' : 'warn'}
          label="Needs attention"
          value={problems.length + late.length}
          hint={problems.length + late.length === 0 ? 'No problem was reported' : 'See the list above'}
        />
        {summaryState.data ? (
          <StatTile
            icon="restart"
            label="Next payment"
            value={next ? <Money amount={next.amount} currency={next.currency} /> : '—'}
            hint={next ? `Renews on ${fmtDate(next.at)}` : 'No payment is scheduled'}
          />
        ) : (
          <StatTile icon="restart" label="Next payment" value="Unavailable" hint="The billing summary could not be loaded" />
        )}
      </div>

      {unavailable.length > 0 && (
        <p role="status" className="rounded-2xl bg-warn/12 px-4 py-3 text-[13.5px] text-ink2">
          Some of your account could not be loaded: {unavailable.join(', ')}. What is shown below may be incomplete.
        </p>
      )}

      <Panel title="Your services" description={countLine(rows)}>
        <ul className="grid gap-2">
          {rows.map((row) => (
            <ServiceLine key={row.key} row={row} />
          ))}
        </ul>
      </Panel>

      <Panel title="Recent activity" description="The latest event of each of your most recent apps.">
        {activity.loading ? (
          <LoadingBlock rows={2} label="Loading recent activity" />
        ) : activity.error ? (
          <ErrorState title="Activity unavailable" message={activity.error.message} onRetry={activity.reload} />
        ) : activity.rows.length === 0 ? (
          <EmptyState title="No activity yet." description="Events appear here when something changes on an app." />
        ) : (
          <div className="grid gap-1.5">
            {activity.rows.map((row) => (
              <ListRow
                key={row.key}
                to={row.to}
                title={row.title}
                meta={row.detail ?? row.serviceName}
                right={
                  <time dateTime={row.at} title={new Date(row.at).toLocaleString('en-IE')} className="text-[12.5px] text-ink3">
                    {relativeTime(row.at)}
                  </time>
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
