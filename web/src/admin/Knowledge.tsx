import { useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel } from '../ui-app';
import { can, denseInput, densePrimary, denseSoft, useAdminSession } from './Overview';

interface Article { id: string; title: string; body: string; tags: string[]; assistant?: boolean }

/** The knowledge base of the team: how to answer the questions that come back, written once and found by a search. */
export default function Knowledge() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'tickets.write');
  const state = useAsync<{ articles: Article[] }>((signal) => get('/admin/support/knowledge', undefined, signal), []);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const all = state.data?.articles ?? [];
  const shown = all.filter((article) => !query.trim() || `${article.title} ${article.body} ${article.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="grid gap-4">
      <Panel
        title="Knowledge base"
        description={'Notes for the team: answers and procedures, found by a search. They are not the pages of the site (/docs, which are written in the repository). A note you mark "the assistant may use this with customers" is also used by the chat assistant, next to the public pages; the others stay private.'}
        action={mayWrite ? <Link to="/admin/knowledge/new" className={densePrimary}>New article</Link> : undefined}
      >
        <input aria-label="Search the knowledge base" className={denseInput} placeholder="Search…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Panel>

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
                      <Link to={`/admin/knowledge/${encodeURIComponent(article.id)}/edit`} className={denseSoft}>Edit</Link>
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
