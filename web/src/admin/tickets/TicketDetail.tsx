import { useEffect, useState } from 'react';
import { get, post, relativeTime, type TicketMessage } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { TicketAttachments } from '../../app/TicketAttachments';
import { Icon } from '../../icons';
import { Link, useParams } from '../../router';
import {
  ErrorState,
  Field,
  LoadingBlock,
  Panel,
  Segmented,
  SoftButton,
  StatusPill,
  TextArea,
  useToast,
} from '../../ui-app';
import { DASH, LiveRegion, can, denseSelect, fmtDateTime, maskEmail, useAdminSession } from '../Overview';
import { ContextPanel } from '../ContextPanel';
import { AiAssistant } from '../SupportAi';
import {
  TICKET_STATUS_OPTIONS,
  ticketPriorityLabel,
  ticketStatus,
  ticketStatusLabel,
  type TicketConversation,
  type TicketRow,
} from './shared';

/**
 * The page of a conversation of the support desk.
 *
 * The thread comes from GET /api/tickets/:id, because that endpoint holds the
 * internal notes as well and the staff may read every ticket. The customer
 * of the ticket comes from GET /api/admin/tickets?id=<id>, and the services
 * of the customer from the record of the customer.
 *
 * The page is a page of its own: /admin/tickets/:id. It is reached by a
 * direct link, by a refresh and by the history of the browser, and the old
 * address with the query parameter opens the same conversation.
 */

export interface TicketDetailProps {
  /**
   * The ticket of the page. When it is not given, the id of the address is
   * used, so the page is the one of the route /admin/tickets/:id.
   */
  ticketId?: string;
}

/** A member of the staff, as the list of the staff sends it. */
interface StaffMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
}

/* -------------------------------------------------------------------------- */
/* the thread                                                                   */
/* -------------------------------------------------------------------------- */

/** What the thread shows: everything, only the customer or only the notes. */
type MessageFilter = 'all' | 'customer' | 'internal';

