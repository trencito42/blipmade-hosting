import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextArea, TextInput } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

interface Article { id: string; title: string; body: string; tags: string[]; assistant?: boolean }
const BACK_TO = '/admin/knowledge';

/** One article of the knowledge base: `/new` writes one, `/:id/edit` changes or deletes one. The list is saved whole, as the API takes it. */
export default function KnowledgeEdit() {
  const { id } = useParams();
  const { navigate } = useRouter();
  const mayWrite = can(useAdminSession().staff, 'tickets.write');
  const state = useAsync<{ articles: Article[] }>((signal) => get('/admin/support/knowledge', undefined, signal), []);
  const all = state.data?.articles ?? [];
  const existing = id ? all.find((article) => article.id === id) : undefined;
  const [draft, setDraft] = useState<Article>(() => ({ id: Math.random().toString(36).slice(2, 10), title: '', body: '', tags: [] }));
  const [tags, setTags] = useState('');
  const [loaded, setLoaded] = useState(!id);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!existing || loaded) return;
    setDraft(existing);
    setTags(existing.tags.join(', '));
    setLoaded(true);
  }, [existing, loaded]);
  const tagList = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  const dirty = !done && (id ? loaded && existing !== undefined && (draft.title !== existing.title || draft.body !== existing.body || Boolean(draft.assistant) !== Boolean(existing.assistant) || tagList.join(',') !== existing.tags.join(',')) : draft.title !== '' || draft.body !== '' || tags !== '');
  useUnsavedChangesGuard(dirty, 'Discard this article?');
  const save = useAction(async (articles: Article[]) => {
    await put('/admin/support/knowledge', { articles });
    setDone(true);
    navigate(BACK_TO, { replace: true });
  });
  const discard = () => {
    if (!dirty || window.confirm('Discard this article?')) navigate(BACK_TO);
  };
  const submit = () => void save.run([...all.filter((article) => article.id !== draft.id), { ...draft, tags: tagList }]);
  const remove = () => {
    if (window.confirm('Delete this article?')) void save.run(all.filter((article) => article.id !== draft.id));
  };
  const ready = mayWrite && draft.title.trim() !== '' && draft.body.trim() !== '' && dirty && !save.pending;
  return (
    <PageEditorShell
      eyebrow="Knowledge base"
      title={id ? 'Edit article' : 'New article'}
      description="Notes for the team: answers and procedures, found by a search."
      backTo={BACK_TO}
      backLabel="Back to the knowledge base"
      dirty={dirty}
      actions={
        <>
          {id && mayWrite && <SoftButton type="button" onClick={remove} disabled={save.pending}>Delete</SoftButton>}
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={submit} disabled={!ready}>{save.pending ? 'Saving…' : 'Save article'}</PrimaryButton>
        </>
      }
    >
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the article" />
        : state.error ? <ErrorState title="The knowledge base could not be loaded" message={state.error.message} onRetry={state.reload} />
        : id && !existing && !loaded ? <ErrorState title="Article not found" message="It was deleted." />
        : (
          <div className="grid gap-3">
            <TextInput label="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} disabled={!mayWrite} />
            <TextArea label="Text" rows={12} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Write the steps, plainly." disabled={!mayWrite} />
            <TextInput label="Tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, separated by commas" disabled={!mayWrite} />
            <label className="flex items-start gap-2 text-[13.5px] text-ink">
              <input type="checkbox" checked={Boolean(draft.assistant)} disabled={!mayWrite} onChange={(event) => setDraft({ ...draft, assistant: event.target.checked })} className="mt-0.5 size-5 shrink-0" />
              <span>The assistant may use this with customers. Write it so a customer can read it: it can be quoted in the chat. Do not put anything private in it.</span>
            </label>
            {save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}
