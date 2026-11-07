import { useEffect } from 'react';
import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Panel, PrimaryButton, SoftButton } from '../../ui-app';

interface BuildJob {
  id: string;
  status: string;
  runtime: string | null;
  log: string;
  lastError: string | null;
  artifactSha256: string | null;
  artifactBytesLength: number;
  attempts: number;
  createdAt: string;
  finishedAt: string | null;
}

export function IsolatedBuildPanel({ importSourceId }: { importSourceId: string }) {
  const state = useAsync<{ jobs: BuildJob[] }>(
    (signal) => get(`/catalog/import/${importSourceId}/builds`, undefined, signal),
    [importSourceId],
  );
  const latest = state.data?.jobs[0];
  const active = latest?.status === 'queued' || latest?.status === 'running';
  const start = useAction(async () => {
    await post(`/catalog/import/${importSourceId}/build`, {});
    await state.reload();
  });
  const cancel = useAction(async () => {
    if (!latest) return;
    await post(`/catalog/builds/${latest.id}/cancel`, {});
    await state.reload();
  });

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void state.reload(), 2_000);
    return () => window.clearInterval(timer);
  }, [active, state.reload]);

  const label = latest?.status === 'succeeded'
    ? 'Build verified'
    : latest?.status === 'failed'
      ? 'Build failed'
      : latest?.status === 'blocked_no_sandbox'
        ? 'Sandbox unavailable'
        : latest?.status === 'running'
          ? 'Building in disposable sandbox…'
          : latest?.status === 'queued'
            ? 'Waiting for disposable sandbox…'
            : 'Not run yet';

  return (
    <Panel title="Safe build preflight" description="Runs the detected build command outside the API and outside your future server, with no network and fixed CPU, memory, disk and time limits.">
      <div className="grid gap-3">
        <div role="status" className="rounded-xl bg-s2 p-3 text-[13.5px] text-ink2">
          <strong className="text-ink">{label}</strong>
          {latest?.runtime ? <span className="ml-2 font-mono text-[12px] text-ink3">{latest.runtime}</span> : null}
          {latest?.artifactSha256 ? (
            <p className="mt-1 break-all font-mono text-[11.5px] text-ink3">
              Artifact {latest.artifactBytesLength} bytes · SHA-256 {latest.artifactSha256}
            </p>
          ) : null}
        </div>
        {latest?.lastError ? <p role="alert" className="rounded-xl bg-bad/10 p-3 text-[13px] text-bad">{latest.lastError}</p> : null}
        {latest?.log ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-night-2 p-3 font-mono text-[12px] text-ink2">{latest.log}</pre> : null}
        {state.error ? <p role="alert" className="text-[13px] text-bad">{state.error.message}</p> : null}
        {start.error ? <p role="alert" className="text-[13px] text-bad">{start.error}</p> : null}
        {cancel.error ? <p role="alert" className="text-[13px] text-bad">{cancel.error}</p> : null}
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <PrimaryButton type="button" onClick={() => void start.run()} disabled={start.pending}>
              {start.pending ? 'Queueing…' : latest ? 'Run again' : 'Run safe build'}
            </PrimaryButton>
          ) : (
            <SoftButton type="button" onClick={() => void cancel.run()} disabled={cancel.pending}>
              {cancel.pending ? 'Cancelling…' : 'Cancel build'}
            </SoftButton>
          )}
          <SoftButton type="button" onClick={() => void state.reload()} disabled={state.loading}>Refresh</SoftButton>
        </div>
      </div>
    </Panel>
  );
}
