import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { cn } from '../lib';
import { Link } from '../router';
import { Button, Logo } from '../ui';
import { EmptyState, ErrorState, LoadingBlock } from '../ui-app';
import { LegalFooter } from '../legal/LegalFooter';

interface StatusComponent {
  id: string;
  name: string;
  state: string;
  detail?: string;
  /** The uptime of the last 90 days, in percent. Null until there are checks. */
  uptime?: number | null;
  days?: { date: string; uptime: number | null }[];
}

interface IncidentUpdateView { id: string; status: string; message: string; createdAt: string }
interface IncidentView {
  id: string;
  title: string;
  status: string;
  impact: string;
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdateView[];
}
interface AnnouncementView { id: string; title: string; body: string; severity: string }

interface StatusPayload {
  components: StatusComponent[];
  incidents?: IncidentView[];
  announcements?: AnnouncementView[];
  updatedAt: string;
}

const INCIDENT_STATUS: Record<string, string> = { investigating: 'Investigating', identified: 'Identified', monitoring: 'Monitoring', resolved: 'Resolved' };

/** The 90 days of a component, one thin bar a day: green when every check passed, amber and red as it got worse, grey with no data. */
function UptimeBars({ days, name }: { days: { date: string; uptime: number | null }[]; name: string }) {
  return (
    <div role="img" aria-label={`Uptime of ${name} over the last 90 days`} className="flex h-6 items-end gap-px">
      {days.map((day) => (
        <span
          key={day.date}
          title={`${day.date}: ${day.uptime === null ? 'no data' : `${day.uptime}% up`}`}
          className={cn('h-full min-w-[2px] flex-1 rounded-[1px]', day.uptime === null ? 'bg-s3' : day.uptime >= 99.9 ? 'bg-acc' : day.uptime >= 98 ? 'bg-warn' : 'bg-bad')}
        />
      ))}
    </div>
  );
}

