import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { get, relativeTime } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../icons';
import { Link, useRouter } from '../../router';
import { EmptyState, ErrorState, Field, LoadingBlock, Panel, Segmented, SoftButton, StatusPill } from '../../ui-app';
import { DASH, LiveRegion, denseInput, denseSelect, fmtDateTime, maskEmail } from '../Overview';
import TicketDetail from './TicketDetail';
import { ListPreferences, useColumnPicker, type SavedQuery } from '../ListPreferences';
import {
  EMPTY_TICKET_FILTERS,
  TICKET_ASSIGNMENT_FILTERS,
  TICKET_CATEGORY_FILTERS,
  TICKET_CHANNELS,
  TICKET_PRIORITY_FILTERS,
  TICKET_SORT_FILTERS,
  TICKET_STATUS_FILTERS,
  buildTicketListQuery,
  hasActiveFilters,
  hasTicketDetailRoute,
  priorityDotClass,
  statusDotClass,
  ticketConversationPath,
  ticketIdFromQuery,
  ticketPriorityLabel,
  ticketStatusLabel,
  type TicketChannel,
  type TicketFilters,
  type TicketRow,
} from './shared';

/**
 * The inbox of the support desk — GET /api/admin/tickets
 *
 * The list takes the whole width of the page: there is no column of a queue
 * next to an empty area. The filters of the desk (the search, the state, the
 * category, the priority, the owner and the order) are read by the API, so
 * the page never holds more rows than it shows and the pager walks the queue
 * with the cursor of the server.
 *
 * The row is a link: the keyboard reaches it, the middle button opens it in
 * another tab and the arrow keys walk from one row to the next one.
 */

export interface TicketInboxProps {
  /** The ticket that is open right now. Its row is marked as the current one. */
  selectedId?: string;
  /** The channel of the desk the list shows. */
  channel?: TicketChannel;
}

/** The number of rows of a page of the list. */
const PAGE_SIZES = [25, 50, 100];

/* -------------------------------------------------------------------------- */
/* the list                                                                     */
/* -------------------------------------------------------------------------- */

/** A column of the table of the queue. */
interface InboxColumn {
  key: string;
  header: string;
  /** The width of the column. The header and the cell use the same one. */
  width: string;
  /** The column is only shown on a wide screen. */
  wideOnly?: boolean;
  nowrap?: boolean;
  /** A long value is cut, and the whole value stays in the title of it. */
  truncate?: boolean;
  render: (ticket: TicketRow) => ReactNode;
}

/** The classes of the header of a column. */
const headClass = 'px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3';

/**
 * The classes of a cell of a row.
 *
 * The row is a card: the first and the last cell carry the rounded ends and
 * the line of it. The row that is hovered and the row that is open are told
 * apart by the surface of the cells, so the whole row changes and not one
 * cell of it.
 */
function cellClass(selected: boolean, first: boolean, last: boolean, column: InboxColumn): string {
  return [
    'px-3 py-3 align-middle text-[14px] text-ink border-y border-line',
    selected ? 'bg-acc/10' : 'bg-card group-hover:bg-s3',
    first ? 'rounded-l-2xl border-l' : '',
    last ? 'rounded-r-2xl border-r' : '',
    column.nowrap ? 'whitespace-nowrap' : '',
    column.truncate ? 'max-w-0' : '',
    column.wideOnly ? 'hidden xl:table-cell' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The keyboard of the rows of the list.
 *
 * The rows are links, so the keyboard reaches them on its own. The arrow
 * keys walk from one row to the next one, so the queue can be read without
 * the mouse.
 */
function useRowKeys(containerRef: RefObject<HTMLElement | null>) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const container = containerRef.current;
      if (!container) return;
      const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-ticket-row]'));
      const index = rows.indexOf(event.currentTarget as HTMLElement);
      if (index < 0) return;
      const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
    },
    [containerRef],
  );
}

