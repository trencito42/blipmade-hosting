import { useEffect, useMemo, useState } from 'react';
import { del, get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
import { FlowCanvas } from './FlowCanvas';
import { can, useAdminSession } from './Overview';

/**
 * The editor of the support bots.
 *
 * A bot is a list of blocks, each with the block it leads to. The editor edits that list as forms, shows what the server
 * says is wrong with it, and runs it in a simulator that saves nothing. Publishing makes a numbered version that new
 * conversations use; the older versions stay and can be put back. There is no drawing board with lines to drag: the
 * connections are chosen from lists, and what leads where is shown in the block that leads.
 */

type Option = { id: string; label: string; next: string };
type Case = { equals?: string; contains?: string; next: string };
type Node = { type: string; text?: string; next?: string; variable?: string; options?: Option[]; cases?: Case[]; else?: string; query?: string; empty?: string; article?: string; subject?: string; priority?: string; departmentId?: string };
type Flow = { start: string; welcome?: string; persona?: { name?: string; avatarUrl?: string }; nodes: Record<string, Node>; layout?: Record<string, { x: number; y: number }> };
type Validation = { ok: boolean; errors: string[]; warnings: string[] };
type Out = { kind: string; text?: string; options?: { id: string; label: string }[]; articles?: { title: string; url: string }[]; input?: string };

const TYPES: { value: string; label: string }[] = [
  { value: 'message', label: 'Send a message' },
  { value: 'buttons', label: 'Show buttons' },
  { value: 'ask_text', label: 'Ask for text' },
  { value: 'ask_email', label: 'Ask for an email' },
  { value: 'ask_service', label: 'Ask for a service' },
  { value: 'branch', label: 'Branch on an answer' },
  { value: 'search_kb', label: 'Search the documentation' },
  { value: 'ai_answer', label: 'Answer with the assistant' },
  { value: 'suggest_article', label: 'Suggest an article' },
  { value: 'create_ticket', label: 'Create a ticket' },
  { value: 'set_priority', label: 'Set the priority' },
  { value: 'assign_department', label: 'Move to a department' },
  { value: 'transfer', label: 'Hand over to a person' },
  { value: 'end', label: 'End' },
];

const NEW_NODE: Record<string, Node> = {
  message: { type: 'message', text: 'Write the message here.' },
  buttons: { type: 'buttons', text: 'Choose one.', options: [{ id: 'one', label: 'Option', next: '' }] },
  ask_text: { type: 'ask_text', text: 'Ask the question here.', variable: 'answer' },
  ask_email: { type: 'ask_email', text: 'What is your email address?', variable: 'email' },
  ask_service: { type: 'ask_service', text: 'Which service is it about?', variable: 'service' },
  branch: { type: 'branch', variable: 'answer', cases: [{ contains: 'word', next: '' }] },
  search_kb: { type: 'search_kb', query: '{{answer}}' },
  ai_answer: { type: 'ai_answer', query: '{{answer}}' },
  suggest_article: { type: 'suggest_article', article: '' },
  create_ticket: { type: 'create_ticket', subject: 'From the assistant' },
  set_priority: { type: 'set_priority', priority: 'NORMAL' },
  assign_department: { type: 'assign_department', departmentId: '' },
  transfer: { type: 'transfer' },
  end: { type: 'end', text: 'Thank you.' },
};

export default function SupportBots() {
  const session = useAdminSession();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useAsync((signal) => get<{ bots: { id: string; name: string; enabled: boolean; publishedVersion: number | null; conversations: number }[] }>('/admin/support/bots', undefined, signal), []);
  const toast = useToast();
  const [name, setName] = useState('');
  const create = useAction(async (template: boolean) => {
    const res = await post<{ bot: { id: string } }>('/admin/support/bots', { name, template });
    setName('');
    list.reload();
    setOpenId(res.bot.id);
  });
  const toggle = useAction(async (id: string, enabled: boolean) => {
    await put(`/admin/support/bots/${id}`, { enabled });
    list.reload();
    toast.push(enabled ? 'The bot is on for new conversations.' : 'The bot is off. Conversations that started go on.', 'ok');
  });
  const [deleting, setDeleting] = useState<{ id: string; name: string; conversations: number } | null>(null);
  const remove = useAction(async (id: string) => {
    await del(`/admin/support/bots/${id}?force=true`);
    list.reload();
    toast.push('Bot deleted.', 'ok');
  });

  if (session.loading) return <LoadingBlock rows={3} label="Loading your permissions" />;
  if (!can(session.staff, 'tickets.read')) return <EmptyState title="No access" description="Your role does not include the support area." />;
  const mayEdit = can(session.staff, 'settings.write');

  if (openId) return <Editor id={openId} mayEdit={mayEdit} onClose={() => { setOpenId(null); list.reload(); }} />;

  return (
    <div className="grid gap-4">
      <Panel title="Support bots" description="A bot answers first in the chat and hands over to a person when it cannot help. Everything it says is written here.">
        {list.loading && !list.data ? (
          <LoadingBlock rows={2} label="Loading the bots" />
        ) : list.error ? (
          <ErrorState title="The bots could not be loaded" message={list.error.message} onRetry={list.reload} />
        ) : (list.data?.bots.length ?? 0) === 0 ? (
          <p className="text-[14px] text-ink2">No bot yet. Until one is published and switched on, the chat goes straight to a person.</p>
        ) : (
          <ul className="grid gap-1.5">
            {list.data!.bots.map((bot) => (
              <li key={bot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
                <p className="text-[14px] font-medium text-ink">
                  {bot.name}
                  <span className="ml-2 text-[12.5px] font-normal text-ink3">
                    {bot.publishedVersion ? `version ${bot.publishedVersion}` : 'not published'} · {bot.enabled ? 'on' : 'off'} · {bot.conversations} conversations
                  </span>
                </p>
                <span className="flex flex-wrap gap-2">
                  <SoftButton onClick={() => setOpenId(bot.id)}>{mayEdit ? 'Edit' : 'View'}</SoftButton>
                  {mayEdit && <SoftButton onClick={() => void toggle.run(bot.id, !bot.enabled)} disabled={!bot.publishedVersion && !bot.enabled}>{bot.enabled ? 'Switch off' : 'Switch on'}</SoftButton>}
                  {mayEdit && <SoftButton onClick={() => setDeleting({ id: bot.id, name: bot.name, conversations: bot.conversations })}>Delete</SoftButton>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(toggle.error || remove.error) && <p role="alert" className="mt-2 text-[13px] text-bad">{toggle.error || remove.error}</p>}
      </Panel>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'this bot'}?`}
        description={deleting && deleting.conversations > 0 ? `It has ${deleting.conversations} conversations. Their records are deleted with it. The tickets that came out of them stay. This cannot be undone.` : 'This cannot be undone.'}
        confirmLabel="Delete"
        busy={remove.pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void remove.run(target.id);
        }}
      />
      {mayEdit && (
        <Panel title="New bot" description="Start from the template (a menu with technical, billing, account, plans and a person) or from an empty bot. Both are drafts that you edit.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
            <SoftButton onClick={() => void create.run(true)} disabled={create.pending || name.trim().length < 2}>From the template</SoftButton>
            <SoftButton onClick={() => void create.run(false)} disabled={create.pending || name.trim().length < 2}>Empty</SoftButton>
          </div>
          {create.error && <p role="alert" className="mt-2 text-[13px] text-bad">{create.error}</p>}
        </Panel>
      )}
    </div>
  );
}

function Editor({ id, mayEdit, onClose }: { id: string; mayEdit: boolean; onClose: () => void }) {
  const toast = useToast();
  const loaded = useAsync((signal) => get<{ bot: { id: string; name: string; enabled: boolean }; draft: Flow; validation: Validation; versions: { id: string; version: number; createdAt: string }[] }>(`/admin/support/bots/${id}`, undefined, signal), [id]);
  const departments = useAsync((signal) => get<{ departments: { id: string; name: string }[] }>('/admin/support/departments', undefined, signal), []);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [past, setPast] = useState<Flow[]>([]);
  const [future, setFuture] = useState<Flow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [addType, setAddType] = useState('message');
  const [importText, setImportText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (loaded.data) {
      setFlow(loaded.data.draft);
      setValidation(loaded.data.validation);
      setPast([]);
      setFuture([]);
      setDirty(false);
    }
  }, [loaded.data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (next: Flow) => {
    if (flow) setPast((stack) => [...stack.slice(-49), flow]);
    setFuture([]);
    setFlow(next);
    setDirty(true);
  };
  const undo = () => {
    if (!flow || past.length === 0) return;
    setFuture((stack) => [flow, ...stack]);
    setFlow(past.at(-1)!);
    setPast((stack) => stack.slice(0, -1));
    setDirty(true);
  };
  const redo = () => {
    if (!flow || future.length === 0) return;
    setPast((stack) => [...stack, flow]);
    setFlow(future[0]!);
    setFuture((stack) => stack.slice(1));
    setDirty(true);
  };

  const save = useAction(async () => {
    const res = await put<{ validation: Validation }>(`/admin/support/bots/${id}/draft`, { flow });
    setValidation(res.validation);
    setDirty(false);
    toast.push('Draft saved.', 'ok');
  });
  const publish = useAction(async () => {
    if (dirty) await put(`/admin/support/bots/${id}/draft`, { flow });
    const res = await post<{ version: number }>(`/admin/support/bots/${id}/publish`);
    setDirty(false);
    toast.push(`Published as version ${res.version}.`, 'ok');
    loaded.reload();
  });
  const rollback = useAction(async (version: number) => {
    await post(`/admin/support/bots/${id}/rollback`, { version });
    toast.push(`Version ${version} is back.`, 'ok');
    loaded.reload();
  });

  const nodeIds = useMemo(() => Object.keys(flow?.nodes ?? {}), [flow]);
  if (loaded.loading && !flow) return <LoadingBlock rows={4} label="Loading the bot" />;
  if (loaded.error || !flow) return <ErrorState title="The bot could not be loaded" message={loaded.error?.message ?? 'Unknown error'} onRetry={loaded.reload} />;

  const setNode = (key: string, node: Node) => change({ ...flow, nodes: { ...flow.nodes, [key]: node } });
  const removeNode = (key: string) => {
    const nodes = { ...flow.nodes };
    delete nodes[key];
    change({ ...flow, nodes, start: flow.start === key ? Object.keys(nodes)[0] ?? '' : flow.start });
  };
  const addNode = () => {
    let n = nodeIds.length + 1;
    while (flow.nodes[`block${n}`]) n += 1;
    change({ ...flow, nodes: { ...flow.nodes, [`block${n}`]: structuredClone(NEW_NODE[addType]!) } });
  };
  const rename = (from: string, to: string) => {
    const key = to.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!key || key === from || flow.nodes[key]) return;
    const text = JSON.stringify(flow).split(`"${from}"`).join(`"${key}"`);
    change(JSON.parse(text) as Flow);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-semibold text-ink">{loaded.data!.bot.name}</h2>
          <p className="text-[12.5px] text-ink3">{dirty ? 'Unsaved changes.' : 'Saved.'} {loaded.data!.bot.enabled ? 'On for new conversations.' : 'Off.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SoftButton onClick={undo} disabled={past.length === 0}>Undo</SoftButton>
          <SoftButton onClick={redo} disabled={future.length === 0}>Redo</SoftButton>
          {mayEdit && <SoftButton onClick={() => void save.run()} disabled={save.pending || !dirty}>Save draft</SoftButton>}
          {mayEdit && <PrimaryButton onClick={() => void publish.run()} disabled={publish.pending}>Publish</PrimaryButton>}
          <SoftButton onClick={onClose}>Back</SoftButton>
        </div>
      </div>
      {(save.error || publish.error || rollback.error) && <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error || publish.error || rollback.error}</p>}

      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <Panel title="What to fix" description="Errors stop the publication. Warnings only say what looks wrong.">
          <ul className="grid gap-1 text-[13.5px]">
            {validation.errors.map((message) => <li key={message} className="text-bad">• {message}</li>)}
            {validation.warnings.map((message) => <li key={message} className="text-ink2">• {message}</li>)}
          </ul>
        </Panel>
      )}

      <Panel title="The map" description="Every block and where it leads. Click a block to edit it below, drag it to move it, drag the board to move the view, scroll or use + and − to zoom. Lines that lead nowhere are red.">
        <FlowCanvas
          flow={flow as never}
          selected={selected}
          readOnly={!mayEdit}
          onSelect={(key) => {
            setSelected(key);
            document.getElementById(`block-${key}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
          }}
          onMove={(key, pos) => change({ ...flow, layout: { ...(flow.layout ?? {}), [key]: pos } })}
        />
      </Panel>

      <Panel title="The flow">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="The first block" value={flow.start} onChange={(event) => change({ ...flow, start: event.target.value })} disabled={!mayEdit}>
              {nodeIds.map((key) => <option key={key} value={key}>{key}</option>)}
            </Select>
            <TextInput label="Welcome message" value={flow.welcome ?? ''} onChange={(event) => change({ ...flow, welcome: event.target.value })} maxLength={1000} disabled={!mayEdit} />
            <TextInput label="Name shown at the top of the chat" value={flow.persona?.name ?? ''} onChange={(event) => change({ ...flow, persona: { ...flow.persona, name: event.target.value } })} maxLength={40} disabled={!mayEdit} />
            <TextInput label="Picture (https address, optional)" value={flow.persona?.avatarUrl ?? ''} onChange={(event) => change({ ...flow, persona: { ...flow.persona, avatarUrl: event.target.value } })} maxLength={300} disabled={!mayEdit} />
          </div>
          {nodeIds.map((key) => (
            <NodeCard key={key} selected={selected === key} id={key} node={flow.nodes[key]!} nodeIds={nodeIds} departments={departments.data?.departments ?? []} readOnly={!mayEdit} isStart={flow.start === key} onChange={(node) => setNode(key, node)} onRemove={() => removeNode(key)} onRename={(to) => rename(key, to)} />
          ))}
          {mayEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <Select label="Add a block" value={addType} onChange={(event) => setAddType(event.target.value)}>
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </Select>
              <SoftButton onClick={addNode} disabled={nodeIds.length >= 60}>Add</SoftButton>
            </div>
          )}
        </div>
      </Panel>

      <Simulator flow={flow} />

      <Panel title="Versions" description="The published versions. New conversations use the one that is on; a conversation that started keeps its own.">
        {(loaded.data!.versions.length ?? 0) === 0 ? (
          <p className="text-[14px] text-ink2">Not published yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {loaded.data!.versions.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-2.5 text-[14px] text-ink">
                <span>Version {version.version} <span className="text-[12.5px] text-ink3">· {new Date(version.createdAt).toLocaleString()}</span></span>
                {mayEdit && <SoftButton onClick={() => void rollback.run(version.version)} disabled={rollback.pending}>Put back as the draft and the live version</SoftButton>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Export and import" description="A flow as a file, to keep or to copy to another bot. An imported flow is checked and arrives as a draft that is off.">
        <div className="grid gap-3">
          <SoftButton onClick={() => {
            const blob = new Blob([JSON.stringify({ name: loaded.data!.bot.name, flow }, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${loaded.data!.bot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
          }}>Download the flow</SoftButton>
          {mayEdit && (
            <>
              <TextArea label="Paste an exported flow" value={importText} onChange={(event) => setImportText(event.target.value)} rows={4} />
              <ImportButton text={importText} onDone={(newId) => { setImportText(''); toast.push('Imported as a new draft.', 'ok'); void newId; }} />
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ImportButton({ text, onDone }: { text: string; onDone: (id: string) => void }) {
  const run = useAction(async () => {
    const parsed = JSON.parse(text) as { name?: string; flow?: unknown };
    const res = await post<{ bot: { id: string } }>('/admin/support/bots/import', { name: `${parsed.name ?? 'Imported bot'} (import)`.slice(0, 60), flow: parsed.flow });
    onDone(res.bot.id);
  });
  return (
    <div className="grid gap-1">
      <SoftButton onClick={() => void run.run()} disabled={run.pending || !text.trim()}>Import as a new bot</SoftButton>
      {run.error && <p role="alert" className="text-[13px] text-bad">{run.error}</p>}
    </div>
  );
}

function NextSelect({ label, value, nodeIds, onChange, disabled, empty = 'The conversation ends here' }: { label: string; value?: string; nodeIds: string[]; onChange: (value: string | undefined) => void; disabled?: boolean; empty?: string }) {
  return (
    <Select label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)} disabled={disabled}>
      <option value="">{empty}</option>
      {nodeIds.map((key) => <option key={key} value={key}>{key}</option>)}
    </Select>
  );
}

function NodeCard({ id, selected, node, nodeIds, departments, readOnly, isStart, onChange, onRemove, onRename }: { id: string; selected?: boolean; node: Node; nodeIds: string[]; departments: { id: string; name: string }[]; readOnly: boolean; isStart: boolean; onChange: (node: Node) => void; onRemove: () => void; onRename: (to: string) => void }) {
  const [draftId, setDraftId] = useState(id);
  useEffect(() => setDraftId(id), [id]);
  const set = (patch: Partial<Node>) => onChange({ ...node, ...patch });
  const label = TYPES.find((type) => type.value === node.type)?.label ?? node.type;
  const text = (field: 'text' | 'query' | 'subject' | 'variable' | 'article', title: string, multi = false) =>
    multi ? (
      <TextArea label={title} value={node[field] ?? ''} onChange={(event) => set({ [field]: event.target.value })} rows={3} maxLength={1000} disabled={readOnly} />
    ) : (
      <TextInput label={title} value={node[field] ?? ''} onChange={(event) => set({ [field]: event.target.value })} maxLength={1000} disabled={readOnly} />
    );
  const next = (title = 'Then') => <NextSelect label={title} value={node.next} nodeIds={nodeIds} onChange={(value) => set({ next: value })} disabled={readOnly} />;

  return (
    <section id={`block-${id}`} className={`grid gap-3 rounded-2xl border bg-card p-4 ${selected ? 'border-acc' : 'border-line'}`} aria-label={`Block ${id}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <TextInput label="Block id" value={draftId} onChange={(event) => setDraftId(event.target.value)} onBlur={() => onRename(draftId)} maxLength={32} disabled={readOnly} />
          <p className="pb-3 text-[13px] text-ink3">{label}{isStart ? ' · first block' : ''}</p>
        </div>
        {!readOnly && <SoftButton onClick={onRemove}>Remove</SoftButton>}
      </div>

      {['message', 'buttons', 'ask_text', 'ask_email', 'ask_service', 'end'].includes(node.type) && text('text', node.type === 'end' ? 'Closing message (optional)' : 'What the customer reads', true)}
      {['ask_text', 'ask_email', 'ask_service', 'branch'].includes(node.type) && text('variable', node.type === 'branch' ? 'The variable to look at' : 'Keep the answer in the variable')}
      {node.type === 'search_kb' && text('query', 'Search for (you can use {{variable}})')}
      {node.type === 'ai_answer' && text('query', 'The question the assistant answers (you can use {{variable}})')}
      {node.type === 'ai_answer' && <p className="text-[12.5px] text-ink3">Answers from the public documentation, only when the assistant is switched on for customers in the numbers page. Otherwise this block does nothing.</p>}
      {node.type === 'suggest_article' && text('article', 'The id of the article')}
      {node.type === 'create_ticket' && text('subject', 'Subject of the ticket')}
      {node.type === 'set_priority' && (
        <Select label="Priority" value={node.priority ?? 'NORMAL'} onChange={(event) => set({ priority: event.target.value })} disabled={readOnly}>
          {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}
        </Select>
      )}
      {(node.type === 'assign_department' || node.type === 'transfer') && (
        <Select label={node.type === 'transfer' ? 'Department (optional)' : 'Department'} value={node.departmentId ?? ''} onChange={(event) => set({ departmentId: event.target.value || undefined })} disabled={readOnly}>
          <option value="">{node.type === 'transfer' ? 'Any' : 'Choose'}</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </Select>
      )}
      {node.type === 'transfer' && text('text', 'What the customer reads (optional)', true)}

      {node.type === 'buttons' && (
        <div className="grid gap-2">
          {(node.options ?? []).map((option, index) => (
            <div key={index} className="grid gap-2 rounded-xl bg-s2 p-3 sm:grid-cols-3">
              <TextInput label="Button" value={option.label} onChange={(event) => set({ options: node.options!.map((entry, i) => (i === index ? { ...entry, label: event.target.value, id: entry.id } : entry)) })} maxLength={60} disabled={readOnly} />
              <TextInput label="Button id" value={option.id} onChange={(event) => set({ options: node.options!.map((entry, i) => (i === index ? { ...entry, id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') } : entry)) })} maxLength={32} disabled={readOnly} />
              <NextSelect label="Leads to" value={option.next} nodeIds={nodeIds} empty="Choose" onChange={(value) => set({ options: node.options!.map((entry, i) => (i === index ? { ...entry, next: value ?? '' } : entry)) })} disabled={readOnly} />
              {!readOnly && <SoftButton onClick={() => set({ options: node.options!.filter((_, i) => i !== index) })} disabled={(node.options ?? []).length <= 1}>Remove the button</SoftButton>}
            </div>
          ))}
          {!readOnly && (node.options ?? []).length < 8 && <SoftButton onClick={() => set({ options: [...(node.options ?? []), { id: `option${(node.options ?? []).length + 1}`, label: 'Option', next: '' }] })}>Add a button</SoftButton>}
        </div>
      )}

      {node.type === 'branch' && (
        <div className="grid gap-2">
          {(node.cases ?? []).map((entry, index) => (
            <div key={index} className="grid gap-2 rounded-xl bg-s2 p-3 sm:grid-cols-3">
              <Select label="When the answer" value={entry.equals !== undefined ? 'equals' : 'contains'} onChange={(event) => set({ cases: node.cases!.map((c, i) => (i === index ? { next: c.next, [event.target.value]: c.equals ?? c.contains ?? '' } : c)) })} disabled={readOnly}>
                <option value="contains">contains</option>
                <option value="equals">is exactly</option>
              </Select>
              <TextInput label="The words" value={entry.equals ?? entry.contains ?? ''} onChange={(event) => set({ cases: node.cases!.map((c, i) => (i === index ? { next: c.next, [c.equals !== undefined ? 'equals' : 'contains']: event.target.value } : c)) })} maxLength={200} disabled={readOnly} />
              <NextSelect label="Leads to" value={entry.next} nodeIds={nodeIds} empty="Choose" onChange={(value) => set({ cases: node.cases!.map((c, i) => (i === index ? { ...c, next: value ?? '' } : c)) })} disabled={readOnly} />
              {!readOnly && <SoftButton onClick={() => set({ cases: node.cases!.filter((_, i) => i !== index) })} disabled={(node.cases ?? []).length <= 1}>Remove the case</SoftButton>}
            </div>
          ))}
          {!readOnly && <SoftButton onClick={() => set({ cases: [...(node.cases ?? []), { contains: 'word', next: '' }] })}>Add a case</SoftButton>}
          <NextSelect label="Otherwise" value={node.else} nodeIds={nodeIds} onChange={(value) => set({ else: value })} disabled={readOnly} />
        </div>
      )}

      {node.type === 'search_kb' && <NextSelect label="When nothing is found" value={node.empty} nodeIds={nodeIds} onChange={(value) => set({ empty: value })} disabled={readOnly} empty="Same as Then" />}
      {!['buttons', 'branch', 'transfer', 'end'].includes(node.type) && next()}
    </section>
  );
}

function Simulator({ flow }: { flow: Flow }) {
  const [inputs, setInputs] = useState<{ text?: string; option?: string }[]>([]);
  const [text, setText] = useState('');
  const run = useAsync(
    (signal) => post<{ ok: boolean; errors?: string[]; turns: Out[][]; effects: string[]; state?: string }>('/admin/support/bots/simulate', { flow, inputs }),
    [JSON.stringify(flow), JSON.stringify(inputs)],
  );
  void run;
  const result = run.data;
  const last = result?.turns.at(-1)?.at(-1);
  return (
    <Panel title="Try it" description="Runs the flow as it is now. Nothing is saved, no ticket is made and nobody is notified.">
      <div className="grid gap-3">
        {run.loading && !result ? (
          <LoadingBlock rows={2} label="Running the flow" />
        ) : result && !result.ok ? (
          <ul className="grid gap-1 text-[13.5px] text-bad">{(result.errors ?? []).map((message) => <li key={message}>• {message}</li>)}</ul>
        ) : (
          <>
            <ol className="grid gap-2" aria-live="polite">
              {result?.turns.flatMap((turn, turnIndex) => [
                ...(turnIndex > 0 && inputs[turnIndex - 1] ? [<li key={`in-${turnIndex}`} className="justify-self-end rounded-2xl bg-acc px-3.5 py-2 text-[14px] text-on-acc">{inputs[turnIndex - 1]!.text ?? inputs[turnIndex - 1]!.option}</li>] : []),
                ...turn.map((out, i) => (
                  <li key={`${turnIndex}-${i}`} className="max-w-[90%] justify-self-start whitespace-pre-wrap break-words rounded-2xl bg-s2 px-3.5 py-2 text-[14px] text-ink">
                    {out.kind === 'articles' ? (out.articles ?? []).map((article) => article.title).join(' · ') : out.text}
                    {out.kind === 'buttons' && <span className="mt-1 flex flex-wrap gap-1.5">{(out.options ?? []).map((option) => <button key={option.id} type="button" onClick={() => setInputs([...inputs, { option: option.id }])} className="min-h-11 rounded-full border border-line bg-card px-3 text-[13px] font-medium text-ink hover:bg-s3">{option.label}</button>)}</span>}
                    {out.kind === 'ask' && out.input === 'service' && <span className="mt-1 flex flex-wrap gap-1.5">{(out.options ?? []).map((option) => <button key={option.id} type="button" onClick={() => setInputs([...inputs, { option: option.id }])} className="min-h-11 rounded-full border border-line bg-card px-3 text-[13px] font-medium text-ink hover:bg-s3">{option.label}</button>)}</span>}
                  </li>
                )),
              ])}
            </ol>
            {result && result.state && result.state !== 'ACTIVE' && <p className="text-[12.5px] text-ink3">The conversation ended: {result.state.toLowerCase().replace('_', ' ')}.</p>}
            {(result?.effects.length ?? 0) > 0 && <ul className="text-[12.5px] text-ink3">{result!.effects.map((effect) => <li key={effect}>• {effect}</li>)}</ul>}
            {last && (last.kind === 'ask' && last.input !== 'service' || last.kind === 'buttons') && (
              <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { setInputs([...inputs, { text }]); setText(''); } }}>
                <TextInput label="Your answer" value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} />
                <SoftButton type="submit" disabled={!text.trim()}>Send</SoftButton>
              </form>
            )}
          </>
        )}
        <SoftButton onClick={() => setInputs([])} disabled={inputs.length === 0}>Start again</SoftButton>
      </div>
    </Panel>
  );
}
