import { useRef, useState } from 'react';
import { get, post, uploadTicketAttachment, type Ticket, type TicketMessage } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, Link } from '../router';
import { useSession } from '../session';
import { cn } from '../lib';
import {
  ErrorState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  Select,
  ButtonLink,
  StatusPill,
  TextArea,
  useToast,
} from '../ui-app';
import { TicketAttachments } from './TicketAttachments';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_CUSTOMER', label: 'Awaiting your reply' },
  { value: 'AWAITING_STAFF', label: 'Awaiting support' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  AWAITING_CUSTOMER: 'Awaiting your reply',
  AWAITING_STAFF: 'Awaiting support',
  ON_HOLD: 'On hold',
  CLOSED: 'Closed',
};

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/gzip',
];

const MAX_BYTES = 5 * 1024 * 1024;

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${DATE_FMT.format(date)}, ${TIME_FMT.format(date)}`;
}

function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TicketPayload extends Ticket {
  messages?: TicketMessage[];
}

function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return 'That file is larger than 5 MB. Attach a smaller file.';
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'That file type is not supported. Attach a PNG, JPEG, GIF, WebP, PDF, TXT, CSV, JSON or ZIP file.';
  }
  return null;
}

export default function TicketDetail() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const attachmentInput = useRef<HTMLInputElement>(null);

  const state = useAsync(
    (signal) => get<{ ticket: TicketPayload; messages?: TicketMessage[] }>(`/tickets/${id}`, undefined, signal),
    [id],
  );

  const [replyBody, setReplyBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [statusChoice, setStatusChoice] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const ticket = state.data?.ticket;
  const messages = (state.data?.ticket.messages ?? state.data?.messages ?? []).filter((m) => !m.internal);

  const reply = useAction(async () => {
    const result = await post<{ message: TicketMessage }>(`/tickets/${id}/replies`, { body: replyBody.trim() });
    if (attachmentFile) {
      await uploadTicketAttachment(id, result.message.id, attachmentFile);
    }
    return result.message;
  });

  const closeTicket = useAction(async () => {
    await post<{ closed: boolean }>(`/tickets/${id}/close`);
    return true;
  });

  const changeStatus = useAction(async (status: string) => {
    const result = await post<{ ticket: Ticket }>(`/tickets/${id}/status`, { status });
    return result.ticket;
  });

  const submitReply = async () => {
    if (!replyBody.trim()) {
      setReplyError('Write a reply before sending.');
      return;
    }
    setReplyError(null);
    const message = await reply.run();
    if (!message) return;
    setReplyBody('');
    setAttachmentFile(null);
    if (attachmentInput.current) attachmentInput.current.value = '';
    setFileError(null);
    state.reload();
    setNotice('Your reply was sent.');
    toast.push('Reply sent', 'ok');
  };

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) {
      setFileError(problem);
      setAttachmentFile(null);
      return;
    }
    setFileError(null);
    setAttachmentFile(file);
  };

  if (state.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading the ticket" />
      </div>
    );
  }

  if (state.error || !ticket) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="This ticket could not be loaded"
          message={state.error?.message ?? 'The ticket does not exist or is not visible to your account.'}
          onRetry={state.reload}
        />
        <p className="px-1 text-[14px] text-ink2">
          <Link to="/app/tickets" className="font-bold text-acc hover:underline">
            Back to your tickets
          </Link>
        </p>
      </div>
    );
  }

  const currentStatus = statusChoice ?? ticket.status;
  const isStaff = user?.role === 'STAFF' || user?.role === 'ADMIN';

  return (
    <div className="grid gap-4">
      <p className="sr-only" aria-live="polite">
        {notice}
      </p>

      <Panel
        title={ticket.subject}
        description={`Ticket #${ticket.number} · opened ${fmtDate(ticket.createdAt)}`}
        action={<StatusPill status={ticket.status} label={STATUS_LABEL[ticket.status] ?? ticket.status.replace(/_/g, ' ')} />}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Category</dt>
            <dd className="mt-1 text-[14.5px] text-ink">{ticket.category}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Priority</dt>
            <dd className="mt-1 text-[14.5px] capitalize text-ink">{ticket.priority}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Related service</dt>
            <dd className="mt-1 text-[14.5px] text-ink">{ticket.serviceName ?? ticket.instanceName ?? 'None'}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Last activity</dt>
            <dd className="mt-1 text-[14.5px] text-ink">{fmtDate(ticket.lastReplyAt ?? ticket.updatedAt)}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Status">
        {!isStaff && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <StatusPill status={ticket.status} label={STATUS_LABEL[ticket.status] ?? ticket.status.replace(/_/g, ' ')} />
              <p className="text-[13.5px] text-ink2">
                {ticket.status === 'CLOSED'
                  ? `Closed on ${fmtDate(ticket.updatedAt)}. This conversation is finished; if the problem comes back, open a new ticket and mention #${ticket.number}.`
                  : 'Close the ticket when the problem is solved. You can always open a new one.'}
              </p>
            </div>
            {ticket.status !== 'CLOSED' ? (
              <PrimaryButton onClick={async () => {
                const closed = await closeTicket.run();
                if (closed) { state.reload(); toast.push('Ticket closed', 'ok'); }
              }} disabled={closeTicket.pending}>
                {closeTicket.pending ? 'Closing…' : 'Close ticket'}
              </PrimaryButton>
            ) : (
              <ButtonLink to="/app/tickets" variant="soft">Open a new ticket</ButtonLink>
            )}
          </div>
        )}
        {isStaff && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
            <Select
              label="Ticket status"
              value={currentStatus}
              onChange={(e) => setStatusChoice(e.target.value)}
              hint="Choose the state that matches where the conversation is."
              className="scroll-mt-16"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <PrimaryButton
              onClick={async () => {
                if (!statusChoice || statusChoice === ticket.status) return;
                const updated = await changeStatus.run(statusChoice);
                if (!updated) return;
                setStatusChoice(null);
                state.reload();
                toast.push('Ticket status updated', 'ok');
              }}
              disabled={changeStatus.pending || !statusChoice || statusChoice === ticket.status}
              className="w-full sm:w-auto"
            >
              {changeStatus.pending ? 'Saving…' : 'Update status'}
            </PrimaryButton>
          </div>
          {changeStatus.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {changeStatus.error}
            </p>
          )}
        </div>
        )}
      </Panel>

      <Panel title="Conversation" description={`${messages.length} message${messages.length === 1 ? '' : 's'}.`}>
        {messages.length === 0 ? (
          <p className="rounded-2xl bg-s2 px-4 py-6 text-center text-[14px] text-ink2">
            No messages in this ticket yet. Write the first reply below.
          </p>
        ) : (
          <ul className="grid gap-2.5">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  'rounded-2xl p-4',
                  // The message of the customer sits on the accent surface, so
                  // the thread can be read on a phone without reading the
                  // names first.
                  user?.id && message.author.id === user.id ? 'bg-acc-bg' : 'bg-s2',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[14.5px] font-medium text-ink">{authorName(message, user?.id ?? null)}</p>
                  <span className="rounded-full bg-s3 px-2.5 py-0.5 text-[11.5px] font-bold text-ink2">
                    {roleLabel(message.author.role)}
                  </span>
                  <span className="text-[12.5px] text-ink3">{fmtDate(message.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink2">{message.body}</p>
                <TicketAttachments ticketId={id} messageId={message.id} attachments={message.attachments} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Reply" description="Your reply is added to the same thread.">
        <div className="grid gap-3">
          <TextArea
            label="Your message"
            rows={5}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            error={replyError ?? undefined}
            placeholder="Add more detail, a log excerpt or a question."
            className="scroll-mt-16"
          />

          <div className="grid gap-2">
            <label htmlFor="ticket-attachment" className="px-1 text-[13.5px] font-medium text-ink">
              Attachment
            </label>
            <input
              id="ticket-attachment"
              ref={attachmentInput}
              type="file"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              className="block w-full text-[14px] text-ink2 file:mr-3 file:h-11 file:rounded-full file:bg-s3 file:px-4 file:text-[14px] file:font-bold file:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            />
            <p className="px-1 text-[12.5px] text-ink3">
              Up to 5 MB. PNG, JPEG, GIF, WebP, PDF, TXT, CSV, JSON and ZIP files are supported.
            </p>
            {fileError && (
              <p role="alert" className="px-1 text-[12.5px] font-medium text-bad">
                {fileError}
              </p>
            )}
            {attachmentFile && (
              <p className="px-1 text-[12.5px] text-ink2">
                Attached: <span className="font-mono break-all text-ink">{attachmentFile.name}</span> ({fmtSize(attachmentFile.size)})
              </p>
            )}
          </div>

          {reply.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {reply.error}
            </p>
          )}

          <div className="flex sm:justify-end">
            <PrimaryButton onClick={submitReply} disabled={reply.pending} className="w-full sm:w-auto">
              {reply.pending ? 'Sending…' : 'Send reply'}
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      <p className="px-1 text-[13.5px] text-ink3">
        <Link
          to="/app/tickets"
          className="inline-flex min-h-11 items-center font-bold text-acc hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          Back to your tickets
        </Link>
      </p>
    </div>
  );
}

function roleLabel(role: string): string {
  if (role === 'STAFF') return 'Staff';
  if (role === 'ADMIN') return 'Admin';
  return 'Customer';
}

function authorName(message: TicketMessage, userId: string | null): string {
  if (userId && message.author.id === userId) return 'You';
  return message.author.name ?? roleLabel(message.author.role);
}
