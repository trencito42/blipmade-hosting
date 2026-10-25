/**
 * The back office of the notifications, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The page is rendered on the
 * server, without a browser, which is enough to see what the staff is told.
 *
 * The API is stubbed: no call ever leaves the machine, and every call is
 * recorded, so the test can see what the page asks the server for.
 *
 * Nine things are checked here:
 *
 *   1. the overview shows the numbers and says plainly that the messages are
 *      written to files when the transport is the file;
 *   2. a message in the state `written-to-file` is never shown as delivered;
 *   3. the ledger is filtered and paginated;
 *   4. the retry of a failed message asks for a confirmation;
 *   5. the retry of a failed event asks for a confirmation;
 *   6. the catalogue of the templates shows the id, the group and the values,
 *      and the preview renders without sending anything;
 *   7. the test send asks for the address and never offers a list of customers;
 *   8. no amount, no private value and no text of a message is written in the
 *      source of the page;
 *   9. the interface never offers a way to send to the customers of the
 *      platform.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

/** The page under test, as the test uses it. */
interface NotificationAdminUi {
  default: (props: Record<string, unknown>) => unknown;
  NotificationOverviewPanel: (props: Record<string, unknown>) => unknown;
  NotificationDeliveriesTable: (props: Record<string, unknown>) => unknown;
  NotificationEventsTable: (props: Record<string, unknown>) => unknown;
  NotificationTemplateCatalogue: (props: Record<string, unknown>) => unknown;
  NotificationTemplatePreviewPanel: (props: Record<string, unknown>) => unknown;
  NotificationTestSendPanel: (props: Record<string, unknown>) => unknown;
  NotificationDeliveryRetryDialog: (props: Record<string, unknown>) => unknown;
  NotificationEventRetryDialog: (props: Record<string, unknown>) => unknown;
  NotificationPager: (props: Record<string, unknown>) => unknown;
  NotificationCategoriesPanel: (props: Record<string, unknown>) => unknown;
  NotificationPreferencesPanel: (props: Record<string, unknown>) => unknown;
  NotificationTrendsPanel: (props: Record<string, unknown>) => unknown;
  notificationDeliveryStateLabel: (state: string) => string;
  notificationTransportLabel: (transport: string) => string;
  notificationOverview: (answer: unknown) => {
    queued: number;
    delivered: number;
    writtenToFile: number;
    failed: number;
    eventsPending: number;
    eventsProcessed: number;
    eventsFailed: number;
    unread: number;
    transport: string;
    relayConfigured: boolean;
    templates: number;
  };
  notificationDeliveriesQuery: (input: {
    state?: string;
    kind?: string;
    recipient?: string;
    cursor?: string;
    limit?: number;
  }) => Record<string, string | number | undefined>;
  notificationEventsQuery: (input: {
    kind?: string;
    state?: string;
    customer?: string;
    cursor?: string;
    limit?: number;
  }) => Record<string, string | number | undefined>;
  listNotificationDeliveries: (query: Record<string, string | number | undefined>) => Promise<unknown>;
  listNotificationEvents: (query: Record<string, string | number | undefined>) => Promise<unknown>;
  runNotificationDeliveryRetry: (delivery: unknown) => Promise<unknown>;
  runNotificationEventRetry: (event: unknown) => Promise<unknown>;
  runNotificationTemplatePreview: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
  runNotificationTemplateValidate: (id: string, payload: Record<string, unknown>) => Promise<string[]>;
  runNotificationTestSend: (input: {
    to: string;
    templateId: string;
    payload?: Record<string, unknown>;
  }) => Promise<{ key: string | null; notice: string; state: string | null; delivered: boolean }>;
  notificationPayload: (text: string) => { ok: boolean; payload?: Record<string, unknown>; error?: string };
}

let ui: NotificationAdminUi;
let server: ViteDevServer;

/** The calls the page made to the server, while the test watches them. */
const calls: { url: string; method: string; body: string | null }[] = [];

