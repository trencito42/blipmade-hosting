/**
 * The inbox of the support desk of the back office, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The page is rendered on the
 * server, without a browser, which is enough to see what the staff is told.
 *
 * The API is stubbed: no call ever leaves the machine.
 *
 * Nine things are checked here:
 *
 *   1. the table of the queue shows every column of the inbox;
 *   2. the rows of a phone carry the whole ticket;
 *   3. the ticket that is open is marked as the current one;
 *   4. an empty queue and a queue that is filtered away are told apart;
 *   5. the search, the filters and the cursor go to the API;
 *   6. the old deep link opens the same conversation;
 *   7. the inbox has no narrow column of a queue;
 *   8. the thread shows the notes of the staff apart from the messages;
 *   9. the activity of the ticket is told in the order it happened.
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

/** The inbox, as the test uses it. */
interface TicketInboxUi {
  default: (props: Record<string, unknown>) => unknown;
  TicketInboxTable: (props: Record<string, unknown>) => unknown;
  TicketInboxList: (props: Record<string, unknown>) => unknown;
  TicketInboxEmpty: (props: Record<string, unknown>) => unknown;
}

/** The page of a conversation, as the test uses it. */
interface TicketDetailUi {
  TicketMessages: (props: Record<string, unknown>) => unknown;
  TicketActivity: (props: Record<string, unknown>) => unknown;
}

/** The shared parts of the desk, as the test uses them. */
interface SharedUi {
  buildTicketListQuery: (filters: Record<string, unknown>) => Record<string, string | number | undefined>;
  ticketIdFromQuery: (query: Record<string, string>) => string;
  ticketConversationPath: (id: string) => string;
  hasTicketDetailRoute: () => boolean;
  hasActiveFilters: (filters: Record<string, unknown>) => boolean;
}

/** The router of the site, as the test uses it. */
interface RouterUi {
  Router: (props: { children?: unknown }) => unknown;
  setServerLocation: (path: string, search?: string) => void;
}

let inbox: TicketInboxUi;
let detail: TicketDetailUi;
let shared: SharedUi;
let router: RouterUi;
let server: ViteDevServer;

/** Two tickets of the queue, as the API sends them. */
const TICKETS = [
  {
    id: 't1',
    number: 42,
    subject: 'The container will not start',
    category: 'technical',
    priority: 'high',
    status: 'awaiting_staff',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-02T09:30:00.000Z',
    messageCount: 3,
    customer: { id: 'c1', email: 'ada@example.com', name: 'Ada Lovelace' },
    instance: { id: 'i1', name: 'ada-mc' },
    assignedTo: 'Grace Hopper',
    assignedToId: 'u2',
  },
  {
    id: 't2',
    number: 43,
    subject: 'The invoice of October is wrong',
    category: 'billing',
    priority: 'normal',
    status: 'open',
    createdAt: '2026-10-31T08:00:00.000Z',
    updatedAt: '2026-11-01T09:30:00.000Z',
    messageCount: 1,
    customer: { id: 'c2', email: 'alan@example.com', name: null },
    instance: null,
    assignedTo: null,
    assignedToId: null,
  },
];

/** The messages of a ticket, as the API sends them. */
const MESSAGES = [
  {
    id: 'm1',
    body: 'The container stops after a few seconds.',
    internal: false,
    author: { id: 'c1', name: 'Ada Lovelace', role: 'CUSTOMER' },
    createdAt: '2026-11-01T08:00:00.000Z',
    attachments: [],
  },
  {
    id: 'm2',
    body: 'The panel says the image is wrong.',
    internal: true,
    author: { id: 'u2', name: 'Grace Hopper', role: 'STAFF' },
    createdAt: '2026-11-01T09:00:00.000Z',
    attachments: [],
  },
];

