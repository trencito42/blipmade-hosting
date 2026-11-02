import { useEffect, useRef, useState } from 'react';
import { del, get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel, Select, SoftButton, StatusPill, TextInput, useToast } from '../ui-app';
import { can, fmtDateTime, useAdminSession } from './Overview';

/**
 * The unified support console.
 *
 * One queue for tickets, chats and emails: the views on the left, the conversations in the middle (a conversation opens in
 * the ticket page, which has the thread, the notes and the assignment), and the departments below. The list refreshes
 * itself when the live stream says that a conversation changed; the stream is a hint and the list is always read from the
 * API, so a missed event costs one refresh and never a message.
 */

const VIEWS: { value: string; label: string }[] = [
  { value: 'all', label: 'All conversations' },
  { value: 'mine', label: 'My inbox' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'chat', label: 'Live chats' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'email', label: 'Email' },
  { value: 'waiting_customer', label: 'Waiting for customer' },
  { value: 'waiting_staff', label: 'Waiting for staff' },
  { value: 'sla_at_risk', label: 'SLA at risk' },
  { value: 'closed', label: 'Closed' },
];

interface Conversation {
  id: string;
  number: number;
  subject: string;
  channel: string;
  priority: string;
  status: string;
  department: { id: string; name: string } | null;
  customer: { id: string; email: string; name: string };
  assignedTo: string | null;
  lastCustomerAt: string | null;
  updatedAt: string;
  messageCount: number;
  sla?: string;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  visible: boolean;
  members: number;
  conversations: number;
}

const PRESENCE = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'AWAY', label: 'Away' },
  { value: 'OFFLINE', label: 'Offline' },
];

/** Reloads when the live stream reports a change. Returns whether the stream is connected. */
function useLiveRefresh(onChange: () => void): boolean {
  const [live, setLive] = useState(false);
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let timer = 0;
    const source = new EventSource('/api/admin/support/stream');
    const changed = () => {
      // Many events in a row make one refresh.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handler.current(), 300);
    };
    source.addEventListener('hello', () => setLive(true));
    for (const type of ['created', 'message', 'attachment', 'status', 'assigned', 'resync']) source.addEventListener(type, changed);
    source.onerror = () => setLive(false);
    return () => {
      window.clearTimeout(timer);
      source.close();
    };
  }, []);
  return live;
}

