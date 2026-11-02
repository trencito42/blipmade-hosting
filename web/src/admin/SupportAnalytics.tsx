import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextInput, useToast } from '../ui-app';
import { can, useAdminSession } from './Overview';

/**
 * The numbers of the support and the policies of the answer times.
 *
 * Every number carries its definition under it: what is counted and what is not. The period, the department, the channel
 * and the person can be chosen. Nothing here changes a conversation.
 */

interface Analytics {
  definitions: Record<string, string>;
  open: { total: number; unassigned: number; slaAtRisk: number; oldestHours: number | null; medianAgeHours: number | null };
  volume: { created: number; byChannel: Record<string, number> };
  firstResponse: { count: number; averageMinutes: number | null; medianMinutes: number | null };
  resolution: { count: number; medianMinutes: number | null };
  sla: { policies: number; judged: number; met: number; compliance: number | null };
  workload: { userId: string; name: string; open: number }[];
  bots: { started: number; completed: number; handedOff: number; handoffRate: number | null; completedRate: number | null; deflectedByArticles: number };
  satisfaction: { count: number; average: number | null };
}

type Policy = { priority: string; firstResponseMinutes: number; nextResponseMinutes?: number | null; resolutionMinutes?: number | null };

const minutes = (value: number | null) => (value === null ? '—' : value >= 120 ? `${Math.round(value / 6) / 10} h` : `${value} min`);

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-s2 px-4 py-3">
      <p className="text-[12.5px] text-ink3">{label}</p>
      <p className="font-mono text-[22px] font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-1 text-[12px] leading-snug text-ink3">{note}</p>}
    </div>
  );
}

