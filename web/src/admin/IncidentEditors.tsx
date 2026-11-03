import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, Select, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

const BACK_TO = '/admin/incidents';
const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
const IMPACTS = ['none', 'minor', 'major', 'critical', 'maintenance'];
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The pieces the three pages share: guard, discard, error line, and the result. */
function useEditor(dirtyNow: boolean, question: string) {
  const { navigate } = useRouter();
  const [done, setDone] = useState(false);
  const dirty = !done && dirtyNow;
  useUnsavedChangesGuard(dirty, question);
  const discard = () => {
    if (!dirty || window.confirm(question)) navigate(BACK_TO);
  };
  const finish = () => {
    setDone(true);
    navigate(BACK_TO, { replace: true });
  };
  return { dirty, discard, finish };
}

function Errors({ message }: { message: string | null | undefined }) {
  return message ? <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{message}</p> : null;
}

/** A new incident, told on the public status page. */
export function IncidentNew() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const [form, setForm] = useState({ title: '', impact: 'minor', message: '' });
  const { dirty, discard, finish } = useEditor(form.title !== '' || form.message !== '', 'Discard this incident?');
  const send = useAction(async () => post('/admin/incidents', form));
  const ok = mayWrite && form.title.trim().length >= 3 && form.message.trim().length >= 3 && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    toast.push('The incident was published.', 'ok');
    finish();
  };
  return (
    <PageEditorShell eyebrow="Incidents" title="New incident" description="It is published on the public status page at once." backTo={BACK_TO} backLabel="Back to incidents" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ok}>{send.pending ? 'Publishing…' : 'Publish incident'}</PrimaryButton></>}>
      <div className="grid gap-3">
        <TextInput label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Slow deployments" />
        <Select label="Impact" value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })}>
          {IMPACTS.map((entry) => <option key={entry} value={entry}>{cap(entry)}</option>)}
        </Select>
        <TextArea label="What we know" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={4} />
        <Errors message={send.error} />
      </div>
    </PageEditorShell>
  );
}

/** A new update on an incident. A resolved update closes it. */
export function IncidentUpdateNew() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const list = useAsync<{ incidents: { id: string; title: string; resolvedAt: string | null }[] }>((signal) => get('/admin/incidents', undefined, signal), []);
  const incident = list.data?.incidents.find((entry) => entry.id === id);
  const [status, setStatus] = useState('monitoring');
  const [message, setMessage] = useState('');
  const { dirty, discard, finish } = useEditor(message !== '', 'Discard this update?');
  const send = useAction(async () => post(`/admin/incidents/${encodeURIComponent(id)}/updates`, { status, message }));
  const ok = mayWrite && Boolean(incident) && message.trim().length >= 3 && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    toast.push('The update was published.', 'ok');
    finish();
  };
  return (
    <PageEditorShell eyebrow="Incidents" title={incident ? `Update: ${incident.title}` : 'New update'} description="A resolved update closes the incident on the status page." backTo={BACK_TO} backLabel="Back to incidents" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ok}>{send.pending ? 'Publishing…' : 'Publish update'}</PrimaryButton></>}>
      {list.loading && !list.data ? <LoadingBlock rows={2} label="Loading the incident" />
        : list.error ? <ErrorState title="The incident could not be loaded" message={list.error.message} onRetry={list.reload} />
        : !incident ? <ErrorState title="Incident not found" message="It was deleted." />
        : (
          <div className="grid gap-3">
            <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((entry) => <option key={entry} value={entry}>{cap(entry)}</option>)}
            </Select>
            <TextArea label="Update" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} placeholder="What we know now" />
            <Errors message={send.error} />
          </div>
        )}
    </PageEditorShell>
  );
}

/** A new announcement: a banner for every signed-in customer, between two dates. */
export function AnnouncementNew() {
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const [note, setNote] = useState({ title: '', body: '', severity: 'maintenance', startsAt: '', endsAt: '' });
  const { dirty, discard, finish } = useEditor(note.title !== '' || note.body !== '', 'Discard this announcement?');
  const send = useAction(async () =>
    post('/admin/announcements', {
      title: note.title, body: note.body, severity: note.severity,
      ...(note.startsAt ? { startsAt: new Date(note.startsAt).toISOString() } : {}),
      ...(note.endsAt ? { endsAt: new Date(note.endsAt).toISOString() } : {}),
    }),
  );
  const ok = mayWrite && note.title.trim().length >= 3 && note.body.trim().length >= 3 && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    toast.push('The announcement was published.', 'ok');
    finish();
  };
  return (
    <PageEditorShell eyebrow="Incidents" title="New announcement" description="A banner for every signed-in customer, between two dates." backTo={BACK_TO} backLabel="Back to incidents" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ok}>{send.pending ? 'Publishing…' : 'Publish announcement'}</PrimaryButton></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Title" value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="Planned maintenance" />
        <Select label="Kind" value={note.severity} onChange={(event) => setNote({ ...note, severity: event.target.value })}>
          <option value="maintenance">Maintenance</option>
          <option value="info">News</option>
          <option value="warning">Warning</option>
        </Select>
        <div className="sm:col-span-2"><TextArea label="Message" value={note.body} onChange={(event) => setNote({ ...note, body: event.target.value })} rows={4} /></div>
        <TextInput label="Starts (optional)" type="datetime-local" value={note.startsAt} onChange={(event) => setNote({ ...note, startsAt: event.target.value })} />
        <TextInput label="Ends (optional)" type="datetime-local" value={note.endsAt} onChange={(event) => setNote({ ...note, endsAt: event.target.value })} />
        <div className="sm:col-span-2"><Errors message={send.error} /></div>
      </div>
    </PageEditorShell>
  );
}
