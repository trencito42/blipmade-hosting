/**
 * The plans and the services of the hosted mail in the back office, checked
 * without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The pages are rendered on the
 * server, without a browser, which is enough to see what the staff is told.
 *
 * The API is stubbed: no call ever leaves the machine, and every call is
 * recorded, so the test can see what the back office asks the server for.
 *
 * Seven things are checked here:
 *
 *   1. the list of the plans shows the limits and the prices of the API;
 *   2. no amount, no currency and no limit is written in the source of the
 *      back office: the operator writes the prices, the platform never invents
 *      one;
 *   3. the form of a plan sends every limit and the price of every period,
 *      and the slug and the name are required;
 *   4. a plan that is not on sale is shown as not on sale and can be put back
 *      on sale;
 *   5. the services are listed with their state and their use, and the
 *      actions of the operator are offered;
 *   6. nothing is deleted without a confirmation;
 *   7. a mail system that does not answer is a state, not a number of zeros.
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

/** The page of the plans, as the test uses it. */
interface MailProductsUi {
  default: (props: Record<string, unknown>) => unknown;
  AdminMailPlansTable: (props: Record<string, unknown>) => unknown;
  AdminMailPlanForm: (props: Record<string, unknown>) => unknown;
  AdminMailPlanDeleteDialog: (props: Record<string, unknown>) => unknown;
  mailPlanCatalog: (plans: unknown[]) => { periods: string[]; currencies: string[]; intervals: string[] };
  mailPlanFormState: (plan: unknown, catalog: unknown) => Record<string, unknown>;
  mailPlanFormErrors: (state: Record<string, unknown>) => Record<string, string>;
  mailPlanBody: (state: Record<string, unknown>) => Record<string, unknown> | null;
  mailPlanLimitDifferences: (plan: unknown) => { key: string; written: number; applied: number }[];
  runMailPlanDelete: (pending: unknown) => Promise<boolean>;
  setMailPlanOnSale: (id: string, onSale: boolean) => Promise<unknown>;
  createMailPlan: (body: unknown) => Promise<unknown>;
}

/** The page of the mail, as the test uses it. */
interface AdminMailUi {
  default: (props: Record<string, unknown>) => unknown;
  AdminMailServicesTable: (props: Record<string, unknown>) => unknown;
  AdminMailUsagePanel: (props: Record<string, unknown>) => unknown;
  adminMailServiceActions: (status: string) => string[];
  runAdminMailServiceAction: (service: unknown, action: string, reason?: string) => Promise<boolean>;
}

let products: MailProductsUi;
let mail: AdminMailUi;
let server: ViteDevServer;

/** The calls the back office made to the server, while the test watches them. */
const calls: { url: string; method: string; body: string | null }[] = [];

