import { useState } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ButtonLink, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, Select, TextArea, TextInput, useToast } from '../ui-app';
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
  const [removing, setRemoving] = useState(false);
  const toast = useToast();
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
        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink to={`/admin/incidents/${encodeURIComponent(incident.id)}/updates/new`} variant="soft">Post an update</ButtonLink>
          <button type="button" className={denseDanger} onClick={() => setRemoving(true)}>Delete</button>
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
        {mayWrite && <div className="mb-4 flex justify-end"><ButtonLink to="/admin/incidents/new">New incident</ButtonLink></div>}
        {incidents.loading && !incidents.data ? <LoadingBlock rows={2} label="Loading the incidents" />
          : incidents.error ? <ErrorState title="The incidents could not be loaded" message={incidents.error.message} onRetry={incidents.reload} />
          : (incidents.data?.incidents.length ?? 0) === 0 ? <EmptyState title="No incident yet" description="Nothing has been published and no check has opened one." />
          : <ul className="grid gap-3">{incidents.data!.incidents.map((incident) => <IncidentRow key={incident.id} incident={incident} mayWrite={mayWrite} onChanged={incidents.reload} />)}</ul>}
      </Panel>

      <Panel title="Announcements" description="A banner for every signed-in customer, between two dates.">
        {mayWrite && <div className="mb-4 flex justify-end"><ButtonLink to="/admin/announcements/new">New announcement</ButtonLink></div>}
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
