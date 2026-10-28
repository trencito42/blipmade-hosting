import { useEffect, useState } from 'react';
import { ApiError, get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import {
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Panel,
  Segmented,
  StatTile,
  StatusPill,
  useToast,
} from '../ui-app';
import {
  DASH,
  LiveRegion,
  can,
  denseGhost,
  denseInput,
  densePrimary,
  denseSelect,
  denseSoft,
  fmtDateTime,
  useAdminSession,
} from './Overview';
import type { TableColumn } from '../lib/table';

/**
 * The back office of the notifications of the platform.
 *
 * Five panels live here: the state of the deliveries, the ledger of the
 * messages, the history of the events, the catalogue of the templates with the
 * test message, and the groups with the activity of the last days.
 *
 * Two rules shape the whole page.
 *
 * The first one is the truth of the transport. When the relay is not
 * configured, the platform writes the messages to files, and a message that
 * sits in a file has not reached anybody. The page says so in words, and a
 * message of that state is never shown as one that was sent.
 *
 * The second one is the reach of the operator. The only message that leaves
 * the platform from here is the test message, and it goes to the one address
 * the operator types. There is no list of the customers of the platform and
 * there is no way to write to all of them.
 *
 * The interface never shows the text of a message that was sent, and never
 * any private value of the platform.
 */

/** How many rows a page of the API holds. */
const PAGE_SIZE = 50;

/**
 * The dense field of the values of a template.
 *
 * The values are JSON, so the field keeps the letters of a monospace font.
 */
const denseArea =
  'w-full scroll-mt-24 rounded-2xl bg-s2 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3';

/* -------------------------------------------------------------------------- */
/* the shapes the API sends                                                    */
/* -------------------------------------------------------------------------- */

/** The numbers of the notifications, as the API sends them. */
export interface NotificationOverview {
  /** How many messages wait to be sent. */
  queued: number;
  /** How many messages the relay took. */
  delivered: number;
  /** How many messages sit in a file of the server. */
  writtenToFile: number;
  /** How many messages could not be sent. */
  failed: number;
  /** How many events still wait to be dispatched. */
  eventsPending: number;
  /** How many events were dispatched. */
  eventsProcessed: number;
  /** How many events could not be dispatched. */
  eventsFailed: number;
  /** How many messages of the customers are still unread. */
  unread: number;
  /** The transport that is in use: the relay, or the file that stands in for it. */
  transport: 'smtp' | 'file';
  /** Whether this environment points at a relay at all. */
  relayConfigured: boolean;
  /** How many templates the catalogue holds. */
  templates: number;
}

/** One message of the ledger, as the API sends it. */
export interface NotificationDelivery {
  key: string;
  kind: string;
  to: string;
  state: 'queued' | 'delivered' | 'written-to-file' | 'failed';
  transport: string;
  attempts: number;
  errorClass: string | null;
  error: string | null;
  updatedAt: string;
  deliveredAt: string | null;
}

/** One event of the history, as the API sends it. */
export interface NotificationEvent {
  id: string;
  type: string;
  businessKey: string;
  userId: string | null;
  /** The customer the event belongs to, when the API names it. */
  customer?: { id: string; email: string } | null;
  state: string;
  /** The outcome of every channel of the event: sent, skipped or failed. */
  channels: Record<string, string>;
  attempts: number;
  lastError: string | null;
  occurredAt: string;
  processedAt: string | null;
}

/** One template of the catalogue, as the API sends it. */
export interface NotificationTemplate {
  id: string;
  version: number;
  category: string;
  subject: string;
  /** The names of the values the template needs. */
  placeholders: string[];
}

/** One group of messages, as the API sends it. */
export interface NotificationCategory {
  key: string;
  /** The name of the group, when the API names it. */
  label?: string;
  /** What the group is for, when the API says it. */
  description?: string;
  /** How important the messages of the group are. */
  classification?: string;
  /** How important the messages of the group are, when there are several. */
  classifications?: string[];
  events: number;
}

/** One day of the activity, as the API sends it. */
export interface NotificationTrendDay {
  date: string;
  delivered: number;
  failed: number;
  writtenToFile: number;
  events: number;
}

/** One group of the preferences, as the API sends it. */
export interface NotificationPreferenceGroup {
  key: string;
  /** Whether the group is a group of messages or a channel. */
  kind?: string;
  enabled: boolean;
  count: number;
}

/** The preview of a template, as the API sends it. */
export interface NotificationPreview {
  subject: string;
  preheader: string;
  text: string;
  html: string;
  /** The names of the values the template did not get. */
  missing: string[];
}

/** The answer of an action of the server: it can carry a refusal. */
interface NotificationAnswer {
  ok?: boolean;
  key?: string;
  message?: string;
  /** The words of the server about what it did. */
  notice?: string;
  /** The state the message ended in. */
  state?: string;
  /** Whether the message really left the platform. */
  delivered?: boolean;
}

/* -------------------------------------------------------------------------- */
/* the words of the operator                                                   */
/* -------------------------------------------------------------------------- */

/** The states a message of the ledger can be in. */
export const NOTIFICATION_DELIVERY_STATES = [
  { value: '', label: 'Every state' },
  { value: 'queued', label: 'Queued' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'written-to-file', label: 'Written to a file' },
  { value: 'failed', label: 'Failed' },
];

/** The states an event of the history can be in. */
export const NOTIFICATION_EVENT_STATES = [
  { value: '', label: 'Every state' },
  { value: 'pending', label: 'Pending' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed' },
];

/**
 * The state of a message, in the words of the operator.
 *
 * A message that sits in a file of the server has not reached anybody, so it
 * is never called delivered.
 */
export function notificationDeliveryStateLabel(state: string): string {
  switch (state) {
    case 'queued':
      return 'Queued';
    case 'delivered':
      return 'Delivered';
    case 'written-to-file':
      return 'Written to a file';
    case 'failed':
      return 'Failed';
    default:
      return state;
  }
}

/** The colour of a state of a message, so every state is read the same way. */
export function notificationDeliveryStateTone(state: string): string {
  switch (state) {
    case 'delivered':
      return 'active';
    case 'written-to-file':
      return 'degraded';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * The transport of a message, in words.
 *
 * A message of the file transport is not on its way to anybody, so the words
 * say that it was not sent.
 */
export function notificationTransportLabel(transport: string): string {
  if (transport === 'file') return 'File — not sent';
  if (transport === 'smtp') return 'Relay';
  return transport;
}

/** The outcome of a channel of an event, in words. */
export function notificationChannelOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'sent':
      return 'Sent';
    case 'skipped':
      return 'Skipped';
    case 'failed':
      return 'Failed';
    case 'written':
      return 'Written to a file';
    default:
      return outcome;
  }
}

/** The colour of the outcome of a channel. */
export function notificationChannelOutcomeTone(outcome: string): string {
  switch (outcome) {
    case 'sent':
      return 'active';
    case 'failed':
      return 'failed';
    case 'written':
      return 'caution';
    default:
      return 'neutral';
  }
}

/**
 * True when the platform writes the messages to files instead of sending
 * them.
 *
 * The relay can be absent while the transport still names a relay, and the
 * other way round, so both facts are asked.
 */
export function notificationIsFileTransport(overview: NotificationOverview): boolean {
  return !overview.relayConfigured || overview.transport === 'file';
}

/* -------------------------------------------------------------------------- */
/* the calls the page makes                                                    */
/* -------------------------------------------------------------------------- */

/** The query of a list of the API, as the API wants it. */
export type NotificationListQuery = Record<string, string | number | undefined>;

/**
 * The numbers of the notifications, read from the answer of the API.
 *
 * The server sends the counters of the messages in one group and the counters
 * of the events in another one, and it names the unread messages in another
 * way than the rest. The page reads both ways, so the numbers on the screen
 * are always the numbers of the server and never numbers of the page.
 *
 * When the server says nothing about the transport, the page believes that
 * nothing is being sent: a silent transport must never be shown as a relay.
 */
export function notificationOverview(answer: unknown): NotificationOverview {
  const root = (answer && typeof answer === 'object' ? answer : {}) as Record<string, unknown>;
  const overview = (root.overview && typeof root.overview === 'object' ? root.overview : root) as Record<string, unknown>;
  const deliveries = (overview.deliveries && typeof overview.deliveries === 'object'
    ? overview.deliveries
    : {}) as Record<string, unknown>;
  const events = (overview.events && typeof overview.events === 'object' ? overview.events : {}) as Record<string, unknown>;
  const transport = (overview.transport && typeof overview.transport === 'object'
    ? overview.transport
    : {}) as Record<string, unknown>;

  const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  const name =
    typeof overview.transport === 'string'
      ? overview.transport
      : typeof transport.transport === 'string'
        ? transport.transport
        : 'file';
  const relay =
    typeof overview.relayConfigured === 'boolean'
      ? overview.relayConfigured
      : typeof transport.relayConfigured === 'boolean'
        ? transport.relayConfigured
        : false;

  return {
    queued: count(overview.queued ?? deliveries.queued),
    delivered: count(overview.delivered ?? deliveries.delivered),
    writtenToFile: count(overview.writtenToFile ?? deliveries.writtenToFile),
    failed: count(overview.failed ?? deliveries.failed),
    eventsPending: count(overview.eventsPending ?? events.pending),
    eventsProcessed: count(overview.eventsProcessed ?? events.processed),
    eventsFailed: count(overview.eventsFailed ?? events.failed),
    unread: count(overview.unread ?? overview.unreadNotifications),
    transport: name === 'smtp' ? 'smtp' : 'file',
    relayConfigured: relay,
    templates: count(overview.templates),
  };
}

/** The query of the ledger of the messages. */
export function notificationDeliveriesQuery(input: {
  state?: string;
  kind?: string;
  recipient?: string;
  cursor?: string;
  limit?: number;
}): NotificationListQuery {
  return {
    limit: input.limit,
    cursor: input.cursor,
    state: input.state || undefined,
    kind: input.kind?.trim() || undefined,
    q: input.recipient?.trim() || undefined,
  };
}

/** The query of the history of the events. */
export function notificationEventsQuery(input: {
  kind?: string;
  state?: string;
  customer?: string;
  cursor?: string;
  limit?: number;
}): NotificationListQuery {
  return {
    limit: input.limit,
    cursor: input.cursor,
    type: input.kind?.trim() || undefined,
    state: input.state || undefined,
    userId: input.customer?.trim() || undefined,
  };
}

/** The first page of the ledger of the messages. */
export function listNotificationDeliveries(
  query: NotificationListQuery,
  signal?: AbortSignal,
): Promise<{ deliveries: NotificationDelivery[]; nextCursor: string | null }> {
  return get<{ deliveries: NotificationDelivery[]; nextCursor: string | null }>(
    '/admin/notifications/deliveries',
    query,
    signal,
  );
}

/** The first page of the history of the events. */
export function listNotificationEvents(
  query: NotificationListQuery,
  signal?: AbortSignal,
): Promise<{ events: NotificationEvent[]; nextCursor: string | null }> {
  return get<{ events: NotificationEvent[]; nextCursor: string | null }>('/admin/notifications/events', query, signal);
}

/**
 * The words of a refusal of the server.
 *
 * The page never writes a refusal of its own: the words of the server are the
 * ones the operator reads.
 */
function notificationRefusal(answer: NotificationAnswer | null | undefined, fallback: string): string {
  const words = answer?.message?.trim();
  return words ? words : fallback;
}

/**
 * Repeats a message that failed.
 *
 * Without a message nothing is repeated and the server is never asked: a
 * repeat always needs a confirmation.
 */
export async function runNotificationDeliveryRetry(delivery: NotificationDelivery | null): Promise<boolean> {
  if (!delivery) return false;
  const answer = await post<NotificationAnswer>(
    `/admin/notifications/deliveries/${encodeURIComponent(delivery.key)}/retry`,
  );
  if (!answer || answer.ok !== true) {
    throw new ApiError(409, 'refused', notificationRefusal(answer, 'The server refused to repeat this message.'));
  }
  return true;
}

/**
 * Dispatches an event that failed again.
 *
 * Without an event nothing is dispatched and the server is never asked.
 */
export async function runNotificationEventRetry(event: NotificationEvent | null): Promise<boolean> {
  if (!event) return false;
  const answer = await post<NotificationAnswer>(`/admin/notifications/events/${encodeURIComponent(event.id)}/retry`);
  if (!answer || answer.ok !== true) {
    throw new ApiError(409, 'refused', notificationRefusal(answer, 'The server refused to dispatch this event again.'));
  }
  return true;
}

/**
 * Looks at a template with the values the operator gives it.
 *
 * The call never sends anything: it only renders the template.
 */
export async function runNotificationTemplatePreview(
  id: string,
  payload: Record<string, unknown>,
): Promise<NotificationPreview> {
  const answer = await post<Record<string, unknown>>(
    `/admin/notifications/templates/${encodeURIComponent(id)}/preview`,
    { payload },
  );
  // The server may send the rendering on its own or inside a group.
  const rendered = (
    answer?.preview && typeof answer.preview === 'object' ? answer.preview : (answer ?? {})
  ) as Record<string, unknown>;
  const missing = Array.isArray(answer?.missing) ? answer.missing : [];
  return {
    subject: typeof rendered.subject === 'string' ? rendered.subject : '',
    preheader: typeof rendered.preheader === 'string' ? rendered.preheader : '',
    text: typeof rendered.text === 'string' ? rendered.text : '',
    html: typeof rendered.html === 'string' ? rendered.html : '',
    missing: missing.filter((value): value is string => typeof value === 'string'),
  };
}

/**
 * Checks a template with the values the operator gives it.
 *
 * The call never sends anything: it only names the values that are missing.
 */
export async function runNotificationTemplateValidate(
  id: string,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const answer = await post<{ missing?: string[] }>(
    `/admin/notifications/templates/${encodeURIComponent(id)}/validate`,
    { payload },
  );
  return Array.isArray(answer?.missing) ? answer.missing : [];
}

/** What the server did with the test message. */
export interface NotificationTestSendResult {
  /** The key of the message in the ledger. */
  key: string | null;
  /** The words of the server about what it did with the message. */
  notice: string;
  /** The state the message ended in. */
  state: string | null;
  /** Whether the message really left the platform. */
  delivered: boolean;
}

/**
 * Sends the test message to the one address the operator typed.
 *
 * This is the only message that leaves the platform from the back office, and
 * it leaves it for one address only. There is no way to write to the
 * customers of the platform from here.
 */
export async function runNotificationTestSend(input: {
  to: string;
  templateId: string;
  payload?: Record<string, unknown>;
}): Promise<NotificationTestSendResult> {
  const answer = await post<NotificationAnswer>('/admin/notifications/test-send', {
    to: input.to.trim(),
    templateId: input.templateId,
    ...(input.payload ? { payload: input.payload } : {}),
  });
  if (!answer || answer.ok !== true) {
    throw new ApiError(409, 'refused', notificationRefusal(answer, 'The server refused the test message.'));
  }
  return {
    key: answer.key ?? null,
    notice: answer.notice ?? '',
    state: answer.state ?? null,
    delivered: answer.delivered === true,
  };
}

/**
 * The values the operator typed, read as JSON.
 *
 * An empty field means no values at all, which is not the same as a wrong
 * field, so it carries no error.
 */
export function notificationPayload(
  text: string,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, payload: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'The values are not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'The values must be an object of names and values.' };
  }
  return { ok: true, payload: parsed as Record<string, unknown> };
}

/* -------------------------------------------------------------------------- */
/* the panels                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The numbers of the notifications.
 *
 * The transport is written out in words, because a number does not say that
 * nothing is being sent: the messages of a platform without a relay sit in
 * files of the server.
 */
export function NotificationOverviewPanel({ overview }: { overview: NotificationOverview }) {
  const file = notificationIsFileTransport(overview);

  return (
    <div className="grid gap-3">
      <section aria-label="The state of the messages" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Queued" value={overview.queued} hint="Waiting to be sent." />
        <StatTile label="Delivered" value={overview.delivered} hint="The relay took the message." />
        <StatTile
          label="Written to a file"
          value={overview.writtenToFile}
          hint="On the server only — nobody received it."
        />
        <StatTile label="Failed" value={overview.failed} hint="The message could not be sent." />
      </section>

      <section aria-label="The state of the events" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Events pending" value={overview.eventsPending} hint="Events the platform still owes." />
        <StatTile label="Events processed" value={overview.eventsProcessed} hint="Events that were dispatched." />
        <StatTile label="Events failed" value={overview.eventsFailed} hint="Events that could not be dispatched." />
        <StatTile label="Unread" value={overview.unread} hint="Messages of the customers that are still unread." />
        <StatTile label="Templates" value={overview.templates} hint="Templates the catalogue holds." />
        <StatTile
          label="Transport"
          value={file ? 'Files' : 'Relay'}
          hint={file ? 'The messages are written to files of the server.' : 'The messages leave the platform through the relay.'}
        />
      </section>

      <div role="status" className={file ? 'rounded-2xl bg-warn/12 px-4 py-3' : 'rounded-2xl bg-acc-bg px-4 py-3'}>
        <p className={file ? 'text-[14.5px] font-semibold text-warn' : 'text-[14.5px] font-semibold text-acc'}>
          {file ? 'The relay is not configured.' : 'The relay is configured.'}
        </p>
        <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink2">
          {file
            ? 'The messages are written to files on the server — nothing is being sent to anybody. A message that sits in a file has not been delivered.'
            : 'The messages leave the platform through the relay.'}
        </p>
      </div>
    </div>
  );
}

/**
 * The state of a message, with the truth of a message of a file.
 *
 * A message that sits in a file carries the words that say so, so no one
 * reads it as a message that arrived.
 */
function DeliveryState({ delivery }: { delivery: NotificationDelivery }) {
  return (
    <span className="block min-w-0">
      <StatusPill
        status={notificationDeliveryStateTone(delivery.state)}
        label={notificationDeliveryStateLabel(delivery.state)}
      />
      {delivery.state === 'written-to-file' && (
        <span className="mt-1 block text-[11.5px] leading-relaxed text-ink3">On the server only — nobody received it.</span>
      )}
    </span>
  );
}

/**
 * The ledger of the messages.
 *
 * The ledger shows the state of every message and nothing of what a message
 * says: the text of a message never comes to the back office.
 */
export function NotificationDeliveriesTable({
  deliveries,
  mayRetry,
  onRetry,
}: {
  deliveries: NotificationDelivery[];
  mayRetry: boolean;
  onRetry: (delivery: NotificationDelivery) => void;
}) {
  const columns: TableColumn<NotificationDelivery>[] = [
    {
      key: 'kind',
      header: 'Kind',
      truncate: true,
      render: (delivery: NotificationDelivery) => (
        <span className="font-mono text-[12.5px] text-ink" title={delivery.kind}>
          {delivery.kind}
        </span>
      ),
    },
    {
      key: 'to',
      header: 'Recipient',
      truncate: true,
      render: (delivery: NotificationDelivery) => (
        <span className="font-mono text-[12.5px] text-ink" title={delivery.to}>
          {delivery.to}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      nowrap: true,
      render: (delivery: NotificationDelivery) => <DeliveryState delivery={delivery} />,
    },
    {
      key: 'transport',
      header: 'Transport',
      nowrap: true,
      render: (delivery: NotificationDelivery) => (
        <span className="text-[12.5px] text-ink2">{notificationTransportLabel(delivery.transport)}</span>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      nowrap: true,
      render: (delivery: NotificationDelivery) => (
        <span className="font-mono text-[12.5px] text-ink2">{delivery.attempts}</span>
      ),
    },
    {
      key: 'failure',
      header: 'Failure',
      className: 'max-w-[260px]',
      render: (delivery: NotificationDelivery) =>
        delivery.error ? (
          <span className="block break-words text-[12.5px] text-bad">{delivery.error}</span>
        ) : (
          <span className="text-ink3">{DASH}</span>
        ),
    },
    {
      key: 'updatedAt',
      header: 'Last change',
      nowrap: true,
      render: (delivery: NotificationDelivery) => (
        <span className="text-[12.5px] text-ink2">{fmtDateTime(delivery.updatedAt)}</span>
      ),
    },
    ...(mayRetry
      ? ([
          {
            key: 'action',
            header: 'Action',
            align: 'right',
            render: (delivery: NotificationDelivery) =>
              delivery.state === 'failed' ? (
                <button type="button" onClick={() => onRetry(delivery)} className={denseGhost}>
                  Retry
                </button>
              ) : (
                <span className="text-ink3">{DASH}</span>
              ),
          },
        ] satisfies TableColumn<NotificationDelivery>[])
      : []),
  ];

  return (
    <>
      <DataTable<NotificationDelivery>
        rows={deliveries}
        rowKey={(delivery) => delivery.key}
        minWidth="1080px"
        columns={columns}
      />
      <CardList<NotificationDelivery> rows={deliveries} rowKey={(delivery) => delivery.key}>
        {(delivery) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="w-0 min-w-0 flex-1">
                <p className="truncate font-mono text-[13.5px] font-medium text-ink" title={delivery.kind}>
                  {delivery.kind}
                </p>
                <p className="truncate font-mono text-[12px] text-ink3" title={delivery.to}>
                  {delivery.to}
                </p>
              </div>
              <DeliveryState delivery={delivery} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-ink3">Transport</dt>
                <dd className="text-ink2">{notificationTransportLabel(delivery.transport)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Attempts</dt>
                <dd className="font-mono text-ink2">{delivery.attempts}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Last change</dt>
                <dd className="text-ink2">{fmtDateTime(delivery.updatedAt)}</dd>
              </div>
              {delivery.error && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-ink3">Failure</dt>
                  <dd className="break-words text-bad">{delivery.error}</dd>
                </div>
              )}
            </dl>
            {mayRetry && delivery.state === 'failed' && (
              <div className="mt-3">
                <button type="button" onClick={() => onRetry(delivery)} className={denseGhost}>
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </CardList>
    </>
  );
}

/** The outcome of every channel of an event. */
function ChannelsCell({ channels }: { channels: Record<string, string> }) {
  const entries = Object.entries(channels ?? {});
  if (!entries.length) return <span className="text-ink3">{DASH}</span>;
  return (
    <span className="block min-w-0">
      {entries.map(([channel, outcome]) => (
        <span key={channel} className="block truncate text-[12.5px] text-ink2">
          <span className="text-ink3">{channel}: </span>
          <StatusPill status={notificationChannelOutcomeTone(outcome)} label={notificationChannelOutcomeLabel(outcome)} />
        </span>
      ))}
    </span>
  );
}

/**
 * The history of the events.
 *
 * The history shows what happened to every event and how every channel ended.
 * The facts of an event are not shown: they belong to the customer.
 */
export function NotificationEventsTable({
  events,
  mayRetry,
  onRetry,
}: {
  events: NotificationEvent[];
  mayRetry: boolean;
  onRetry: (event: NotificationEvent) => void;
}) {
  const columns: TableColumn<NotificationEvent>[] = [
    {
      key: 'type',
      header: 'Event',
      truncate: true,
      render: (event: NotificationEvent) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[12.5px] text-ink" title={event.type}>
            {event.type}
          </span>
          <span className="block truncate font-mono text-[11.5px] text-ink3" title={event.businessKey}>
            {event.businessKey}
          </span>
        </span>
      ),
    },
    {
      key: 'userId',
      header: 'Customer',
      truncate: true,
      render: (event: NotificationEvent) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[12.5px] text-ink2">{event.userId ?? DASH}</span>
          {event.customer?.email && (
            <span className="block truncate font-mono text-[11.5px] text-ink3">{event.customer.email}</span>
          )}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      nowrap: true,
      render: (event: NotificationEvent) => <StatusPill status={event.state} label={event.state} />,
    },
    {
      key: 'channels',
      header: 'Channels',
      className: 'max-w-[220px]',
      render: (event: NotificationEvent) => <ChannelsCell channels={event.channels} />,
    },
    {
      key: 'attempts',
      header: 'Attempts',
      nowrap: true,
      render: (event: NotificationEvent) => (
        <span className="font-mono text-[12.5px] text-ink2">{event.attempts}</span>
      ),
    },
    {
      key: 'occurredAt',
      header: 'Happened',
      nowrap: true,
      render: (event: NotificationEvent) => (
        <span className="text-[12.5px] text-ink2">{fmtDateTime(event.occurredAt)}</span>
      ),
    },
    ...(mayRetry
      ? ([
          {
            key: 'action',
            header: 'Action',
            align: 'right',
            render: (event: NotificationEvent) =>
              event.state === 'failed' ? (
                <button type="button" onClick={() => onRetry(event)} className={denseGhost}>
                  Retry
                </button>
              ) : (
                <span className="text-ink3">{DASH}</span>
              ),
          },
        ] satisfies TableColumn<NotificationEvent>[])
      : []),
  ];

  return (
    <>
      <DataTable<NotificationEvent> rows={events} rowKey={(event) => event.id} minWidth="1080px" columns={columns} />
      <CardList<NotificationEvent> rows={events} rowKey={(event) => event.id}>
        {(event) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="w-0 min-w-0 flex-1">
                <p className="truncate font-mono text-[13.5px] font-medium text-ink" title={event.type}>
                  {event.type}
                </p>
                <p className="truncate font-mono text-[12px] text-ink3" title={event.businessKey}>
                  {event.businessKey}
                </p>
              </div>
              <StatusPill status={event.state} label={event.state} />
            </div>
            <dl className="mt-2 grid gap-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-ink3">Customer</dt>
                <dd className="truncate font-mono text-ink2">
                  {event.userId ?? DASH}
                  {event.customer?.email ? ` · ${event.customer.email}` : ''}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Channels</dt>
                <dd className="min-w-0">
                  <ChannelsCell channels={event.channels} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Happened</dt>
                <dd className="text-ink2">{fmtDateTime(event.occurredAt)}</dd>
              </div>
              {event.lastError && (
                <div className="min-w-0">
                  <dt className="text-ink3">Last failure</dt>
                  <dd className="break-words text-bad">{event.lastError}</dd>
                </div>
              )}
            </dl>
            {mayRetry && event.state === 'failed' && (
              <div className="mt-3">
                <button type="button" onClick={() => onRetry(event)} className={denseGhost}>
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </CardList>
    </>
  );
}

/** The values a template needs, as a list of names. */
function PlaceholderList({ placeholders }: { placeholders: string[] }) {
  if (!placeholders?.length) return <span className="text-ink3">{DASH}</span>;
  return (
    <span className="block min-w-0">
      {placeholders.map((placeholder) => (
        <span key={placeholder} className="mr-1.5 inline-block font-mono text-[12px] text-ink2">
          {placeholder}
        </span>
      ))}
    </span>
  );
}

/**
 * The catalogue of the templates.
 *
 * The catalogue names the id, the version, the group, the subject and the
 * values each template needs. The text of a template is only shown by the
 * preview, and only with the values the operator gives it.
 */
export function NotificationTemplateCatalogue({
  templates,
  onPreview,
}: {
  templates: NotificationTemplate[];
  onPreview: (template: NotificationTemplate) => void;
}) {
  const columns: TableColumn<NotificationTemplate>[] = [
    {
      key: 'id',
      header: 'Id',
      truncate: true,
      render: (template: NotificationTemplate) => (
        <span className="font-mono text-[12.5px] text-ink" title={template.id}>
          {template.id}
        </span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      nowrap: true,
      render: (template: NotificationTemplate) => (
        <span className="font-mono text-[12.5px] text-ink2">{template.version}</span>
      ),
    },
    {
      key: 'category',
      header: 'Group',
      nowrap: true,
      render: (template: NotificationTemplate) => (
        <span className="text-[12.5px] text-ink2">{template.category}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      truncate: true,
      render: (template: NotificationTemplate) => (
        <span className="text-[13px] text-ink" title={template.subject}>
          {template.subject}
        </span>
      ),
    },
    {
      key: 'placeholders',
      header: 'Values',
      className: 'max-w-[260px]',
      render: (template: NotificationTemplate) => <PlaceholderList placeholders={template.placeholders} />,
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (template: NotificationTemplate) => (
        <button type="button" onClick={() => onPreview(template)} className={denseGhost}>
          Preview
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable<NotificationTemplate>
        rows={templates}
        rowKey={(template) => template.id}
        minWidth="900px"
        columns={columns}
      />
      <CardList<NotificationTemplate> rows={templates} rowKey={(template) => template.id}>
        {(template) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <p className="w-0 min-w-0 flex-1 truncate font-mono text-[13.5px] font-medium text-ink" title={template.id}>
                {template.id}
              </p>
              <span className="shrink-0 font-mono text-[12px] text-ink3">v{template.version}</span>
            </div>
            <p className="truncate text-[12.5px] text-ink3">{template.category}</p>
            <p className="mt-1 break-words text-[13px] text-ink">{template.subject}</p>
            <div className="mt-1.5">
              <PlaceholderList placeholders={template.placeholders} />
            </div>
            <div className="mt-3">
              <button type="button" onClick={() => onPreview(template)} className={denseGhost}>
                Preview
              </button>
            </div>
          </div>
        )}
      </CardList>
    </>
  );
}

/**
 * The preview of a template.
 *
 * The preview shows what the template says with the values the operator gives
 * it, and it sends nothing at all. The values that are missing are named, so
 * the operator knows why a preview looks empty.
 */
export function NotificationTemplatePreviewPanel({
  template,
  values,
  onValuesChange,
  onPreview,
  preview,
  busy,
  error,
  mayPreview,
}: {
  template: NotificationTemplate | null;
  values: string;
  onValuesChange: (value: string) => void;
  onPreview: () => void;
  preview: NotificationPreview | null;
  busy?: boolean;
  error?: string | null;
  /** False when the role of the operator does not hold the right to preview. */
  mayPreview?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="px-1 text-[13.5px] font-medium text-ink">Preview</p>
        <p className="mt-1 break-words text-[13px] leading-relaxed text-ink2">
          {template
            ? `The template "${template.id}" is rendered with the values below. Nothing is sent: the message goes nowhere from here.`
            : 'Choose a template of the catalogue to look at it. Nothing is sent: the message goes nowhere from here.'}
        </p>
      </div>

      {template && (
        <>
          <Field
            label="Values"
            htmlFor="notifications-template-values"
            hint={'JSON, for example {"name":"Ana"}. The names of the values are the ones the catalogue names.'}
          >
            <textarea
              id="notifications-template-values"
              value={values}
              onChange={(event) => onValuesChange(event.target.value)}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              placeholder="{}"
              className={denseArea}
            />
          </Field>
          <div>
            <button type="button" onClick={onPreview} disabled={busy || mayPreview === false} className={densePrimary}>
              {busy ? 'Rendering…' : 'Preview the template'}
            </button>
          </div>
        </>
      )}

      {error && <NotificationError message={error} />}

      {preview && template && (
        <div className="grid gap-3">
          {preview.missing.length > 0 && (
            <p role="status" className="rounded-2xl bg-warn/12 px-4 py-3 text-[13.5px] leading-relaxed text-warn">
              These values are missing: {preview.missing.join(', ')}.
            </p>
          )}
          <div className="rounded-2xl bg-s2 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Subject</p>
            <p className="mt-1 break-words text-[14px] font-medium text-ink">{preview.subject}</p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Preheader</p>
            <p className="mt-1 break-words text-[13px] text-ink2">{preview.preheader}</p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Text</p>
            <pre className="mt-1 max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-ink2">
              {preview.text}
            </pre>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">HTML</p>
            <pre className="mt-1 max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-ink2">
              {preview.html}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The test message.
 *
 * The operator types one address and picks one template. The message goes to
 * that address and to nobody else: there is no list of the customers of the
 * platform here, and there is no way to write to all of them.
 */
export function NotificationTestSendPanel({
  templates,
  to,
  onToChange,
  templateId,
  onTemplateIdChange,
  values,
  onValuesChange,
  onSend,
  busy,
  error,
  sent,
  maySend,
}: {
  templates: NotificationTemplate[];
  to: string;
  onToChange: (value: string) => void;
  templateId: string;
  onTemplateIdChange: (value: string) => void;
  values: string;
  onValuesChange: (value: string) => void;
  onSend: () => void;
  busy?: boolean;
  error?: string | null;
  sent?: NotificationTestSendResult | null;
  /** False when the role of the operator does not hold the right to send. */
  maySend?: boolean;
}) {
  const ready = to.trim().length > 0 && templateId.length > 0;

  return (
    <div className="grid gap-3">
      <div>
        <p className="px-1 text-[13.5px] font-medium text-ink">Test message</p>
        <p className="mt-1 break-words text-[13px] leading-relaxed text-ink2">
          The message goes to the one address below. No customer of the platform is on this form, and nothing here writes to
          the customers of the platform.
        </p>
      </div>

      <Field label="Address" htmlFor="notifications-test-to" hint="The one address that receives the test message.">
        <input
          id="notifications-test-to"
          type="email"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="address@example.com"
          className={denseInput}
        />
      </Field>

      <Field label="Template" htmlFor="notifications-test-template">
        <select
          id="notifications-test-template"
          value={templateId}
          onChange={(event) => onTemplateIdChange(event.target.value)}
          className={denseSelect}
        >
          <option value="">Choose a template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.subject} ({template.id})
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Values (optional)"
        htmlFor="notifications-test-values"
        hint={'JSON, for example {"name":"Ana"}. Empty values are fine: the preview of the template names what is missing.'}
      >
        <textarea
          id="notifications-test-values"
          value={values}
          onChange={(event) => onValuesChange(event.target.value)}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder="{}"
          className={denseArea}
        />
      </Field>

      <div>
        <button type="button" onClick={onSend} disabled={busy || !ready || maySend === false} className={densePrimary}>
          {busy ? 'Sending…' : 'Send the test message'}
        </button>
      </div>

      {!ready && (
        <p className="px-1 text-[12.5px] text-ink3">An address and a template are needed before the message can be sent.</p>
      )}

      {error && <NotificationError message={error} />}

      {sent && (
        <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3">
          <p className="text-[13.5px] font-semibold text-acc">
            {sent.delivered ? 'The test message left the platform.' : 'The test message did not leave the platform.'}
          </p>
          {sent.notice && <p className="mt-1 break-words text-[13px] leading-relaxed text-ink2">{sent.notice}</p>}
          {sent.key && (
            <p className="mt-1 break-words text-[12.5px] text-ink3">
              Its key is <span className="font-mono text-ink2">{sent.key}</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The groups of messages and how many events each of them holds. */
export function NotificationCategoriesPanel({ categories }: { categories: NotificationCategory[] }) {
  return (
    <DataTable<NotificationCategory>
      rows={categories}
      rowKey={(category) => category.key}
      minWidth="760px"
      columns={[
        {
          key: 'key',
          header: 'Group',
          truncate: true,
          render: (category: NotificationCategory) => (
            <span className="block min-w-0">
              <span className="block truncate font-mono text-[12.5px] text-ink">{category.key}</span>
              {category.label && <span className="block truncate text-[12px] text-ink3">{category.label}</span>}
            </span>
          ),
        },
        {
          key: 'description',
          header: 'Description',
          className: 'max-w-[320px]',
          render: (category: NotificationCategory) =>
            category.description ? (
              <span className="block break-words text-[12.5px] text-ink2">{category.description}</span>
            ) : (
              <span className="text-ink3">{DASH}</span>
            ),
        },
        {
          key: 'classification',
          header: 'Kind',
          nowrap: true,
          render: (category: NotificationCategory) => {
            const kinds = category.classifications?.length
              ? category.classifications
              : category.classification
                ? [category.classification]
                : [];
            if (!kinds.length) return <span className="text-ink3">{DASH}</span>;
            return (
              <span className="flex flex-wrap gap-1.5">
                {kinds.map((kind) => (
                  <StatusPill key={kind} status={kind} label={kind} />
                ))}
              </span>
            );
          },
        },
        {
          key: 'events',
          header: 'Events',
          nowrap: true,
          align: 'right',
          render: (category: NotificationCategory) => (
            <span className="font-mono text-[12.5px] text-ink2">{category.events}</span>
          ),
        },
      ]}
    />
  );
}

/** How many customers have every group of messages switched on. */
export function NotificationPreferencesPanel({ groups }: { groups: NotificationPreferenceGroup[] }) {
  return (
    <DataTable<NotificationPreferenceGroup>
      rows={groups}
      rowKey={(group) => group.key}
      minWidth="620px"
      columns={[
        {
          key: 'key',
          header: 'Group',
          nowrap: true,
          render: (group: NotificationPreferenceGroup) => (
            <span className="font-mono text-[12.5px] text-ink">{group.key}</span>
          ),
        },
        {
          key: 'kind',
          header: 'Kind',
          nowrap: true,
          render: (group: NotificationPreferenceGroup) => (
            <span className="text-[12.5px] text-ink2">{group.kind ?? 'group'}</span>
          ),
        },
        {
          key: 'enabled',
          header: 'State',
          nowrap: true,
          render: (group: NotificationPreferenceGroup) => (
            <StatusPill status={group.enabled ? 'active' : 'stopped'} label={group.enabled ? 'On' : 'Off'} />
          ),
        },
        {
          key: 'count',
          header: 'Customers',
          nowrap: true,
          align: 'right',
          render: (group: NotificationPreferenceGroup) => (
            <span className="font-mono text-[12.5px] text-ink2">{group.count}</span>
          ),
        },
      ]}
    />
  );
}

/** The activity of the last days. */
export function NotificationTrendsPanel({ days }: { days: NotificationTrendDay[] }) {
  return (
    <DataTable<NotificationTrendDay>
      rows={days}
      rowKey={(day) => day.date}
      minWidth="620px"
      columns={[
        {
          key: 'date',
          header: 'Day',
          nowrap: true,
          render: (day: NotificationTrendDay) => <span className="text-[12.5px] text-ink2">{day.date}</span>,
        },
        {
          key: 'events',
          header: 'Events',
          nowrap: true,
          align: 'right',
          render: (day: NotificationTrendDay) => <span className="font-mono text-[12.5px] text-ink2">{day.events}</span>,
        },
        {
          key: 'delivered',
          header: 'Delivered',
          nowrap: true,
          align: 'right',
          render: (day: NotificationTrendDay) => <span className="font-mono text-[12.5px] text-ink2">{day.delivered}</span>,
        },
        {
          key: 'writtenToFile',
          header: 'Written to a file',
          nowrap: true,
          align: 'right',
          render: (day: NotificationTrendDay) => (
            <span className="font-mono text-[12.5px] text-ink2">{day.writtenToFile}</span>
          ),
        },
        {
          key: 'failed',
          header: 'Failed',
          nowrap: true,
          align: 'right',
          render: (day: NotificationTrendDay) => <span className="font-mono text-[12.5px] text-ink2">{day.failed}</span>,
        },
      ]}
    />
  );
}

/** The end of a list that is walked with a cursor. */
export function NotificationPager({
  shown,
  hasMore,
  pending,
  onLoadMore,
}: {
  shown: number;
  hasMore: boolean;
  pending: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="px-1 text-[12.5px] text-ink3">{shown} shown.</p>
      {hasMore && (
        <button type="button" onClick={onLoadMore} disabled={pending} className={denseSoft}>
          {pending ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

/**
 * The failure of the API, with the words of the failure.
 *
 * The page never writes a failure of its own: the words of the server are the
 * ones the operator reads.
 */
export function NotificationError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
      {message}
    </p>
  );
}

/**
 * The confirmation of the repeat of a message.
 *
 * The message is given to the mail system only after the operator confirmed
 * it, so the dialog names the message that is repeated.
 */
export function NotificationDeliveryRetryDialog({
  delivery,
  busy,
  onConfirm,
  onCancel,
}: {
  delivery: NotificationDelivery | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!delivery) return null;
  return (
    <ConfirmDialog
      open
      title="Repeat this message?"
      description={`The message "${delivery.kind}" for ${delivery.to} is given to the mail system again. It was tried ${
        delivery.attempts
      } ${delivery.attempts === 1 ? 'time' : 'times'}.`}
      confirmLabel="Repeat the message"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/**
 * The confirmation of the dispatch of an event that failed.
 *
 * The event is given to the dispatcher only after the operator confirmed it.
 */
export function NotificationEventRetryDialog({
  event,
  busy,
  onConfirm,
  onCancel,
}: {
  event: NotificationEvent | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!event) return null;
  return (
    <ConfirmDialog
      open
      title="Dispatch this event again?"
      description={`The event "${event.type}" is given to the dispatcher again. It was tried ${event.attempts} ${
        event.attempts === 1 ? 'time' : 'times'
      }. The key of the event is ${event.businessKey}.`}
      confirmLabel="Dispatch the event again"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* the page                                                                    */
/* -------------------------------------------------------------------------- */

/** The panels of the page. */
export type NotificationTab = 'overview' | 'messages' | 'events' | 'templates' | 'groups';

const TABS: { value: NotificationTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'messages', label: 'Messages' },
  { value: 'events', label: 'Events' },
  { value: 'templates', label: 'Templates' },
  { value: 'groups', label: 'Groups' },
];

/**
 * A list of the API that is walked with a cursor.
 *
 * The rows of the pages that were walked are kept, so "Load more" adds to the
 * list on the screen instead of replacing it. The answer of the API replaces
 * the rows when the filters change, because it is another list.
 */
function useNotificationPage<T>(
  load: (cursor: string | undefined, signal: AbortSignal | undefined) => Promise<{ rows: T[]; nextCursor: string | null }>,
  deps: unknown[],
) {
  const first = useAsync(async (signal) => load(undefined, signal), deps);

  const [walked, setWalked] = useState<{ rows: T[]; cursor: string | null }>({ rows: [], cursor: null });

  useEffect(() => {
    const page = first.data;
    if (!page) return;
    setWalked({ rows: page.rows, cursor: page.nextCursor });
  }, [first.data]);

  const more = useAction(async () => {
    const cursor = walked.cursor;
    if (!cursor) return;
    const page = await load(cursor, undefined);
    setWalked((current) => ({ rows: [...current.rows, ...page.rows], cursor: page.nextCursor }));
  });

  return {
    rows: walked.rows,
    hasMore: Boolean(walked.cursor),
    loading: first.loading,
    error: first.error,
    reload: first.reload,
    loadMore: more.run,
    loadingMore: more.pending,
    errorMore: more.error,
  };
}

export default function EmailNotifications() {
  const session = useAdminSession();
  const toast = useToast();

  const [tab, setTab] = useState<NotificationTab>('overview');

  // The filters of the ledger of the messages.
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryKind, setDeliveryKind] = useState('');
  const [deliveryRecipient, setDeliveryRecipient] = useState('');
  const [appliedKind, setAppliedKind] = useState('');
  const [appliedRecipient, setAppliedRecipient] = useState('');

  // The filters of the history of the events.
  const [eventKind, setEventKind] = useState('');
  const [eventState, setEventState] = useState('');
  const [eventCustomer, setEventCustomer] = useState('');
  const [appliedEventKind, setAppliedEventKind] = useState('');
  const [appliedCustomer, setAppliedCustomer] = useState('');

  // The message and the event that wait for a confirmation.
  const [pendingDelivery, setPendingDelivery] = useState<NotificationDelivery | null>(null);
  const [pendingEvent, setPendingEvent] = useState<NotificationEvent | null>(null);

  // The template that is looked at, and the values the operator gives it.
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null);
  const [previewValues, setPreviewValues] = useState('');
  const [previewResult, setPreviewResult] = useState<NotificationPreview | null>(null);

  // The test message: one address, one template.
  const [sendTo, setSendTo] = useState('');
  const [sendTemplateId, setSendTemplateId] = useState('');
  const [sendValues, setSendValues] = useState('');
  const [sent, setSent] = useState<NotificationTestSendResult | null>(null);

  // A word is not a request per letter, so the text filters wait a moment.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedKind(deliveryKind.trim()), 300);
    return () => clearTimeout(timer);
  }, [deliveryKind]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedRecipient(deliveryRecipient.trim()), 300);
    return () => clearTimeout(timer);
  }, [deliveryRecipient]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedEventKind(eventKind.trim()), 300);
    return () => clearTimeout(timer);
  }, [eventKind]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedCustomer(eventCustomer.trim()), 300);
    return () => clearTimeout(timer);
  }, [eventCustomer]);

  const overview = useAsync((signal) => get<unknown>('/admin/notifications/overview', undefined, signal), []);

  const templateList = useAsync(
    (signal) => get<{ templates: NotificationTemplate[] }>('/admin/notifications/templates', undefined, signal),
    [],
  );

  const categories = useAsync(
    (signal) => get<{ categories: NotificationCategory[] }>('/admin/notifications/categories', undefined, signal),
    [],
  );

  const trends = useAsync(
    (signal) => get<{ days: NotificationTrendDay[] }>('/admin/notifications/trends', undefined, signal),
    [],
  );

  const preferences = useAsync(
    (signal) => get<{ groups: NotificationPreferenceGroup[] }>('/admin/notifications/preferences', undefined, signal),
    [],
  );

  const deliveries = useNotificationPage<NotificationDelivery>(
    async (cursor, signal) => {
      const page = await listNotificationDeliveries(
        notificationDeliveriesQuery({
          state: deliveryState,
          kind: appliedKind,
          recipient: appliedRecipient,
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        }),
        signal,
      );
      return { rows: page.deliveries ?? [], nextCursor: page.nextCursor ?? null };
    },
    [deliveryState, appliedKind, appliedRecipient],
  );

  const events = useNotificationPage<NotificationEvent>(
    async (cursor, signal) => {
      const page = await listNotificationEvents(
        notificationEventsQuery({
          kind: appliedEventKind,
          state: eventState,
          customer: appliedCustomer,
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        }),
        signal,
      );
      return { rows: page.events ?? [], nextCursor: page.nextCursor ?? null };
    },
    [appliedEventKind, eventState, appliedCustomer],
  );

  // The server asks for "infrastructure.write" for every action that repeats
  // something, that renders a template or that sends the test message.
  const mayWrite = can(session.staff, 'infrastructure.write');

  const retryDelivery = useAction(async (delivery: NotificationDelivery) => {
    await runNotificationDeliveryRetry(delivery);
    toast.push('The message was given to the mail system again.', 'ok');
    deliveries.reload();
    return true;
  });

  const retryEvent = useAction(async (event: NotificationEvent) => {
    await runNotificationEventRetry(event);
    toast.push('The event was given to the dispatcher again.', 'ok');
    events.reload();
    return true;
  });

  const preview = useAction(async (template: NotificationTemplate, values: string) => {
    const parsed = notificationPayload(values);
    if (!parsed.ok) throw new ApiError(0, 'invalid_payload', parsed.error);
    const rendered = await runNotificationTemplatePreview(template.id, parsed.payload);
    // The answer of the server names the values that are missing. When it does
    // not, the template is asked for them.
    const missing = rendered.missing.length
      ? rendered.missing
      : await runNotificationTemplateValidate(template.id, parsed.payload);
    const result = { ...rendered, missing };
    setPreviewResult(result);
    return result;
  });

  const send = useAction(async () => {
    const parsed = notificationPayload(sendValues);
    if (!parsed.ok) throw new ApiError(0, 'invalid_payload', parsed.error);
    const result = await runNotificationTestSend({
      to: sendTo,
      templateId: sendTemplateId,
      payload: parsed.payload,
    });
    setSent(result);
    toast.push('The test message was given to the server.', 'ok');
    return result;
  });

  const templates = templateList.data?.templates ?? [];
  const numbers = notificationOverview(overview.data);
  // The transport is only known when the server has answered: a page that is
  // still loading must never claim that nothing is being sent.
  const file = overview.data ? notificationIsFileTransport(numbers) : false;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${deliveries.rows.length} messages and ${events.rows.length} events shown`} />

      {file && (
        <div role="status" className="rounded-2xl bg-warn/12 px-4 py-3">
          <p className="text-[14px] font-semibold text-warn">The relay is not configured.</p>
          <p className="mt-1 break-words text-[13px] leading-relaxed text-ink2">
            The messages are written to files on the server — nothing is being sent to anybody.
          </p>
        </div>
      )}

      <Segmented ariaLabel="The panels of the notifications" options={TABS} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Panel
          title="The overview"
          description="The state of the messages and of the events, and the transport that carries them."
        >
          {overview.loading ? (
            <LoadingBlock rows={3} label="Loading the overview" />
          ) : overview.error ? (
            <ErrorState
              title="The overview could not be loaded"
              message={overview.error.message}
              onRetry={overview.reload}
            />
          ) : overview.data ? (
            <NotificationOverviewPanel overview={numbers} />
          ) : null}
        </Panel>
      )}

      {tab === 'messages' && (
        <Panel
          title="Messages"
          description="The ledger of the messages. A message that sits in a file of the server has not reached anybody."
        >
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="State" htmlFor="notifications-delivery-state">
                <select
                  id="notifications-delivery-state"
                  value={deliveryState}
                  onChange={(event) => setDeliveryState(event.target.value)}
                  className={denseSelect}
                >
                  {NOTIFICATION_DELIVERY_STATES.map((state) => (
                    <option key={state.value} value={state.value}>
                      {state.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kind" htmlFor="notifications-delivery-kind">
                <input
                  id="notifications-delivery-kind"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  value={deliveryKind}
                  onChange={(event) => setDeliveryKind(event.target.value)}
                  placeholder="invoice.paid"
                  className={denseInput}
                />
              </Field>
              <Field label="Recipient" htmlFor="notifications-delivery-recipient">
                <input
                  id="notifications-delivery-recipient"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  value={deliveryRecipient}
                  onChange={(event) => setDeliveryRecipient(event.target.value)}
                  placeholder="address@example.com"
                  className={denseInput}
                />
              </Field>
            </div>

            {deliveries.loading ? (
              <LoadingBlock rows={3} label="Loading the messages" />
            ) : deliveries.error ? (
              <ErrorState
                title="The messages could not be loaded"
                message={deliveries.error.message}
                onRetry={deliveries.reload}
              />
            ) : !deliveries.rows.length ? (
              <EmptyState
                title="No message matches these filters."
                description="Clear the state, the kind or the recipient to see more of the messages."
              />
            ) : (
              <div className="grid gap-3">
                <NotificationDeliveriesTable
                  deliveries={deliveries.rows}
                  mayRetry={mayWrite}
                  onRetry={(delivery) => setPendingDelivery(delivery)}
                />
                <NotificationPager
                  shown={deliveries.rows.length}
                  hasMore={deliveries.hasMore}
                  pending={deliveries.loadingMore}
                  onLoadMore={() => void deliveries.loadMore()}
                />
              </div>
            )}

            {!mayWrite && (
              <p className="px-1 text-[13px] text-ink3">
                Your role does not hold &quot;infrastructure.write&quot;, so a message cannot be repeated from here.
              </p>
            )}

            <NotificationError message={deliveries.errorMore} />
            <NotificationError message={retryDelivery.error} />
          </div>
        </Panel>
      )}

      {tab === 'events' && (
        <Panel title="Events" description="The history of the events and how every channel of them ended.">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Kind" htmlFor="notifications-event-kind">
                <input
                  id="notifications-event-kind"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  value={eventKind}
                  onChange={(event) => setEventKind(event.target.value)}
                  placeholder="invoice.paid"
                  className={denseInput}
                />
              </Field>
              <Field label="State" htmlFor="notifications-event-state">
                <select
                  id="notifications-event-state"
                  value={eventState}
                  onChange={(event) => setEventState(event.target.value)}
                  className={denseSelect}
                >
                  {NOTIFICATION_EVENT_STATES.map((state) => (
                    <option key={state.value} value={state.value}>
                      {state.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Customer" htmlFor="notifications-event-customer">
                <input
                  id="notifications-event-customer"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  value={eventCustomer}
                  onChange={(event) => setEventCustomer(event.target.value)}
                  placeholder="the id of the customer"
                  className={denseInput}
                />
              </Field>
            </div>

            {events.loading ? (
              <LoadingBlock rows={3} label="Loading the events" />
            ) : events.error ? (
              <ErrorState title="The events could not be loaded" message={events.error.message} onRetry={events.reload} />
            ) : !events.rows.length ? (
              <EmptyState
                title="No event matches these filters."
                description="Clear the kind, the state or the customer to see more of the events."
              />
            ) : (
              <div className="grid gap-3">
                <NotificationEventsTable
                  events={events.rows}
                  mayRetry={mayWrite}
                  onRetry={(event) => setPendingEvent(event)}
                />
                <NotificationPager
                  shown={events.rows.length}
                  hasMore={events.hasMore}
                  pending={events.loadingMore}
                  onLoadMore={() => void events.loadMore()}
                />
              </div>
            )}

            {!mayWrite && (
              <p className="px-1 text-[13px] text-ink3">
                Your role does not hold &quot;infrastructure.write&quot;, so an event cannot be dispatched again from here.
              </p>
            )}

            <NotificationError message={events.errorMore} />
            <NotificationError message={retryEvent.error} />
          </div>
        </Panel>
      )}

      {tab === 'templates' && (
        <Panel
          title="Templates"
          description="The catalogue of the templates. A preview shows what a template says and sends nothing."
        >
          <div className="grid gap-4">
            <div className="grid gap-3">
              {templateList.loading ? (
                <LoadingBlock rows={3} label="Loading the templates" />
              ) : templateList.error ? (
                <ErrorState
                  title="The templates could not be loaded"
                  message={templateList.error.message}
                  onRetry={templateList.reload}
                />
              ) : !templates.length ? (
                <EmptyState title="The catalogue holds no template yet." />
              ) : (
                <NotificationTemplateCatalogue
                  templates={templates}
                  onPreview={(template) => {
                    setPreviewTemplate(template);
                    setPreviewResult(null);
                    preview.clearError();
                  }}
                />
              )}
            </div>

            <div className="rounded-2xl bg-s2 p-4">
              <NotificationTemplatePreviewPanel
                template={previewTemplate}
                values={previewValues}
                onValuesChange={setPreviewValues}
                onPreview={() => {
                  if (!previewTemplate) return;
                  void preview.run(previewTemplate, previewValues);
                }}
                preview={previewResult}
                busy={preview.pending}
                error={preview.error}
                mayPreview={mayWrite}
              />
            </div>

            <div className="rounded-2xl bg-s2 p-4">
              <NotificationTestSendPanel
                templates={templates}
                to={sendTo}
                onToChange={setSendTo}
                templateId={sendTemplateId}
                onTemplateIdChange={setSendTemplateId}
                values={sendValues}
                onValuesChange={setSendValues}
                onSend={() => {
                  void send.run();
                }}
                busy={send.pending}
                error={send.error}
                sent={sent}
                maySend={mayWrite}
              />
            </div>

            {!mayWrite && (
              <p className="px-1 text-[13px] text-ink3">
                Your role does not hold &quot;infrastructure.write&quot;, so a template cannot be previewed and a test
                message cannot be sent from here.
              </p>
            )}
          </div>
        </Panel>
      )}

      {tab === 'groups' && (
        <div className="grid gap-4">
          <Panel title="The groups" description="The groups of messages and how many events each of them holds.">
            {categories.loading ? (
              <LoadingBlock rows={3} label="Loading the groups" />
            ) : categories.error ? (
              <ErrorState
                title="The groups could not be loaded"
                message={categories.error.message}
                onRetry={categories.reload}
              />
            ) : (
              <NotificationCategoriesPanel categories={categories.data?.categories ?? []} />
            )}
          </Panel>

          <Panel title="The preferences" description="How many customers have every group of messages switched on.">
            {preferences.loading ? (
              <LoadingBlock rows={3} label="Loading the preferences" />
            ) : preferences.error ? (
              <ErrorState
                title="The preferences could not be loaded"
                message={preferences.error.message}
                onRetry={preferences.reload}
              />
            ) : (
              <NotificationPreferencesPanel groups={preferences.data?.groups ?? []} />
            )}
          </Panel>

          <Panel title="The activity of the last days" description="The messages of every day and the events of that day.">
            {trends.loading ? (
              <LoadingBlock rows={3} label="Loading the activity" />
            ) : trends.error ? (
              <ErrorState
                title="The activity could not be loaded"
                message={trends.error.message}
                onRetry={trends.reload}
              />
            ) : (
              <NotificationTrendsPanel days={trends.data?.days ?? []} />
            )}
          </Panel>
        </div>
      )}

      <NotificationDeliveryRetryDialog
        delivery={pendingDelivery}
        busy={retryDelivery.pending}
        onCancel={() => setPendingDelivery(null)}
        onConfirm={() => {
          if (!pendingDelivery) return;
          // The dialog closes when the message was repeated and when the
          // server refused it, so the words of the refusal are read outside.
          void retryDelivery.run(pendingDelivery).finally(() => setPendingDelivery(null));
        }}
      />

      <NotificationEventRetryDialog
        event={pendingEvent}
        busy={retryEvent.pending}
        onCancel={() => setPendingEvent(null)}
        onConfirm={() => {
          if (!pendingEvent) return;
          void retryEvent.run(pendingEvent).finally(() => setPendingEvent(null));
        }}
      />
    </div>
  );
}
