/**
 * The page of the operations in the back office, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The page is rendered on the
 * server, without a browser, which is enough to see what the operator is told.
 *
 * The API is stubbed: no call ever leaves the machine, and every call is
 * recorded, so the test can see what the page asks the server for and how it
 * asks for it.
 *
 * Nine things are checked here:
 *
 *   1. the page has its own route in the admin area and it is in the
 *      navigation, next to the infrastructure;
 *   2. the headline says the state of the platform, when the sweep ran and
 *      how the checks are counted;
 *   3. the checks show their state, their sentence, their numbers and how
 *      long they have been in that state;
 *   4. only a check that fires can be acknowledged, and an acknowledged check
 *      says that it is;
 *   5. the alerts show the time, the check, the severity and the channels
 *      that carried them;
 *   6. the channels show their state, so the operator sees that an alert may
 *      not be able to leave the host;
 *   7. an API that is not there yet is a readable error and not a blank
 *      screen;
 *   8. the calls of the page are the calls of the contract, and the writes
 *      carry the credentials and the CSRF token;
 *   9. the page names no icon outside the table of the icons.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

import { iconNames } from '../src/icon-map.ts';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

/** The state of a check, of the sweep or of a channel. */
type OpsState = 'ok' | 'warning' | 'critical';

interface OpsCheck {
  id: string;
  title: string;
  state: OpsState;
  summary: string;
  detail: string;
  checkedAt: string;
  durationMs: number;
  since: string | null;
  alerts: number;
}

interface OpsHealth {
  overall: OpsState;
  checkedAt: string;
  summary: { total: number; ok: number; warning: number; critical: number };
  checks: OpsCheck[];
}

interface OpsAlert {
  at: string;
  check: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  channels: { journal: boolean; webhook: 'sent' | 'skipped' | 'failed' };
}

interface OpsAlertState {
  check: string;
  status: 'ok' | 'firing';
  since: string;
  lastSentAt: string;
  sends: number;
  acknowledgedAt: string | null;
}

interface OpsChannel {
  id: string;
  name: string;
  state: OpsState | 'off';
  detail: string;
}

