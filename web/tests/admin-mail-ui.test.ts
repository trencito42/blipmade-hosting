/**
 * The page of the mail in the back office, checked without a screen.
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
 * Ten things are checked here:
 *
 *   1. the health panel shows the version, the disk and the agreement of the
 *      two sides;
 *   2. the health panel says plainly when the two sides do not agree, and
 *      which number differs;
 *   3. the health panel says that the mail system cannot be reached, and does
 *      not claim that the two sides agree;
 *   4. the domains table shows the domains of the API, with the customer;
 *   5. the search and the state filter are sent to the API;
 *   6. "Load more" asks for the next page with the cursor;
 *   7. the jobs table shows the reason of the last failure;
 *   8. the "Repeat" button is on a job that can be repeated only;
 *   9. the "Repeat" asks for a confirmation before it calls the API;
 *  10. a refusal of the API is shown with the words of the refusal.
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
interface AdminMailUi {
  default: (props: Record<string, unknown>) => unknown;
  AdminMailHealthPanel: (props: Record<string, unknown>) => unknown;
  AdminMailDomainsTable: (props: Record<string, unknown>) => unknown;
  AdminMailJobsTable: (props: Record<string, unknown>) => unknown;
  AdminMailRetryDialog: (props: Record<string, unknown>) => unknown;
  AdminMailPager: (props: Record<string, unknown>) => unknown;
  AdminMailError: (props: Record<string, unknown>) => unknown;
  adminMailNextCursor: (pagination: unknown) => string | null;
  adminMailDomainsQuery: (input: {
    search?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }) => Record<string, string | number | undefined>;
  runAdminMailRetry: (job: unknown) => Promise<unknown>;
}

interface ApiModule {
  listAdminMailDomains: (query: Record<string, string | number | undefined>) => Promise<unknown>;
}

interface RouteDef {
  pattern: string;
  title: string;
  area?: string;
  component?: unknown;
}

interface NavEntry {
  to: string;
  label: string;
  shortLabel?: string;
  icon: string;
}

let ui: AdminMailUi;
let api: ApiModule;
let server: ViteDevServer;
let routes: RouteDef[] = [];
let adminNav: NavEntry[] = [];

/** The calls the page made to the server, while the test watches them. */
const calls: { url: string; method: string }[] = [];

/** The health of the mail, as the API sends it. */
const HEALTH = {
  service: {
    configured: true,
    reachable: true,
    version: '55982ac',
    disk: { used: '6.6G', total: '127G', usedPercent: '6%' },
    error: null,
  },
  platform: { domains: 12, mailboxes: 30, aliases: 4, failedJobs: 1 },
  system: { domains: 12, mailboxes: 30, aliases: 4 },
  consistent: true,
};

/** A domain of mail of a customer, as the API sends it. */
const DOMAINS = [
  {
    id: 'cm1',
    name: 'acme.ro',
    status: 'active',
    quotaMb: 10240,
    usedMb: 12,
    mailboxes: 3,
    aliases: 1,
    lastError: null,
    customer: { id: 'cu1', email: 'owner@example.com' },
    createdAt: '2026-10-25T02:00:00.000Z',
    updatedAt: '2026-10-25T02:00:00.000Z',
  },
  {
    id: 'cm2',
    name: 'broken.ro',
    status: 'error',
    quotaMb: 10240,
    usedMb: 0,
    mailboxes: 0,
    aliases: 0,
    lastError: 'the mail system refused the domain',
    customer: { id: 'cu2', email: 'second@example.com' },
    createdAt: '2026-10-25T02:00:00.000Z',
    updatedAt: '2026-10-25T02:00:00.000Z',
  },
];

/** The first page of the domains, as the API sends it. */
const DOMAINS_PAGE = {
  domains: DOMAINS,
  total: 12,
  pagination: { limit: 50, nextCursor: 'eyJhdCI6', hasMore: true },
};

/** A failed job whose work can be repeated. */
const RETRYABLE_JOB = {
  id: 'mj1',
  kind: 'mailbox.create',
  status: 'failed',
  attempts: 1,
  lastError: 'the mail system refused the mailbox',
  retryable: true,
  domain: { id: 'md1', name: 'acme.ro' },
  payload: { address: 'contact@acme.ro', domain: 'acme.ro' },
  createdAt: '2026-10-25T02:00:00.000Z',
  updatedAt: '2026-10-25T02:00:00.000Z',
};

