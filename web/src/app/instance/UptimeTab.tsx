import { get, patch } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ErrorState, LoadingBlock, Panel, SoftButton, useToast } from '../../ui-app';
import type { TabProps } from './common';

interface Uptime {
  windows: { key: string; label: string; percent: number | null; checks: number }[];
  outages: { from: string; to: string | null; minutes: number }[];
  current: 'up' | 'down' | 'unknown';
  alertsEnabled: boolean;
  canChange: boolean;
}

const when = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const length = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

/** How often the server served, counted from a check every minute, and whether the owner is told when it stops. */
export default function UptimeTab({ instance }: TabProps) {
  const { push } = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/uptime`;
  const state = useAsync<Uptime>((signal) => get<Uptime>(base, undefined, signal), [instance.id]);
  const toggle = useAction(async (next: boolean) => {
    await patch(base, { alertsEnabled: next });
    push(next ? 'You will get an email when this server stops serving.' : 'The email alerts are off for this server.', 'ok');
    state.reload();
  });
  const data = state.data;
  const current = data?.current ?? 'unknown';
  return (
    <div className="grid gap-4">
      <Panel title="Uptime" description="A check runs every minute while the server is meant to be running. A server you stopped yourself is not counted.">
        {state.loading && !data ? (
          <LoadingBlock rows={2} label="Loading the uptime" />
        ) : state.error || !data ? (
          <ErrorState title="The uptime could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />
        ) : (
          <div className="grid gap-4">
            <p className="text-[14.5px] text-ink">
              Right now:{' '}
              <strong className={current === 'down' ? 'text-bad' : current === 'up' ? 'text-ok' : 'text-ink2'}>
                {current === 'up' ? 'serving' : current === 'down' ? 'not serving' : 'no recent check'}
              </strong>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.windows.map((window) => (
                <div key={window.key} className="rounded-2xl bg-s2 p-4">
                  <p className="text-[12.5px] text-ink3">{window.label}</p>
                  <p className="text-[24px] font-semibold text-ink">{window.percent === null ? '—' : `${window.percent}%`}</p>
                  <p className="text-[12px] text-ink3">{window.checks} checks</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-[14px] font-medium text-ink">Outages, last 30 days</p>
              {data.outages.length === 0 ? (
                <p className="text-[14px] text-ink2">No outage recorded.</p>
              ) : (
                <ul className="grid gap-2">
                  {data.outages.map((outage) => (
                    <li key={outage.from} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink">
                      <span>{when(outage.from)}{outage.to ? ` to ${when(outage.to)}` : ''}</span>
                      <span className="text-ink2">{length(outage.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Panel>
      {data && (
        <Panel title="Alerts" description="An email goes to the owner when the server has not been serving for 3 minutes, and another when it is back. A restart you start yourself is shorter than that.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14.5px] text-ink">Email alerts are <strong>{data.alertsEnabled ? 'on' : 'off'}</strong> for this server.</p>
            {data.canChange ? (
              <SoftButton onClick={() => void toggle.run(!data.alertsEnabled)} disabled={toggle.pending}>{data.alertsEnabled ? 'Turn off' : 'Turn on'}</SoftButton>
            ) : (
              <span className="text-[13px] text-ink3">Only the owner can change this.</span>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