/** The page under test, as the test uses it. */
interface OpsUi {
  default: (props: Record<string, unknown>) => unknown;
  OpsHeadline: (props: { health: OpsHealth }) => unknown;
  OpsChecks: (props: {
    checks: OpsCheck[];
    states: OpsAlertState[];
    mayAcknowledge: boolean;
    onAcknowledge: (check: OpsCheck) => void;
  }) => unknown;
  OpsAlertsList: (props: { alerts: OpsAlert[] }) => unknown;
  OpsChannelsList: (props: { channels: OpsChannel[] }) => unknown;
  OpsRegion: (props: {
    state: { data?: unknown; loading: boolean; error: Error | null; reload: () => void };
    loadingLabel: string;
    errorTitle: string;
    children: (data: never) => unknown;
  }) => unknown;
  opsFailureText: (error: Error & { status?: number }) => string;
  opsHealth: (signal?: AbortSignal) => Promise<unknown>;
  opsAlerts: (signal?: AbortSignal) => Promise<unknown>;
  opsChannels: (signal?: AbortSignal) => Promise<unknown>;
  ackOpsCheck: (id: string, note: string) => Promise<unknown>;
  declareOpsIncident: (message: string, until: string | null) => Promise<unknown>;
  clearOpsIncident: () => Promise<unknown>;
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

let ui: OpsUi;
let server: ViteDevServer;
let routes: RouteDef[] = [];
let adminNav: NavEntry[] = [];
let phoneTabs: NavEntry[] = [];

/** The calls the page made to the server, while the test watches them. */
const calls: { url: string; method: string; headers: Record<string, string>; credentials?: string }[] = [];

/** The checks of the sweep, as the API sends them. */
const CHECKS: OpsCheck[] = [
  {
    id: 'mailcow',
    title: 'Mail server',
    state: 'ok',
    summary: 'The mail server answers and the queue is empty.',
    detail: 'queued 0 · rejected 2',
    checkedAt: '2026-10-26T07:00:00.000Z',
    durationMs: 42,
    since: '2026-10-26T06:00:00.000Z',
    alerts: 0,
  },
  {
    id: 'backup',
    title: 'Backups',
    state: 'warning',
    summary: 'The last backup is older than a day.',
    detail: 'last run 26 Oct 2026, 02:00',
    checkedAt: '2026-10-26T07:00:00.000Z',
    durationMs: 120,
    since: '2026-10-26T05:00:00.000Z',
    alerts: 1,
  },
  {
    id: 'webhooks',
    title: 'Payment webhooks',
    state: 'critical',
    summary: 'The webhooks of the payments are not delivered.',
    detail: 'failed 12',
    checkedAt: '2026-10-26T07:00:00.000Z',
    durationMs: 8,
    since: '2026-10-26T04:30:00.000Z',
    alerts: 4,
  },
];

/** The health of the platform, as the API sends it. */
const HEALTH: OpsHealth = {
  overall: 'critical',
  checkedAt: '2026-10-26T07:00:00.000Z',
  summary: { total: 11, ok: 9, warning: 1, critical: 1 },
  checks: CHECKS,
};

/** The state of the alerts of every check that can fire. */
const STATES: OpsAlertState[] = [
  {
    check: 'mailcow',
    status: 'ok',
    since: '2026-10-26T06:00:00.000Z',
    lastSentAt: '2026-10-25T20:00:00.000Z',
    sends: 0,
    acknowledgedAt: null,
  },
  {
    check: 'backup',
    status: 'firing',
    since: '2026-10-26T05:00:00.000Z',
    lastSentAt: '2026-10-26T05:00:00.000Z',
    sends: 1,
    acknowledgedAt: null,
  },
  {
    check: 'webhooks',
    status: 'firing',
    since: '2026-10-26T04:30:00.000Z',
    lastSentAt: '2026-10-26T06:30:00.000Z',
    sends: 4,
    acknowledgedAt: '2026-10-26T06:45:00.000Z',
  },
];

/** The alerts the sweep sent. */
const ALERTS: OpsAlert[] = [
  {
    at: '2026-10-26T06:30:00.000Z',
    check: 'webhooks',
    severity: 'critical',
    title: 'The webhooks of the payments are not delivered',
    detail: '12 events are waiting for an answer of Stripe.',
    channels: { journal: true, webhook: 'sent' },
  },
  {
    at: '2026-10-26T05:00:00.000Z',
    check: 'backup',
    severity: 'warning',
    title: 'The last backup is older than a day',
    detail: '',
    channels: { journal: true, webhook: 'failed' },
  },
];

/** The channels an alert can leave the host by. */
const CHANNELS: OpsChannel[] = [
  { id: 'journal', name: 'Journal on the host', state: 'ok', detail: 'The journal of the host is written.' },
  { id: 'webhook', name: 'Webhook to the office', state: 'warning', detail: 'The last webhook took 12 seconds.' },
  { id: 'email', name: 'Mail to the operators', state: 'off', detail: 'No address is configured.' },
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

  ui = (await server.ssrLoadModule('/src/admin/Ops.tsx')) as OpsUi;
  const router = (await server.ssrLoadModule('/src/routes.tsx')) as { ROUTES: RouteDef[] };
  routes = router.ROUTES;
  const nav = (await server.ssrLoadModule('/src/nav.ts')) as { ADMIN_NAV: NavEntry[]; ADMIN_PHONE_TABS: NavEntry[] };
  adminNav = nav.ADMIN_NAV;
  phoneTabs = nav.ADMIN_PHONE_TABS;

  // The client of the API reads the csrf cookie from the document, and the
  // document does not exist without a browser. The stub gives it the cookie
  // of a signed in member of staff and records the calls, so no call ever
  // leaves the machine.
  const globals = globalThis as unknown as {
    document: { cookie: string };
    fetch: (
      input: unknown,
      init?: { method?: string; headers?: Record<string, string>; credentials?: string },
    ) => Promise<Response>;
  };
  globals.document = { cookie: 'bm_csrf=test-token' };
  globals.fetch = async (input: unknown, init?: { method?: string; headers?: Record<string, string>; credentials?: string }) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, credentials: init?.credentials });
    if (url.startsWith('/api/ops/health')) return json(HEALTH);
    if (url.startsWith('/api/ops/alerts')) return json({ alerts: ALERTS, states: STATES });
    if (url.startsWith('/api/ops/channels')) return json({ channels: CHANNELS });
    if (url.startsWith('/api/ops/checks/')) return json({ ok: true });
    if (url.startsWith('/api/ops/incident')) return json({ ok: true });
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