/** The numbers of the notifications, when the relay is not configured. */
const FILE_OVERVIEW = {
  queued: 3,
  delivered: 12,
  writtenToFile: 5,
  failed: 1,
  eventsPending: 2,
  eventsProcessed: 40,
  eventsFailed: 1,
  unread: 7,
  transport: 'file',
  relayConfigured: false,
  templates: 7,
};

/** The numbers of the notifications, when the relay is configured. */
const RELAY_OVERVIEW = { ...FILE_OVERVIEW, transport: 'smtp', relayConfigured: true, writtenToFile: 0 };

/**
 * The numbers of the notifications, as the server sends them: the counters
 * of the messages in one group, the counters of the events in another one and
 * the transport in a third one.
 */
const API_OVERVIEW = {
  transport: { transport: 'file', relayConfigured: false, sending: false, notice: 'No relay is configured.' },
  deliveries: { queued: 3, delivered: 12, writtenToFile: 5, failed: 1, total: 21 },
  events: { pending: 2, processed: 40, failed: 1, total: 43 },
  unreadNotifications: 7,
  templates: 7,
};

/** A message that the relay took. */
const DELIVERED = {
  key: 'md_1',
  kind: 'invoice.paid',
  to: 'ana@example.com',
  state: 'delivered',
  transport: 'smtp',
  attempts: 1,
  errorClass: null,
  error: null,
  updatedAt: '2026-10-25T02:00:00.000Z',
  deliveredAt: '2026-10-25T02:00:01.000Z',
};

/** A message that sits in a file of the server. */
const WRITTEN = {
  key: 'md_2',
  kind: 'invoice.failed',
  to: 'broken@example.com',
  state: 'written-to-file',
  transport: 'file',
  attempts: 2,
  errorClass: null,
  error: null,
  updatedAt: '2026-10-25T02:05:00.000Z',
  deliveredAt: null,
};

/** A message that failed and can be given to the mail system again. */
const FAILED = {
  key: 'md_3',
  kind: 'account.registered',
  to: 'new@example.com',
  state: 'failed',
  transport: 'smtp',
  attempts: 3,
  errorClass: 'smtp',
  error: 'the relay refused the message',
  updatedAt: '2026-10-25T02:10:00.000Z',
  deliveredAt: null,
};

/** The first page of the ledger of the messages. */
const DELIVERIES = [DELIVERED, WRITTEN, FAILED];

/** An event that was dispatched. */
const EVENT_DONE = {
  id: 'ev_1',
  type: 'invoice.paid',
  businessKey: 'invoice:inv_9',
  userId: 'cu_1',
  state: 'processed',
  channels: { email: 'sent', in_app: 'skipped' },
  attempts: 1,
  lastError: null,
  occurredAt: '2026-10-25T01:00:00.000Z',
  processedAt: '2026-10-25T01:00:02.000Z',
};

/** An event that failed and can be given to the dispatcher again. */
const EVENT_FAILED = {
  id: 'ev_2',
  type: 'hosting.instance_stopped',
  businessKey: 'instance:vm_3',
  userId: 'cu_2',
  state: 'failed',
  channels: { email: 'failed', in_app: 'skipped' },
  attempts: 3,
  lastError: 'the relay refused the message',
  occurredAt: '2026-10-24T22:00:00.000Z',
  processedAt: null,
};

/** The first page of the history of the events. */
const EVENTS = [EVENT_DONE, EVENT_FAILED];

/** The catalogue of the templates. */
const TEMPLATES = [
  {
    id: 'invoice.paid',
    version: 3,
    category: 'ordersBilling',
    subject: 'Your invoice is paid',
    placeholders: ['name', 'invoiceNumber'],
  },
  {
    id: 'account.registered',
    version: 1,
    category: 'accountSecurity',
    subject: 'Welcome to blipmade',
    placeholders: ['name'],
  },
];

/** The preview of a template, as the server sends it. */
const PREVIEW = {
  preview: {
    id: 'invoice.paid',
    subject: 'Your invoice is paid',
    preheader: 'The invoice INV-9 is paid',
    text: 'Hello Ana,\n\nThe invoice INV-9 is paid.',
    html: '<p>Hello Ana,</p><p>The invoice INV-9 is paid.</p>',
  },
};

