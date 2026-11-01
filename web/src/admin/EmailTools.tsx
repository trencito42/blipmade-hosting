import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, Panel, useToast } from '../ui-app';
import { denseGhost, densePrimary } from './Overview';

/**
 * The tools around one template: a preview of the draft with made-up values (in a frame that cannot run
 * anything), a test message to yourself, and the versions of the wording with a way back.
 */

type Draft = Partial<Record<'subject' | 'heading' | 'preheader' | 'note', string>>;
interface Version { id: string; action: string; actorEmail: string | null; createdAt: string; before: Draft | null; after: Draft | null }

export function TemplateTools({ id, draft, mayWrite, onRestored }: { id: string; draft: Draft; mayWrite: boolean; onRestored: () => void }) {
  const toast = useToast();
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const versions = useAsync<{ versions: Version[] }>((signal) => get(`/admin/email-templates/${encodeURIComponent(id)}/versions`, undefined, signal), [id]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const path = `/admin/email-templates/${encodeURIComponent(id)}`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => setPreview((await post<{ preview: { subject: string; html: string; text: string } }>(`${path}/preview`, { draft })).preview))}>Preview the draft</button>
        {mayWrite && (
          <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => { const result = await post<{ sentTo: string; state: string }>(`${path}/test`, { draft }); toast.push(`A test message was sent to ${result.sentTo} (${result.state}).`, 'ok'); })}>Send me a test</button>
        )}
      </div>
      {preview && (
        <div className="grid gap-2 rounded-2xl bg-s2 p-3">
          <p className="text-[13px] font-semibold text-ink">{preview.subject}</p>
          <p className="text-[12px] text-ink3">Made-up values. The frame below cannot run scripts or open links on its own.</p>
          <iframe title="Preview of the message" sandbox="" srcDoc={preview.html} className="h-[420px] w-full rounded-xl border-0 bg-white" />
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-ink">Versions</p>
        {versions.loading ? <LoadingBlock rows={1} label="Loading the versions" /> : versions.error ? <ErrorState title="The versions could not be loaded" message={versions.error.message} onRetry={versions.reload} /> : !versions.data?.versions.length ? <p className="text-[13px] text-ink3">The wording was never changed.</p> : (
          <ul className="grid gap-1.5 text-[12.5px] text-ink2">
            {versions.data.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-2">
                <span>{new Date(version.createdAt).toLocaleString()} · {version.actorEmail ?? 'the platform'} · {version.action.replace('admin.email_template.', '')} · {version.after ? Object.keys(version.after).join(', ') || 'original wording' : 'original wording'}</span>
                {mayWrite && version.after && (
                  <button type="button" className={denseGhost} disabled={busy} onClick={() => void act(async () => { await post(`${path}/restore`, { versionId: version.id }); toast.push('That wording is back.', 'ok'); onRestored(); versions.reload(); })}>Restore this wording</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function EmailCoverage() {
  const state = useAsync<{ events: { event: string; template: string; templateExists: boolean; email: boolean; changed: boolean; delivered30d: Record<string, number> }[]; missing: string[]; orphans: string[] }>((signal) => get('/admin/email-templates/coverage', undefined, signal), []);
  return (
    <Panel title="Events and templates" description="Each event of the platform, the template it uses, and what was delivered in the last 30 days.">
      {state.loading ? <LoadingBlock rows={2} label="Loading the map" /> : state.error || !state.data ? <ErrorState title="The map could not be loaded" message={state.error?.message ?? 'No answer.'} onRetry={state.reload} /> : (
        <div className="grid gap-2 text-[13px] text-ink2">
          <p>{state.data.events.length} events. {state.data.missing.length ? <span className="font-medium text-bad">Without a template: {state.data.missing.join(', ')}.</span> : 'Every event that sends an email has its template.'} {state.data.orphans.length ? `Templates no event uses: ${state.data.orphans.join(', ')}.` : ''}</p>
          <details>
            <summary className="cursor-pointer font-semibold text-ink">All events</summary>
            <ul className="mt-2 grid gap-1 text-[12.5px]">
              {state.data.events.map((row) => (
                <li key={row.event}><span className="font-mono">{row.event}</span> → <span className="font-mono">{row.template}</span>{row.changed ? ' (changed)' : ''}{Object.keys(row.delivered30d).length ? ` · ${Object.entries(row.delivered30d).map(([name, count]) => `${count} ${name}`).join(', ')}` : ''}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Panel>
  );
}
