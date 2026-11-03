import { useState } from 'react';
import { get, getAll, post, type Ticket } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import {
  CardList,
  ButtonLink,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Pager,
  Panel,
  SoftButton,
  StatusPill,
  TextInput,
  usePaged,
  useToast,
} from '../ui-app';

interface TicketCategory {
  id: string;
  label: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  awaiting_customer: 'Awaiting your reply',
  awaiting_staff: 'Awaiting support',
  on_hold: 'On hold',
  closed: 'Closed',
};

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${DATE_FMT.format(date)}, ${TIME_FMT.format(date)}`;
}

function fmtRelative(value: string | null | undefined): string {
  if (!value) return 'No replies yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return DATE_FMT.format(date);
}

function statusLabel(status: string): string {
  // The API answers with the upper case of the enumeration. The label is
  // found either way, so the page keeps working with both.
  return STATUS_LABEL[status.toLowerCase()] ?? status.replace(/_/g, ' ');
}

/** Before a ticket: a search of the documentation, because most questions already have an answer there. */
function DocsSearch() {
  const [term, setTerm] = useState('');
  return (
    <form
      role="search"
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        window.location.assign(`/docs${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`);
      }}
    >
      <input
        type="search"
        aria-label="Search the documentation"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search the documentation"
        autoComplete="off"
        className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-[14.5px] text-ink placeholder:text-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      />
      <SoftButton type="submit">Search</SoftButton>
    </form>
  );
}

export default function Tickets() {
  const toast = useToast();
  const [closing, setClosing] = useState<Ticket | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);

  const tickets = useAsync(async (signal) => ({ tickets: await getAll<Ticket>('/tickets', 'tickets', {}, signal) }), []);
  const categories = useAsync((signal) => get<{ categories: TicketCategory[] }>('/tickets/categories', undefined, signal), []);

  const categoryLabel = (id: string) => categories.data?.categories.find((c) => c.id === id)?.label ?? id;
  const all = tickets.data?.tickets ?? [];
  const paged = usePaged(all, 20);
  const rows = paged.rows;

  return (
    <div className="grid gap-4">
      <Panel className="grid gap-4">
        <DocsSearch />
        {tickets.loading ? (
          <LoadingBlock rows={4} label="Loading your tickets" />
        ) : tickets.error ? (
          <ErrorState
            title="Your tickets could not be loaded"
            message={tickets.error.message}
            onRetry={tickets.reload}
          />
        ) : !all.length ? (
          <EmptyState
            title="No tickets yet."
            description="Open a ticket and we will answer in the same thread."
            action={<ButtonLink to="/app/tickets/new">Create a ticket</ButtonLink>}
          />
        ) : (
          <div className="grid gap-3">
            <DataTable<Ticket>
              rows={rows}
              rowKey={(t) => t.id}
              rowTo={(t) => `/app/tickets/${t.id}`}
              columns={[
                {
                  key: 'subject',
                  header: 'Subject',
                  truncate: true,
                  width: '38%',
                  render: (t) => (
                    <Link
                      to={`/app/tickets/${t.id}`}
                      title={t.subject}
                      className="block truncate font-bold tracking-[-0.02em] text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      {t.subject}
                    </Link>
                  ),
                },
                { key: 'number', header: 'Number', nowrap: true, render: (t) => <span className="font-mono tabular-nums text-ink2">#{t.number}</span> },
                { key: 'category', header: 'Category', nowrap: true, render: (t) => <span className="text-ink2">{categoryLabel(t.category)}</span> },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (t) => <StatusPill status={t.status} label={statusLabel(t.status)} />,
                },
                {
                  key: 'last',
                  header: 'Last reply',
                  nowrap: true,
                  render: (t) => (
                    <span className="text-ink2" title={fmtDate(t.lastReplyAt)}>
                      {fmtRelative(t.lastReplyAt)}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Quick actions',
                  align: 'right',
                  nowrap: true,
                  render: (t) => (
                    t.status !== 'closed' ? (
                      <SoftButton onClick={() => setClosing(t)} aria-label={`Close ticket ${t.number}`} title="Close this ticket. Write again to reopen it.">
                        Close
                      </SoftButton>
                    ) : null
                  ),
                },
              ]}
            />

            <ConfirmDialog
              open={closing !== null}
              title={closing ? `Close ticket #${closing.number}?` : 'Close ticket?'}
              description="Closing tells support the problem is solved. You can open a new ticket any time."
              confirmLabel="Close ticket"
              busy={closeBusy}
              onCancel={() => setClosing(null)}
              onConfirm={() => {
                if (!closing) return;
                setCloseBusy(true);
                post(`/tickets/${closing.id}/close`)
                  .then(() => {
                    toast.push('The ticket was closed.', 'ok');
                    tickets.reload();
                  })
                  .catch((failure) => toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error'))
                  .finally(() => {
                    setCloseBusy(false);
                    setClosing(null);
                  });
              }}
            />

            <CardList<Ticket> rows={rows} rowKey={(t) => t.id}>
              {(t) => (
                <Link
                  to={`/app/tickets/${t.id}`}
                  className="flex min-w-0 flex-wrap items-start justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                >
                  <div className="w-0 min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink" title={t.subject}>
                      {t.subject}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[13px] text-ink3"
                      title={`#${t.number} · ${categoryLabel(t.category)} · ${fmtRelative(t.lastReplyAt)}`}
                    >
                      #{t.number} · {categoryLabel(t.category)} · {fmtRelative(t.lastReplyAt)}
                    </p>
                  </div>
                  {/* The status gets a line of its own on a phone, so a long
                      subject is not cut to make room for the pill. */}
                  <div className="w-full sm:w-auto">
                    <StatusPill status={t.status} label={statusLabel(t.status)} />
                  </div>
                </Link>
              )}
            </CardList>
            <Pager paged={paged} label="Tickets pages" />
          </div>
        )}
      </Panel>
    </div>
  );
}