/** The table of the queue, for the wide screens. */
export function TicketInboxTable({
  tickets,
  selectedId = '',
  showEmails = false,
  visibleColumns,
}: {
  tickets: TicketRow[];
  selectedId?: string;
  /** The addresses of the customers are shown as they are. */
  showEmails?: boolean;
  visibleColumns?: string[];
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const onRowKeys = useRowKeys(bodyRef);
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  const columns = useMemo<InboxColumn[]>(
    () => [
      {
        key: 'ticket',
        header: 'Ticket',
        width: '26%',
        render: (ticket) => (
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              title={ticketStatusLabel(ticket.status)}
              className={`size-2 shrink-0 rounded-full ${statusDotClass(ticket.status)}`}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-[12px] text-ink3">#{ticket.number}</span>
              <span className="truncate text-[14px] font-medium tracking-[-0.02em] text-ink" title={ticket.subject}>
                {ticket.subject}
              </span>
            </span>
          </span>
        ),
      },
      {
        key: 'customer',
        header: 'Customer',
        width: '17%',
        truncate: true,
        render: (ticket) => (
          <span className="block min-w-0">
            <span className="block truncate text-[13.5px] text-ink" title={ticket.customer.name ?? 'No name'}>
              {ticket.customer.name ?? 'No name'}
            </span>
            <span className="block truncate font-mono text-[12px] text-ink3" title={email(ticket.customer.email)}>
              {email(ticket.customer.email)}
            </span>
          </span>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        width: '10%',
        wideOnly: true,
        nowrap: true,
        render: (ticket) => <span className="text-ink2 capitalize">{ticket.category}</span>,
      },
      {
        key: 'priority',
        header: 'Priority',
        width: '10%',
        nowrap: true,
        render: (ticket) => (
          <span className="inline-flex items-center gap-1.5 text-ink2">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${priorityDotClass(ticket.priority)}`} />
            {ticketPriorityLabel(ticket.priority)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '13%',
        nowrap: true,
        render: (ticket) => <StatusPill status={ticket.status} />,
      },
      {
        key: 'assigned',
        header: 'Assigned to',
        width: '13%',
        truncate: true,
        render: (ticket) => (
          <span className="block min-w-0 truncate text-ink2" title={ticket.assignedTo ?? 'Unassigned'}>
            {ticket.assignedTo ?? DASH}
          </span>
        ),
      },
      {
        key: 'activity',
        header: 'Last activity',
        width: '11%',
        nowrap: true,
        render: (ticket) => (
          <span className="text-ink2" title={fmtDateTime(ticket.updatedAt)}>
            {relativeTime(ticket.updatedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        width: '10%',
        nowrap: true,
        render: (ticket) => (
          <Link
            to={ticketConversationPath(ticket.id)}
            className="inline-flex h-8 items-center justify-center rounded-full border border-line bg-card px-3 text-[12.5px] font-semibold text-ink2 transition-colors duration-[180ms] hover:border-acc/50 hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            Open
          </Link>
        ),
      },
    ],
    [showEmails],
  ).filter((column) => !visibleColumns || visibleColumns.includes(column.key));

  return (
    // The table scrolls inside its own box, so the page never scrolls
    // sideways. The columns that do not fit a narrow screen are hidden and
    // the rest of the table keeps its place.
    <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain bm-hide-scroll md:block">
      <table className="w-full border-separate text-left" style={{ borderSpacing: '0 6px', minWidth: '700px' }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width }}
                className={`${headClass} ${column.nowrap ? 'whitespace-nowrap' : ''} ${column.wideOnly ? 'hidden xl:table-cell' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {tickets.map((ticket) => {
            const selected = ticket.id === selectedId;
            return (
              <tr key={ticket.id} className="group">
                {columns.map((column, index) => (
                  <td key={column.key} className={cellClass(selected, index === 0, index === columns.length - 1, column)}>
                    {column.key === 'ticket' ? (
                      <Link
                        to={ticketConversationPath(ticket.id)}
                        data-ticket-row
                        aria-current={selected ? 'true' : undefined}
                        onKeyDown={onRowKeys}
                        className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        {column.render(ticket)}
                      </Link>
                    ) : (
                      column.render(ticket)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The rows of the queue, for the narrow screens. */
export function TicketInboxList({
  tickets,
  selectedId = '',
  showEmails = false,
}: {
  tickets: TicketRow[];
  selectedId?: string;
  /** The addresses of the customers are shown as they are. */
  showEmails?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const onRowKeys = useRowKeys(listRef);
  const email = (value: string) => (showEmails ? value : maskEmail(value));

  return (
    // The rows are lines and not cards: the queue of a phone is a list, and
    // every line carries the whole ticket.
    <ul ref={listRef} className="divide-y divide-line md:hidden">
      {tickets.map((ticket) => {
        const selected = ticket.id === selectedId;
        return (
          <li key={ticket.id}>
            <Link
              to={ticketConversationPath(ticket.id)}
              data-ticket-row
              aria-current={selected ? 'true' : undefined}
              onKeyDown={onRowKeys}
              className={`flex items-start gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                selected ? 'bg-acc/10' : ''
              }`}
            >
              <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${statusDotClass(ticket.status)}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-[12px] text-ink3">#{ticket.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium tracking-[-0.02em] text-ink" title={ticket.subject}>
                    {ticket.subject}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-ink2" title={ticket.customer.name ?? email(ticket.customer.email)}>
                  {ticket.customer.name ?? email(ticket.customer.email)}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink3">
                  <StatusPill status={ticket.status} />
                  <span className="capitalize">{ticket.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${priorityDotClass(ticket.priority)}`} />
                    {ticketPriorityLabel(ticket.priority)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ticket.assignedTo ?? 'Unassigned'}</span>
                  <span aria-hidden="true">·</span>
                  <span title={fmtDateTime(ticket.updatedAt)}>{relativeTime(ticket.updatedAt)}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the list says when it holds nothing.
 *
 * A queue that is empty and a queue that is filtered away are two different
 * things, and they are told apart: the second one offers the way back.
 */
export function TicketInboxEmpty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (!filtered) {
    return <EmptyState title="The queue is empty." description="New tickets appear here as soon as a customer opens one." />;
  }
  return (
    <EmptyState
      title="No ticket matches these filters."
      description="Try another search, or clear the filters to see the whole queue again."
      action={
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
        >
          Clear the filters
        </button>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* the page                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The list of the queue.
 *
 * The desk itself is {@link TicketInbox}: it decides between the list and
 * the conversation of the address.
 */
export function TicketQueue({ selectedId = '', channel = 'tickets' }: TicketInboxProps) {
  const [filters, setFilters] = useState<TicketFilters>(EMPTY_TICKET_FILTERS);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [showEmails, setShowEmails] = useState(false);
  const columnChoices = [
    { key: 'ticket', label: 'Ticket', required: true }, { key: 'customer', label: 'Customer' }, { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'assigned', label: 'Assigned to' },
    { key: 'activity', label: 'Last activity' }, { key: 'actions', label: 'Actions' },
  ];
  const columnPicker = useColumnPicker('tickets', columnChoices);

  // The search is read after a short pause, so a word that is being typed
  // does not ask the server for a page after every letter.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      // A new search starts at the first page of the queue.
      setCursorStack((stack) => (stack.length ? [] : stack));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const cursor = cursorStack[cursorStack.length - 1] ?? '';
  const pageIndex = cursorStack.length;

  const list = useAsync(
    (signal) =>
      get<{
        tickets: TicketRow[];
        total?: number;
        pagination?: { limit: number; nextCursor: string | null; hasMore: boolean };
      }>('/admin/tickets', buildTicketListQuery({ ...filters, search: debouncedSearch, cursor }), signal),
    [debouncedSearch, filters, cursor],
  );

  const tickets = list.data?.tickets ?? [];
  const total = list.data?.total;
  const pagination = list.data?.pagination;
  const hasMore = Boolean(pagination?.hasMore);
  const nextCursor = pagination?.nextCursor ?? '';

  const updateFilters = (patch: Partial<TicketFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setCursorStack([]);
  };

  const clearFilters = () => {
    setFilters(EMPTY_TICKET_FILTERS);
    setSearch('');
    setDebouncedSearch('');
    setCursorStack([]);
  };
  const applyView = (saved: SavedQuery) => {
    const nextSearch = typeof saved.search === 'string' ? saved.search : '';
    const nextLimit = saved.limit === 50 || saved.limit === 100 ? saved.limit : 25;
    setSearch(nextSearch); setDebouncedSearch(nextSearch);
    setFilters({
      ...EMPTY_TICKET_FILTERS,
      status: typeof saved.status === 'string' ? saved.status : '', category: typeof saved.category === 'string' ? saved.category : '',
      priority: typeof saved.priority === 'string' ? saved.priority : '', assigned: typeof saved.assigned === 'string' ? saved.assigned : '',
      sort: saved.sort === 'oldest' ? 'oldest' : 'recent', limit: nextLimit,
    });
    setCursorStack([]);
  };

  const nextPage = () => {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, nextCursor]);
  };

  const previousPage = () => setCursorStack((stack) => stack.slice(0, -1));

  const filtersAreActive = hasActiveFilters({ ...filters, search: debouncedSearch });
  const channelLabel = TICKET_CHANNELS.find((entry) => entry.id === channel)?.label ?? 'Tickets';

  const firstRow = pageIndex * filters.limit + (tickets.length ? 1 : 0);
  const lastRow = pageIndex * filters.limit + tickets.length;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'} in the inbox`} />
      <Panel
        title="Support inbox"
        description="Every ticket of the platform. The newest activity comes first unless the order is changed."
        actionBelow
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-line bg-s2 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
              {channelLabel}
            </span>
            <button
              type="button"
              aria-pressed={showEmails}
              onClick={() => setShowEmails((value) => !value)}
              title="Revealing addresses is a local view change. The API has no endpoint that records a reveal."
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-[13px] font-semibold text-ink2 transition-colors duration-[180ms] hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc lg:h-[38px]"
            >
              <Icon name={showEmails ? 'eyeOff' : 'eye'} size={15} />
              {showEmails ? 'Mask e-mails' : 'Show e-mails'}
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <ListPreferences scope="tickets" query={{ search: debouncedSearch, status: filters.status, category: filters.category, priority: filters.priority, assigned: filters.assigned, sort: filters.sort, limit: filters.limit }} onApply={applyView} columns={columnChoices} visibleColumns={columnPicker.visible} onToggleColumn={columnPicker.toggle} onResetColumns={columnPicker.reset} />
          {/* The search and the tabs of the states. */}
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="inbox-search" className="px-1 text-[14px] font-medium text-ink">
                Search
              </label>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3">
                  <Icon name="search" size={15} />
                </span>
                <input
                  id="inbox-search"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  aria-describedby="inbox-search-hint"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCursorStack([]);
                  }}
                  placeholder="Number, subject or customer"
                  className={`${denseInput} pl-10`}
                />
              </div>
              <p id="inbox-search-hint" className="px-1 text-[12.5px] text-ink3">
                Matches the number of the ticket, its subject and its customer.
              </p>
            </div>

            <Segmented
              ariaLabel="Filter the tickets by state"
              value={filters.status}
              onChange={(value) => updateFilters({ status: value })}
              options={TICKET_STATUS_FILTERS}
            />
          </div>

          {/* The other filters of the desk. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Category" htmlFor="inbox-category">
              <select
                id="inbox-category"
                value={filters.category}
                onChange={(event) => updateFilters({ category: event.target.value })}
                className={denseSelect}
              >
                {TICKET_CATEGORY_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority" htmlFor="inbox-priority">
              <select
                id="inbox-priority"
                value={filters.priority}
                onChange={(event) => updateFilters({ priority: event.target.value })}
                className={denseSelect}
              >
                {TICKET_PRIORITY_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assignment" htmlFor="inbox-assignment">
              <select
                id="inbox-assignment"
                value={filters.assigned}
                onChange={(event) => updateFilters({ assigned: event.target.value })}
                className={denseSelect}
              >
                {TICKET_ASSIGNMENT_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order" htmlFor="inbox-sort">
              <select
                id="inbox-sort"
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value })}
                className={denseSelect}
              >
                {TICKET_SORT_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {filtersAreActive && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-s2 px-4 py-3">
              <span className="text-[13.5px] text-ink2">The list is filtered.</span>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-[13px] font-semibold text-ink transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc lg:h-[38px]"
              >
                <Icon name="close" size={14} />
                Clear the filters
              </button>
            </div>
          )}

          {list.loading ? (
            <LoadingBlock rows={5} label="Loading the inbox" />
          ) : list.error ? (
            <ErrorState
              title="The inbox could not be loaded"
              message={list.error.message}
              onRetry={list.reload}
            />
          ) : !tickets.length ? (
            <TicketInboxEmpty filtered={filtersAreActive} onClear={clearFilters} />
          ) : (
            <div className="grid gap-3">
              <TicketInboxTable tickets={tickets} selectedId={selectedId} showEmails={showEmails} visibleColumns={columnPicker.visible} />
              <TicketInboxList tickets={tickets} selectedId={selectedId} showEmails={showEmails} />
            </div>
          )}

          {/* The pager of the queue. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-[12.5px] text-ink3">
              {tickets.length
                ? `Showing ${firstRow}–${lastRow} of ${typeof total === 'number' ? total : '?'} tickets`
                : 'No tickets on this page.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="inbox-page-size" className="text-[12.5px] text-ink3">
                Rows
              </label>
              <div className="w-[76px]">
                <select
                  id="inbox-page-size"
                  value={filters.limit}
                  onChange={(event) => updateFilters({ limit: Number(event.target.value) || 25 })}
                  className={denseSelect}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <SoftButton onClick={previousPage} disabled={pageIndex === 0}>
                Previous
              </SoftButton>
              <SoftButton onClick={nextPage} disabled={!hasMore}>
                Next
              </SoftButton>
            </div>
          </div>

          <p className="px-1 text-[12.5px] text-ink3">
            The list, the filters and the pager are read from <span className="font-mono">GET /api/admin/tickets</span>. The
            pages are walked with the cursor of the server.
          </p>
        </div>
      </Panel>
    </div>
  );
}

/**
 * The desk of the support.
 *
 * The desk is the inbox of the tickets, and it reads the address of the page:
 * an address that holds a ticket opens the conversation of that ticket, and
 * every other address shows the list.
 *
 * The old address of a conversation was `/admin/tickets?ticket=<id>`, and it
 * still opens the same conversation. When the dedicated route is in the
 * table of the routes, the address is replaced with it, so the conversation
 * keeps one address and the history of the browser works with it.
 */
export default function TicketInbox(props: TicketInboxProps = {}) {
  const { query, navigate } = useRouter();
  const deepLink = ticketIdFromQuery(query);

  useEffect(() => {
    if (!deepLink || !hasTicketDetailRoute()) return;
    navigate(ticketConversationPath(deepLink), { replace: true });
  }, [deepLink, navigate]);

  // A conversation that was opened with the old address is shown here while
  // the dedicated route is not in the table of the routes yet.
  if (deepLink) return <TicketDetail ticketId={deepLink} />;

  return <TicketQueue {...props} />;
}