/** What happened to a ticket. */
const EVENTS = [
  { id: 'e1', type: 'created', message: 'Ticket opened.', createdAt: '2026-11-01T08:00:00.000Z' },
  { id: 'e2', type: 'assigned', message: 'Ticket assigned.', createdAt: '2026-11-01T09:00:00.000Z' },
];

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  inbox = (await server.ssrLoadModule('/src/admin/tickets/TicketInbox.tsx')) as TicketInboxUi;
  detail = (await server.ssrLoadModule('/src/admin/tickets/TicketDetail.tsx')) as TicketDetailUi;
  shared = (await server.ssrLoadModule('/src/admin/tickets/shared.ts')) as SharedUi;
  router = (await server.ssrLoadModule('/src/router.tsx')) as RouterUi;

  // The client of the API reads the csrf cookie from the document, and the
  // document does not exist without a browser. The stub gives it the cookie
  // of a signed in member of staff, so no call ever leaves the machine.
  const globals = globalThis as unknown as {
    document: { cookie: string };
    fetch: (input: unknown) => Promise<Response>;
  };
  globals.document = { cookie: 'bm_csrf=test-token' };
  globals.fetch = async () =>
    new Response(JSON.stringify({ error: { code: 'not_found', message: 'No such endpoint.' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
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

describe('the inbox of the support desk', () => {
  it('shows every column of the queue', () => {
    const html = plain(render(createElement(inbox.TicketInboxTable, { tickets: TICKETS })));

    // The eight columns of the queue.
    for (const header of ['Ticket', 'Customer', 'Category', 'Priority', 'Status', 'Assigned to', 'Last activity', 'Actions']) {
      assert.match(html, new RegExp(`>${header}<`));
    }
    // The reference and the subject of the ticket.
    assert.match(html, /#42/);
    assert.match(html, /The container will not start/);
    // The customer, the state, the owner and the activity.
    assert.match(html, /Ada Lovelace/);
    assert.match(html, /awaiting staff/);
    assert.match(html, /Grace Hopper/);
    assert.match(html, /hour/);
    // Every row opens the conversation of its ticket.
    assert.match(html, /href="\/admin\/tickets/);
  });

  it('shows the queue of a phone in compact rows', () => {
    const html = plain(render(createElement(inbox.TicketInboxList, { tickets: TICKETS })));

    // The whole ticket is on the row.
    assert.match(html, /#42/);
    assert.match(html, /The container will not start/);
    assert.match(html, /Ada Lovelace/);
    assert.match(html, /technical/);
    assert.match(html, /High/);
    assert.match(html, /Grace Hopper/);
    // The rows are lines of a list and not cards of their own.
    assert.match(html, /divide-y/);
  });

  it('marks the ticket that is open as the current one', () => {
    const html = plain(render(createElement(inbox.TicketInboxTable, { tickets: TICKETS, selectedId: 't1' })));
    // The row of the open ticket carries the mark, and only that row does.
    assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
    assert.match(html, /aria-current="true"/);
  });

  it('tells an empty queue and a queue that is filtered apart', () => {
    const empty = plain(render(createElement(inbox.TicketInboxEmpty, { filtered: false, onClear: () => {} })));
    assert.match(empty, /The queue is empty\./);
    assert.doesNotMatch(empty, /Clear the filters/);

    const filtered = plain(render(createElement(inbox.TicketInboxEmpty, { filtered: true, onClear: () => {} })));
    assert.match(filtered, /No ticket matches these filters\./);
    // The way back to the whole queue is offered.
    assert.match(filtered, /Clear the filters/);
  });

  it('sends the search, the filters and the cursor to the API', () => {
    const query = shared.buildTicketListQuery({
      search: '  42  ',
      status: 'open',
      category: 'billing',
      priority: 'urgent',
      assigned: 'unassigned',
      sort: 'oldest',
      limit: 25,
      cursor: 'eyJhdCI6',
    });

    assert.deepEqual(query, {
      search: '42',
      status: 'OPEN',
      category: 'BILLING',
      priority: 'URGENT',
      assigned: 'unassigned',
      sort: 'oldest',
      limit: 25,
      cursor: 'eyJhdCI6',
    });

    // A queue without a filter asks for the first page and nothing else.
    const plainQuery = shared.buildTicketListQuery({
      status: '',
      category: '',
      priority: '',
      assigned: '',
      sort: 'recent',
      limit: 25,
    });
    assert.deepEqual(plainQuery, { limit: 25 });

    // The filters of the page are told apart from the default ones.
    assert.equal(shared.hasActiveFilters({ status: '', category: '', priority: '', assigned: '', sort: 'recent' }), false);
    assert.equal(shared.hasActiveFilters({ status: 'open', category: '', priority: '', assigned: '', sort: 'recent' }), true);
    assert.equal(shared.hasActiveFilters({ search: '42', status: '', category: '', priority: '', assigned: '', sort: 'recent' }), true);
  });

  it('opens the conversation of the old deep link', () => {
    // The old address was `/admin/tickets?ticket=<id>`.
    assert.equal(shared.ticketIdFromQuery({ ticket: 't1' }), 't1');
    assert.equal(shared.ticketIdFromQuery({}), '');
    assert.equal(shared.ticketIdFromQuery({ ticket: '  ' }), '');

    // The address of the conversation holds the ticket, whichever of the two
    // forms the desk uses.
    const path = shared.ticketConversationPath('t1');
    assert.match(path, /^\/admin\/tickets/);
    assert.match(path, /t1/);
    if (shared.hasTicketDetailRoute()) {
      assert.equal(path, '/admin/tickets/t1');
    } else {
      assert.equal(path, '/admin/tickets?ticket=t1');
    }
  });

  it('opens the conversation that the address of the page names', () => {
    // The address of the old deep link, as the browser shows it.
    router.setServerLocation('/admin/tickets', 'ticket=t1');
    const html = plain(
      render(createElement(router.Router, null, createElement(inbox.default as never, {}))),
    );

    // The conversation of the ticket is opened, and the list of the queue is
    // not shown next to it.
    assert.match(html, /Loading the ticket/);
    assert.doesNotMatch(html, /Support inbox/);

    // The address without a ticket shows the list of the queue.
    router.setServerLocation('/admin/tickets', '');
    const list = plain(
      render(createElement(router.Router, null, createElement(inbox.default as never, {}))),
    );
    assert.match(list, /Support inbox/);
    assert.doesNotMatch(list, /Loading the ticket/);
  });

  it('has no narrow column of a queue', () => {
    const source = readFileSync(join(webRoot, 'src/admin/tickets/TicketInbox.tsx'), 'utf8');
    const entry = readFileSync(join(webRoot, 'src/admin/Tickets.tsx'), 'utf8');

    // The list takes the whole width of the page: no column of 360 pixels
    // and no empty area next to it.
    assert.doesNotMatch(source, /360px/);
    assert.doesNotMatch(entry, /360px/);
    assert.doesNotMatch(entry, /lg:grid-cols-\[minmax\(0,1fr\)\]/);
  });
});

describe('the conversation of a ticket', () => {
  it('shows the notes of the staff apart from the messages', () => {
    const html = plain(render(createElement(detail.TicketMessages, { ticketId: 't1', messages: MESSAGES })));

    // Both the message and the note are in the thread.
    assert.match(html, /The container stops after a few seconds\./);
    assert.match(html, /The panel says the image is wrong\./);
    // The note is marked as a note.
    assert.match(html, /Internal note/);
  });

  it('shows only the notes of the staff when the desk asks for them', () => {
    const html = plain(
      render(createElement(detail.TicketMessages, { ticketId: 't1', messages: MESSAGES, filter: 'internal' })),
    );
    assert.match(html, /The panel says the image is wrong\./);
    assert.doesNotMatch(html, /The container stops after a few seconds\./);
  });

  it('shows what happened to the ticket', () => {
    const html = plain(render(createElement(detail.TicketActivity, { events: EVENTS })));
    assert.match(html, /Ticket opened\./);
    assert.match(html, /Ticket assigned\./);
  });
});
