import { useEffect, useState } from 'react';
import { api, get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, LoadingBlock, Panel, Select, useToast } from '../ui-app';
import { can, denseGhost, denseInput, densePrimary, useAdminSession } from './Overview';

/**
 * The words of the public site. Pick a block, edit its draft, publish it, take it down, or put an
 * earlier version back. The site keeps the words of the code until a version is published, and the
 * text is plain text: markup is refused when it is saved.
 */

interface BlockRow { key: string; label: string; description: string; hasDraft: boolean; draftBy: string | null; published: { id: string; at: string; by: string | null } | null }
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

export default function Content() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'content.write');
  const toast = useToast();
  const list = useAsync<{ blocks: BlockRow[]; placeholders: string[] }>((signal) => get('/admin/content', undefined, signal), []);
  const [key, setKey] = useState('');
  const detail = useAsync<Detail | null>((signal) => (key ? get<Detail>(`/admin/content/${encodeURIComponent(key)}`, undefined, signal) : Promise.resolve(null)), [key]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!key && list.data?.blocks[0]) setKey(list.data.blocks[0].key);
  }, [list.data, key]);
  useEffect(() => {
    const value = detail.data;
    if (value) setText(pretty(value.draft?.data ?? value.published?.data ?? value.block.example));
  }, [detail.data]);

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      toast.push(message, 'ok');
      list.reload();
      detail.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const base = `/admin/content/${encodeURIComponent(key)}`;
  const parsed = (() => {
    try {
      return { value: JSON.parse(text) as unknown, error: null as string | null };
    } catch {
      return { value: null, error: 'The text is not valid JSON.' };
    }
  })();

  if (session.loading || list.loading) return <LoadingBlock rows={3} label="Loading the content" />;
  if (list.error) return <ErrorState title="The content could not be loaded" message={list.error.message} onRetry={list.reload} />;
  if (!list.data) return <EmptyState title="No editable content." description="Nothing is registered." />;
  const current = detail.data;

  return (
    <div className="grid gap-4">
      <Panel title="Words of the public site" description="Edit a draft, publish it, and the site shows it within a minute, without a deploy. Until a version is published, and after it is taken down, the site uses the words of the code. Plain text only.">
        <div className="grid gap-4">
          <Select label="Block" value={key} onChange={(event) => setKey(event.target.value)}>
            {list.data.blocks.map((block) => <option key={block.key} value={block.key}>{block.label}{block.published ? ' (published)' : ''}{block.hasDraft ? ' (draft)' : ''}</option>)}
          </Select>
          {detail.loading && <LoadingBlock rows={2} label="Loading the block" />}
          {current && (
            <>
              <p className="text-[13px] text-ink2">{current.block.description}</p>
              <p className="text-[12.5px] text-ink3">Placeholders for the rates: {list.data.placeholders.map((name) => <code key={name} className="mx-0.5 rounded bg-s3 px-1.5 py-0.5 font-mono text-[12px] text-ink">{`{{${name}}}`}</code>)}</p>
              <textarea aria-label="Content of the block, as JSON" rows={14} value={text} onChange={(event) => setText(event.target.value)} disabled={!mayWrite} className={`${denseInput} h-auto py-2 font-mono text-[12.5px]`} />
              {parsed.error && <p role="alert" className="text-[13px] font-medium text-bad">{parsed.error}</p>}
              {mayWrite && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={denseGhost} disabled={busy || parsed.error !== null} onClick={() => void run(() => api(`${base}/draft`, { method: 'PUT', body: { data: parsed.value } }), 'The draft was saved. It is not on the site yet.')}>Save the draft</button>
                  <button type="button" className={densePrimary} disabled={busy || !current.draft} onClick={() => void run(() => post(`${base}/publish`), 'Published. The site shows it within a minute.')}>Publish the draft</button>
                  <button type="button" className={denseGhost} disabled={busy || !current.draft} onClick={() => void run(() => api(`${base}/draft`, { method: 'DELETE' }), 'The draft was discarded.')}>Discard the draft</button>
                  <button type="button" className={denseGhost} disabled={busy || !current.published} onClick={() => void run(() => post(`${base}/unpublish`), 'Taken down. The site uses the words of the code.')}>Take down</button>
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
                        {mayWrite && row.status === 'ARCHIVED' && <button type="button" className={denseGhost} disabled={busy} onClick={() => void run(() => post(`${base}/rollback`, { revisionId: row.id }), 'That version is published again.')}>Put this version back</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