/** The groups of the messages. */
const CATEGORIES = [
  {
    key: 'ordersBilling',
    classifications: ['essential'],
    channels: ['email'],
    eventTypes: 4,
    events: 120,
  },
  {
    key: 'productUpdates',
    classifications: ['marketing'],
    channels: ['email'],
    eventTypes: 2,
    events: 4,
  },
];

/** The activity of the last days. */
const TRENDS = [
  { date: '2026-10-24', delivered: 9, failed: 1, writtenToFile: 3, events: 12 },
  { date: '2026-10-25', delivered: 4, failed: 0, writtenToFile: 2, events: 6 },
];

/** The groups of the preferences. */
const PREFERENCES = [
  { key: 'accountSecurity', kind: 'group', enabled: true, count: 120 },
  { key: 'productUpdates', kind: 'group', enabled: false, count: 12 },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  ui = (await server.ssrLoadModule('/src/admin/EmailNotifications.tsx')) as NotificationAdminUi;

  // The client of the API reads the csrf cookie from the document, and the
  // document does not exist without a browser. The stub gives it the cookie
  // of a signed in member of staff and records the calls, so no call ever
  // leaves the machine.
  const globals = globalThis as unknown as {
    document: { cookie: string };
    fetch: (input: unknown, init?: { method?: string; body?: unknown }) => Promise<Response>;
  };
  globals.document = { cookie: 'bm_csrf=test-token' };
  globals.fetch = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : null });
    if (url.startsWith('/api/admin/notifications/overview')) return json({ overview: FILE_OVERVIEW });
    if (url.startsWith('/api/admin/notifications/deliveries/') && url.endsWith('/retry')) return json({ ok: true });
    if (url.startsWith('/api/admin/notifications/deliveries')) {
      return json({ deliveries: DELIVERIES, nextCursor: 'cursor-2' });
    }
    if (url.startsWith('/api/admin/notifications/events/') && url.endsWith('/retry')) {
      return json({ ok: true, dispatched: { channels: { email: 'sent' } } });
    }
    if (url.startsWith('/api/admin/notifications/events')) return json({ events: EVENTS, nextCursor: null });
    if (url.startsWith('/api/admin/notifications/templates/') && url.endsWith('/preview')) return json(PREVIEW);
    if (url.startsWith('/api/admin/notifications/templates/') && url.endsWith('/validate')) {
      return json({ missing: ['invoiceNumber'] });
    }
    if (url.startsWith('/api/admin/notifications/templates')) return json({ templates: TEMPLATES });
    if (url.startsWith('/api/admin/notifications/categories')) return json({ categories: CATEGORIES });
    if (url.startsWith('/api/admin/notifications/trends')) return json({ days: TRENDS });
    if (url.startsWith('/api/admin/notifications/preferences')) return json({ groups: PREFERENCES });
    if (url.startsWith('/api/admin/notifications/test-send')) {
      return json({
        ok: true,
        key: 'md_test',
        state: 'written-to-file',
        delivered: false,
        transport: 'file',
        notice: 'No relay is configured: the message was written to a file and nobody received it.',
      });
    }
    return json({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404);
  };
});

after(async () => {
  await server.close();
});

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

/**
 * The text of the page.
 *
 * React leaves a mark between two texts that follow each other, so the marks
 * are taken out before the text is read.
 */
