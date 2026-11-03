import { useEffect, useState } from 'react';
import { del, get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
import { can, useAdminSession } from './Overview';

/**
 * The automation rules of the support, and the business hours the waiting clocks use.
 *
 * A rule is: when this happens, and these conditions hold, do these things. The editor writes exactly what the server
 * accepts; the server checks it again. A rule starts switched off, can be tried on a real conversation without changing
 * it, and keeps a history of what it did, including the runs that failed.
 */

type Action = { type: string; priority?: string; departmentId?: string; userId?: string; status?: string; text?: string };
type Rule = { id: string; name: string; enabled: boolean; priority: number; trigger: string; afterMinutes: number | null; conditions: Record<string, unknown>; actions: Action[]; actorId: string | null; runs?: number; failing?: number };

const TRIGGERS = [
  { value: 'conversation_created', label: 'A conversation is opened' },
  { value: 'customer_replied', label: 'The customer replies' },
  { value: 'staff_replied', label: 'The staff replies' },
  { value: 'status_changed', label: 'The status changes' },
  { value: 'reopened', label: 'A closed conversation is reopened' },
  { value: 'staff_unanswered', label: 'The customer waits for the staff' },
  { value: 'customer_inactive', label: 'The staff waits for the customer' },
];
const WAITING = ['staff_unanswered', 'customer_inactive'];
const ACTIONS = [
  { value: 'set_priority', label: 'Set the priority' },
  { value: 'set_department', label: 'Move to a department' },
  { value: 'assign', label: 'Assign' },
  { value: 'set_status', label: 'Set the status' },
  { value: 'add_note', label: 'Add an internal note' },
  { value: 'reply', label: 'Reply to the customer' },
];
const STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_STAFF', 'ON_HOLD', 'CLOSED'];
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;

export const blank = (): Rule => ({ id: '', name: '', enabled: false, priority: 100, trigger: 'conversation_created', afterMinutes: null, conditions: {}, actions: [{ type: 'set_priority', priority: 'HIGH' }], actorId: null });

export default function SupportAutomations() {
  const session = useAdminSession();
  const toast = useToast();
  const list = useAsync((signal) => get<{ automations: Rule[] }>('/admin/support/automations', undefined, signal), []);
  const [history, setHistory] = useState<string | null>(null);

  const toggle = useAction(async (rule: Rule) => {
    await put(`/admin/support/automations/${rule.id}`, { enabled: !rule.enabled });
    list.reload();
    toast.push(rule.enabled ? 'The rule is off.' : 'The rule is on.', 'ok');
  });
  const remove = useAction(async (rule: Rule) => {
    await del(`/admin/support/automations/${rule.id}`);
    list.reload();
    toast.push('Rule deleted.', 'ok');
  });

  if (session.loading) return <LoadingBlock rows={3} label="Loading your permissions" />;
  if (!can(session.staff, 'tickets.read')) return <EmptyState title="No access" description="Your role does not include the support area." />;
  const mayEdit = can(session.staff, 'settings.write');

  return (
    <div className="grid gap-4">
      <Panel title="Automation rules" description="Rules act on conversations by themselves. They run in order, one event is handled once by one rule, and every run is written down.">
        {list.loading && !list.data ? (
          <LoadingBlock rows={2} label="Loading the rules" />
        ) : list.error ? (
          <ErrorState title="The rules could not be loaded" message={list.error.message} onRetry={list.reload} />
        ) : (list.data?.automations.length ?? 0) === 0 ? (
          <p className="text-[14px] text-ink2">No rule yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {list.data!.automations.map((rule) => (
              <li key={rule.id} className="grid gap-2 rounded-2xl bg-s2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-medium text-ink">
                    {rule.name}
                    <span className="ml-2 text-[12.5px] font-normal text-ink3">
                      {TRIGGERS.find((trigger) => trigger.value === rule.trigger)?.label}{rule.afterMinutes ? ` · after ${rule.afterMinutes} min` : ''} · {rule.enabled ? 'on' : 'off'} · {rule.runs ?? 0} runs{rule.failing ? ` · ${rule.failing} failed` : ''}
                    </span>
                  </p>
                  <span className="flex flex-wrap gap-2">
                    <SoftButton onClick={() => setHistory(history === rule.id ? null : rule.id)}>History</SoftButton>
                    <ButtonLink to={`/admin/support/automations/${encodeURIComponent(rule.id)}/edit`} variant="soft">{mayEdit ? 'Edit' : 'View'}</ButtonLink>
                    {mayEdit && <SoftButton onClick={() => void toggle.run(rule)}>{rule.enabled ? 'Switch off' : 'Switch on'}</SoftButton>}
                    {mayEdit && <SoftButton onClick={() => void remove.run(rule)}>Delete</SoftButton>}
                  </span>
                </div>
                {history === rule.id && <History id={rule.id} mayEdit={mayEdit} />}
              </li>
            ))}
          </ul>
        )}
        {(toggle.error || remove.error) && <p role="alert" className="mt-2 text-[13px] text-bad">{toggle.error || remove.error}</p>}
        {mayEdit && <div className="mt-3"><ButtonLink to="/admin/support/automations/new" variant="soft">New rule</ButtonLink></div>}
      </Panel>
      <HoursPanel mayEdit={mayEdit} />
    </div>
  );
}

function History({ id, mayEdit }: { id: string; mayEdit: boolean }) {
  const runs = useAsync((signal) => get<{ runs: { id: string; ticketId: string; status: string; attempts: number; done: string[]; error: string | null; createdAt: string }[] }>(`/admin/support/automations/${id}/runs`, undefined, signal), [id]);
  const retry = useAction(async (runId: string) => {
    await post(`/admin/support/automation-runs/${runId}/retry`);
    runs.reload();
  });
  if (runs.loading) return <LoadingBlock rows={1} label="Loading the history" />;
  if ((runs.data?.runs.length ?? 0) === 0) return <p className="text-[13px] text-ink3">It has not run yet.</p>;
  return (
    <ul className="grid gap-1 text-[13px]">
      {runs.data!.runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2">
          <span className="min-w-0 break-words text-ink2">
            {new Date(run.createdAt).toLocaleString()} · {run.status}{run.attempts > 1 ? ` (${run.attempts} tries)` : ''} · {run.done.join(', ') || run.error}
          </span>
          {mayEdit && run.status !== 'ok' && <SoftButton onClick={() => void retry.run(run.id)} disabled={retry.pending}>Try again</SoftButton>}
        </li>
      ))}
    </ul>
  );
}

