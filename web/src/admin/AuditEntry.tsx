import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { ErrorState, LoadingBlock, Panel } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { DASH, fmtDateTime } from './Overview';
import { metaEntries } from './Audit';

interface Entry { id: string; actorId: string | null; actorEmail: string | null; action: string; targetType: string | null; targetId: string | null; meta: unknown; ip: string | null; createdAt: string }

/** The page of the entity an entry is about, when the back office has one. */
const TARGETS: Record<string, (id: string) => string> = {
  user: (id) => `/admin/customers/${encodeURIComponent(id)}`,
  order: (id) => `/admin/orders/${encodeURIComponent(id)}`,
  instance: (id) => `/admin/services/${encodeURIComponent(id)}`,
  vps: (id) => `/admin/vps`,
  promotion: (id) => `/admin/promotions/${encodeURIComponent(id)}`,
  abuse: (id) => `/admin/abuse/${encodeURIComponent(id)}`,
};

/** One entry of the audit log, read-only: who did what to what, from where, and the other entries about the same target. */
export default function AuditEntry() {
  const { id = '' } = useParams();
  const state = useAsync<{ log: Entry; related: Entry[] }>((signal) => get(`/admin/audit/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const log = state.data?.log;
  const target = log?.targetType && log.targetId ? TARGETS[log.targetType]?.(log.targetId) : undefined;
  return (
    <PageEditorShell eyebrow="Audit log" title={log ? log.action : 'Audit entry'} description="An entry cannot be changed." backTo="/admin/audit" backLabel="Back to the audit log" actions={null}>
      {state.loading && !state.data ? <LoadingBlock rows={4} label="Loading the entry" />
        : state.error || !log ? <ErrorState title="The entry could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-4">
            <dl className="grid gap-3 rounded-2xl bg-s2 p-4 text-[13.5px] sm:grid-cols-2">
              <div><dt className="text-ink3">When</dt><dd className="font-mono text-ink">{fmtDateTime(log.createdAt)}</dd></div>
              <div><dt className="text-ink3">Actor</dt><dd className="break-all text-ink">{log.actorId ? <Link to={`/admin/customers/${encodeURIComponent(log.actorId)}`} className="text-acc hover:underline">{log.actorEmail ?? log.actorId}</Link> : log.actorEmail ?? 'the platform'}</dd></div>
              <div><dt className="text-ink3">Target</dt><dd className="break-all font-mono text-ink">{log.targetType ?? DASH}{log.targetId ? ` · ${log.targetId}` : ''}{target && <> · <Link to={target} className="text-acc hover:underline">open</Link></>}</dd></div>
              <div><dt className="text-ink3">Source</dt><dd className="font-mono text-ink">{log.ip ?? DASH}</dd></div>
            </dl>
            <Panel title="Detail" description="Exactly what was stored with the entry.">
              {metaEntries(log.meta).length === 0 ? <p className="text-[13.5px] text-ink3">Nothing was stored.</p> : (
                <dl className="grid gap-2 text-[13.5px]">
                  {metaEntries(log.meta).map((pair) => (
                    <div key={pair.key} className="grid gap-0.5 sm:grid-cols-[12rem_minmax(0,1fr)]"><dt className="text-ink3">{pair.key}</dt><dd className="break-words font-mono text-ink">{pair.value}</dd></div>
                  ))}
                </dl>
              )}
            </Panel>
            {state.data!.related.length > 0 && (
              <Panel title="Around the same target" description="The other entries about it, newest first.">
                <ul className="divide-y divide-line">
                  {state.data!.related.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                      <Link to={`/admin/audit/${encodeURIComponent(row.id)}`} className="font-mono text-acc hover:underline">{row.action}</Link>
                      <span className="text-ink3">{row.actorEmail ?? 'the platform'} · {fmtDateTime(row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        )}
    </PageEditorShell>
  );
}