function plain(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

/** The source of the page, as the test reads it. */
function pageSource(): string {
  return readFileSync(join(webRoot, 'src/admin/EmailNotifications.tsx'), 'utf8');
}

/**
 * The source of one function of the page.
 *
 * The slice lets the test look at one part of the page alone.
 */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `the function ${name} is missing from the page`);
  const end = source.indexOf('\nexport ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('the overview of the notifications', () => {
  it('shows the numbers and says plainly that the messages are written to files', () => {
    const html = plain(render(createElement(ui.NotificationOverviewPanel, { overview: FILE_OVERVIEW })));

    // The numbers of the states, of the events and of the catalogue.
    assert.match(html, /Queued/);
    assert.match(html, /Delivered/);
    assert.match(html, /Written to a file/);
    assert.match(html, /Failed/);
    assert.match(html, /Events pending/);
    assert.match(html, /Templates/);
    // The number of the pending events and the number of the templates.
    assert.match(html, />2</);
    assert.match(html, />7</);

    // The transport is written out in words: a number does not say that
    // nothing is being sent.
    assert.match(html, /The relay is not configured/);
    assert.match(html, /written to files on the server/);
    assert.match(html, /nothing is being sent to anybody/);
    // A message of a file is never called delivered.
    assert.match(html, /has not been delivered/);
  });

  it('says that the relay carries the messages when the relay is configured', () => {
    const html = plain(render(createElement(ui.NotificationOverviewPanel, { overview: RELAY_OVERVIEW })));
    assert.match(html, /The relay is configured/);
    assert.doesNotMatch(html, /nothing is being sent to anybody/);
    assert.doesNotMatch(html, /The relay is not configured/);
  });

  it('reads the numbers of the server in the two ways the server sends them', () => {
    // The server sends the counters in groups.
    const grouped = ui.notificationOverview({ overview: API_OVERVIEW });
    assert.equal(grouped.queued, 3);
    assert.equal(grouped.delivered, 12);
    assert.equal(grouped.writtenToFile, 5);
    assert.equal(grouped.failed, 1);
    assert.equal(grouped.eventsPending, 2);
    assert.equal(grouped.eventsProcessed, 40);
    assert.equal(grouped.eventsFailed, 1);
    assert.equal(grouped.unread, 7);
    assert.equal(grouped.templates, 7);
    assert.equal(grouped.transport, 'file');
    assert.equal(grouped.relayConfigured, false);

    // The server sends them flat.
    const flat = ui.notificationOverview({ overview: FILE_OVERVIEW });
    assert.deepEqual(flat, grouped);

    // An answer that says nothing never claims that something is being sent.
    const empty = ui.notificationOverview({});
    assert.equal(empty.transport, 'file');
    assert.equal(empty.relayConfigured, false);
    assert.equal(empty.queued, 0);
  });
});

