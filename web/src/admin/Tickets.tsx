import { useEffect, useState } from 'react';
import { get, post, type TicketMessage } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useRouter } from '../router';
import {
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Panel,
  Segmented,
  StatusPill,
  TextArea,
  useToast,
} from '../ui-app';
import { DASH, LiveRegion, can, denseGhost, denseSelect, denseSoft, fmtDateTime, maskEmail, useStaffUser } from './Overview';

/**
 * Staff support queue — GET /api/admin/tickets
 *
 * The ticket thread comes from GET /api/tickets/:id, which staff may read for
 * any ticket and which includes the internal notes. Assignment uses
 * POST /api/admin/tickets/:id/assign and the status uses
 * POST /api/tickets/:id/status; both take the value the API stores.
 */

interface AdminTicket {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  customer: { id: string; email: string; name: string | null };
  instance: { id: string; name: string } | null;
  assignedTo: string | null;
}

interface AdminTicketDetail {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  instanceId: string | null;
  instanceName: string | null;
  createdAt: string;
  updatedAt: string;
  lastReplyAt: string | null;
  assignedTo: string | null;
  messageCount: number;
  messages: TicketMessage[];
}

interface StaffMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  title: string | null;
  permissions: string[];
}

const QUEUE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_CUSTOMER', label: 'Awaiting customer' },
  { value: 'AWAITING_STAFF', label: 'Awaiting staff' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'awaiting_customer', label: 'Awaiting customer' },
  { value: 'awaiting_staff', label: 'Awaiting staff' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'closed', label: 'Closed' },
];