/** The plans of the hosted mail, as the API sends them. */
const PLANS = [
  {
    id: 'mp1',
    slug: 'mail-starter',
    name: 'Mail Starter',
    description: 'One domain for a small team.',
    icon: 'mail',
    visible: true,
    deployable: true,
    limits: {
      maxDomains: 1,
      maxMailboxes: 5,
      maxAliases: 10,
      maxForwarding: 5,
      totalStorageMb: 10240,
      mailboxQuotaMb: 512,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
    writtenLimits: {
      maxDomains: 1,
      maxMailboxes: 5,
      maxAliases: 10,
      maxForwarding: 5,
      totalStorageMb: 10240,
      mailboxQuotaMb: 512,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
    prices: [
      { id: 'pr1', period: 'monthly', amount: 490, currency: 'RON', active: true },
      { id: 'pr2', period: 'yearly', amount: 4900, currency: 'RON', active: true },
    ],
    customers: 12,
    services: 14,
  },
  {
    id: 'mp2',
    slug: 'mail-office',
    name: 'Mail Office',
    description: 'More domains and more mailboxes.',
    icon: 'mail',
    visible: true,
    // The plan is not on sale any more, but the customers that bought it keep
    // the services they pay for.
    deployable: false,
    limits: {
      maxDomains: 5,
      maxMailboxes: 25,
      maxAliases: 50,
      maxForwarding: 25,
      totalStorageMb: 51200,
      mailboxQuotaMb: 1024,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
    writtenLimits: {
      maxDomains: 5,
      maxMailboxes: 25,
      maxAliases: 50,
      maxForwarding: 25,
      totalStorageMb: 51200,
      mailboxQuotaMb: 1024,
      // The catalog asks for more than the platform holds.
      sendLimit: 500,
      sendInterval: 'HOURLY',
    },
    prices: [{ id: 'pr3', period: 'monthly', amount: 990, currency: 'RON', active: true }],
    customers: 3,
    services: 3,
  },
];

/** The hosted mail services of the customers, as the API sends them. */
const SERVICES = [
  {
    id: 'ms1',
    userId: 'cu1',
    customerEmail: 'owner@example.com',
    plan: { slug: 'mail-starter', name: 'Mail Starter' },
    status: 'ACTIVE',
    usage: { domains: 2, mailboxes: 5, storageMb: 120, storageLimitMb: 10240 },
    limits: {
      maxDomains: 1,
      maxMailboxes: 5,
      maxAliases: 10,
      maxForwarding: 5,
      totalStorageMb: 10240,
      mailboxQuotaMb: 512,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
    graceUntil: null,
    suspendedAt: null,
    cancelledAt: null,
    retentionUntil: null,
    lastError: null,
    createdAt: '2026-10-01T02:00:00.000Z',
  },
  {
    id: 'ms2',
    userId: 'cu2',
    customerEmail: 'second@example.com',
    plan: { slug: 'mail-office', name: 'Mail Office' },
    status: 'SUSPENDED',
    usage: { domains: 1, mailboxes: 2, storageMb: 40, storageLimitMb: 51200 },
    limits: {
      maxDomains: 5,
      maxMailboxes: 25,
      maxAliases: 50,
      maxForwarding: 25,
      totalStorageMb: 51200,
      mailboxQuotaMb: 1024,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
    graceUntil: '2026-10-20T02:00:00.000Z',
    suspendedAt: '2026-10-21T02:00:00.000Z',
    cancelledAt: null,
    retentionUntil: null,
    lastError: 'the mail system refused the mailbox',
    createdAt: '2026-09-01T02:00:00.000Z',
  },
  {
    id: 'ms3',
    userId: 'cu3',
    customerEmail: 'third@example.com',
    plan: { slug: 'mail-starter', name: 'Mail Starter' },
    status: 'CANCELLED',
    usage: { domains: 0, mailboxes: 0, storageMb: 0, storageLimitMb: 10240 },
    limits: {
      maxDomains: 1,
      maxMailboxes: 5,
      maxAliases: 10,
      maxForwarding: 5,
      totalStorageMb: 10240,
      mailboxQuotaMb: 512,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
    graceUntil: null,
    suspendedAt: null,
    cancelledAt: '2026-10-10T02:00:00.000Z',
    retentionUntil: '2026-11-10T02:00:00.000Z',
    lastError: null,
    createdAt: '2026-08-01T02:00:00.000Z',
  },
];

/** The use of the platform, as the API sends it. */
const USAGE = {
  services: 17,
  domains: 24,
  mailboxes: 31,
  storageMb: 4096,
  byStatus: { ACTIVE: 12, PENDING: 1, SUSPENDED: 3, CANCELLED: 1 },
  sendingLimits: [{ domain: 'acme.ro', limit: 200, remaining: 180, interval: 'HOURLY' }],
  health: {
    configured: true,
    reachable: true,
    version: '55982ac',
    disk: { used: '6.6G', total: '127G', usedPercent: '6%' },
    error: null,
  },
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

  products = (await server.ssrLoadModule('/src/admin/MailProducts.tsx')) as MailProductsUi;
  mail = (await server.ssrLoadModule('/src/admin/Mail.tsx')) as AdminMailUi;

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

    if (url.startsWith('/api/admin/mail/plans') && method === 'GET') return json({ plans: PLANS });
    if (url.startsWith('/api/admin/mail/plans') && method === 'POST') return json({ plan: PLANS[0] }, 201);
    if (url.startsWith('/api/admin/mail/plans/') && method === 'PATCH') return json({ plan: PLANS[0] });
    if (url.startsWith('/api/admin/mail/plans/') && method === 'DELETE') {
      // A plan a customer bought cannot be deleted: the server refuses it.
      if (url.endsWith('/mp2')) {
        return json(
          { error: { code: 'plan_in_use', message: 'This plan cannot be deleted: a customer bought it.' } },
          409,
        );
      }
      return json({ ok: true });
    }
    if (url.startsWith('/api/admin/mail/services') && method === 'GET') return json({ services: SERVICES });
    if (url.startsWith('/api/admin/mail/usage')) return json(USAGE);
    if (url.startsWith('/api/admin/mail/services/')) return json({ ok: true });
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

/** The body the back office sent to the server. */
function sentBody(call: { body: string | null }): Record<string, unknown> {
  assert.ok(call.body, 'the call carried no body');
  return JSON.parse(call.body) as Record<string, unknown>;
}

describe('the pages of the back office', () => {
  it('the page of the plans draws the panel of the plans', () => {
    const html = plain(render(createElement(products.default, {})));
    assert.match(html, /Plans of hosted mail/);
    // The page says where the prices come from.
    assert.match(html, /the minor units/);
  });

  it('the page of the mail draws the services and the use of the platform', () => {
    const html = plain(render(createElement(mail.default, {})));
    // The panels that were there before.
    assert.match(html, /Mail health/);
    assert.match(html, /Domains/);
    assert.match(html, /Jobs/);
    // The panels that were added.
    assert.match(html, /Mail services/);
    assert.match(html, /The use of the platform/);
  });
});

describe('the list of the plans of hosted mail', () => {
  it('shows the limits and the prices that come from the API', () => {
    const html = plain(
      render(
        createElement(products.AdminMailPlansTable, {
          plans: PLANS,
          mayWrite: true,
          onEdit: () => {},
          onDelete: () => {},
          onToggleSale: () => {},
        }),
      ),
    );

    // The name and the slug of the plan.
    assert.match(html, /Mail Starter/);
    assert.match(html, /mail-starter/);

    // Every limit of the plan, with the number of the API.
    assert.match(html, /Domains: 1/);
    assert.match(html, /Mailboxes of a domain: 5/);
    assert.match(html, /Aliases of a domain: 10/);
    assert.match(html, /Forwarding rules of a domain: 5/);
    assert.match(html, /Space of the plan: 10240/);
    assert.match(html, /Space of a mailbox: 512/);
    assert.match(html, /Messages sent: 200/);
    assert.match(html, /Window of the sending: HOURLY/);

    // The prices, with their period and their currency. The amount is shown
    // in the unit the platform counts in: the minor units.
    assert.match(html, /monthly/);
    assert.match(html, /yearly/);
    assert.match(html, /RON/);
    assert.match(html, /490 minor units/);
    assert.match(html, /4900 minor units/);
    assert.match(html, /990 minor units/);

    // How many customers bought the plan.
    assert.match(html, /12 · 14 services/);
  });

  it('writes out the limit the platform holds below the limit of the catalog', () => {
    const differences = products.mailPlanLimitDifferences(PLANS[1]);
    assert.equal(differences.length, 1);
    assert.equal(differences[0]!.key, 'sendLimit');
    assert.equal(differences[0]!.written, 500);
    assert.equal(differences[0]!.applied, 200);

    const html = plain(
      render(
        createElement(products.AdminMailPlansTable, {
          plans: [PLANS[1]],
          mayWrite: false,
          onEdit: () => {},
          onDelete: () => {},
          onToggleSale: () => {},
        }),
      ),
    );
    assert.match(html, /The catalog says sendLimit 500 and the platform applies sendLimit 200/);
  });
});

describe('the back office never invents a price', () => {
  const sources = [
    { name: 'MailProducts.tsx', file: join(webRoot, 'src/admin/MailProducts.tsx') },
    { name: 'Mail.tsx', file: join(webRoot, 'src/admin/Mail.tsx') },
  ];

  for (const source of sources) {
    it(`writes no price and no limit in ${source.name}`, () => {
      const text = readFileSync(source.file, 'utf8');

      // A currency that is written in the source.
      assert.doesNotMatch(text, /\b(EUR|USD|RON|GBP|CHF|MDL|PLN|HUF)\b/, `${source.name} writes a currency`);

      // An amount that is written in the source.
      assert.doesNotMatch(
        text,
        /\b(amount|baseAmount|price|prices|total|totalAmount)\s*[:=]\s*[0-9]/,
        `${source.name} writes an amount`,
      );

      // A limit that is written in the source.
      assert.doesNotMatch(
        text,
        /\b(maxDomains|maxMailboxes|maxAliases|maxForwarding|totalStorageMb|mailboxQuotaMb|sendLimit|storageMb)\s*[:=]\s*[0-9]/,
        `${source.name} writes a limit`,
      );

      // A price that is written as a literal of the markup.
      assert.doesNotMatch(text, /amount=\{\s*[0-9]/, `${source.name} writes an amount in the markup`);
    });
  }
});

describe('the form of a plan', () => {
  it('sends every limit and the price of every period', async () => {
    const catalog = products.mailPlanCatalog(PLANS);
    // The periods and the currencies come from the API.
    assert.deepEqual(catalog.periods, ['monthly', 'yearly']);
    assert.deepEqual(catalog.currencies, ['RON']);
    assert.deepEqual(catalog.intervals, ['HOURLY']);

    const state = products.mailPlanFormState(null, catalog) as Record<string, unknown>;
    const rows = state.prices as { period: string; amount: string; currency: string; changed: boolean }[];
    assert.deepEqual(
      rows.map((row) => row.period),
      ['monthly', 'yearly'],
    );

    // The operator fills the form.
    const filled = {
      ...state,
      name: 'Mail Starter',
      slug: 'mail-starter',
      description: 'One domain for a small team.',
      maxDomains: '1',
      maxMailboxes: '5',
      maxAliases: '10',
      maxForwarding: '5',
      totalStorageMb: '10240',
      mailboxQuotaMb: '512',
      sendLimit: '200',
      sendInterval: 'HOURLY',
      prices: rows.map((row) => ({ ...row, amount: row.period === 'monthly' ? '490' : '4900', currency: 'RON' })),
    };

    // A form that holds a limit the server refuses is not sent.
    const broken = { ...filled, maxMailboxes: 'many mailboxes' };
    assert.equal(products.mailPlanBody(broken), null);
    const errors = products.mailPlanFormErrors(broken);
    assert.ok(errors.maxMailboxes, 'the limit that is not a number is not named');

    const body = products.mailPlanBody(filled);
    assert.ok(body, 'the filled form was refused');

    // Every limit is sent.
    for (const key of [
      'maxDomains',
      'maxMailboxes',
      'maxAliases',
      'maxForwarding',
      'totalStorageMb',
      'mailboxQuotaMb',
      'sendLimit',
    ]) {
      assert.equal(typeof body[key], 'number', `the limit ${key} was not sent`);
    }
    assert.equal(body.sendInterval, 'HOURLY');

    // The price of every period is sent.
    assert.deepEqual(body.prices, [
      { period: 'monthly', amount: 490, currency: 'RON' },
      { period: 'yearly', amount: 4900, currency: 'RON' },
    ]);

    // And the server is asked with all of it.
    calls.length = 0;
    await products.createMailPlan(body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/mail/plans');
    const sent = sentBody(calls[0]!);
    assert.equal(sent.name, 'Mail Starter');
    assert.equal(sent.slug, 'mail-starter');
    assert.equal(sent.maxMailboxes, 5);
    assert.equal(sent.totalStorageMb, 10240);
    assert.equal(sent.sendLimit, 200);
    assert.equal(sent.sendInterval, 'HOURLY');
    assert.deepEqual(sent.prices, [
      { period: 'monthly', amount: 490, currency: 'RON' },
      { period: 'yearly', amount: 4900, currency: 'RON' },
    ]);
  });

  it('sends only the periods the operator changed when a plan is changed', () => {
    const catalog = products.mailPlanCatalog(PLANS);
    const state = products.mailPlanFormState(PLANS[0], catalog) as Record<string, unknown>;
    const rows = state.prices as { period: string; amount: string; currency: string; changed: boolean }[];

    // The prices of the plan are prefilled with what the API holds.
    assert.deepEqual(
      rows.map((row) => row.amount),
      ['490', '4900'],
    );

    // The operator changes the price of the monthly period only.
    const changed = {
      ...state,
      prices: rows.map((row) => (row.period === 'monthly' ? { ...row, amount: '590', changed: true } : row)),
    };

    const body = products.mailPlanBody(changed);
    assert.ok(body);
    assert.deepEqual(body.prices, [{ period: 'monthly', amount: 590, currency: 'RON' }]);
  });

  it('asks for the name and the slug', () => {
    const catalog = products.mailPlanCatalog(PLANS);
    const html = plain(
      render(
        createElement(products.AdminMailPlanForm, {
          plan: null,
          catalog,
          busy: false,
          error: null,
          onSubmit: () => {},
          onCancel: () => {},
        }),
      ),
    );

    // The name and the slug are required.
    assert.match(html, /id="mail-plan-new-name"[^>]*required/);
    assert.match(html, /id="mail-plan-new-slug"[^>]*required/);

    // Every limit is asked for.
    for (const key of [
      'maxDomains',
      'maxMailboxes',
      'maxAliases',
      'maxForwarding',
      'totalStorageMb',
      'mailboxQuotaMb',
      'sendLimit',
      'sendInterval',
    ]) {
      assert.match(html, new RegExp(`id="mail-plan-new-${key}"`), `the limit ${key} is not asked for`);
    }

    // The price of every period of the API is asked for, in minor units.
    assert.match(html, /Price of the monthly period \(minor units\)/);
    assert.match(html, /Price of the yearly period \(minor units\)/);

    // A refusal of the server is shown with the words of the refusal.
    const refused = plain(
      render(
        createElement(products.AdminMailPlanForm, {
          plan: null,
          catalog,
          busy: false,
          error: 'This plan cannot be saved: the platform holds less space than the plan asks for.',
          onSubmit: () => {},
          onCancel: () => {},
        }),
      ),
    );
    assert.match(refused, /role="alert"/);
    assert.match(refused, /This plan cannot be saved: the platform holds less space than the plan asks for\./);
  });
});

describe('a plan that is not on sale', () => {
  it('is shown as not on sale and can be put back on sale', async () => {
    const html = plain(
      render(
        createElement(products.AdminMailPlansTable, {
          plans: PLANS,
          mayWrite: true,
          onEdit: () => {},
          onDelete: () => {},
          onToggleSale: () => {},
        }),
      ),
    );

    // The plan that is off sale says so.
    assert.match(html, /Not on sale/);
    assert.match(html, /Put on sale/);

    // The plan that is on sale can be taken off sale.
    assert.match(html, /On sale/);
    assert.match(html, /Take off sale/);

    // Putting a plan back on sale asks the server for it.
    calls.length = 0;
    await products.setMailPlanOnSale('mp2', true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'PATCH');
    assert.equal(calls[0]!.url, '/api/admin/mail/plans/mp2');
    assert.deepEqual(sentBody(calls[0]!), { deployable: true });
  });
});

describe('the mail services', () => {
  it('are listed with their state, their use and their life', () => {
    const html = plain(
      render(
        createElement(mail.AdminMailServicesTable, {
          services: SERVICES,
          mayWrite: true,
          onAction: () => {},
        }),
      ),
    );

    // The customer and the plan of every service.
    assert.match(html, /owner@example\.com/);
    assert.match(html, /second@example\.com/);
    assert.match(html, /Mail Starter/);
    assert.match(html, /Mail Office/);

    // The state of every service.
    assert.match(html, /ACTIVE/);
    assert.match(html, /SUSPENDED/);
    assert.match(html, /CANCELLED/);

    // The use of every service.
    assert.match(html, /2 domains · 5 mailboxes · 120 MB of 10240 MB/);
    assert.match(html, /1 domains · 2 mailboxes · 40 MB of 51200 MB/);

    // The life of every service: when it began, when it will end.
    assert.match(html, /Since:/);
    assert.match(html, /Suspended at:/);
    assert.match(html, /Kept until:/);

    // The words of the last failure.
    assert.match(html, /the mail system refused the mailbox/);
  });

  it('offer the actions the state of the service allows', () => {
    assert.deepEqual(mail.adminMailServiceActions('ACTIVE'), ['suspend', 'cancel', 'reprovision']);
    assert.deepEqual(mail.adminMailServiceActions('SUSPENDED'), ['resume', 'cancel', 'reprovision']);
    // A service that is cancelled is only brought back.
    assert.deepEqual(mail.adminMailServiceActions('CANCELLED'), ['reactivate']);

    const html = plain(
      render(
        createElement(mail.AdminMailServicesTable, {
          services: SERVICES,
          mayWrite: true,
          onAction: () => {},
        }),
      ),
    );
    assert.match(html, /Suspend<\/button>/);
    assert.match(html, /Resume<\/button>/);
    assert.match(html, /Cancel<\/button>/);
    assert.match(html, /Reactivate<\/button>/);
    assert.match(html, /Host it again<\/button>/);
  });

  it('are acted on only when the operator names the service', async () => {
    calls.length = 0;
    assert.equal(await mail.runAdminMailServiceAction(null, 'suspend', 'a reason'), false);
    assert.equal(calls.length, 0);

    await mail.runAdminMailServiceAction(SERVICES[0], 'suspend', 'the customer asked for it');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.url, '/api/admin/mail/services/ms1/suspend');
    assert.deepEqual(sentBody(calls[0]!), { reason: 'the customer asked for it' });
  });
});

describe('the use of the platform', () => {
  it('shows the numbers of the API and the state of the mail system', () => {
    const html = plain(render(createElement(mail.AdminMailUsagePanel, { usage: USAGE })));

    // The numbers of the API.
    assert.match(html, /Services/);
    assert.match(html, /17/);
    assert.match(html, /Domains/);
    assert.match(html, /24/);
    assert.match(html, /Mailboxes/);
    assert.match(html, /31/);
    assert.match(html, /4096 MB/);

    // The number of services in every state.
    assert.match(html, /ACTIVE/);
    assert.match(html, /PENDING/);
    assert.match(html, /SUSPENDED/);
    assert.match(html, /CANCELLED/);

    // The limits of sending that are applied.
    assert.match(html, /acme\.ro/);
    assert.match(html, /180/);
    assert.match(html, /HOURLY/);

    // The state of the mail system.
    assert.match(html, /The mail system/);
    assert.match(html, /55982ac/);
    assert.match(html, /6\.6G of 127G \(6%\)/);
  });

  it('shows a mail system that does not answer as a state, not as zeros', () => {
    const down = {
      ...USAGE,
      sendingLimits: [],
      health: {
        configured: true,
        reachable: false,
        version: null,
        disk: null,
        error: 'connect ECONNREFUSED 127.0.0.1:8989',
      },
    };
    const html = plain(render(createElement(mail.AdminMailUsagePanel, { usage: down })));

    // The mail system that does not answer is said out loud.
    assert.match(html, /The mail system cannot be reached/);
    assert.match(html, /connect ECONNREFUSED 127\.0\.0\.1:8989/);

    // The limits of sending are not known, so they are not counted as zeros.
    assert.match(html, /not known/);
    assert.match(html, /not counted here as zeros/);
    assert.doesNotMatch(html, /Left<\/dt>/);
  });
});

describe('the removal of a plan', () => {
  it('is never sent without a confirmation', async () => {
    // The list offers the removal, but the server is not asked.
    calls.length = 0;
    const html = plain(
      render(
        createElement(products.AdminMailPlansTable, {
          plans: PLANS,
          mayWrite: true,
          onEdit: () => {},
          onDelete: () => {},
          onToggleSale: () => {},
        }),
      ),
    );
    assert.match(html, /Delete<\/button>/);
    assert.equal(calls.length, 0);

    // Without a confirmed removal nothing is sent to the server.
    assert.equal(await products.runMailPlanDelete(null), false);
    assert.equal(calls.length, 0);

    // The confirmation names the plan and says that a plan a customer bought
    // cannot be deleted.
    const dialog = plain(
      render(
        createElement(products.AdminMailPlanDeleteDialog, {
          plan: PLANS[0],
          busy: false,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      ),
    );
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /Delete Mail Starter/);
    assert.match(dialog, /cannot be deleted/);
    assert.match(dialog, /Type mail-starter to confirm/);

    // After the confirmation the plan is removed.
    calls.length = 0;
    assert.equal(await products.runMailPlanDelete({ kind: 'delete', plan: PLANS[0] }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'DELETE');
    assert.equal(calls[0]!.url, '/api/admin/mail/plans/mp1');
  });

  it('shows the refusal of the server as it comes', async () => {
    // The server refuses the plan a customer bought.
    await assert.rejects(
      () => products.runMailPlanDelete({ kind: 'delete', plan: PLANS[1] }),
      (error: Error & { status?: number }) => {
        assert.equal(error.name, 'ApiError');
        assert.equal(error.status, 409);
        assert.match(error.message, /This plan cannot be deleted: a customer bought it\./);
        return true;
      },
    );
  });
});