export function RuleEditor({ rule, departments, mayEdit, onClose }: { rule: Rule; departments: { id: string; name: string }[]; mayEdit: boolean; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Rule>(rule);
  const [ticketNumber, setTicketNumber] = useState('');
  const [tried, setTried] = useState<{ matches: boolean; failed: string[]; would: string[] } | null>(null);
  const set = (patch: Partial<Rule>) => setDraft({ ...draft, ...patch });
  const condition = (key: string, value: unknown) => {
    const next = { ...draft.conditions };
    if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    set({ conditions: next });
  };
  const setAction = (index: number, patch: Action) => set({ actions: draft.actions.map((action, i) => (i === index ? patch : action)) });

  const save = useAction(async () => {
    const body = { name: draft.name, trigger: draft.trigger, priority: draft.priority, afterMinutes: WAITING.includes(draft.trigger) ? draft.afterMinutes : null, conditions: draft.conditions, actions: draft.actions };
    if (draft.id) await put(`/admin/support/automations/${draft.id}`, body);
    else await post('/admin/support/automations', body);
    toast.push('Rule saved.', 'ok');
    onClose();
  });
  const dry = useAction(async () => {
    const res = await post<{ result: { matches: boolean; failed: string[]; would: string[] } }>('/admin/support/automations/dry-run', { conditions: draft.conditions, actions: draft.actions, ticketNumber: Number(ticketNumber) });
    setTried(res.result);
  });

  useEffect(() => setTried(null), [draft, ticketNumber]);

  return (
    <div className="grid gap-4">
      <Panel title="Rule" description="A new rule is saved switched off. Try it on a real conversation first: nothing is changed by trying.">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Name" value={draft.name} onChange={(event) => set({ name: event.target.value })} maxLength={80} disabled={!mayEdit} />
            <TextInput label="Order (lower runs first)" type="number" value={String(draft.priority)} onChange={(event) => set({ priority: Number(event.target.value) || 100 })} disabled={!mayEdit} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="When" value={draft.trigger} onChange={(event) => set({ trigger: event.target.value, afterMinutes: WAITING.includes(event.target.value) ? draft.afterMinutes ?? 60 : null })} disabled={!mayEdit}>
              {TRIGGERS.map((trigger) => <option key={trigger.value} value={trigger.value}>{trigger.label}</option>)}
            </Select>
            {WAITING.includes(draft.trigger) && <TextInput label="After how many minutes (business hours, when set)" type="number" value={String(draft.afterMinutes ?? '')} onChange={(event) => set({ afterMinutes: Number(event.target.value) || null })} disabled={!mayEdit} />}
          </div>

          <h3 className="pt-1 text-[14px] font-semibold text-ink">Only if</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Department" value={String(draft.conditions.departmentId ?? '')} onChange={(event) => condition('departmentId', event.target.value)} disabled={!mayEdit}>
              <option value="">Any</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </Select>
            <Select label="Channel" value={String(draft.conditions.channel ?? '')} onChange={(event) => condition('channel', event.target.value)} disabled={!mayEdit}>
              <option value="">Any</option>
              <option value="TICKET">Ticket</option>
              <option value="CHAT">Chat</option>
              <option value="EMAIL">Email</option>
            </Select>
            <Select label="Assigned" value={String(draft.conditions.assigned ?? '')} onChange={(event) => condition('assigned', event.target.value)} disabled={!mayEdit}>
              <option value="">Either</option>
              <option value="none">Nobody</option>
              <option value="someone">Somebody</option>
            </Select>
            <Select label="Priority" value={String((draft.conditions.priority as string[] | undefined)?.[0] ?? '')} onChange={(event) => condition('priority', event.target.value ? [event.target.value] : [])} disabled={!mayEdit}>
              <option value="">Any</option>
              {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}
            </Select>
            <Select label="Status" value={String((draft.conditions.status as string[] | undefined)?.[0] ?? '')} onChange={(event) => condition('status', event.target.value ? [event.target.value] : [])} disabled={!mayEdit}>
              <option value="">Any</option>
              {STATUSES.map((value) => <option key={value} value={value}>{value.toLowerCase().replace('_', ' ')}</option>)}
            </Select>
            <Select label="Business hours" value={String(draft.conditions.businessHours ?? '')} onChange={(event) => condition('businessHours', event.target.value)} disabled={!mayEdit}>
              <option value="">Either</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </div>

          <h3 className="pt-1 text-[14px] font-semibold text-ink">Then</h3>
          {draft.actions.map((action, index) => (
            <div key={index} className="grid gap-2 rounded-xl bg-s2 p-3 sm:grid-cols-2">
              <Select label="Do" value={action.type} onChange={(event) => setAction(index, { type: event.target.value, ...(event.target.value === 'set_priority' ? { priority: 'HIGH' } : event.target.value === 'set_status' ? { status: 'CLOSED' } : event.target.value === 'assign' ? { userId: 'round_robin' } : event.target.value === 'set_department' ? { departmentId: departments[0]?.id ?? '' } : { text: '' }) })} disabled={!mayEdit}>
                {ACTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </Select>
              {action.type === 'set_priority' && (
                <Select label="Priority" value={action.priority ?? 'HIGH'} onChange={(event) => setAction(index, { ...action, priority: event.target.value })} disabled={!mayEdit}>
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}
                </Select>
              )}
              {action.type === 'set_status' && (
                <Select label="Status" value={action.status ?? 'CLOSED'} onChange={(event) => setAction(index, { ...action, status: event.target.value })} disabled={!mayEdit}>
                  {STATUSES.map((value) => <option key={value} value={value}>{value.toLowerCase().replace('_', ' ')}</option>)}
                </Select>
              )}
              {action.type === 'set_department' && (
                <Select label="Department" value={action.departmentId ?? ''} onChange={(event) => setAction(index, { ...action, departmentId: event.target.value })} disabled={!mayEdit}>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </Select>
              )}
              {action.type === 'assign' && <p className="self-end pb-3 text-[13px] text-ink3">To the available person with the fewest open conversations.</p>}
              {(action.type === 'add_note' || action.type === 'reply') && (
                <div className="sm:col-span-2">
                  <TextArea label={action.type === 'reply' ? 'Message to the customer' : 'Note'} value={action.text ?? ''} onChange={(event) => setAction(index, { ...action, text: event.target.value })} rows={3} maxLength={2000} disabled={!mayEdit} />
                  <p className="text-[12px] text-ink3">You can use {'{{customer_first_name}}'}, {'{{ticket_number}}'}, {'{{service_name}}'} and {'{{department}}'}.</p>
                </div>
              )}
              {mayEdit && <SoftButton onClick={() => set({ actions: draft.actions.filter((_, i) => i !== index) })} disabled={draft.actions.length <= 1}>Remove this action</SoftButton>}
            </div>
          ))}
          {mayEdit && draft.actions.length < 8 && <SoftButton onClick={() => set({ actions: [...draft.actions, { type: 'add_note', text: '' }] })}>Add an action</SoftButton>}

          {save.error && <p role="alert" className="text-[13px] text-bad">{save.error}</p>}
          <div className="flex flex-wrap gap-2">
            {mayEdit && <PrimaryButton onClick={() => void save.run()} disabled={save.pending || !draft.name.trim()}>Save</PrimaryButton>}
            <SoftButton onClick={onClose}>Back</SoftButton>
          </div>
        </div>
      </Panel>

      <Panel title="Try it" description="Says what the rule would do to a real conversation. Nothing is changed.">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <TextInput label="Conversation number" type="number" value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} />
          <SoftButton onClick={() => void dry.run()} disabled={dry.pending || !ticketNumber}>Try</SoftButton>
        </div>
        {dry.error && <p role="alert" className="mt-2 text-[13px] text-bad">{dry.error}</p>}
        {tried && (
          <p className="mt-2 text-[14px] text-ink" role="status">
            {tried.matches ? `It would: ${tried.would.join(', ')}.` : `It would not run: the ${tried.failed.join(', ')} did not match.`}
          </p>
        )}
      </Panel>
    </div>
  );
}

