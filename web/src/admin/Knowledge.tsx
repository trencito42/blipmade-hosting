import { useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, LoadingBlock, Panel } from '../ui-app';
import { can, denseGhost, denseInput, densePrimary, denseSoft, useAdminSession } from './Overview';

interface Article { id: string; title: string; body: string; tags: string[]; assistant?: boolean }

/** The knowledge base of the team: how to answer the questions that come back, written once and found by a search. */
export default function Knowledge() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'tickets.write');
  const state = useAsync<{ articles: Article[] }>((signal) => get('/admin/support/knowledge', undefined, signal), []);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Article | null>(null);
  const save = useAction(async (articles: Article[]) => {
    await put('/admin/support/knowledge', { articles });
    setDraft(null);
    state.reload();
  });
  const all = state.data?.articles ?? [];
  const shown = all.filter((article) => !query.trim() || `${article.title} ${article.body} ${article.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="grid gap-4">
      <Panel
        title="Knowledge base"
        description={'Notes for the team: answers and procedures, found by a search. They are not the pages of the site (/docs, which are written in the repository). A note you mark "the assistant may use this with customers" is also used by the chat assistant, next to the public pages; the others stay private.'}
        action={mayWrite ? <button type="button" className={densePrimary} onClick={() => setDraft({ id: Math.random().toString(36).slice(2, 10), title: '', body: '', tags: [] })}>New article</button> : undefined}
      >
        <input aria-label="Search the knowledge base" className={denseInput} placeholder="Search…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Panel>

      {draft && (
        <Panel title={all.some((article) => article.id === draft.id) ? 'Edit the article' : 'New article'}>
          <div className="grid gap-3">
            <input aria-label="Title" className={denseInput} placeholder="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            <textarea aria-label="Text" rows={10} className="rounded-2xl border border-line bg-card p-3 text-[16px] text-ink outline-none focus:border-acc sm:text-[14px]" placeholder="Write the steps, plainly." value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            <input aria-label="Tags" className={denseInput} placeholder="Tags, separated by commas" value={draft.tags.join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
            <label className="flex items-start gap-2 text-[13.5px] text-ink"><input type="checkbox" checked={Boolean(draft.assistant)} onChange={(event) => setDraft({ ...draft, assistant: event.target.checked })} className="mt-0.5 size-5 shrink-0" /><span>The assistant may use this with customers. Write it so a customer can read it: it can be quoted in the chat. Do not put anything private in it.</span></label>
            {save.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={densePrimary} disabled={save.pending || !draft.title.trim() || !draft.body.trim()} onClick={() => void save.run([...all.filter((article) => article.id !== draft.id), draft])}>Save</button>
              <button type="button" className={denseGhost} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        </Panel>
      )}

      {state.loading && !state.data ? (
        <LoadingBlock rows={2} label="Loading the articles" />
      ) : state.error ? (
        <ErrorState title="The knowledge base could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : shown.length === 0 ? (
        <EmptyState title={all.length === 0 ? 'No articles yet.' : 'Nothing matches.'} description={all.length === 0 ? 'Write the first one: the answer you gave twice.' : 'Try another word.'} />
      ) : (
        <ul className="grid gap-2">
          {shown.map((article) => (
            <li key={article.id} className="grid gap-2 rounded-2xl bg-s2 p-4">
              <button type="button" className="text-left text-[14.5px] font-semibold text-ink" aria-expanded={open === article.id} onClick={() => setOpen(open === article.id ? null : article.id)}>
                {article.title} {article.assistant && <span className="rounded-full bg-acc-bg px-2 py-0.5 text-[11px] font-semibold text-acc">customers</span>} {article.tags.length > 0 && <span className="text-[12px] font-normal text-ink3">· {article.tags.join(', ')}</span>}
              </button>
              {open === article.id && (
                <>
                  <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink2">{article.body}</p>
                  {mayWrite && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={denseSoft} onClick={() => setDraft(article)}>Edit</button>
                      <button type="button" className={denseGhost} onClick={() => void save.run(all.filter((entry) => entry.id !== article.id))}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