function IncidentCard({ incident }: { incident: IncidentView }) {
  const open = !incident.resolvedAt;
  return (
    <article className="rounded-2xl border border-line bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">{incident.title}</h3>
        <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-bold', open ? 'bg-warn/12 text-warn' : 'bg-acc/12 text-acc')}>{INCIDENT_STATUS[incident.status] ?? incident.status}</span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink3">Started {fmtDate(incident.startedAt)}{incident.resolvedAt ? ` · resolved ${fmtDate(incident.resolvedAt)}` : ''}</p>
      <ol className="mt-3 grid gap-2 border-l border-line pl-4">
        {incident.updates.map((update) => (
          <li key={update.id}>
            <p className="text-[13px] font-semibold text-ink">{INCIDENT_STATUS[update.status] ?? update.status} <span className="font-normal text-ink3">· {fmtDate(update.createdAt)}</span></p>
            <p className="text-[14px] text-ink2">{update.message}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}

type StateKind = 'operational' | 'degraded' | 'partial' | 'outage' | 'unknown';

/** Maps the state string the API sends onto the states the page can describe. */
function classify(raw: string): StateKind {
  const state = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!state) return 'unknown';
  if (state.includes('partial')) return state.includes('major') ? 'outage' : 'partial';
  if (state.includes('major') || state.includes('outage')) return 'outage';
  if (state.includes('down') || state.includes('offline') || state.includes('critical')) return 'outage';
  if (
    state.includes('degrad') ||
    state.includes('warn') ||
    state.includes('slow') ||
    state.includes('maintenance') ||
    state.includes('unstable')
  ) {
    return 'degraded';
  }
  if (
    state.includes('operational') ||
    state === 'up' ||
    state === 'ok' ||
    state === 'healthy' ||
    state === 'online' ||
    state === 'active' ||
    state === 'normal' ||
    state.includes('available')
  ) {
    return 'operational';
  }
  return 'unknown';
}

const KIND_LABEL: Record<StateKind, string> = {
  operational: 'Operational',
  degraded: 'Degraded performance',
  partial: 'Partial outage',
  outage: 'Outage',
  unknown: 'Reported state',
};

const KIND_DOT: Record<StateKind, string> = {
  operational: 'bg-acc',
  degraded: 'bg-warn',
  partial: 'bg-bad',
  outage: 'bg-bad',
  unknown: 'bg-ink3',
};

const KIND_PILL: Record<StateKind, string> = {
  operational: 'bg-acc/12 text-acc',
  degraded: 'bg-warn/12 text-warn',
  partial: 'bg-bad/12 text-bad',
  outage: 'bg-bad/12 text-bad',
  unknown: 'bg-s3 text-ink2',
};

interface Banner {
  title: string;
  detail: string;
  className: string;
}

function bannerFor(components: StatusComponent[]): Banner {
  if (!components.length) {
    return {
      title: 'No components reported',
      detail: 'The status endpoint did not list any components.',
      className: 'bg-s2 text-ink2',
    };
  }
  const kinds = components.map((component) => classify(component.state));
  if (kinds.includes('outage')) {
    return {
      title: 'Major outage',
      detail: 'At least one component is reported as down. Our team is working on it.',
      className: 'bg-bad/12 text-bad',
    };
  }
  if (kinds.includes('partial')) {
    return {
      title: 'Partial outage',
      detail: 'Part of the platform is unavailable right now.',
      className: 'bg-bad/12 text-bad',
    };
  }
  if (kinds.includes('degraded')) {
    return {
      title: 'Degraded performance',
      detail: 'Everything is reachable, but some components are slower than usual.',
      className: 'bg-warn/12 text-warn',
    };
  }
  if (kinds.every((kind) => kind === 'operational')) {
    return {
      title: 'All systems operational',
      detail: 'Every component is reporting a healthy state.',
      className: 'bg-acc-bg text-acc',
    };
  }
  return {
    title: 'Status partially reported',
    detail: 'One or more components reported a state this page does not recognise, so the overall state is unknown.',
    className: 'bg-s2 text-ink2',
  };
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function fmtDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${DATE_FMT.format(date)}, ${TIME_FMT.format(date)}`;
}

/** The incidents of the last two months that are over. */
function PastIncidents() {
  const state = useAsync((signal) => get<{ incidents: IncidentView[] }>('/status/incidents', undefined, signal), []);
  const incidents = state.data?.incidents ?? [];
  return (
    <section aria-label="Past incidents" className="grid gap-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-ink">Past incidents</h2>
      {state.loading ? (
        <LoadingBlock rows={1} label="Loading the past incidents" />
      ) : incidents.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-5 py-4 text-[14px] text-ink2">No incidents in the last 60 days.</p>
      ) : (
        incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
      )}
    </section>
  );
}

export default function Status() {
  const state = useAsync((signal) => get<StatusPayload>('/status', undefined, signal), []);
  const components = state.data?.components ?? [];
  const banner = bannerFor(components);

  return (
    <div className="min-h-[100svh] bg-bg">
      <header className="border-b border-line bg-bg/85 backdrop-blur-md">
        {/* The bar wraps on a narrow phone so no navigation link is pushed out
            of the viewport. */}
        <div className="mx-auto flex min-h-[64px] w-full max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 sm:flex-nowrap sm:px-8 sm:py-0">
          <Logo className="shrink-0" />
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            <Link
              to="/docs"
              className="inline-flex h-10 items-center rounded-lg px-3 text-[14px] font-medium text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Docs
            </Link>
            <Link
              to="/status"
              aria-current="page"
              className="inline-flex h-10 items-center rounded-lg px-3 text-[14px] font-medium text-ink transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Status
            </Link>
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-lg px-3 text-[14px] font-medium text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-[clamp(40px,6vw,76px)] leading-[1] font-semibold tracking-[-0.045em] text-ink [text-wrap:balance]">
          Service status
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink2">
          Live state of the Blipmade platform, straight from the status endpoint.
        </p>

        <div className="mt-8 grid gap-4">
          {state.loading ? (
            <LoadingBlock rows={3} label="Loading the current status" />
          ) : state.error ? (
            <ErrorState
              title="Status data is not available right now"
              message={`${state.error.message} The platform may be having trouble, or the status check could not be reached.`}
              onRetry={state.reload}
            />
          ) : (
            <>
              <div
                role="status"
                aria-live="polite"
                className={cn('rounded-2xl border border-line px-5 py-5', banner.className)}
              >
                <p className="text-[19px] font-semibold tracking-[-0.03em]">{banner.title}</p>
                <p className="mt-1 text-[14.5px] opacity-90">{banner.detail}</p>
              </div>

              {(state.data?.announcements ?? []).map((announcement) => (
                <div key={announcement.id} role="note" className={cn('rounded-2xl border px-5 py-4', announcement.severity === 'maintenance' ? 'border-warn/40 bg-warn/10' : announcement.severity === 'warning' ? 'border-bad/40 bg-bad/10' : 'border-line bg-card')}>
                  <p className="text-[15px] font-semibold text-ink">{announcement.title}</p>
                  <p className="mt-1 text-[14px] text-ink2">{announcement.body}</p>
                </div>
              ))}

              {(state.data?.incidents ?? []).length > 0 && (
                <section aria-label="Current incidents" className="grid gap-3">
                  <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-ink">Current incidents</h2>
                  {state.data!.incidents!.map((incident) => <IncidentCard key={incident.id} incident={incident} />)}
                </section>
              )}

              {components.length === 0 ? (
                <EmptyState
                  title="No components reported"
                  description="The status endpoint did not list any components, so there is nothing to show."
                />
              ) : (
                <ul className="grid gap-1.5">
                  {components.map((component) => {
                    const kind = classify(component.state);
                    return (
                      <li key={component.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-card px-4 py-3.5">
                        <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', KIND_DOT[kind])} />
                        <span className="w-0 min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.02em] text-ink" title={component.name}>
                          {component.name}
                        </span>
                        <span
                          className={cn(
                            'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold',
                            KIND_PILL[kind],
                          )}
                        >
                          <span className="min-w-0 break-words">
                            {kind === 'unknown' ? `${KIND_LABEL[kind]}: ${component.state}` : KIND_LABEL[kind]}
                          </span>
                        </span>
                        {component.days && component.days.some((day) => day.uptime !== null) && (
                          <div className="basis-full">
                            <UptimeBars days={component.days} name={component.name} />
                            <p className="mt-1 flex justify-between text-[11.5px] text-ink3">
                              <span>90 days ago</span>
                              <span>{component.uptime !== null && component.uptime !== undefined ? `${component.uptime}% uptime` : ''}</span>
                              <span>Today</span>
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="rounded-2xl border border-line bg-card px-4 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Last checked</p>
                <p className="mt-1 text-[14.5px] text-ink2">
                  {state.data?.updatedAt ? (
                    <time dateTime={state.data.updatedAt}>{fmtDate(state.data.updatedAt)}</time>
                  ) : (
                    'Not reported'
                  )}
                </p>
                <p className="mt-2 text-[13px] text-ink3">
                  Every part is checked every minute. The bars show how each part did over the last 90 days; a grey bar means there were no checks that day.
                </p>
              </div>

              <PastIncidents />

              {/* The refresh fills the width of a phone, so it is within
                  reach of a thumb. */}
              <div className="flex sm:justify-end">
                <Button variant="soft" onClick={state.reload} full className="sm:w-auto">
                  Refresh
                </Button>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-[1200px] px-5 pb-10 sm:px-8">
        <p className="text-[13.5px] text-ink3">
          Something broken that is not listed here?{' '}
          <Link to="/app/tickets" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h">
            Open a ticket
          </Link>
          .
        </p>
        <LegalFooter className="mt-6" />
      </footer>
    </div>
  );
}