describe('the page of the operations in the back office', () => {
  it('has its own route in the admin area', () => {
    const route = routes.find((entry) => entry.pattern === '/admin/ops');
    assert.ok(route, 'the route /admin/ops is missing from the router');
    assert.equal(route!.area, 'admin');
    assert.equal(route!.title, 'Operations');
    assert.ok(route!.component, 'the route /admin/ops has no page');
  });

  it('is in the navigation of the admin, next to the infrastructure', () => {
    const entry = adminNav.find((item) => item.to === '/admin/ops');
    assert.ok(entry, 'the page is not in the navigation of the admin');
    assert.equal(entry!.label, 'Operations');
    assert.equal(entry!.shortLabel, 'Ops');
    assert.ok(iconNames().includes(entry!.icon), 'the icon of the page is not in the table of the icons');

    const infra = adminNav.findIndex((item) => item.to === '/admin/infrastructure');
    assert.equal(adminNav.findIndex((item) => item.to === '/admin/ops'), infra + 1);
  });

  it('leaves the phone bar of the admin with the four pages it had', () => {
    assert.deepEqual(
      phoneTabs.map((entry) => entry.to),
      ['/admin', '/admin/customers', '/admin/tickets', '/admin/audit'],
    );
  });

  it('draws the panels of the page', () => {
    const html = plain(render(createElement(ui.default, {})));
    assert.match(html, /Operations/);
    assert.match(html, /Checks/);
    assert.match(html, /Alerts/);
    assert.match(html, /Channels/);
    assert.match(html, /Incident/);
  });
});

describe('the headline of the sweep', () => {
  it('says the state of the platform, when the sweep ran and the counts', () => {
    const html = plain(render(createElement(ui.OpsHeadline, { health: HEALTH })));

    // The state of the platform, in the words of the operator.
    assert.match(html, /Critical/);
    assert.match(html, /Some checks of the sweep are broken/);

    // When the sweep last ran.
    assert.match(html, /Last sweep/);
    assert.match(html, /26 Oct 2026/);

    // The counts of the sweep.
    assert.match(html, /Ok<\/p><p class="[^"]*">9</);
    assert.match(html, /Warning<\/p><p class="[^"]*">1</);
    assert.match(html, /Critical<\/p><p class="[^"]*">1</);
    assert.match(html, /11 checks in the sweep/);
  });

  it('says that everything is fine when the sweep found nothing wrong', () => {
    const html = plain(
      render(
        createElement(ui.OpsHeadline, {
          health: { ...HEALTH, overall: 'ok', summary: { total: 11, ok: 11, warning: 0, critical: 0 } },
        }),
      ),
    );
    assert.match(html, /Every check of the sweep passes/);
    assert.match(html, /Ok<\/p><p class="[^"]*">11</);
  });
});