/** The messages of a ticket, with the notes of the staff marked. */
export function TicketMessages({
  ticketId,
  messages,
  filter = 'all',
}: {
  ticketId: string;
  messages: TicketMessage[];
  filter?: MessageFilter;
}) {
  const shown = messages.filter((message) => {
    if (filter === 'customer') return !message.internal;
    if (filter === 'internal') return message.internal;
    return true;
  });

  if (!messages.length) {
    return (
      <p className="rounded-2xl bg-s2 px-4 py-6 text-center text-[14px] text-ink2">
        This ticket has no message yet.
      </p>
    );
  }

  if (!shown.length) {
    return (
      <p className="rounded-2xl bg-s2 px-4 py-6 text-center text-[14px] text-ink2">
        {filter === 'internal' ? 'No internal note in this ticket.' : 'No message of the customer in this ticket.'}
      </p>
    );
  }

  return (
    <ul className="grid gap-2.5">
      {shown.map((message) => (
        <li key={message.id} className={message.internal ? 'rounded-2xl bg-warn/10 p-4' : 'rounded-2xl bg-s2 p-4'}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[14px] font-medium text-ink">{message.author.name ?? message.author.role}</p>
            <span className="rounded-full bg-s3 px-2.5 py-0.5 text-[11.5px] font-bold text-ink2">{message.author.role}</span>
            {message.internal && (
              <span className="rounded-full bg-warn/20 px-2.5 py-0.5 text-[11.5px] font-bold text-warn">Internal note</span>
            )}
            <span className="text-[12.5px] text-ink3" title={fmtDateTime(message.createdAt)}>
              {relativeTime(message.createdAt)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink2">{message.body}</p>
          <TicketAttachments ticketId={ticketId} messageId={message.id} attachments={message.attachments} />
        </li>
      ))}
    </ul>
  );
}

/** What happened to a ticket, in the order it happened. */
export function TicketActivity({ events }: { events: { id: string; type: string; message: string; createdAt: string }[] }) {
  if (!events.length) {
    return <p className="text-[13.5px] text-ink2">Nothing was recorded for this ticket yet.</p>;
  }
  return (
    <ol className="grid gap-2.5">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-acc/60" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] text-ink2">{event.message}</span>
            <span className="block text-[12px] text-ink3" title={fmtDateTime(event.createdAt)}>
              {relativeTime(event.createdAt)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* the composer                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The composer of the answer.
 *
 * A public reply goes to the customer and an internal note stays in the
 * queue of the staff. The text of the answer is only cleared when the API
 * really took it, so a failed request never loses what the staff wrote.
 */
export function TicketReplyComposer({
  ticketId,
  mayWrite,
  onSent,
  suggestion,
}: {
  ticketId: string;
  mayWrite: boolean;
  /** Called after a reply or a note was really written. */
  onSent?: () => void;
  /**
   * A text that was written somewhere else, for example by the assistant. It
   * lands in the composer, where the staff read it before they send it.
   */
  suggestion?: { text: string; at: number; append?: boolean } | null;
}) {
  const toast = useToast();
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reply = useAction(async () =>
    post<{ message: TicketMessage }>(`/tickets/${ticketId}/replies`, { body: body.trim(), internal }),
  );

  // The text that comes from outside lands in the composer, and the moment it
  // arrived is what tells it apart from the text that is already there. A
  // saved answer is added under what the staff wrote, a draft from the
  // assistant takes its place.
  useEffect(() => {
    if (!suggestion?.text) return;
    setBody((current) => {
      if (!suggestion.append) return suggestion.text;
      return current.trim() ? `${current}\n\n${suggestion.text}` : suggestion.text;
    });
  }, [suggestion?.at]);

  const send = async () => {
    if (!body.trim()) {
      setError(internal ? 'Write the note before adding it.' : 'Write a reply before sending.');
      return;
    }
    setError(null);
    const answer = await reply.run();
    if (!answer) return;
    setBody('');
    toast.push(internal ? 'Internal note added' : 'Reply sent', 'ok');
    onSent?.();
  };

  return (
    <div className="grid gap-3">
      <Segmented
        ariaLabel="The kind of the answer"
        role="group"
        value={internal ? 'internal' : 'reply'}
        onChange={(value) => setInternal(value === 'internal')}
        options={[
          { value: 'reply', label: 'Public reply' },
          { value: 'internal', label: 'Internal note' },
        ]}
      />
      <TextArea
        label={internal ? 'Note for the staff' : 'Reply to the customer'}
        rows={4}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          if (error) setError(null);
        }}
        error={error ?? undefined}
        placeholder={internal ? 'What the next member of the staff has to know.' : 'Answer the customer.'}
        className="scroll-mt-16"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={reply.pending || !mayWrite}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 lg:h-[38px]"
        >
          {reply.pending ? 'Sending…' : internal ? 'Add the note' : 'Send the reply'}
        </button>
        <span className="text-[12.5px] text-ink3">
          {internal ? 'Only the staff read a note.' : 'The customer reads a reply in their account.'}
        </span>
      </div>
      {!mayWrite && (
        <p className="text-[13px] text-ink3">Your role does not hold &quot;tickets.write&quot;, so you cannot answer.</p>
      )}
      {reply.error && (
        <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {reply.error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* the page                                                                     */
/* -------------------------------------------------------------------------- */

export default function TicketDetail(props: TicketDetailProps = {}) {
  const params = useParams();
  const ticketId = (props.ticketId ?? params.id ?? '').trim();

  const session = useAdminSession();
  const staff = session.staff;
  const mayWrite = can(staff, 'tickets.write');
  const mayReadStaff = can(staff, 'staff.read');
  const toast = useToast();

  const [filter, setFilter] = useState<MessageFilter>('all');
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  // The text that the assistant wrote lands in the composer. The moment it
  // arrived is what tells a new text from the one that is already there.
  const [suggestion, setSuggestion] = useState<{ text: string; at: number; append?: boolean } | null>(null);

  // The answers the team uses again. They are kept in the settings of the
  // platform, one list for the whole team.
  const savedReplies = useAsync<{ replies: { id: string; title: string; body: string }[] }>(
    async (signal) => get<{ replies: { id: string; title: string; body: string }[] }>('/admin/support/replies', undefined, signal),
    [],
  );

  // The thread of the conversation. The endpoint of the customer is used,
  // because it holds the internal notes as well.
  const conversation = useAsync<{ ticket: TicketConversation | null }>(
    async (signal) => {
      if (!ticketId) return { ticket: null };
      const answer = await get<{ ticket: TicketConversation }>(`/tickets/${encodeURIComponent(ticketId)}`, undefined, signal);
      return { ticket: answer.ticket };
    },
    [ticketId],
  );

  // The row of the queue holds the customer of the ticket and the id of the
  // member of the staff that owns it.
  const row = useAsync<{ ticket: TicketRow | null }>(
    async (signal) => {
      if (!ticketId) return { ticket: null };
      const answer = await get<{ tickets: TicketRow[] }>('/admin/tickets', { id: ticketId }, signal);
      return { ticket: answer.tickets[0] ?? null };
    },
    [ticketId],
  );

  // The list of the staff fills the assignment. A role that cannot read it
  // gets an empty menu instead of a failed request.
  const staffList = useAsync<{ staff: StaffMember[] }>(
    async (signal) => {
      if (!mayReadStaff) return { staff: [] };
      return get<{ staff: StaffMember[] }>('/admin/staff', undefined, signal);
    },
    [mayReadStaff],
  );

  const current = conversation.data?.ticket ?? null;
  const messages = current?.messages ?? [];
  const customer = row.data?.ticket?.customer ?? null;

  const changeStatus = useAction(async (next: string) =>
    post<{ ticket: { id: string; status: string } }>(`/tickets/${encodeURIComponent(ticketId)}/status`, { status: next }),
  );

  const assign = useAction(async (userId: string | null) =>
    post<{ ticket: { id: string; assignedToId: string | null } }>(`/admin/tickets/${encodeURIComponent(ticketId)}/assign`, { userId }),
  );

  // The owner of the ticket is shown as it is, and the menu of the
  // assignment starts from it.
  const assignedToId = row.data?.ticket?.assignedToId ?? '';
  useEffect(() => {
    setAssignee(assignedToId);
  }, [assignedToId]);

  const statusValue = status || (current ? ticketStatus(current.status).toUpperCase() : '');
  const statusChanged = Boolean(status) && status !== (current ? ticketStatus(current.status).toUpperCase() : '');

  const reloadAll = () => {
    conversation.reload();
    row.reload();
  };

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  if (!ticketId) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="This ticket has no address"
          message="The address of the conversation does not hold the number of a ticket."
        />
        <p className="px-1 text-[14px] text-ink2">
          <Link to="/admin/tickets" className="font-bold text-acc hover:underline">
            Back to the inbox
          </Link>
        </p>
      </div>
    );
  }

  if (conversation.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading the ticket" />
      </div>
    );
  }

  if (conversation.error || !current) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="This ticket could not be loaded"
          message={conversation.error?.message ?? 'The ticket does not exist.'}
          onRetry={conversation.reload}
        />
        <p className="px-1 text-[14px] text-ink2">
          <Link to="/admin/tickets" className="font-bold text-acc hover:underline">
            Back to the inbox
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LiveRegion message={`Ticket #${current.number} loaded`} />

      {/* The way back to the queue. */}
      <div>
        <Link
          to="/admin/tickets"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-4 text-[14px] font-semibold text-ink transition-colors duration-[180ms] hover:border-acc/50 hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          <Icon name="arrow" size={15} className="rotate-180" />
          Back to Inbox
        </Link>
      </div>

      {/* The head of the conversation. */}
      <Panel
        title={`#${current.number} ${current.subject}`}
        description={`Opened ${fmtDateTime(current.createdAt)} · ${messages.length} message${messages.length === 1 ? '' : 's'} · last activity ${relativeTime(current.updatedAt)}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={current.status} label={ticketStatusLabel(current.status)} />
          <span className="rounded-full bg-s3 px-2.5 py-1 text-[12px] font-bold capitalize text-ink2">
            {ticketPriorityLabel(current.priority)} priority
          </span>
          <span className="rounded-full bg-s3 px-2.5 py-1 text-[12px] font-bold capitalize text-ink2">
            {current.category.toLowerCase()}
          </span>
          {current.serviceName && (
            <span className="rounded-full bg-s3 px-2.5 py-1 text-[12px] font-bold text-ink2">{current.serviceName}</span>
          )}
          <span className="rounded-full bg-s3 px-2.5 py-1 text-[12px] font-bold text-ink2">
            {current.assignedTo ?? 'Unassigned'}
          </span>
        </div>
      </Panel>

      {/* The conversation and the column of the context. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="grid gap-4">
          <Panel
            title="Conversation"
            description="The messages of the customer and the notes of the staff. The notes are never shown to the customer."
          >
            <div className="grid gap-3">
              <Segmented
                ariaLabel="The messages of the ticket"
                role="group"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Every message' },
                  { value: 'customer', label: 'The customer' },
                  { value: 'internal', label: 'Internal notes' },
                ]}
              />
              <TicketMessages ticketId={ticketId} messages={messages} filter={filter} />
            </div>
          </Panel>

          <Panel
            title="Reply"
            description="A public reply goes to the customer. An internal note stays in the queue of the staff."
          >
            {/* The answers the team uses again. The text is written by the
                platform, with the names of the customer, and lands in the
                composer, where the staff read it before they send it. */}
            {savedReplies.data?.replies.length ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label="Insert a saved reply"
                  className={denseSelect}
                  value=""
                  onChange={(event) => {
                    const found = savedReplies.data?.replies.find((entry) => entry.id === event.target.value);
                    if (!found) return;
                    void post<{ text: string }>(`/admin/support/conversations/${encodeURIComponent(ticketId)}/render`, { text: found.body })
                      .then((answer) => setSuggestion({ text: answer.text || found.body, at: Date.now(), append: true }))
                      .catch(() => setSuggestion({ text: found.body, at: Date.now(), append: true }));
                  }}
                >
                  <option value="">Insert a saved reply</option>
                  {savedReplies.data.replies.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <TicketReplyComposer ticketId={ticketId} mayWrite={mayWrite} onSent={reloadAll} suggestion={suggestion} />
          </Panel>

          {/* The assistant of the staff. It writes a draft; the staff read it
              before they send it, and the text lands in the composer. */}
          {mayWrite && (
            <AiAssistant ticketId={ticketId} onUse={(text) => setSuggestion({ text, at: Date.now() })} />
          )}
        </div>

        <div className="grid content-start gap-4">
          {/* What the platform knows about the customer of this ticket. */}
          <ContextPanel ticketId={ticketId} />

          {/* The record of the customer. The panel of the context beside it
              already says who the customer is and what they run, so this one
              only opens the record itself. */}
          <Panel title="The customer record">
            {customer ? (
              <div className="grid gap-3">
                <dl className="grid gap-2.5">
                  {current.serviceName && (
                    <div className="min-w-0">
                      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Service</dt>
                      <dd className="mt-0.5 truncate text-[14px] text-ink" title={current.serviceName}>
                        {current.serviceName}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Last reply</dt>
                    <dd className="mt-0.5 text-[14px] text-ink">
                      {current.lastReplyAt ? fmtDateTime(current.lastReplyAt) : DASH}
                    </dd>
                  </div>
                </dl>
                <Link
                  to={`/admin/customers/${customer.id}`}
                  className="text-[13.5px] font-bold text-acc hover:underline"
                >
                  Open the record of the customer
                </Link>
              </div>
            ) : row.loading ? (
              <LoadingBlock rows={2} label="Loading the customer" />
            ) : (
              <p className="text-[13.5px] text-ink2">
                The customer of this ticket is not in the answer of the API right now.
              </p>
            )}
          </Panel>

          {/* The state of the ticket and the owner of it. */}
          <Panel title="Ticket" description="The state and the owner of the ticket.">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">State</p>
                {mayWrite ? (
                  <>
                    <Field label="The state of the ticket" htmlFor="ticket-state">
                      <select
                        id="ticket-state"
                        value={statusValue}
                        onChange={(event) => setStatus(event.target.value)}
                        className={denseSelect}
                      >
                        {TICKET_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <SoftButton
                      onClick={async () => {
                        if (!status) return;
                        const answer = await changeStatus.run(status);
                        if (!answer) return;
                        setStatus('');
                        reloadAll();
                      }}
                      disabled={changeStatus.pending || !statusChanged}
                    >
                      {changeStatus.pending ? 'Saving…' : 'Update the state'}
                    </SoftButton>
                  </>
                ) : (
                  <p className="text-[13.5px] text-ink2">
                    <StatusPill status={current.status} label={ticketStatusLabel(current.status)} />
                  </p>
                )}
                {changeStatus.error && (
                  <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
                    {changeStatus.error}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Owner</p>
                <p className="text-[13.5px] text-ink2">
                  {current.assignedTo ? `Assigned to ${current.assignedTo}.` : 'Nobody owns this ticket yet.'}
                </p>
                {mayWrite ? (
                  <>
                    <Field label="Assign the ticket to" htmlFor="ticket-owner">
                      <select
                        id="ticket-owner"
                        value={assignee}
                        onChange={(event) => setAssignee(event.target.value)}
                        disabled={!mayReadStaff}
                        className={denseSelect}
                      >
                        <option value="">Unassigned</option>
                        {staffList.data?.staff.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.name ?? maskEmail(member.email)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <SoftButton
                      onClick={async () => {
                        const answer = await assign.run(assignee || null);
                        if (!answer) return;
                        toast.push(assignee ? 'Assignment saved.' : 'Assignment cleared.', 'ok');
                        reloadAll();
                      }}
                      disabled={assign.pending || !mayReadStaff || staffList.loading}
                    >
                      {assign.pending ? 'Saving…' : 'Save the assignment'}
                    </SoftButton>
                    {!mayReadStaff && (
                      <p className="text-[13px] text-ink3">
                        Your role does not hold &quot;staff.read&quot;, so the list of the staff cannot be read and a ticket
                        cannot be assigned from here.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-ink3">
                    Your role does not hold &quot;tickets.write&quot;, so the ticket is read-only.
                  </p>
                )}
                {assign.error && (
                  <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
                    {assign.error}
                  </p>
                )}
              </div>
            </div>
          </Panel>

          {/* What happened to the ticket. */}
          <Panel title="Activity" description="Everything the API recorded for this ticket.">
            <TicketActivity events={current.events ?? []} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