/** A failed job whose work cannot be repeated. */
const STUCK_JOB = {
  id: 'mj2',
  kind: 'domain.delete',
  status: 'failed',
  attempts: 3,
  lastError: 'the mail system refused to remove the domain',
  retryable: false,
  domain: null,
  payload: {},
  createdAt: '2026-10-25T02:00:00.000Z',
  updatedAt: '2026-10-25T02:00:00.000Z',
};

/** The first page of the jobs, as the API sends it. */
const JOBS_PAGE = {
  jobs: [RETRYABLE_JOB, STUCK_JOB],
  total: 3,
  pagination: { limit: 50, nextCursor: null, hasMore: false },
};

/** The answer of the API for the repeat of a job. It can be a refusal. */
let retryAnswer: { status: number; body: unknown } = {
  status: 200,
  body: { job: { ...RETRYABLE_JOB, status: 'done', attempts: 2 } },
};

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

  ui = (await server.ssrLoadModule('/src/admin/Mail.tsx')) as AdminMailUi;
  api = (await server.ssrLoadModule('/src/lib/api.ts')) as ApiModule;
  const router = (await server.ssrLoadModule('/src/routes.tsx')) as { ROUTES: RouteDef[] };
  routes = router.ROUTES;
  const nav = (await server.ssrLoadModule('/src/nav.ts')) as { ADMIN_NAV: NavEntry[] };
  adminNav = nav.ADMIN_NAV;

  // The client of the API reads the csrf cookie from the document, and the
  // document does not exist without a browser. The stub gives it the cookie
  // of a signed in member of staff and records the calls, so no call ever
  // leaves the machine.
  const globals = globalThis as unknown as {
    document: { cookie: string };
    fetch: (input: unknown, init?: { method?: string }) => Promise<Response>;
  };
  globals.document = { cookie: 'bm_csrf=test-token' };
  globals.fetch = async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url.startsWith('/api/admin/mail/health')) return json(HEALTH);
    if (url.startsWith('/api/admin/mail/domains')) return json(DOMAINS_PAGE);
    if (url.startsWith('/api/admin/mail/jobs/') && url.endsWith('/retry')) {
      return json(retryAnswer.body, retryAnswer.status);
    }
    if (url.startsWith('/api/admin/mail/jobs')) return json(JOBS_PAGE);
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

describe('the health of the mail', () => {
  it('shows the version, the disk and the agreement of the two sides', () => {
    const html = plain(render(createElement(ui.AdminMailHealthPanel, { health: HEALTH })));
    // The version the mail system reports.
    assert.match(html, /55982ac/);
    // The disk it uses, with the share of it.
    assert.match(html, /6\.6G of 127G \(6%\)/);
    // The two sides hold the same numbers.
    assert.match(html, /Both sides hold the same numbers/);
    // The numbers of both sides are shown.
    assert.match(html, /Domains/);
    assert.match(html, /Mailboxes/);
    assert.match(html, /Aliases/);
  });

  it('says plainly when the two sides do not agree, and which number differs', () => {
    const health = {
      ...HEALTH,
      consistent: false,
      system: { ...HEALTH.system, mailboxes: 27 },
    };
    const html = plain(render(createElement(ui.AdminMailHealthPanel, { health })));
    assert.match(html, /The two sides do not hold the same numbers/);
    // The number that differs is named, with the two numbers of it.
    assert.match(html, /Mailboxes: the platform holds 30, the mail system holds 27/);
    // The agreement is not claimed either.
    assert.doesNotMatch(html, /Both sides hold the same numbers/);
    // The numbers that do not differ are not named as if they differed.
    assert.doesNotMatch(html, /Domains: the platform holds/);
  });

  it('says that the mail system cannot be reached, and does not claim that the two sides agree', () => {
    const health = {
      ...HEALTH,
      service: {
        configured: true,
        reachable: false,
        version: null,
        disk: null,
        error: 'connect ECONNREFUSED 127.0.0.1:8989',
      },
      consistent: null,
    };
    const html = plain(render(createElement(ui.AdminMailHealthPanel, { health })));
    assert.match(html, /The mail system cannot be reached/);
    // The words of the failure are shown.
    assert.match(html, /connect ECONNREFUSED 127\.0\.0\.1:8989/);
    // The two sides are not said to agree, in any of the two ways.
    assert.doesNotMatch(html, /Both sides hold the same numbers/);
    assert.doesNotMatch(html, /The two sides do not hold the same numbers/);
    assert.doesNotMatch(html, /the same numbers/);
    // The numbers of the platform are not presented as the numbers of the
    // mail system.
    assert.match(html, /not known/);
  });
});

