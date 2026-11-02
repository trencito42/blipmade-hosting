import type { TicketMessage } from '../../lib/api';
import { ROUTES } from '../../routes';
import { matchPath } from '../../router';

/**
 * The shared parts of the support desk of the back office.
 *
 * The desk will hold more than one channel: live chat and the other ways a
 * customer reaches the platform will come next to the tickets. The channel is
 * named here, so a new channel is a new entry of the same desk and not a
 * second helpdesk with its own rules.
 */

/** The channels the desk holds. The tickets are the one that exists today. */
export type TicketChannel = 'tickets';

export const TICKET_CHANNELS: { id: TicketChannel; label: string }[] = [{ id: 'tickets', label: 'Tickets' }];

/** The customer of a ticket, as the API sends it. */
export interface TicketCustomer {
  id: string;
  email: string;
  name: string | null;
}

/** One ticket of the queue, as the list of the staff sends it. */
export interface TicketRow {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  customer: TicketCustomer;
  instance: { id: string; name: string } | null;
  /** The name of the owner of the ticket, or nothing when it has none. */
  assignedTo: string | null;
  /** The id of the owner of the ticket. The list of the staff sends it. */
  assignedToId?: string | null;
}

/** One thing that happened to a ticket. */
export interface TicketEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

/**
 * The whole conversation of a ticket.
 *
 * The thread of the conversation comes from the endpoint of the customer,
 * because it holds the internal notes as well. The values of the enums come
 * in upper case there, so the page reads them through the helpers of this
 * file and never compares them by hand.
 */
export interface TicketConversation extends Omit<TicketRow, 'customer' | 'instance'> {
  instanceId: string | null;
  instanceName: string | null;
  mailServiceId: string | null;
  /** The name of the service the ticket is about, a server or a mail service. */
  serviceName: string | null;
  lastReplyAt: string | null;
  messages: TicketMessage[];
  events: TicketEvent[];
}

/* -------------------------------------------------------------------------- */
/* the values of the filters                                                    */
/* -------------------------------------------------------------------------- */

/** The states of a ticket, as the tabs of the inbox show them. */
export const TICKET_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'awaiting_customer', label: 'Awaiting customer' },
  { value: 'awaiting_staff', label: 'Awaiting staff' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'closed', label: 'Closed' },
];

/** The categories of a ticket. */
export const TICKET_CATEGORY_FILTERS = [
  { value: '', label: 'Every category' },
  { value: 'technical', label: 'Technical' },
  { value: 'billing', label: 'Billing' },
  { value: 'account', label: 'Account' },
  { value: 'abuse', label: 'Abuse report' },
  { value: 'other', label: 'Other' },
];

/** The priorities of a ticket. */
export const TICKET_PRIORITY_FILTERS = [
  { value: '', label: 'Every priority' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Who owns the tickets of the list. */
export const TICKET_ASSIGNMENT_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'unassigned', label: 'Unassigned' },
];

/** The order of the list. */
export const TICKET_SORT_FILTERS = [
  { value: 'recent', label: 'Recent activity first' },
  { value: 'oldest', label: 'Oldest activity first' },
];

/** The states a ticket can be put in. The API stores them in upper case. */
export const TICKET_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_CUSTOMER', label: 'Awaiting customer' },
  { value: 'AWAITING_STAFF', label: 'Awaiting staff' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'CLOSED', label: 'Closed' },
];

/* -------------------------------------------------------------------------- */
/* the small helpers                                                            */
/* -------------------------------------------------------------------------- */

