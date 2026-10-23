import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { cn } from '../lib';
import { Link } from '../router';
import { Button, Logo } from '../ui';
import { EmptyState, ErrorState, LoadingBlock } from '../ui-app';

interface StatusComponent {
  id: string;
  name: string;
  state: string;
}

interface StatusPayload {
  components: StatusComponent[];
  updatedAt: string;
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

export default function Status() {
  const state = useAsync((signal) => get<StatusPayload>('/status', undefined, signal), []);
  const components = state.data?.components ?? [];
  const banner = bannerFor(components);

  return (
    <div className="min-h-[100svh] bg-bg">
      <header className="bg-s1">
        {/* The bar wraps on a narrow phone so no navigation link is pushed out
            of the viewport. */}
        <div className="mx-auto flex min-h-[60px] w-full max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
          <Logo className="shrink-0" />
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            <Link
              to="/docs"
              className="inline-flex h-11 items-center rounded-full px-2.5 text-[13.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4 sm:text-[15px]"
            >
              Docs
            </Link>
            <Link
              to="/status"
              aria-current="page"
              className="inline-flex h-11 items-center rounded-full px-2.5 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4 sm:text-[15px]"
            >
              Status
            </Link>
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-full px-2.5 text-[13.5px] font-bold text-ink2 transition-colors duration-[180ms] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4 sm:text-[15px]"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[clamp(30px,7vw,44px)] font-extrabold leading-[1.05] tracking-[-0.05em] text-ink">
          Service status
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink2">
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
                className={cn('rounded-[22px] px-5 py-5', banner.className)}
              >
                <p className="text-[19px] font-extrabold tracking-[-0.03em]">{banner.title}</p>
                <p className="mt-1 text-[14.5px] opacity-90">{banner.detail}</p>
              </div>

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
                      <li key={component.id} className="flex items-center gap-3 rounded-2xl bg-s1 px-4 py-3.5">
                        <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', KIND_DOT[kind])} />
                        <span className="w-0 min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={component.name}>
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
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="rounded-2xl bg-s1 px-4 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Last checked</p>
                <p className="mt-1 text-[14.5px] text-ink2">
                  {state.data?.updatedAt ? (
                    <time dateTime={state.data.updatedAt}>{fmtDate(state.data.updatedAt)}</time>
                  ) : (
                    'Not reported'
                  )}
                </p>
                <p className="mt-2 text-[13px] text-ink3">
                  90-day uptime history is not available yet. This page only shows the state the platform reports right now.
                </p>
              </div>

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

      <footer className="mx-auto w-full max-w-[1280px] px-4 pb-10 sm:px-6">
        <p className="text-[13.5px] text-ink3">
          Something broken that is not listed here?{' '}
          <Link to="/app/tickets" className="inline-flex min-h-11 items-center font-bold text-acc hover:underline">
            Open a ticket
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