describe('the domains of the mail', () => {
  it('shows the domains of the API, with the customer that owns them', () => {
    const html = plain(render(createElement(ui.AdminMailDomainsTable, { domains: DOMAINS })));
    assert.match(html, /acme\.ro/);
    assert.match(html, /owner@example\.com/);
    assert.match(html, /broken\.ro/);
    assert.match(html, /second@example\.com/);
    // The state, the counters and the space come from the API.
    assert.match(html, /active/);
    assert.match(html, /12 MB of 10240 MB/);
    // The reason of the last failure is shown with its own words.
    assert.match(html, /the mail system refused the domain/);
  });

  it('sends the search and the state to the API', async () => {
    calls.length = 0;
    await api.listAdminMailDomains(ui.adminMailDomainsQuery({ search: 'acme', status: 'active' }));
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /^\/api\/admin\/mail\/domains\?/);
    assert.match(calls[0]!.url, /search=acme/);
    assert.match(calls[0]!.url, /status=active/);
  });

  it('sends nothing of an empty search or of an empty state', async () => {
    calls.length = 0;
    await api.listAdminMailDomains(ui.adminMailDomainsQuery({ search: '   ', status: '' }));
    assert.equal(calls.length, 1);
    assert.doesNotMatch(calls[0]!.url, /search=/);
    assert.doesNotMatch(calls[0]!.url, /status=/);
  });
});