describe('the ledger of the messages', () => {
  it('never shows a message of a file as delivered', () => {
    const html = plain(
      render(createElement(ui.NotificationDeliveriesTable, { deliveries: [WRITTEN], mayRetry: true, onRetry: () => {} })),
    );

    // The state is written as it is.
    assert.match(html, /Written to a file/);
    // The word delivered is nowhere near the message.
    assert.doesNotMatch(html, /delivered/i);
    // The transport says that the message was not sent.
    assert.match(html, /File — not sent/);
    assert.match(html, /nobody received it/);

    // The word of the state is the same in every place of the page.
    assert.equal(ui.notificationDeliveryStateLabel('written-to-file'), 'Written to a file');
    assert.equal(ui.notificationDeliveryStateLabel('delivered'), 'Delivered');
    assert.equal(ui.notificationTransportLabel('file'), 'File — not sent');
  });

  it('is filtered and paginated', async () => {
    // The filters are given to the API.
    calls.length = 0;
    await ui.listNotificationDeliveries(
      ui.notificationDeliveriesQuery({
        state: 'failed',
        kind: 'invoice.paid',
        recipient: 'ana@example.com',
        limit: 50,
      }),
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /^\/api\/admin\/notifications\/deliveries\?/);
    assert.match(calls[0]!.url, /state=failed/);
    assert.match(calls[0]!.url, /kind=invoice\.paid/);
    assert.match(calls[0]!.url, /q=ana%40example\.com/);

    // Nothing is sent of an empty filter.
    calls.length = 0;
    await ui.listNotificationDeliveries(ui.notificationDeliveriesQuery({ state: '', kind: '   ', recipient: '' }));
    assert.equal(calls.length, 1);
    assert.doesNotMatch(calls[0]!.url, /state=/);
    assert.doesNotMatch(calls[0]!.url, /kind=/);
    assert.doesNotMatch(calls[0]!.url, /q=/);

    // The next page is asked for with the cursor the API sent.
    calls.length = 0;
    await ui.listNotificationDeliveries(ui.notificationDeliveriesQuery({ cursor: 'cursor-2', limit: 50 }));
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /cursor=cursor-2/);

    // The events are filtered the same way.
    calls.length = 0;
    await ui.listNotificationEvents(
      ui.notificationEventsQuery({ kind: 'invoice.paid', state: 'failed', customer: 'cu_1', limit: 50 }),
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /^\/api\/admin\/notifications\/events\?/);
    assert.match(calls[0]!.url, /type=invoice\.paid/);
    assert.match(calls[0]!.url, /state=failed/);
    assert.match(calls[0]!.url, /userId=cu_1/);

    // The end of the list offers the next page only when there is one.
    const more = plain(
      render(createElement(ui.NotificationPager, { shown: 50, hasMore: true, pending: false, onLoadMore: () => {} })),
    );
    assert.match(more, /Load more/);

    const last = plain(
      render(createElement(ui.NotificationPager, { shown: 12, hasMore: false, pending: false, onLoadMore: () => {} })),
    );
    assert.doesNotMatch(last, /Load more/);
  });

  it('asks for a confirmation before the retry of a failed message', async () => {
    calls.length = 0;

    // The ledger offers the retry and asks the server nothing.
    const table = plain(
      render(createElement(ui.NotificationDeliveriesTable, { deliveries: [FAILED], mayRetry: true, onRetry: () => {} })),
    );
    assert.match(table, /Retry<\/button>/);
    assert.equal(calls.length, 0);

    // A message that is not failed has nothing to repeat.
    const quiet = plain(
      render(
        createElement(ui.NotificationDeliveriesTable, { deliveries: [DELIVERED, WRITTEN], mayRetry: true, onRetry: () => {} }),
      ),
    );
    assert.doesNotMatch(quiet, /Retry<\/button>/);

    // The confirmation names the message that is repeated.
    const dialog = plain(
      render(
        createElement(ui.NotificationDeliveryRetryDialog, {
          delivery: FAILED,
          busy: false,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      ),
    );
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /Repeat this message\?/);
    assert.match(dialog, /account\.registered/);
    assert.match(dialog, /new@example\.com/);

    // Without a message nothing is repeated and the server is not asked.
    assert.equal(await ui.runNotificationDeliveryRetry(null), false);
    assert.equal(calls.length, 0);

    // After the confirmation the message is given to the mail system again.
    const repeated = await ui.runNotificationDeliveryRetry(FAILED);
    assert.equal(repeated, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/notifications/deliveries/md_3/retry');
  });

  it('asks for a confirmation before the retry of a failed event', async () => {
    calls.length = 0;

    const table = plain(
      render(createElement(ui.NotificationEventsTable, { events: [EVENT_FAILED], mayRetry: true, onRetry: () => {} })),
    );
    assert.match(table, /Retry<\/button>/);
    // The outcome of every channel is written out.
    assert.match(table, /failed/i);
    assert.match(table, /skipped/i);
    assert.equal(calls.length, 0);

    const dialog = plain(
      render(
        createElement(ui.NotificationEventRetryDialog, {
          event: EVENT_FAILED,
          busy: false,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      ),
    );
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /Dispatch this event again\?/);
    assert.match(dialog, /hosting\.instance_stopped/);

    assert.equal(await ui.runNotificationEventRetry(null), false);
    assert.equal(calls.length, 0);

    const dispatched = await ui.runNotificationEventRetry(EVENT_FAILED);
    assert.equal(dispatched, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/notifications/events/ev_2/retry');
  });
});

describe('the templates of the back office', () => {
  it('shows the id, the group and the values of every template', () => {
    const html = plain(
      render(createElement(ui.NotificationTemplateCatalogue, { templates: TEMPLATES, onPreview: () => {} })),
    );
    assert.match(html, /invoice\.paid/);
    assert.match(html, /ordersBilling/);
    assert.match(html, /Your invoice is paid/);
    // The values the template needs are named.
    assert.match(html, /invoiceNumber/);
    assert.match(html, /account\.registered/);
    assert.match(html, /accountSecurity/);
  });

  it('renders the preview without sending anything', async () => {
    calls.length = 0;

    const preview = (await ui.runNotificationTemplatePreview('invoice.paid', { name: 'Ana' })) as {
      subject: string;
      preheader: string;
      text: string;
      html: string;
      missing: string[];
    };

    // The preview is asked for of the preview of the template, and of nothing
    // else: no message is sent from here.
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/notifications/templates/invoice.paid/preview');
    assert.equal(calls.filter((call) => call.url.includes('test-send')).length, 0);

    // The preview holds what the template says.
    assert.equal(preview.subject, 'Your invoice is paid');
    assert.match(preview.text, /The invoice INV-9 is paid/);
    assert.match(preview.html, /<p>Hello Ana/);

    // The values that are missing are named by the server.
    const missing = await ui.runNotificationTemplateValidate('invoice.paid', { name: 'Ana' });
    assert.deepEqual(missing, ['invoiceNumber']);
    assert.equal(calls[1]!.url, '/api/admin/notifications/templates/invoice.paid/validate');
    assert.equal(calls.filter((call) => call.url.includes('test-send')).length, 0);

    // The values that are missing are written out.
    const html = plain(
      render(
        createElement(ui.NotificationTemplatePreviewPanel, {
          template: TEMPLATES[0],
          values: '{"name":"Ana"}',
          onValuesChange: () => {},
          onPreview: () => {},
          preview: { ...preview, missing },
          busy: false,
          error: null,
        }),
      ),
    );
    assert.match(html, /These values are missing: invoiceNumber/);
    assert.match(html, /Your invoice is paid/);
    assert.match(html, /The invoice INV-9 is paid/);
    assert.match(html, /&lt;p&gt;Hello Ana/);
  });

  it('reads the values of the operator and refuses what is not JSON', () => {
    const empty = ui.notificationPayload('   ');
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.payload, {});

    const good = ui.notificationPayload('{"name":"Ana"}');
    assert.equal(good.ok, true);
    assert.deepEqual(good.payload, { name: 'Ana' });

    const wrong = ui.notificationPayload('not json');
    assert.equal(wrong.ok, false);
    assert.match(wrong.error ?? '', /not valid JSON/);

    const list = ui.notificationPayload('[1,2]');
    assert.equal(list.ok, false);
  });
});

describe('the test message of the back office', () => {
  it('asks for the address and never offers a list of customers', async () => {
    const html = plain(
      render(
        createElement(ui.NotificationTestSendPanel, {
          templates: TEMPLATES,
          to: '',
          onToChange: () => {},
          templateId: '',
          onTemplateIdChange: () => {},
          values: '',
          onValuesChange: () => {},
          onSend: () => {},
          busy: false,
          error: null,
          sent: null,
        }),
      ),
    );

    // The address is typed by the operator.
    assert.match(html, /type="email"/);
    assert.match(html, /Address/);
    // The templates are the only list of the form.
    assert.match(html, /<option value=""[^>]*>Choose a template<\/option>/);
    assert.equal((html.match(/<option/g) ?? []).length, TEMPLATES.length + 1);
    // There is no list of the customers of the platform.
    assert.doesNotMatch(html, /<datalist/);
    assert.doesNotMatch(html, /cu_1|ana@example\.com/);

    // The message goes only to the address the operator typed.
    calls.length = 0;
    const result = await ui.runNotificationTestSend({ to: 'ana@example.com', templateId: 'invoice.paid' });
    assert.equal(result.key, 'md_test');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/notifications/test-send');
    assert.match(calls[0]!.body ?? '', /"to":"ana@example\.com"/);
    assert.match(calls[0]!.body ?? '', /"templateId":"invoice\.paid"/);

    // The words of the server about the test message are the ones the
    // operator reads: a message of a file was not delivered.
    assert.match(result.notice, /written to a file and nobody received it/);
    assert.equal(result.delivered, false);

    const shown = plain(
      render(
        createElement(ui.NotificationTestSendPanel, {
          templates: TEMPLATES,
          to: 'ana@example.com',
          onToChange: () => {},
          templateId: 'invoice.paid',
          onTemplateIdChange: () => {},
          values: '',
          onValuesChange: () => {},
          onSend: () => {},
          busy: false,
          error: null,
          sent: result,
        }),
      ),
    );
    assert.match(shown, /The test message did not leave the platform/);
    assert.match(shown, /written to a file and nobody received it/);
  });
});

describe('the page of the notifications in the back office', () => {
  it('draws the panels of the page', () => {
    const html = plain(render(createElement(ui.default, {})));
    assert.match(html, /Overview/);
    assert.match(html, /Messages/);
    assert.match(html, /Events/);
    assert.match(html, /Templates/);
    assert.match(html, /Groups/);
  });

  it('shows the groups, the preferences and the activity', () => {
    const categories = plain(render(createElement(ui.NotificationCategoriesPanel, { categories: CATEGORIES })));
    assert.match(categories, /ordersBilling/);
    assert.match(categories, /essential/);
    assert.match(categories, /marketing/);
    assert.match(categories, />120</);

    const preferences = plain(render(createElement(ui.NotificationPreferencesPanel, { groups: PREFERENCES })));
    assert.match(preferences, /accountSecurity/);
    assert.match(preferences, />120</);
    assert.match(preferences, /Off/);

    const trends = plain(render(createElement(ui.NotificationTrendsPanel, { days: TRENDS })));
    assert.match(trends, /2026-10-24/);
    assert.match(trends, /Written to a file/);
  });

  it('writes no amount, no private value and no text of a message in its source', () => {
    const source = pageSource();

    // No private value of the platform is ever written in the page.
    assert.doesNotMatch(source, /api[_-]?key|password|secret|fingerprint|token/i);
    // No amount is written in the page: the page is not a bill. A dollar sign
    // next to a number would be an amount, a dollar sign of a template of the
    // page is not.
    assert.doesNotMatch(source, /[€£]|\bEUR\b|\bUSD\b|\bamount\b|\bprice\b|\bcost\b|\$\s?\d/i);
    // The text of a message never comes to the page.
    assert.doesNotMatch(source, /\bbody\b/i);

    // The ledger and the history read the state of a message and nothing of
    // what a message says.
    const ledger = functionSource(source, 'NotificationDeliveriesTable');
    assert.doesNotMatch(ledger, /\.(body|html|text|content|message|raw)\b/);
    const history = functionSource(source, 'NotificationEventsTable');
    assert.doesNotMatch(history, /\.(body|html|text|content|message|raw)\b/);
  });

  it('never offers a way to send to the customers of the platform', () => {
    const source = pageSource();

    // Every path of the page, as it is written in the source.
    const paths = [...source.matchAll(/['`](\/admin\/notifications[^'"`]*)['`]/g)].map((match) => match[1]!);

    // The paths that only read.
    const reading = new Set([
      '/admin/notifications/overview',
      '/admin/notifications/deliveries',
      '/admin/notifications/events',
      '/admin/notifications/templates',
      '/admin/notifications/categories',
      '/admin/notifications/trends',
      '/admin/notifications/preferences',
    ]);

    // The only path of the page that can write a message out of the platform
    // is the test message.
    const writing = paths.filter(
      (path) =>
        !reading.has(path) && !path.endsWith('/retry') && !path.endsWith('/preview') && !path.endsWith('/validate'),
    );
    assert.deepEqual(writing, ['/admin/notifications/test-send']);

    // The test message carries one address, one template and the values. It
    // never carries a list of the customers of the platform.
    const send = functionSource(source, 'runNotificationTestSend');
    assert.doesNotMatch(send, /recipients|addresses|customers|users|audience/i);
    assert.match(send, /to: input\.to\.trim\(\)/);

    // Nothing in the page offers a list of the customers to write to.
    assert.doesNotMatch(source, /datalist/i);
  });
});
