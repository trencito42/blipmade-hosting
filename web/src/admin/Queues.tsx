import { useState } from 'react';
import { del, get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, LoadingBlock, Panel, SoftButton, useToast } from '../ui-app';
import { can, denseDanger, fmtDateTime, useAdminSession } from './Overview';

interface Queue {
  name: string;
  label: string;
  counts: Record<string, number>;
  failed: { id: string; name: string; reason: string; attempts: number; failedAt: string | null }[];
}

/** The queues of jobs: how many are waiting, running and failed, and the failed ones with the reason, to retry or remove. The data of a job is never shown. */
export default function Queues() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'infrastructure.write');
  const toast = useToast();
  const state = useAsync<{ queues: Queue[] }>((signal) => get<{ queues: Queue[] }>('/admin/queues', undefined, signal), []);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, work: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await work();
      toast.push(message, 'ok');
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(null);
    }
  };
  if (state.loading && !state.data) return <LoadingBlock rows={3} label="Loading the queues" />;
  if (state.error || !state.data) return <ErrorState title="The queues could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />;
  return (
    <div className="grid gap-4">
      {state.data.queues.map((queue) => (
        <Panel key={queue.name} title={queue.label} description={`${queue.counts.waiting ?? 0} waiting · ${queue.counts.active ?? 0} running · ${queue.counts.delayed ?? 0} delayed · ${queue.counts.failed ?? 0} failed · ${queue.counts.completed ?? 0} done`}>
          {queue.failed.length === 0 ? (
            <EmptyState title="No failed job" description="Nothing is waiting for a person." />
          ) : (
            <ul className="grid gap-2">
              {mayWrite && queue.failed.length > 1 && (
                <li className="flex justify-end">
                  <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => { if (window.confirm(`Remove all ${queue.counts.failed ?? queue.failed.length} failed jobs of ${queue.label}? They will not be retried.`)) void act(`${queue.name}all`, () => del(`/admin/queues/${queue.name}/failed`), 'The failed jobs were removed.'); }}>Remove all failed</button>
                </li>
              )}
              {queue.failed.map((job) => (
                <li key={job.id} className="grid gap-1.5 rounded-2xl bg-s2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold text-ink">{job.name} <span className="font-mono text-[12px] font-normal text-ink3">#{job.id}</span></p>
                    <span className="text-[12.5px] text-ink3">{job.failedAt ? fmtDateTime(job.failedAt) : ''} · {job.attempts} attempt{job.attempts === 1 ? '' : 's'}</span>
                  </div>
                  <p className="break-words font-mono text-[12.5px] text-bad">{job.reason || 'No reason was recorded.'}</p>
                  {mayWrite && (
                    <div className="flex gap-2">
                      <SoftButton disabled={busy !== null} onClick={() => void act(`${queue.name}${job.id}`, () => post(`/admin/queues/${queue.name}/jobs/${job.id}/retry`), 'The job was queued again.')}>Retry</SoftButton>
                      <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => void act(`${queue.name}${job.id}`, () => del(`/admin/queues/${queue.name}/jobs/${job.id}`), 'The job was removed.')}>Remove</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ))}
    </div>
  );
}