describe('the work the mail still owes', () => {
  it('asks for the next page with the cursor of the page on the screen', async () => {
    // The cursor of the next page is the one the API sent.
    assert.equal(ui.adminMailNextCursor({ limit: 50, nextCursor: 'eyJhdCI6', hasMore: true }), 'eyJhdCI6');
    assert.equal(ui.adminMailNextCursor({ limit: 50, nextCursor: null, hasMore: false }), null);

    // The next page is asked for with that cursor.
    calls.length = 0;
    await api.listAdminMailDomains(ui.adminMailDomainsQuery({ cursor: 'eyJhdCI6', limit: 50 }));
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /cursor=eyJhdCI6/);

    // The page offers the next page when the API says there is one.
    const pager = plain(
      render(createElement(ui.AdminMailPager, { shown: 50, total: 120, hasMore: true, pending: false, onLoadMore: () => {} })),
    );
    assert.match(pager, /Load more/);

    const last = plain(
      render(createElement(ui.AdminMailPager, { shown: 120, total: 120, hasMore: false, pending: false, onLoadMore: () => {} })),
    );
    assert.doesNotMatch(last, /Load more/);
  });

  it('shows the reason of the last failure', () => {
    const html = plain(
      render(createElement(ui.AdminMailJobsTable, { jobs: JOBS_PAGE.jobs, mayRepeat: true, onRepeat: () => {} })),
    );
    assert.match(html, /the mail system refused the mailbox/);
    assert.match(html, /the mail system refused to remove the domain/);
    // The work and the domain it belongs to are shown.
    assert.match(html, /mailbox\.create/);
    assert.match(html, /acme\.ro/);
  });

  it('offers the repeat on a job that can be repeated only', () => {
    const repeatable = plain(
      render(createElement(ui.AdminMailJobsTable, { jobs: [RETRYABLE_JOB], mayRepeat: true, onRepeat: () => {} })),
    );
    assert.match(repeatable, /Repeat<\/button>/);

    // A failed job whose work cannot be repeated says so, instead of
    // offering a button the server will refuse.
    const stuck = plain(
      render(createElement(ui.AdminMailJobsTable, { jobs: [STUCK_JOB], mayRepeat: true, onRepeat: () => {} })),
    );
    assert.doesNotMatch(stuck, /Repeat<\/button>/);
    assert.match(stuck, /This job cannot be repeated/);
  });

  it('asks for a confirmation before it calls the API', async () => {
    calls.length = 0;

    // The table offers the repeat and asks the server nothing.
    const table = plain(
      render(createElement(ui.AdminMailJobsTable, { jobs: [RETRYABLE_JOB], mayRepeat: true, onRepeat: () => {} })),
    );
    assert.match(table, /Repeat<\/button>/);
    assert.equal(calls.length, 0);

    // The confirmation names the work that is repeated.
    const dialog = plain(
      render(
        createElement(ui.AdminMailRetryDialog, {
          job: RETRYABLE_JOB,
          busy: false,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      ),
    );
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /Repeat this job\?/);
    assert.match(dialog, /mailbox\.create/);

    // Without a confirmation nothing is repeated and the server is not asked.
    assert.equal(await ui.runAdminMailRetry(null), null);
    assert.equal(calls.length, 0);

    // After the confirmation the job is repeated.
    const repeated = (await ui.runAdminMailRetry(RETRYABLE_JOB)) as { id: string; status: string; attempts: number };
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/mail/jobs/mj1/retry');
    assert.equal(repeated.id, 'mj1');
    assert.equal(repeated.status, 'done');
    assert.equal(repeated.attempts, 2);
  });

  it('shows a refusal of the API with the words of the refusal', async () => {
    retryAnswer = {
      status: 409,
      body: {
        error: {
          code: 'job_not_retryable',
          message: 'This job cannot be repeated: the kind of the job is not repeatable.',
        },
      },
    };

    // The client of the API keeps the words of the refusal.
    await assert.rejects(
      () => ui.runAdminMailRetry(RETRYABLE_JOB),
      (error: Error & { status?: number }) => {
        assert.equal(error.name, 'ApiError');
        assert.equal(error.status, 409);
        assert.match(error.message, /This job cannot be repeated: the kind of the job is not repeatable\./);
        return true;
      },
    );

    // The page shows the refusal with the words of the refusal.
    const shown = plain(
      render(
        createElement(ui.AdminMailError, {
          message: 'This job cannot be repeated: the kind of the job is not repeatable.',
        }),
      ),
    );
    assert.match(shown, /role="alert"/);
    assert.match(shown, /This job cannot be repeated: the kind of the job is not repeatable\./);

    // The next test finds the API answering again.
    retryAnswer = { status: 200, body: { job: { ...RETRYABLE_JOB, status: 'done', attempts: 2 } } };
  });
});

describe('the page of the mail in the back office', () => {
  it('draws the three panels of the page', () => {
    const html = plain(render(createElement(ui.default, {})));
    assert.match(html, /Mail health/);
    assert.match(html, /Domains/);
    assert.match(html, /Jobs/);
  });

  it('has its own route in the admin area', () => {
    const route = routes.find((entry) => entry.pattern === '/admin/mail');
    assert.ok(route, 'the route /admin/mail is missing from the router');
    assert.equal(route!.area, 'admin');
    assert.equal(route!.title, 'Mail');
    assert.ok(route!.component, 'the route /admin/mail has no page');
  });

  it('is in the navigation of the admin', () => {
    const entry = adminNav.find((item) => item.to === '/admin/mail');
    assert.ok(entry, 'the page is not in the navigation of the admin');
    assert.equal(entry!.label, 'Mail');
    assert.equal(entry!.shortLabel, 'Mail');
  });

  it('shows no secret', () => {
    const source = readFileSync(join(webRoot, 'src/admin/Mail.tsx'), 'utf8');
    assert.doesNotMatch(source, /api[_-]?key|password|fingerprint|secret/i);
  });

  it('is written in English', () => {
    const source = readFileSync(join(webRoot, 'src/admin/Mail.tsx'), 'utf8');
    // The back office speaks English.
    assert.doesNotMatch(source, /[ăâîțșşțĂÂÎȚȘŞ]/);
  });
});
