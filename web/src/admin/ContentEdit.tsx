import { useEffect, useState } from 'react';
import { api, get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, denseGhost, denseInput, useAdminSession } from './Overview';

const BACK_TO = '/admin/content';
interface Detail {
  block: { key: string; label: string; description: string; example: unknown };
  draft: { id: string; data: unknown; authorEmail: string | null; createdAt: string } | null;
  published: { id: string; data: unknown } | null;
  history: { id: string; status: string; note: string | null; by: string | null; at: string; data: unknown }[];
}
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function Preview({ keyName, data }: { keyName: string; data: any }) {
  if (!data || typeof data !== 'object') return null;
  if (keyName === 'home.hero') return <div className="grid gap-1"><p className="text-[18px] font-semibold text-ink">{data.title}</p><p className="text-ink2">{data.lead}</p></div>;
  if (keyName === 'site.announcement') return <p className="rounded-xl bg-s2 px-3 py-2 text-ink">{data.message}{data.linkLabel ? <span className="ml-2 font-semibold underline">{data.linkLabel}</span> : null}</p>;
  if (keyName === 'home.faq' && Array.isArray(data.items)) return <div className="grid gap-2">{data.items.map((item: { q: string; a: string }, index: number) => <div key={index}><p className="font-semibold text-ink">{item.q}</p><p className="text-ink2">{item.a}</p></div>)}</div>;
  return <pre className="whitespace-pre-wrap font-sans text-ink2">{pretty(data)}</pre>;
}


/** One block of the public site: its draft, the preview, publishing, taking down and the history. */
export default function ContentEdit() {
  const { key = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'content.write');
  const detail = useAsync<Detail>((signal) => get<Detail>(`/admin/content/${encodeURIComponent(key)}`, undefined, signal), [key]);
  const placeholders = useAsync<{ placeholders: string[] }>((signal) => get('/admin/content', undefined, signal), []);
  const [text, setText] = useState('');
  const [base, setBase] = useState('');
  useEffect(() => {
    const value = detail.data;
    if (!value) return;
    const start = pretty(value.draft?.data ?? value.published?.data ?? value.block.example);
    setText(start);
    setBase(start);
  }, [detail.data]);
  const dirty = text !== base;
  useUnsavedChangesGuard(dirty, 'Discard the unsaved words?');
  const parsed = (() => {
    try {
      return { value: JSON.parse(text) as unknown, error: null as string | null };
    } catch {
      return { value: null, error: 'The text is not valid JSON.' };
    }
  })();
  const url = `/admin/content/${encodeURIComponent(key)}`;
  const act = useAction(async (work: () => Promise<unknown>, message: string) => {
    await work();
    toast.push(message, 'ok');
    detail.reload();
  });
  const current = detail.data;
  return (
    <PageEditorShell
      eyebrow="Site content"
      title={current ? current.block.label : 'Content block'}
      description="Edit a draft, publish it, and the site shows it within a minute, without a deploy."
      backTo={BACK_TO}
      backLabel="Back to content"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" disabled={!mayWrite || act.pending || parsed.error !== null || !dirty} onClick={() => void act.run(() => api(`${url}/draft`, { method: 'PUT', body: { data: parsed.value } }), 'The draft was saved. It is not on the site until you publish it.')}>Save the draft</SoftButton>
          <PrimaryButton type="button" disabled={!mayWrite || act.pending || !current?.draft || dirty} onClick={() => void act.run(() => post(`${url}/publish`), 'Published. The site shows it within a minute.').then(() => navigate(BACK_TO))}>Publish the draft</PrimaryButton>
        </>
      }
    >
      {detail.loading && !detail.data ? <LoadingBlock rows={3} label="Loading the block" />
        : detail.error || !current ? <ErrorState title="The block could not be loaded" message={detail.error?.message ?? 'Not found.'} onRetry={detail.reload} />
        : (
          <div className="grid gap-4">
            <p className="text-[13px] text-ink2">{current.block.description}</p>
            {placeholders.data && <p className="text-[12.5px] text-ink3">Placeholders for the rates: {placeholders.data.placeholders.map((name) => <code key={name} className="mx-0.5 rounded bg-s3 px-1.5 py-0.5 font-mono text-[12px] text-ink">{`{{${name}}}`}</code>)}</p>}
            <textarea aria-label="Content of the block, as JSON" rows={14} value={text} onChange={(event) => setText(event.target.value)} disabled={!mayWrite} className={`${denseInput} h-auto py-2 font-mono text-[12.5px]`} />
            {parsed.error && <p role="alert" className="text-[13px] font-medium text-bad">{parsed.error}</p>}
            {act.error && <p role="alert" className="text-[13px] font-medium text-bad">{act.error}</p>}
            {mayWrite && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={denseGhost} disabled={act.pending || !current.draft} onClick={() => void act.run(() => api(`${url}/draft`, { method: 'DELETE' }), 'The draft was discarded.')}>Discard the draft</button>
                <button type="button" className={denseGhost} disabled={act.pending || !current.published} onClick={() => void act.run(() => post(`${url}/unpublish`), 'Taken down. The site uses the words of the code.')}>Take down</button>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-ink">Preview of the draft</summary>
              <div className="mt-2 rounded-2xl bg-s2 p-3 text-[13.5px]"><Preview keyName={key} data={parsed.value} /></div>
            </details>
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-ink">History</p>
                {current.history.length === 0 ? <p className="text-[13px] text-ink3">Nothing was published yet.</p> : (
                  <ul className="grid gap-1.5 text-[12.5px] text-ink2">
                    {current.history.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-2">
                        <span>{new Date(row.at).toLocaleString()} · {row.by ?? 'the platform'} · {row.status.toLowerCase()}{row.note ? ` · ${row.note}` : ''}</span>
                        {mayWrite && row.status === 'ARCHIVED' && <button type="button" className={denseGhost} disabled={act.pending} onClick={() => void act.run(() => post(`${url}/rollback`, { revisionId: row.id }), 'That version is published again.')}>Put this version back</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
          </div>
        )}
    </PageEditorShell>
  );
}
