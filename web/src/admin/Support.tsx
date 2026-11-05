import { isMenuKey, onRecordContextMenu, RowMenuButton, useContextMenu, type MenuItem } from '../context-menu';
import { useMenuKit } from '../lib/menu-actions';
import { useEffect, useRef, useState } from 'react';
import { del, get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel, Select, SoftButton, StatusPill, TextInput, useToast } from '../ui-app';
import { pictureFromFile } from '../lib/avatar';
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
    // After "hello" the server has recorded this connection as present, so the list of who is here is read again.
    source.addEventListener('hello', () => {
      setLive(true);
      changed();
    });
    // A person who left is noticed without waiting for a conversation to change.
    const poll = window.setInterval(() => handler.current(), 30_000);
    for (const type of ['created', 'message', 'attachment', 'status', 'assigned', 'resync']) source.addEventListener(type, changed);
    source.onerror = () => setLive(false);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      source.close();
    };
  }, []);
  return live;
}

export default function Support() {
  const session = useAdminSession();
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
  const menu = useContextMenu();
  const menuKit = useMenuKit();
  const rows = list.data?.conversations;
  const { owner: menuOwner, close: closeMenu } = menu;
  useEffect(() => {
    if (menuOwner !== null && rows && !rows.some((row) => row.id === menuOwner)) closeMenu();
  }, [menuOwner, rows, closeMenu]);
  /** The actions of a conversation of the queue. The changes of state and the assignment stay in the conversation itself. */
  const conversationActions = (row: Conversation): MenuItem[] => {
    const to = `/admin/tickets?ticket=${encodeURIComponent(row.id)}`;
    const items: MenuItem[] = [
      menuKit.go('open', 'Open conversation', 'chat', to),
      menuKit.copy('copy-number', 'ticket number', `#${row.number}`, { separated: true }),
      menuKit.copy('copy-link', 'conversation link', `${window.location.origin}${to}`),
    ];
    if (can(session.staff, 'customers.read') && row.customer?.id) items.push(menuKit.go('customer', 'Open customer', 'user', `/admin/customers/${encodeURIComponent(row.customer.id)}`, { separated: true }));
    return items;
  };
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
        <Link to="/admin/support/settings" className="flex h-10 items-center rounded-xl px-3 text-[14px] font-medium text-ink2 hover:bg-s2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Support settings</Link>
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
              <li key={row.id} className="flex items-start gap-1" onContextMenu={(event) => onRecordContextMenu(event, menu, conversationActions(row), row.id)}>
                <Link to={`/admin/tickets?ticket=${row.id}`} onKeyDown={(event) => { if (isMenuKey(event)) { event.preventDefault(); menu.openAt(event.currentTarget, conversationActions(row), row.id); } }} className="grid min-w-0 flex-1 gap-1 rounded-2xl border border-line bg-card px-4 py-3 transition-colors hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
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
                <RowMenuButton items={conversationActions(row)} owner={row.id} menu={menu} label={`conversation #${row.number}`} className="mt-1.5" />
              </li>
            ))}
            {menu.element}
            {list.data!.pagination.hasMore && <li className="pt-1 text-center text-[12.5px] text-ink3">Showing the newest conversations. Narrow the view or search to see the rest.</li>}
          </ul>
        )}

      </div>
    </div>
  );
}

export function DepartmentsPanel({ departments, canEdit, reload, toast }: { departments: Department[]; canEdit: boolean; reload: () => void; toast: ReturnType<typeof useToast> }) {
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

export function GuestPanel({ mayEdit }: { mayEdit: boolean }) {
  const toast = useToast();
  const loaded = useAsync((signal) => get<{ config: { enabled: boolean; retentionDays: number; notice: string } }>('/admin/support/guest', undefined, signal), []);
  const [config, setConfig] = useState<{ enabled: boolean; retentionDays: number; notice: string } | null>(null);
  useEffect(() => setConfig(loaded.data?.config ?? null), [loaded.data]);
  const save = useAction(async () => {
    await put('/admin/support/guest', config);
    toast.push('Saved.', 'ok');
    loaded.reload();
  });
  if (!config) return null;
  return (
    <Panel title="Chat for visitors who are not signed in" description="Off by default. A visitor agrees to the notice, gets a credential that opens only their chat, is never sent an email, and is removed with what they wrote after the retention period.">
      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} disabled={!mayEdit} className="size-5" />
          Open to visitors on the public site
        </label>
        <TextInput label="Keep what a visitor wrote for (days)" type="number" value={String(config.retentionDays)} onChange={(event) => setConfig({ ...config, retentionDays: Number(event.target.value) || 1 })} disabled={!mayEdit} />
        <TextInput label="The notice the visitor agrees to" value={config.notice} onChange={(event) => setConfig({ ...config, notice: event.target.value })} maxLength={1000} disabled={!mayEdit} />
        {save.error && <p role="alert" className="text-[13px] text-bad">{save.error}</p>}
        {mayEdit && <SoftButton onClick={() => void save.run()} disabled={save.pending}>Save</SoftButton>}
      </div>
    </Panel>
  );
}

/** The photo a customer sees at the top of the chat when they talk to you. It is yours: you change only your own. */
export function PhotoPanel({ mayEdit }: { mayEdit: boolean }) {
  const toast = useToast();
  const me = useAsync((signal) => get<{ name: string; avatar: string | null }>('/admin/support/me', undefined, signal), []);
  const save = useAction(async (avatar: string | null) => {
    await put('/admin/support/me/avatar', { avatar });
    me.reload();
    toast.push(avatar ? 'Photo saved.' : 'Photo removed.', 'ok');
  });
  const choose = useAction(async (file: File) => {
    await save.run(await pictureFromFile(file));
  });
  if (!me.data) return null;
  return (
    <Panel title="Your name and photo in the chat" description="A customer who talks to you sees your first name, the initial of your last name and this photo at the top of the chat. Without a photo they see your initial.">
      <div className="flex flex-wrap items-center gap-4">
        {me.data.avatar ? (
          <img src={me.data.avatar} alt="" width={56} height={56} className="size-14 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-acc text-[20px] font-bold text-on-acc">{me.data.name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="grid gap-2">
          <p className="text-[14px] font-medium text-ink">{me.data.name}</p>
          {mayEdit && (
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex h-11 cursor-pointer items-center rounded-full border border-line bg-card px-4 text-[14px] font-medium text-ink hover:bg-s2 focus-within:ring-2 focus-within:ring-acc">
                {me.data.avatar ? 'Change the photo' : 'Upload a photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void choose.run(file); event.target.value = ''; }} />
              </label>
              {me.data.avatar && <SoftButton onClick={() => void save.run(null)} disabled={save.pending}>Remove</SoftButton>}
            </div>
          )}
          {(choose.error || save.error) && <p role="alert" className="text-[13px] text-bad">{choose.error || save.error}</p>}
        </div>
      </div>
    </Panel>
  );
}