/** The state of a ticket, in the small letters the filters use. */
export function ticketStatus(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

/** The priority of a ticket, in the small letters the filters use. */
export function ticketPriority(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

/** The name of a state, in the words the staff read. */
export function ticketStatusLabel(value: string | null | undefined): string {
  const key = ticketStatus(value);
  return TICKET_STATUS_FILTERS.find((entry) => entry.value === key)?.label ?? (key ? key.replace(/_/g, ' ') : 'Unknown');
}

/** The name of a priority, in the words the staff read. */
export function ticketPriorityLabel(value: string | null | undefined): string {
  const key = ticketPriority(value);
  return TICKET_PRIORITY_FILTERS.find((entry) => entry.value === key)?.label ?? (key ? key.replace(/_/g, ' ') : 'Unknown');
}

/** The colour of the dot that shows the state of a ticket at a glance. */
const STATUS_DOT: Record<string, string> = {
  open: 'bg-ink3',
  awaiting_customer: 'bg-warn',
  awaiting_staff: 'bg-warn',
  on_hold: 'bg-warn',
  closed: 'bg-acc',
};

/** The colour of the dot that shows the priority of a ticket at a glance. */
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-bad',
  high: 'bg-warn',
  normal: 'bg-ink3',
  low: 'bg-ink3/50',
};

/** The classes of the dot of a state. */
export function statusDotClass(status: string | null | undefined): string {
  return STATUS_DOT[ticketStatus(status)] ?? 'bg-ink3';
}

/** The classes of the dot of a priority. */
export function priorityDotClass(priority: string | null | undefined): string {
  return PRIORITY_DOT[ticketPriority(priority)] ?? 'bg-ink3';
}

/* -------------------------------------------------------------------------- */
/* the address of a conversation                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether the route table holds the dedicated route of a conversation.
 *
 * The route table is the one place that knows which addresses exist, so the
 * desk asks it instead of guessing. While the route is not in the table the
 * address with the query parameter is used, and it opens the same
 * conversation.
 */
const HAS_DETAIL_ROUTE = ROUTES.some((route) => matchPath(route.pattern, '/admin/tickets/probe') !== null);

/** True when the conversation of a ticket has an address of its own. */
export function hasTicketDetailRoute(): boolean {
  return HAS_DETAIL_ROUTE;
}

/**
 * The address of the conversation of a ticket.
 *
 * The dedicated route `/admin/tickets/:id` is the address of a conversation.
 * The address with the query parameter opens the same conversation and is
 * used while the route is not in the table yet.
 */
export function ticketConversationPath(ticketId: string): string {
  const encoded = encodeURIComponent(ticketId);
  return HAS_DETAIL_ROUTE ? `/admin/tickets/${encoded}` : `/admin/tickets?ticket=${encoded}`;
}

/**
 * The ticket of a deep link.
 *
 * The old address of a conversation was `/admin/tickets?ticket=<id>`, and it
 * is still read, so a link that was shared before still opens the same
 * conversation.
 */
export function ticketIdFromQuery(query: Record<string, string>): string {
  return (query.ticket ?? '').trim();
}

/* -------------------------------------------------------------------------- */
/* the list                                                                    */
/* -------------------------------------------------------------------------- */

/** The filters of the inbox. */
export interface TicketFilters {
  /**
   * The free text of the search: the number, the subject and the customer.
   * The page holds the text of the field apart from the text that is asked
   * for, so a word that is being typed does not ask for a page after every
   * letter.
   */
  search?: string;
  /** The state of the ticket. Empty means every state. */
  status: string;
  /** The category of the ticket. Empty means every category. */
  category: string;
  /** The priority of the ticket. Empty means every priority. */
  priority: string;
  /** "assigned", "unassigned" or empty for both. */
  assigned: string;
  /** "recent" or "oldest". */
  sort: string;
  /** The number of rows of a page. */
  limit: number;
  /** The cursor of the page. Empty is the first page. */
  cursor?: string;
}

/** The filters of the inbox when the page opens. */
export const EMPTY_TICKET_FILTERS: TicketFilters = {
  status: '',
  category: '',
  priority: '',
  assigned: '',
  sort: 'recent',
  limit: 25,
  cursor: '',
};

/**
 * The query of the list of the queue.
 *
 * The API reads the state, the category and the priority in upper case, and
 * the search is the text of the staff.
 */
export function buildTicketListQuery(filters: TicketFilters): Record<string, string | number | undefined> {
  const search = (filters.search ?? '').trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.status ? { status: filters.status.toUpperCase() } : {}),
    ...(filters.category ? { category: filters.category.toUpperCase() } : {}),
    ...(filters.priority ? { priority: filters.priority.toUpperCase() } : {}),
    ...(filters.assigned ? { assigned: filters.assigned } : {}),
    ...(filters.sort && filters.sort !== 'recent' ? { sort: filters.sort } : {}),
    limit: filters.limit,
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
}

/** True when a filter of the list is not the default one. */
export function hasActiveFilters(filters: TicketFilters): boolean {
  return Boolean(
    (filters.search ?? '').trim() ||
      filters.status ||
      filters.category ||
      filters.priority ||
      filters.assigned ||
      (filters.sort && filters.sort !== 'recent'),
  );
}