type Hours = { timezone: string; days: Record<string, { from: string; to: string }[]>; holidays: string[] };

function HoursPanel({ mayEdit }: { mayEdit: boolean }) {
  const toast = useToast();
  const loaded = useAsync((signal) => get<{ hours: Hours | null }>('/admin/support/hours', undefined, signal), []);
  const [hours, setHours] = useState<Hours | null>(null);
  const [holidays, setHolidays] = useState('');
  useEffect(() => {
    if (loaded.data) {
      setHours(loaded.data.hours);
      setHolidays((loaded.data.hours?.holidays ?? []).join(', '));
    }
  }, [loaded.data]);
  const save = useAction(async (next: Hours | null) => {
    await put('/admin/support/hours', { hours: next ? { ...next, holidays: holidays.split(/[,\s]+/).filter(Boolean) } : null });
    loaded.reload();
    toast.push(next ? 'Business hours saved.' : 'Business hours removed: the clocks count around the clock.', 'ok');
  });
  const fresh: Hours = { timezone: 'Europe/Bucharest', days: Object.fromEntries(DAYS.map(([key]) => [key, key === 'sat' || key === 'sun' ? [] : [{ from: '09:00', to: '17:00' }]])), holidays: [] };
  return (
    <Panel title="Business hours" description="Used by the clocks of the answer times and by the rules that wait. Without hours they count around the clock. Whether a person is here to chat is never read from these hours.">
      {loaded.loading && !loaded.data ? (
        <LoadingBlock rows={2} label="Loading the hours" />
      ) : !hours ? (
        <div className="grid gap-2">
          <p className="text-[14px] text-ink2">No hours are set.</p>
          {mayEdit && <SoftButton onClick={() => setHours(fresh)}>Set business hours</SoftButton>}
        </div>
      ) : (
        <div className="grid gap-3">
          <TextInput label="Time zone" value={hours.timezone} onChange={(event) => setHours({ ...hours, timezone: event.target.value })} disabled={!mayEdit} />
          {DAYS.map(([key, label]) => {
            const window = hours.days[key]?.[0];
            return (
              <div key={key} className="grid grid-cols-[110px_1fr_1fr_auto] items-end gap-2">
                <p className="pb-3 text-[14px] text-ink">{label}</p>
                <TextInput label="From" value={window?.from ?? ''} placeholder="closed" onChange={(event) => setHours({ ...hours, days: { ...hours.days, [key]: event.target.value ? [{ from: event.target.value, to: window?.to ?? '17:00' }] : [] } })} disabled={!mayEdit} />
                <TextInput label="To" value={window?.to ?? ''} placeholder="closed" onChange={(event) => setHours({ ...hours, days: { ...hours.days, [key]: window || event.target.value ? [{ from: window?.from ?? '09:00', to: event.target.value }] : [] } })} disabled={!mayEdit} />
                <span />
              </div>
            );
          })}
          <TextInput label="Days that are closed (2026-12-25, 2027-01-01)" value={holidays} onChange={(event) => setHolidays(event.target.value)} disabled={!mayEdit} />
          {save.error && <p role="alert" className="text-[13px] text-bad">{save.error}</p>}
          {mayEdit && (
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={() => void save.run(hours)} disabled={save.pending}>Save the hours</PrimaryButton>
              <SoftButton onClick={() => void save.run(null).then(() => setHours(null))}>Remove the hours</SoftButton>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