describe('the checks of the sweep', () => {
  it('shows the state, the sentence, the numbers and the time in the state', () => {
    const html = plain(
      render(createElement(ui.OpsChecks, { checks: CHECKS, states: STATES, mayAcknowledge: true, onAcknowledge: () => {} })),
    );

    // The name and the id of every check.
    assert.match(html, /Mail server/);
    assert.match(html, /mailcow/);
    assert.match(html, /Backups/);
    assert.match(html, /backup/);

    // The sentence of the check and the numbers behind it.
    assert.match(html, /The mail server answers and the queue is empty/);
    assert.match(html, /queued 0 · rejected 2/);
    assert.match(html, /checked in 42 ms/);

    // The state of the check.
    assert.match(html, />Ok</);
    assert.match(html, />Warning</);
    assert.match(html, />Critical</);

    // How long the check has been in that state.
    assert.match(html, /In this state since/);
    assert.match(html, /26 Oct 2026/);
  });

  it('offers the acknowledgement only on a check that fires', () => {
    const acknowledged = plain(
      render(createElement(ui.OpsChecks, { checks: CHECKS, states: STATES, mayAcknowledge: true, onAcknowledge: () => {} })),
    );
    // The backup fires and is not acknowledged yet.
    assert.match(acknowledged, /Acknowledge<\/button>/);
    // The webhooks fire but are already acknowledged.
    assert.match(acknowledged, /Acknowledged/);

    // A check that does not fire is not acknowledged, so the page does not
    // offer a step the server has nothing to do with.
    const calm = plain(
      render(
        createElement(ui.OpsChecks, {
          checks: [CHECKS[0]!],
          states: [STATES[0]!],
          mayAcknowledge: true,
          onAcknowledge: () => {},
        }),
      ),
    );
    assert.doesNotMatch(calm, /Acknowledge<\/button>/);
  });

  it('does not offer the acknowledgement to a role that may not write', () => {
    const html = plain(
      render(createElement(ui.OpsChecks, { checks: CHECKS, states: STATES, mayAcknowledge: false, onAcknowledge: () => {} })),
    );
    assert.doesNotMatch(html, /Acknowledge<\/button>/);
  });
});

describe('the alerts of the sweep', () => {
  it('shows the time, the check, the severity and the channels', () => {
    const html = plain(render(createElement(ui.OpsAlertsList, { alerts: ALERTS })));

    // The title and the detail of the alert.
    assert.match(html, /The webhooks of the payments are not delivered/);
    assert.match(html, /12 events are waiting for an answer of Stripe/);

    // The check and the moment of the alert.
    assert.match(html, /webhooks/);
    assert.match(html, /26 Oct 2026/);

    // The severity of the alert.
    assert.match(html, />Critical</);
    assert.match(html, />Warning</);

    // The channels that carried the alert.
    assert.match(html, /Journal: written · Webhook: sent/);
    assert.match(html, /Journal: written · Webhook: failed/);
  });

  it('says that no alert has fired', () => {
    const html = plain(render(createElement(ui.OpsAlertsList, { alerts: [] })));
    assert.match(html, /No alerts/);
  });
});

describe('the channels of the alerts', () => {
  it('shows the state of every channel, so a channel that is off is seen', () => {
    const html = plain(render(createElement(ui.OpsChannelsList, { channels: CHANNELS })));

    assert.match(html, /Journal on the host/);
    assert.match(html, /Webhook to the office/);
    assert.match(html, /Mail to the operators/);

    // The state of every channel.
    assert.match(html, />Ok</);
    assert.match(html, />Warning</);
    assert.match(html, />Off</);

    // The words of the channel.
    assert.match(html, /No address is configured/);
  });
});

describe('an API that is not there yet', () => {
  it('is a readable error and not a blank screen', () => {
    const missing = Object.assign(new Error('Request failed (404).'), { status: 404 });
    const html = plain(
      render(
        createElement(ui.OpsRegion, {
          state: { data: undefined, loading: false, error: missing, reload: () => {} },
          loadingLabel: 'Loading the sweep',
          errorTitle: 'The state of the platform could not be loaded',
          children: () => null,
        }),
      ),
    );

    // The error is told to the operator.
    assert.match(html, /role="alert"/);
    assert.match(html, /The state of the platform could not be loaded/);
    // The operator is told what is missing and not shown a bare status code.
    assert.match(html, /The operations API is not there yet/);
    // The retry is there, so the page fills itself when the API answers.
    assert.match(html, /Retry/);
  });

  it('keeps the words of any other refusal', () => {
    const refused = Object.assign(new Error('Your role does not hold "infrastructure.read".'), { status: 403 });
    const html = plain(
      render(
        createElement(ui.OpsRegion, {
          state: { data: undefined, loading: false, error: refused, reload: () => {} },
          loadingLabel: 'Loading the sweep',
          errorTitle: 'The state of the platform could not be loaded',
          children: () => null,
        }),
      ),
    );
    assert.match(html, /Your role does not hold/);
    assert.doesNotMatch(html, /The operations API is not there yet/);
  });
});