export default function Tickets() {
  const { query } = useRouter();
  const staff = useStaffUser();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    const fromQuery = query.ticket;
    if (fromQuery) setSelectedId(fromQuery);
  }, [query.ticket]);

  const queue = useAsync(
    (signal) => get<{ tickets: AdminTicket[] }>('/admin/tickets', { status: status || undefined }, signal),
    [status],
  );

  const staffList = useAsync((signal) => get<{ staff: StaffMember[] }>('/admin/staff', undefined, signal), []);

  const tickets = queue.data?.tickets ?? [];
  const mayWrite = can(staff, 'tickets.write');

  const assign = useAction(async (userId: string | null) => {
    return post<{ ticket: { id: string; assignedToId: string | null } }>(`/admin/tickets/${selectedId}/assign`, { userId });
  });

  const changeStatus = useAction(async (next: string) => {
    // The API stores the status in upper case.
    return post<{ ticket: { id: string; status: string } }>(`/tickets/${selectedId}/status`, { status: next.toUpperCase() });
  });

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <LiveRegion message={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'} in the queue`} />
      <div className={selectedId ? 'hidden lg:block' : 'block'}>
        <Panel title="Queue" description="Newest activity first. Pick a ticket to open the thread.">
          <div className="grid gap-3">
            <Segmented ariaLabel="Filter tickets by status" value={status} onChange={setStatus} options={QUEUE_FILTERS} />

            {queue.loading ? (
              <LoadingBlock rows={4} label="Loading the queue" />
            ) : queue.error ? (
              <ErrorState title="The queue could not be loaded" message={queue.error.message} onRetry={queue.reload} />
            ) : !tickets.length ? (
              <EmptyState
                title={status ? 'No ticket with that status.' : 'The queue is empty.'}
                description={status ? 'Pick another status to see more.' : 'New tickets appear here when a customer opens one.'}
              />
            ) : (
              <div className="grid gap-3">
                <DataTable<AdminTicket>
                  rows={tickets}
                  rowKey={(ticket) => ticket.id}
                  columns={[
                    {
                      key: 'subject',
                      header: 'Ticket',
                      render: (ticket: AdminTicket) => (
                        <button
                          type="button"
                          onClick={() => setSelectedId(ticket.id)}
                          aria-pressed={ticket.id === selectedId}
                          className="block min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                        >
                          <span className="block truncate text-[14px] font-bold tracking-[-0.02em] text-ink" title={`#${ticket.number} ${ticket.subject}`}>
                            #{ticket.number} {ticket.subject}
                          </span>
                          <span className="block truncate text-[12.5px] text-ink3" title={maskEmail(ticket.customer?.email ?? '')}>
                            {maskEmail(ticket.customer?.email ?? '')}
                          </span>
                        </button>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (ticket: AdminTicket) => <StatusPill status={ticket.status} />,
                    },
                    {
                      key: 'assigned',
                      header: 'Assigned',
                      render: (ticket: AdminTicket) => <span className="text-ink2">{ticket.assignedTo ?? DASH}</span>,
                    },
                  ]}
                />
                <CardList<AdminTicket> rows={tickets} rowKey={(ticket) => ticket.id}>
                  {(ticket) => (
                    <button
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      aria-pressed={ticket.id === selectedId}
                      className="block w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-bold tracking-[-0.02em] text-ink" title={`#${ticket.number} ${ticket.subject}`}>
                            #{ticket.number} {ticket.subject}
                          </p>
                          <p className="truncate font-mono text-[12.5px] text-ink3" title={maskEmail(ticket.customer?.email ?? '')}>
                            {maskEmail(ticket.customer?.email ?? '')}
                          </p>
                        </div>
                        <StatusPill status={ticket.status} />
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-ink3">
                        {ticket.messageCount} message{ticket.messageCount === 1 ? '' : 's'} · {ticket.assignedTo ?? 'Unassigned'}
                      </p>
                    </button>
                  )}
                </CardList>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className={selectedId ? 'block' : 'hidden lg:block'}>
        {selectedId ? (
          <TicketDetailPanel
            ticketId={selectedId}
            ticket={selected}
            staffList={staffList.data?.staff ?? []}
            staffLoading={staffList.loading}
            mayWrite={mayWrite}
            onClose={() => setSelectedId('')}
            onChanged={() => {
              queue.reload();
              toast.push('Ticket updated', 'ok');
            }}
            assignAction={assign}
            statusAction={changeStatus}
          />
        ) : (
          <Panel title="No ticket open">
            <p className="text-[14px] text-ink2">
              Pick a ticket from the queue to read the thread, change the status or assign it to a member of staff.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function TicketDetailPanel({
  ticketId,
  ticket,
  staffList,
  staffLoading,
  mayWrite,
  onClose,
  onChanged,
  assignAction,
  statusAction,
}: {
  ticketId: string;
  ticket: AdminTicket | null;
  staffList: StaffMember[];
  staffLoading: boolean;
  mayWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  assignAction: { run: (userId: string | null) => Promise<unknown>; pending: boolean; error: string | null };
  statusAction: { run: (status: string) => Promise<unknown>; pending: boolean; error: string | null };
}) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const detail = useAsync(
    (signal) => get<{ ticket: AdminTicketDetail }>(`/tickets/${ticketId}`, undefined, signal),
    [ticketId],
  );

  const reply = useAction(async () => {
    return post<{ message: TicketMessage }>(`/tickets/${ticketId}/replies`, {
      body: replyBody.trim(),
      internal,
    });
  });

  const current = detail.data?.ticket;
  const messages = current?.messages ?? [];

  const sendReply = async () => {
    if (!replyBody.trim()) {
      setReplyError('Write a reply before sending.');
      return;
    }
    setReplyError(null);
    const message = await reply.run();
    if (!message) return;
    setReplyBody('');
    detail.reload();
    toast.push(internal ? 'Internal note added' : 'Reply sent', 'ok');
  };

  return (
    <div className="grid gap-4">
      <Panel
        title={current ? `#${current.number} ${current.subject}` : 'Ticket'}
        description={current ? `Opened ${fmtDateTime(current.createdAt)}` : undefined}
        action={
          <button type="button" onClick={onClose} className={denseSoft}>
            Back to queue
          </button>
        }
      >
        {detail.loading ? (
          <LoadingBlock rows={3} label="Loading the ticket" />
        ) : detail.error || !current ? (
          <ErrorState title="This ticket could not be loaded" message={detail.error?.message ?? 'Not found.'} onRetry={detail.reload} />
        ) : (
          <div className="grid gap-3">
            <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-s2 p-3.5">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Status</dt>
                <dd className="mt-1">
                  <StatusPill status={current.status} />
                </dd>
              </div>
              <div className="min-w-0 rounded-2xl bg-s2 p-3.5">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Customer</dt>
                <dd className="mt-1 truncate font-mono text-[13px] text-ink" title={ticket ? maskEmail(ticket.customer?.email ?? '') : undefined}>
                  {ticket ? maskEmail(ticket.customer?.email ?? '') : DASH}
                </dd>
              </div>
              <div className="rounded-2xl bg-s2 p-3.5">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Priority</dt>
                <dd className="mt-1 capitalize text-ink">{current.priority}</dd>
              </div>
              <div className="min-w-0 rounded-2xl bg-s2 p-3.5">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Instance</dt>
                <dd className="mt-1 truncate text-ink" title={current.instanceName ?? undefined}>
                  {current.instanceName ?? DASH}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Panel>

      {current && (
        <>
          <Panel title="Assignment" description="Assign the ticket to a member of staff, or clear the assignment.">
            <div className="grid gap-3">
              <p className="text-[13.5px] text-ink2">
                Currently {current.assignedTo ? `assigned to ${current.assignedTo}` : 'unassigned'}.
              </p>
              {mayWrite ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
                  <Field label="Assign to" htmlFor="ticket-assignee">
                    <select
                      id="ticket-assignee"
                      value={assignee}
                      onChange={(event) => setAssignee(event.target.value)}
                      className={denseSelect}
                    >
                      <option value="">Unassigned</option>
                      {staffList.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name ?? maskEmail(member.email)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    disabled={assignAction.pending || staffLoading}
                    onClick={async () => {
                      const result = await assignAction.run(assignee || null);
                      if (!result) return;
                      setAssignee('');
                      detail.reload();
                      onChanged();
                    }}
                    className={denseSoft}
                  >
                    {assignAction.pending ? 'Saving…' : 'Save assignment'}
                  </button>
                </div>
              ) : (
                <p className="text-[13px] text-ink3">Your role does not hold &quot;tickets.write&quot;, so the ticket is read-only.</p>
              )}
              {assignAction.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
                  {assignAction.error}
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Status">
            <div className="grid gap-3">
              {mayWrite ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
                  <Field label="Ticket status" htmlFor="ticket-status">
                    <select
                      id="ticket-status"
                      value={status || current.status}
                      onChange={(event) => setStatus(event.target.value)}
                      className={denseSelect}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    disabled={statusAction.pending || !status || status === current.status}
                    onClick={async () => {
                      const result = await statusAction.run(status);
                      if (!result) return;
                      setStatus('');
                      detail.reload();
                      onChanged();
                    }}
                    className={denseSoft}
                  >
                    {statusAction.pending ? 'Saving…' : 'Update status'}
                  </button>
                </div>
              ) : (
                <p className="text-[13px] text-ink3">Your role does not hold &quot;tickets.write&quot;, so the status cannot be changed.</p>
              )}
              {statusAction.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
                  {statusAction.error}
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Thread" description={`${messages.length} message${messages.length === 1 ? '' : 's'}. Internal notes are only visible to staff.`}>
            {!messages.length ? (
              <p className="rounded-2xl bg-s2 px-4 py-6 text-center text-[14px] text-ink2">No message in this ticket yet.</p>
            ) : (
              <ul className="grid gap-2.5">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.internal
                        ? 'rounded-2xl bg-warn/10 p-4'
                        : 'rounded-2xl bg-s2 p-4'
                    }
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[14px] font-bold text-ink">{message.author.name ?? message.author.role}</p>
                      <span className="rounded-full bg-s3 px-2.5 py-0.5 text-[11.5px] font-bold text-ink2">
                        {message.author.role}
                      </span>
                      {message.internal && (
                        <span className="rounded-full bg-warn/20 px-2.5 py-0.5 text-[11.5px] font-bold text-warn">
                          Internal note
                        </span>
                      )}
                      <span className="text-[12.5px] text-ink3">{fmtDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink2">{message.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Reply" description="A public reply goes to the customer. An internal note stays in the staff queue.">
            <div className="grid gap-3">
              <TextArea
                label="Message"
                rows={4}
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                error={replyError ?? undefined}
                placeholder="Answer the customer or leave a note for the team."
                className="scroll-mt-16"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={internal}
                  onClick={() => setInternal((value) => !value)}
                  className={internal ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
                >
                  {internal ? 'Internal note' : 'Public reply'}
                </button>
                <button type="button" onClick={sendReply} disabled={reply.pending || !mayWrite} className={denseSoft}>
                  {reply.pending ? 'Sending…' : internal ? 'Add note' : 'Send reply'}
                </button>
              </div>
              {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;tickets.write&quot;, so you cannot reply.</p>}
              {reply.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
                  {reply.error}
                </p>
              )}
            </div>
          </Panel>
        </>
      )}

      <p className="px-1 text-[13.5px] text-ink3">
        <Link to="/admin" className="font-bold text-acc hover:underline">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}