export default function Support() {
  const session = useAdminSession();
  const toast = useToast();
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const list = useAsync(
    (signal) => get<{ conversations: Conversation[]; pagination: { hasMore: boolean } }>('/admin/support/conversations', { view, q: search || undefined, departmentId: departmentId || undefined }, signal),
    [view, search, departmentId],
  );
  const counts = useAsync((signal) => get<{ counts: Record<string, number> }>('/admin/support/counts', undefined, signal), []);
  const departments = useAsync((signal) => get<{ departments: Department[] }>('/admin/support/departments', undefined, signal), []);
  const presence = useAsync((signal) => get<{ staff: { userId: string; chosen: string; status: string; name: string }[] }>('/admin/support/presence', undefined, signal), []);

  const live = useLiveRefresh(() => {
    list.reload();
    counts.reload();
    presence.reload();
  });

  const setPresence = useAction(async (status: string) => {
    await put('/admin/support/presence', { status });
    presence.reload();
  });

  if (session.loading) return <LoadingBlock rows={4} label="Loading your permissions" />;
  if (!can(session.staff, 'tickets.read')) return <EmptyState title="No access" description="Your role does not include the support queue." />;

  const mine = presence.data?.staff.find((row) => row.userId === session.staff?.id);
  const here = (presence.data?.staff ?? []).filter((row) => row.status === 'AVAILABLE').length;

  return (
    <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <nav aria-label="Views" className="grid gap-0.5">
          {VIEWS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-current={view === entry.value ? 'page' : undefined}
              onClick={() => setView(entry.value)}
              className={`flex h-10 items-center justify-between rounded-xl px-3 text-left text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${view === entry.value ? 'bg-card text-ink' : 'text-ink2 hover:bg-s2 hover:text-ink'}`}
            >
              <span>{entry.label}</span>
              <span className="font-mono text-[12px] tabular-nums text-ink3">{counts.data?.counts[entry.value] ?? ''}</span>
            </button>
          ))}
        </nav>
        <div className="grid gap-2 rounded-2xl border border-line bg-card p-3">
          <Select label="Your status" value={mine?.chosen ?? 'AVAILABLE'} onChange={(event) => void setPresence.run(event.target.value)} disabled={!can(session.staff, 'tickets.write')}>
            {PRESENCE.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <p className="text-[12.5px] text-ink3">{here} of the staff available now. {live ? 'Live.' : 'Not live: the list refreshes when you do.'}</p>
        </div>
      </aside>

      <div className="grid min-w-0 content-start gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <TextInput label="Search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Subject, email or number" autoComplete="off" />
          <Select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">All departments</option>
            {(departments.data?.departments ?? []).map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </Select>
        </div>

        {list.loading && !list.data ? (
          <LoadingBlock rows={5} label="Loading the conversations" />
        ) : list.error ? (
          <ErrorState title="The conversations could not be loaded" message={list.error.message} onRetry={list.reload} />
        ) : (list.data?.conversations.length ?? 0) === 0 ? (
          <EmptyState title="Nothing in this view." description="When a customer writes, the conversation appears here." />
        ) : (
          <ul className="grid gap-1.5">
            {list.data!.conversations.map((row) => (
              <li key={row.id}>
                <Link to={`/admin/tickets?ticket=${row.id}`} className="grid gap-1 rounded-2xl border border-line bg-card px-4 py-3 transition-colors hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 break-words text-[14.5px] font-semibold text-ink">#{row.number} · {row.subject}</span>
                    {(row.sla === 'breached' || row.sla === 'at_risk') && <StatusPill status={row.sla === 'breached' ? 'late' : 'at risk'} />}
                    <StatusPill status={row.status} />
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-ink3">
                    <span>{row.customer.name || row.customer.email}</span>
                    <span>{row.channel}</span>
                    <span>{row.department?.name ?? 'No department'}</span>
                    <span>{row.assignedTo ?? 'Unassigned'}</span>
                    <span className="font-mono">{fmtDateTime(row.updatedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {list.data!.pagination.hasMore && <li className="pt-1 text-center text-[12.5px] text-ink3">Showing the newest conversations. Narrow the view or search to see the rest.</li>}
          </ul>
        )}

        <DepartmentsPanel departments={departments.data?.departments ?? []} canEdit={can(session.staff, 'settings.write')} reload={departments.reload} toast={toast} />
      </div>
    </div>
  );
}

function DepartmentsPanel({ departments, canEdit, reload, toast }: { departments: Department[]; canEdit: boolean; reload: () => void; toast: ReturnType<typeof useToast> }) {
  const [name, setName] = useState('');
  const create = useAction(async () => {
    await post('/admin/support/departments', { name });
    setName('');
    reload();
    toast.push('Department created.', 'ok');
  });
  const toggle = useAction(async (department: Department) => {
    await put(`/admin/support/departments/${department.id}`, { visible: !department.visible });
    reload();
  });
  const remove = useAction(async (department: Department) => {
    await del(`/admin/support/departments/${department.id}`);
    reload();
    toast.push('Department deleted.', 'ok');
  });
  return (
    <Panel title="Departments" description="The queues a conversation is sorted into. A customer picks one of the visible ones when they write.">
      <div className="grid gap-3">
        {departments.length === 0 ? (
          <p className="text-[14px] text-ink2">No department yet. Conversations are in one queue until you add one.</p>
        ) : (
          <ul className="grid gap-1.5">
            {departments.map((department) => (
              <li key={department.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
                <p className="text-[14px] font-medium text-ink">
                  {department.name}
                  <span className="ml-2 text-[12.5px] font-normal text-ink3">{department.conversations} conversations · {department.members} staff{department.visible ? '' : ' · hidden'}</span>
                </p>
                {canEdit && (
                  <span className="flex gap-2">
                    <SoftButton onClick={() => void toggle.run(department)}>{department.visible ? 'Hide' : 'Show'}</SoftButton>
                    <SoftButton onClick={() => void remove.run(department)} disabled={department.conversations > 0}>Delete</SoftButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) void create.run();
            }}
          >
            <TextInput label="New department" value={name} onChange={(event) => setName(event.target.value)} placeholder="For example Technical" maxLength={60} />
            <SoftButton type="submit" disabled={create.pending || !name.trim()}>Add</SoftButton>
          </form>
        ) : (
          <p className="text-[12.5px] text-ink3">Only a role with settings access can change the departments.</p>
        )}
        {(create.error || toggle.error || remove.error) && <p role="alert" className="text-[13px] text-bad">{create.error || toggle.error || remove.error}</p>}
      </div>
    </Panel>
  );
}
