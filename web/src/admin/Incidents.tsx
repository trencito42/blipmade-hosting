import { useState } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, Select, TextArea, TextInput, useToast } from '../ui-app';
import { can, denseDanger, denseGhost, fmtDateTime, useAdminSession } from './Overview';

/**
 * Incidents and announcements.
 *
 * An incident is told on the public status page with its updates; a resolved update closes it.
 * The checks of the platform also open and close incidents by themselves (marked "automatic").
 * An announcement is a banner for every signed-in customer, for a period: a maintenance window, news.
 */
interface Update { id: string; status: string; message: string; createdAt: string }
interface Incident { id: string; title: string; status: string; impact: string; components: string[]; automatic: boolean; startedAt: string; resolvedAt: string | null; updates: Update[] }
interface Announcement { id: string; title: string; body: string; severity: string; startsAt: string; endsAt: string | null; active: boolean }

const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
const IMPACTS = ['none', 'minor', 'major', 'critical', 'maintenance'];
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function IncidentRow({ incident, mayWrite, onChanged }: { incident: Incident; mayWrite: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(incident.resolvedAt ? 'resolved' : 'monitoring');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await post(`/admin/incidents/${incident.id}/updates`, { status, message });
      setMessage('');
      toast.push('The update was published.', 'ok');
      onChanged();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="grid gap-3 rounded-2xl bg-s2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{incident.title} {incident.automatic && <span className="ml-1 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase text-ink2">automatic</span>}</p>
          <p className="text-[12.5px] text-ink3">{cap(incident.impact)} · started {fmtDateTime(incident.startedAt)}{incident.resolvedAt ? ` · resolved ${fmtDateTime(incident.resolvedAt)}` : ''}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${incident.resolvedAt ? 'bg-acc-bg text-acc' : 'bg-warn/15 text-warn'}`}>{cap(incident.status)}</span>
      </div>
      <ol className="grid gap-1.5 border-l border-line pl-3">
        {incident.updates.map((update) => (
          <li key={update.id} className="text-[13px] text-ink2"><strong className="text-ink">{cap(update.status)}</strong> · {fmtDateTime(update.createdAt)} — {update.message}</li>
        ))}
      </ol>
      {mayWrite && (
        <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((entry) => <option key={entry} value={entry}>{cap(entry)}</option>)}
          </Select>
          <TextInput label="Update" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What we know now" />
          <div className="flex gap-2">
            <PrimaryButton onClick={() => void send()} disabled={busy || message.trim().length < 3}>Publish</PrimaryButton>
            <button type="button" className={denseDanger} onClick={() => setRemoving(true)}>Delete</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={removing} title="Delete this incident?" description="It disappears from the status page and from the history." confirmLabel="Delete" onCancel={() => setRemoving(false)}
        onConfirm={() => { setRemoving(false); void del(`/admin/incidents/${incident.id}`).then(onChanged).catch((failure: Error) => toast.push(failure.message, 'error')); }} />
    </li>
  );
}

export default function Incidents() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'infrastructure.write');
  const toast = useToast();
  const incidents = useAsync<{ incidents: Incident[] }>((signal) => get('/admin/incidents', undefined, signal), []);
  const announcements = useAsync<{ announcements: Announcement[] }>((signal) => get('/admin/announcements', undefined, signal), []);
  const [form, setForm] = useState({ title: '', impact: 'minor', message: '' });
  const [note, setNote] = useState({ title: '', body: '', severity: 'maintenance', startsAt: '', endsAt: '' });
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>, message: string, after: () => void) => {
    setBusy(true);
    try {
      await work();
      toast.push(message, 'ok');
      after();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Panel title="Incidents" description="Told on the public status page. The checks open and close some by themselves.">
        {mayWrite && (
          <div className="mb-4 grid gap-2 rounded-2xl bg-s2 p-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <TextInput label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Slow deployments" />
            <Select label="Impact" value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })}>
              {IMPACTS.map((entry) => <option key={entry} value={entry}>{cap(entry)}</option>)}
            </Select>
            <div className="sm:col-span-2"><TextArea label="What we know" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={2} /></div>
            <div className="sm:col-span-2">
              <PrimaryButton disabled={busy || form.title.trim().length < 3 || form.message.trim().length < 3}
                onClick={() => void run(() => post('/admin/incidents', form), 'The incident was published.', () => { setForm({ title: '', impact: 'minor', message: '' }); incidents.reload(); })}>
                Publish incident
              </PrimaryButton>
            </div>
          </div>
        )}
        {incidents.loading && !incidents.data ? <LoadingBlock rows={2} label="Loading the incidents" />
          : incidents.error ? <ErrorState title="The incidents could not be loaded" message={incidents.error.message} onRetry={incidents.reload} />
          : (incidents.data?.incidents.length ?? 0) === 0 ? <EmptyState title="No incident yet" description="Nothing has been published and no check has opened one." />
          : <ul className="grid gap-3">{incidents.data!.incidents.map((incident) => <IncidentRow key={incident.id} incident={incident} mayWrite={mayWrite} onChanged={incidents.reload} />)}</ul>}
      </Panel>

      <Panel title="Announcements" description="A banner for every signed-in customer, between two dates.">
        {mayWrite && (
          <div className="mb-4 grid gap-2 rounded-2xl bg-s2 p-4 sm:grid-cols-2">
            <TextInput label="Title" value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="Planned maintenance" />
            <Select label="Kind" value={note.severity} onChange={(event) => setNote({ ...note, severity: event.target.value })}>
              <option value="maintenance">Maintenance</option>
              <option value="info">News</option>
              <option value="warning">Warning</option>
            </Select>
            <div className="sm:col-span-2"><TextArea label="Message" value={note.body} onChange={(event) => setNote({ ...note, body: event.target.value })} rows={2} /></div>
            <TextInput label="Starts (optional)" type="datetime-local" value={note.startsAt} onChange={(event) => setNote({ ...note, startsAt: event.target.value })} />
            <TextInput label="Ends (optional)" type="datetime-local" value={note.endsAt} onChange={(event) => setNote({ ...note, endsAt: event.target.value })} />
            <div className="sm:col-span-2">
              <PrimaryButton disabled={busy || note.title.trim().length < 3 || note.body.trim().length < 3}
                onClick={() => void run(() => post('/admin/announcements', { title: note.title, body: note.body, severity: note.severity, ...(note.startsAt ? { startsAt: new Date(note.startsAt).toISOString() } : {}), ...(note.endsAt ? { endsAt: new Date(note.endsAt).toISOString() } : {}) }), 'The announcement was published.', () => { setNote({ title: '', body: '', severity: 'maintenance', startsAt: '', endsAt: '' }); announcements.reload(); })}>
                Publish announcement
              </PrimaryButton>
            </div>
          </div>
        )}
        {announcements.loading && !announcements.data ? <LoadingBlock rows={2} label="Loading the announcements" />
          : announcements.error ? <ErrorState title="The announcements could not be loaded" message={announcements.error.message} onRetry={announcements.reload} />
          : (announcements.data?.announcements.length ?? 0) === 0 ? <EmptyState title="No announcement" description="Customers see none." />
          : (
            <ul className="grid gap-2">
              {announcements.data!.announcements.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-ink">{entry.title} <span className="ml-1 text-[12px] font-normal text-ink3">{cap(entry.severity)}</span></p>
                    <p className="text-[12.5px] text-ink3">{fmtDateTime(entry.startsAt)}{entry.endsAt ? ` → ${fmtDateTime(entry.endsAt)}` : ' → until switched off'} · {entry.active ? 'on' : 'off'}</p>
                  </div>
                  {mayWrite && (
                    <div className="flex gap-2">
                      <SoftButton onClick={() => void run(() => patch(`/admin/announcements/${entry.id}`, { active: !entry.active }), entry.active ? 'Switched off.' : 'Switched on.', announcements.reload)}>{entry.active ? 'Switch off' : 'Switch on'}</SoftButton>
                      <button type="button" className={denseDanger} onClick={() => void run(() => del(`/admin/announcements/${entry.id}`), 'Deleted.', announcements.reload)}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}