describe('the calls of the page', () => {
  it('reads the sweep, the alerts and the channels of the contract', async () => {
    calls.length = 0;

    await ui.opsHealth();
    await ui.opsAlerts();
    await ui.opsChannels();

    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      ['GET /api/ops/health', 'GET /api/ops/alerts?limit=50', 'GET /api/ops/channels'],
    );
  });

  it('acknowledges a check with a note, and declares and clears an incident', async () => {
    calls.length = 0;

    await ui.ackOpsCheck('backup', 'the backup of the night is running late');
    await ui.declareOpsIncident('the mail server does not answer', '2026-10-27T07:00:00.000Z');
    await ui.clearOpsIncident();

    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      [
        'POST /api/ops/checks/backup/ack',
        'POST /api/ops/incident',
        'DELETE /api/ops/incident',
      ],
    );

    // A write carries the cookie of the session and the CSRF token, the same
    // way every other write of the back office carries them.
    for (const call of calls) {
      assert.equal(call.credentials, 'include', 'the write does not carry the session');
      assert.equal(call.headers['X-CSRF-Token'], 'test-token', 'the write does not carry the CSRF token');
    }
  });

  it('sends the note of the acknowledgement and the words of the incident', async () => {
    calls.length = 0;
    const bodies: unknown[] = [];

    const globals = globalThis as unknown as {
      fetch: (input: unknown, init?: { method?: string; body?: string }) => Promise<Response>;
    };
    const stub = globals.fetch;
    globals.fetch = async (input: unknown, init?: { method?: string; body?: string }) => {
      if (init?.body) bodies.push(JSON.parse(init.body));
      return stub(input, init);
    };

    await ui.ackOpsCheck('backup', 'the backup of the night is running late');
    await ui.declareOpsIncident('the mail server does not answer', null);
    globals.fetch = stub;

    assert.deepEqual(bodies[0], { note: 'the backup of the night is running late' });
    assert.deepEqual(bodies[1], { message: 'the mail server does not answer', until: null });
  });
});

describe('the house rules of the page', () => {
  it('names no icon outside the table of the icons', () => {
    const source = readFileSync(join(webRoot, 'src/admin/Ops.tsx'), 'utf8');
    const names = iconNames();
    for (const match of source.matchAll(/<Icon\s+name="([^"]+)"/g)) {
      assert.ok(names.includes(match[1] as never), `the icon ${match[1]} is not in the table of the icons`);
    }
  });

  it('does not hardcode a class of the icon font', () => {
    const source = readFileSync(join(webRoot, 'src/admin/Ops.tsx'), 'utf8');
    const families = new Set(['fa-icon', 'fa-sharp-duotone', 'fa-duotone', 'fa-regular', 'fa-solid']);
    for (const match of source.matchAll(/(?<![-\w])fa-[a-z0-9-]+/g)) {
      assert.ok(families.has(match[0]), `the page names the class ${match[0]} of the icon font`);
    }
  });

  it('is written in English', () => {
    const source = readFileSync(join(webRoot, 'src/admin/Ops.tsx'), 'utf8');
    // The back office speaks English.
    assert.doesNotMatch(source, /[ăâîțșşțĂÂÎȚȘŞ]/);
  });

  it('asks for the sweep at most once a minute, and only while the page is open', () => {
    const source = readFileSync(join(webRoot, 'src/admin/Ops.tsx'), 'utf8');
    // The gap between two reads of the sweep.
    assert.match(source, /REFRESH_MS = 60_000/);
    // The timer is cleared when the page goes away.
    assert.match(source, /clearInterval\(timer\)/);
  });
});