export default function SupportAnalytics() {
  const session = useAdminSession();
  const [days, setDays] = useState('30');
  const [departmentId, setDepartmentId] = useState('');
  const [channel, setChannel] = useState('');
  const data = useAsync((signal) => get<Analytics>('/admin/support/analytics', { days, departmentId: departmentId || undefined, channel: channel || undefined }, signal), [days, departmentId, channel]);
  const departments = useAsync((signal) => get<{ departments: { id: string; name: string }[] }>('/admin/support/departments', undefined, signal), []);

  if (session.loading) return <LoadingBlock rows={3} label="Loading your permissions" />;
  if (!can(session.staff, 'tickets.read')) return <EmptyState title="No access" description="Your role does not include the support area." />;
  const a = data.data;
  const d = a?.definitions ?? {};

  return (
    <div className="grid gap-4">
      <Panel title="Support numbers" description="Read from the history of the conversations. The definition of each number is under it.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Period" value={days} onChange={(event) => setDays(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
          <Select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">All</option>
            {(departments.data?.departments ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </Select>
          <Select label="Channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">All</option>
            <option value="TICKET">Tickets</option>
            <option value="CHAT">Chats</option>
            <option value="EMAIL">Email</option>
          </Select>
        </div>
      </Panel>

      {data.loading && !a ? (
        <LoadingBlock rows={4} label="Loading the numbers" />
      ) : data.error || !a ? (
        <ErrorState title="The numbers could not be loaded" message={data.error?.message ?? 'Unknown error'} onRetry={data.reload} />
      ) : (
        <>
          <Panel title="Now">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="Open conversations" value={String(a.open.total)} />
              <Figure label="Unassigned" value={String(a.open.unassigned)} />
              <Figure label="SLA at risk or late" value={a.sla.policies ? String(a.open.slaAtRisk) : '—'} note={a.sla.policies ? undefined : 'No policy is set.'} />
              <Figure label="Oldest open" value={a.open.oldestHours === null ? '—' : `${a.open.oldestHours} h`} note={d.backlogAge} />
            </div>
          </Panel>
          <Panel title="In the period">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="Conversations" value={String(a.volume.created)} note={Object.entries(a.volume.byChannel).map(([key, value]) => `${key} ${value}`).join(' · ') || undefined} />
              <Figure label="First response (median)" value={minutes(a.firstResponse.medianMinutes)} note={`Average ${minutes(a.firstResponse.averageMinutes)} over ${a.firstResponse.count}. ${d.firstResponse}`} />
              <Figure label="Resolution (median)" value={minutes(a.resolution.medianMinutes)} note={d.resolution} />
              <Figure label="SLA compliance" value={a.sla.compliance === null ? '—' : `${a.sla.compliance}%`} note={a.sla.policies ? `${a.sla.met} of ${a.sla.judged} judged. ${d.slaCompliance}` : 'No policy is set.'} />
              <Figure label="Satisfaction" value={a.satisfaction.average === null ? '—' : `${a.satisfaction.average} / 5`} note={`${a.satisfaction.count} ratings. ${d.satisfaction}`} />
              <Figure label="Bot conversations" value={String(a.bots.started)} note={`${a.bots.completedRate ?? '—'}% completed (${d.botCompleted})`} />
              <Figure label="Handed to a person" value={a.bots.handoffRate === null ? '—' : `${a.bots.handoffRate}%`} note={d.handoff} />
              <Figure label="Ended after articles" value={String(a.bots.deflectedByArticles)} note="Bot conversations that suggested articles, reached their end and made no ticket." />
            </div>
          </Panel>
          <Panel title="Workload">
            {a.workload.length === 0 ? <p className="text-[14px] text-ink2">No open conversation is assigned.</p> : (
              <ul className="grid gap-1 text-[14px]">{a.workload.map((person) => <li key={person.userId} className="flex justify-between rounded-xl bg-s2 px-4 py-2"><span>{person.name}</span><span className="font-mono tabular-nums">{person.open}</span></li>)}</ul>
            )}
          </Panel>
        </>
      )}
      <Policies mayEdit={can(session.staff, 'settings.write')} onSaved={data.reload} />
    </div>
  );
}

function Policies({ mayEdit, onSaved }: { mayEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const loaded = useAsync((signal) => get<{ policies: Policy[] }>('/admin/support/sla', undefined, signal), []);
  const [rows, setRows] = useState<Policy[]>([]);
  useEffect(() => setRows(loaded.data?.policies ?? []), [loaded.data]);
  const save = useAction(async () => {
    await put('/admin/support/sla', { policies: rows });
    toast.push('Policies saved.', 'ok');
    loaded.reload();
    onSaved();
  });
  const used = new Set(rows.map((row) => row.priority));
  const free = ['LOW', 'NORMAL', 'HIGH', 'URGENT'].filter((priority) => !used.has(priority));
  const number = (value: string) => (value ? Number(value) : null);
  return (
    <Panel title="Answer time policies" description="How long the first answer of a person, the next answer and the resolution may take, by priority. The clocks run in business minutes when business hours are set. The resolution clock keeps running while the conversation waits for the customer.">
      <div className="grid gap-3">
        {rows.length === 0 && <p className="text-[14px] text-ink2">No policy. Nothing is judged late.</p>}
        {rows.map((row, index) => (
          <div key={row.priority} className="grid gap-2 rounded-xl bg-s2 p-3 sm:grid-cols-4">
            <p className="pb-3 text-[14px] font-medium capitalize text-ink sm:self-end">{row.priority.toLowerCase()}</p>
            <TextInput label="First answer (min)" type="number" value={String(row.firstResponseMinutes)} onChange={(event) => setRows(rows.map((r, i) => (i === index ? { ...r, firstResponseMinutes: Number(event.target.value) || 1 } : r)))} disabled={!mayEdit} />
            <TextInput label="Next answer (min)" type="number" value={String(row.nextResponseMinutes ?? '')} onChange={(event) => setRows(rows.map((r, i) => (i === index ? { ...r, nextResponseMinutes: number(event.target.value) } : r)))} disabled={!mayEdit} />
            <TextInput label="Resolution (min)" type="number" value={String(row.resolutionMinutes ?? '')} onChange={(event) => setRows(rows.map((r, i) => (i === index ? { ...r, resolutionMinutes: number(event.target.value) } : r)))} disabled={!mayEdit} />
            {mayEdit && <SoftButton onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove</SoftButton>}
          </div>
        ))}
        {save.error && <p role="alert" className="text-[13px] text-bad">{save.error}</p>}
        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            {free[0] && <SoftButton onClick={() => setRows([...rows, { priority: free[0]!, firstResponseMinutes: 60 }])}>Add a policy for {free[0].toLowerCase()}</SoftButton>}
            <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>Save the policies</PrimaryButton>
          </div>
        )}
      </div>
    </Panel>
  );
}
