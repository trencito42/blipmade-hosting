import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, LoadingBlock, Panel, StatusPill, useToast } from '../ui-app';
import { DASH, can, denseGhost, densePrimary, fmtDateTime, useAdminSession } from './Overview';
import { OpsNav } from './Ops';

interface Issue {
  id: string;
  title: string;
  culprit: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  count: number | null;
  level: string | null;
  status: string | null;
  permalink: string;
  project: string | null;
}

export default function OpsErrors() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const state = useAsync<{
    glitchtip: {
      origin: string;
      dsnConfigured: boolean;
      dsnHost: string | null;
      environment: string;
      apiTokenConfigured: boolean;
      reachable: boolean | null;
      limitation: string | null;
      issues: Issue[];
      openCount: number | null;
    };
    sdk: { api: boolean; worker: boolean; browser: string; environment: string; release: string | null; host: string | null };
  }>((signal) => get('/admin/ops/errors', undefined, signal), []);
  const ping = useAction(async () => post<{ sent: boolean; reason: string }>('/admin/ops/errors/synthetic', {}));
  const data = state.data;

  return (
    <div className="grid gap-4">
      <OpsNav />
      <Panel
        title="Application errors (GlitchTip)"
        description="GlitchTip records exceptions from the API, the worker and the browser. It does not replace backup, hypervisor, VM, network or service-health monitoring. DSNs and tokens stay on the server."
        actionBelow
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={denseGhost} onClick={() => state.reload()}>Refresh</button>
            {mayWrite && (
              <button
                type="button"
                className={densePrimary}
                disabled={ping.pending}
                onClick={() => void ping.run().then((result) => { if (result) toast.push(result.reason, result.sent ? 'ok' : 'error'); })}
              >
                Send synthetic exception
              </button>
            )}
          </div>
        }
      >
        {state.loading && !data ? (
          <LoadingBlock rows={3} label="Loading GlitchTip status" />
        ) : state.error ? (
          <ErrorState title="GlitchTip status could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : data ? (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-2xl bg-s2 p-4">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                Ingestion
                <StatusPill
                  status={data.sdk.api ? 'active' : 'unavailable'}
                  label={data.sdk.api ? 'API SDK configured' : 'API SDK not configured'}
                />
                <StatusPill
                  status={data.sdk.worker ? 'active' : 'unavailable'}
                  label={data.sdk.worker ? 'Worker SDK configured' : 'Worker SDK not configured'}
                />
                <StatusPill status="unavailable" label={`Browser SDK ${data.sdk.browser.replace(/_/g, ' ')}`} />
              </p>
              <p className="text-[12.5px] text-ink3">
                Host {data.sdk.host ?? DASH} · environment {data.sdk.environment} · release {data.sdk.release ?? 'not set'}.
                A configured DSN is not proof that events arrived.
              </p>
              <p className="text-[12.5px] text-ink3">
                API token {data.glitchtip.apiTokenConfigured ? 'present' : 'missing'} · reachable{' '}
                {data.glitchtip.reachable === null ? 'not probed' : data.glitchtip.reachable ? 'yes' : 'no'}.
              </p>
              {data.glitchtip.limitation && <p className="text-[13px] text-ink2">{data.glitchtip.limitation}</p>}
              <a className="text-[13.5px] font-semibold text-acc hover:underline" href={data.glitchtip.origin} target="_blank" rel="noreferrer">
                Open GlitchTip
              </a>
            </div>
            {data.glitchtip.issues.length === 0 ? (
              <EmptyState
                title="No unresolved issues from the API."
                description={data.glitchtip.apiTokenConfigured ? 'Either nothing is open, or GlitchTip would not list issues.' : 'Set GLITCHTIP_AUTH_TOKEN on the API to list issues here.'}
              />
            ) : (
              <ul className="grid gap-2">
                {data.glitchtip.issues.map((issue) => (
                  <li key={issue.id} className="grid gap-1 rounded-2xl bg-s2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-[14px] font-semibold text-ink">{issue.title}</p>
                      <StatusPill status={issue.level === 'error' || issue.level === 'fatal' ? 'failed' : 'degraded'} label={issue.level ?? issue.status ?? 'open'} />
                    </div>
                    <p className="font-mono text-[12.5px] text-ink3">
                      {issue.project ?? 'project unknown'} · count {issue.count ?? DASH} · first {issue.firstSeen ? fmtDateTime(issue.firstSeen) : DASH} · last {issue.lastSeen ? fmtDateTime(issue.lastSeen) : DASH}
                    </p>
                    {issue.culprit && <p className="truncate font-mono text-[12px] text-ink3">{issue.culprit}</p>}
                    <a className="text-[13px] font-semibold text-acc hover:underline" href={issue.permalink} target="_blank" rel="noreferrer">
                      Open issue
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
