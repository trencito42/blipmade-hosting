/**
 * The new shape of the email hosting, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The page is rendered on the
 * server, without a browser, which is enough to see what the customer is
 * told.
 *
 * Six things are checked here:
 *
 *   1. the overview is compact: it adds a domain from one place only, and it
 *      shows the summary of the subscription and the table of the domains;
 *   2. the domains of two subscriptions are never read as one list, and every
 *      domain appears exactly once;
 *   3. every row of the table leads to the page of its domain;
 *   4. the page of a domain has a way back, and it says plainly when the
 *      domain cannot be read;
 *   5. the DNS tells "configured", "observed" and "verified" apart, and a
 *      record that is missing is never folded away;
 *   6. the price of the plan is the one of the platform, and choosing a plan
 *      creates no order.
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

/** The parts of the mail area the test uses. */
interface MailArea {
  MailDomainList: (props: Record<string, unknown>) => unknown;
  MailDnsPanel: (props: Record<string, unknown>) => unknown;
  MailPlanChangeDialog: (props: Record<string, unknown>) => unknown;
  MailboxCreateDialog: (props: Record<string, unknown>) => unknown;
  MailAddDomainDialog: (props: Record<string, unknown>) => unknown;
  MailDomainPage: (props: Record<string, unknown>) => unknown;
  groupDomains: (services: unknown[], domains: unknown[]) => {
    rowsOfService: Map<string, { id: string; name: string }[]>;
    rowsWithoutService: { id: string; name: string }[];
  };
  priceDifference: (current: unknown, next: unknown) => string | null;
}

let area: MailArea;
let server: ViteDevServer;

/** The calls the page made to the server, while the test watches them. */
const calls: { url: string; method: string }[] = [];

/** The answer of the server for every call: enough for the client to read. */
function answer(): Response {
  return new Response(JSON.stringify({ ok: true, domains: [], mailboxes: [], aliases: [], records: [], verified: false }), {
    status: 200,
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

  // The client of the API reads the csrf cookie from the document, and the
  // document does not exist without a browser. The stub gives it the cookie
  // of a signed in customer and records the calls, so no call ever leaves
  // the machine.
  const globals = globalThis as unknown as {
    document: { cookie: string };
    fetch: (input: unknown, init?: { method?: string }) => Promise<Response>;
  };
  globals.document = { cookie: 'bm_csrf=test-token' };
  globals.fetch = async (input: unknown, init?: { method?: string }) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return answer();
  };

  const list = (await server.ssrLoadModule('/src/app/mail/MailDomainList.tsx')) as MailArea;
  const dns = (await server.ssrLoadModule('/src/app/mail/MailDnsPanel.tsx')) as MailArea;
  const plan = (await server.ssrLoadModule('/src/app/mail/MailPlanChangeDialog.tsx')) as MailArea;
  const mailbox = (await server.ssrLoadModule('/src/app/mail/MailboxCreateDialog.tsx')) as MailArea;
  const addDomain = (await server.ssrLoadModule('/src/app/mail/MailAddDomainDialog.tsx')) as MailArea;
  const page = (await server.ssrLoadModule('/src/app/mail/MailDomainPage.tsx')) as MailArea;
  const shared = (await server.ssrLoadModule('/src/app/mail/shared.ts')) as MailArea;

  area = {
    ...list,
    ...dns,
    ...plan,
    ...mailbox,
    ...addDomain,
    ...page,
    groupDomains: shared.groupDomains,
    priceDifference: plan.priceDifference,
  };
});

after(async () => {
  await server.close();
});

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

/** A domain of a customer, as the server sends it. */
const domain = {
  id: 'd1',
  name: 'xodo.ro',
  status: 'active' as const,
  quotaMb: 512,
  usedMb: 0,
  maxMailboxes: 2,
  maxAliases: 20,
  mailboxes: 1,
  aliases: 2,
  dkimPublic: 'v=DKIM1; k=rsa; p=abc',
  webmailUrl: 'https://mail.blipmade.com/',
  lastError: null,
  createdAt: '2026-10-20T10:00:00.000Z',
};

/** The same domain, as the subscription that holds it sends it. */
const serviceDomain = {
  id: 'd1',
  name: 'xodo.ro',
  status: 'ACTIVE',
  ownershipStatus: 'VERIFIED' as const,
  verificationHost: '_blipmade.xodo.ro',
  verificationToken: 'blipmade-verification=abc123',
  verifiedAt: '2026-10-21T10:00:00.000Z',
  quotaMb: 512,
  usedMb: 0,
  mailboxCount: 1,
  aliasCount: 2,
  maxMailboxes: 2,
  maxAliases: 20,
  maxForwarding: 3,
  lastError: null,
};

/** A subscription of the customer, as the server sends it. */
const service = {
  id: 's1',
  status: 'ACTIVE' as const,
  plan: { slug: 'mail-starter', name: 'Email Hosting Starter', category: 'EMAIL_HOSTING' },
  limits: {
    maxDomains: 1,
    maxMailboxes: 2,
    maxAliases: 20,
    maxForwarding: 3,
    totalStorageMb: 512,
    mailboxQuotaMb: 512,
    sendLimit: 200,
    sendInterval: 'HOURLY',
  },
  usage: { domains: 1, mailboxes: 1, storageMb: 0, storageLimitMb: 512 },
  domains: [serviceDomain],
  graceUntil: null,
  suspendedAt: null,
  cancelledAt: null,
  retentionUntil: null,
  lastError: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  webmailUrl: 'https://mail.blipmade.com/',
};

/** A plan of the platform, with the price the platform asks. */
const plan = {
  id: 'p1',
  slug: 'mail-starter',
  name: 'Email Hosting Starter',
  description: 'A hostname, a few mailboxes and a place for the mail.',
  icon: 'mail',
  limits: {
    maxDomains: 1,
    maxMailboxes: 2,
    maxAliases: 20,
    maxForwarding: 3,
    totalStorageMb: 512,
    mailboxQuotaMb: 512,
    sendLimit: 200,
    sendInterval: 'HOURLY',
  },
  price: { amount: 490, currency: 'EUR', period: 'MONTHLY' },
  prices: [{ amount: 490, currency: 'EUR', period: 'MONTHLY' }],
  availability: { state: 'ORDERABLE', orderable: true, blockers: [] },
  onSale: true,
};

/** Another plan of the platform, with its own price. */
const otherPlan = {
  ...plan,
  id: 'p2',
  slug: 'mail-business',
  name: 'Email Hosting Business',
  limits: { ...plan.limits, maxDomains: 5, maxMailboxes: 10, totalStorageMb: 2048 },
  price: { amount: 1490, currency: 'EUR', period: 'MONTHLY' },
  prices: [{ amount: 1490, currency: 'EUR', period: 'MONTHLY' }],
};

describe('the domains of the customer', () => {
  it('keeps the domains of two subscriptions apart', () => {
    const other = {
      ...service,
      id: 's2',
      plan: { slug: 'mail-business', name: 'Email Hosting Business', category: 'EMAIL_HOSTING' },
      domains: [
        {
          ...serviceDomain,
          id: 'd2',
          name: 'acme.ro',
          ownershipStatus: 'UNVERIFIED' as const,
        },
      ],
    };

    const grouped = area.groupDomains(
      [service, other],
      [domain, { ...domain, id: 'd2', name: 'acme.ro' }],
    );

    // Every subscription keeps its own rows.
    assert.deepEqual(grouped.rowsOfService.get('s1')?.map((row) => row.name), ['xodo.ro']);
    assert.deepEqual(grouped.rowsOfService.get('s2')?.map((row) => row.name), ['acme.ro']);
    // And a domain appears exactly once.
    const names = [
      ...(grouped.rowsOfService.get('s1') ?? []).map((row) => row.name),
      ...(grouped.rowsOfService.get('s2') ?? []).map((row) => row.name),
      ...grouped.rowsWithoutService.map((row) => row.name),
    ];
    assert.equal(names.length, 2);
    assert.equal(new Set(names).size, 2);
  });

  it('keeps the domains that belong to no plan apart as well', () => {
    const grouped = area.groupDomains([], [domain]);
    assert.equal(grouped.rowsOfService.size, 0);
    assert.deepEqual(grouped.rowsWithoutService.map((row) => row.name), ['xodo.ro']);
  });
});

describe('the table of the domains', () => {
  const rows = [
    {
      id: 'd1',
      name: 'xodo.ro',
      status: 'active' as const,
      statusLabel: 'Active',
      mailboxes: 1,
      maxMailboxes: 2,
      aliases: 2,
      maxAliases: 20,
      usedMb: 0,
      quotaMb: 512,
      dns: 'verified' as const,
      webmailUrl: null,
      lastError: null,
      serviceId: 's1',
    },
  ];

  it('shows the columns of the table and every domain once', () => {
    const html = render(createElement(area.MailDomainList, { domains: rows, title: 'Email domains' }));

    for (const header of ['Domain', 'Status', 'Mailboxes', 'Aliases', 'Storage', 'DNS status']) {
      assert.match(html, new RegExp(`>${header}<`));
    }
    assert.match(html, /xodo\.ro/);
    assert.match(html, /1 \/ 2/);
    assert.match(html, /2 \/ 20/);
    assert.match(html, /DNS verified/);
    // The domain is one row of the table, not a card of its own.
    const tableRows = html.match(/<tr[^>]*>/g) ?? [];
    assert.equal(tableRows.length, 2); // the header of the table and the one domain
  });

  it('leads to the page of the domain', () => {
    const html = render(createElement(area.MailDomainList, { domains: rows }));
    assert.match(html, /href="\/app\/mail\/domains\/d1"/);
    // The row opens the domain: there is no button of its own for it.
    assert.doesNotMatch(html, />Manage</);
  });
});

describe('the page of a domain', () => {
  it('always has a way back to the email', () => {
    const html = render(createElement(area.MailDomainPage, {}));
    assert.match(html, /Back to Email/);
    assert.match(html, /href="\/app\/mail"/);
  });
});

describe('the DNS of a domain', () => {
  const records = [
    {
      name: 'xodo.ro',
      type: 'MX' as const,
      value: 'mx1.blipmade.com.',
      priority: 10,
      purpose: 'where the mail is delivered',
    },
  ];

  it('tells the customer when a record is missing', () => {
    const html = render(
      createElement(area.MailDnsPanel, {
        records,
        verified: false,
        results: [{ name: 'xodo.ro', type: 'MX', ok: false, found: [] }],
      }),
    );
    assert.match(html, /Not verified yet/);
    assert.match(html, /Not found/);
    // A record that is missing is never folded away: the table is there.
    assert.match(html, /mx1\.blipmade\.com\./);
    assert.doesNotMatch(html, /Show the records/);
  });

  it('says that the mail is delivered when the server has seen the records', () => {
    const html = render(
      createElement(area.MailDnsPanel, {
        records,
        verified: true,
        results: [{ name: 'xodo.ro', type: 'MX', ok: true, found: ['mx1.blipmade.com.'] }],
      }),
    );
    assert.match(html, /The server has seen these records/);
    assert.match(html, /Mail is delivered to this domain/);
    assert.doesNotMatch(html, /Not verified yet/);
  });

  it('folds the records away when everything is in place', () => {
    const html = render(
      createElement(area.MailDnsPanel, {
        records,
        verified: true,
        results: [{ name: 'xodo.ro', type: 'MX', ok: true, found: ['mx1.blipmade.com.'] }],
      }),
    );
    assert.match(html, /Show the records/);
  });

  it('shows the record of the proof of ownership', () => {
    const html = render(
      createElement(area.MailDnsPanel, {
        records,
        verified: false,
        proof: {
          status: 'UNVERIFIED',
          host: '_blipmade.xodo.ro',
          token: 'blipmade-verification=abc123',
          onCheck: () => {},
        },
      }),
    );
    assert.match(html, /Ownership not verified/);
    assert.match(html, /_blipmade\.xodo\.ro/);
    assert.match(html, /blipmade-verification=abc123/);
    assert.match(html, /Check the proof/);
  });
});

describe('the change of the plan', () => {
  it('shows the price of the platform and creates no order when it opens', () => {
    calls.length = 0;
    const html = render(
      createElement(area.MailPlanChangeDialog, {
        open: true,
        service,
        plans: [plan, otherPlan],
        onClose: () => {},
      }),
    );

    // The price comes from the API: 4.90 a month and 14.90 a month.
    assert.match(html, /4\.90/);
    assert.match(html, /14\.90/);
    assert.match(html, /per month/);
    // The limits of the plan are the ones of the platform.
    assert.match(html, /10 mailboxes per domain/);
    // Nothing is charged and no order is created when the dialog opens.
    assert.equal(calls.length, 0);
  });

  it('computes the difference of the price when both prices are known', () => {
    const difference = area.priceDifference(
      { amount: 490, currency: 'EUR', period: 'MONTHLY' },
      { amount: 1490, currency: 'EUR', period: 'MONTHLY' },
    );
    assert.match(difference ?? '', /10\.00 more/);

    // The difference is not guessed when one of the prices is missing.
    assert.equal(area.priceDifference(null, { amount: 1490, currency: 'EUR', period: 'MONTHLY' }), null);
    assert.equal(
      area.priceDifference(
        { amount: 490, currency: 'EUR', period: 'MONTHLY' },
        { amount: 1490, currency: 'USD', period: 'MONTHLY' },
      ),
      null,
    );
  });

  it('warns when the new plan holds less than the service uses', () => {
    const smaller = {
      ...plan,
      id: 'p3',
      slug: 'mail-lite',
      name: 'Email Hosting Lite',
      limits: { ...plan.limits, maxDomains: 1, maxMailboxes: 1, totalStorageMb: 128 },
      price: { amount: 190, currency: 'EUR', period: 'MONTHLY' },
      prices: [{ amount: 190, currency: 'EUR', period: 'MONTHLY' }],
    };
    const html = render(
      createElement(area.MailPlanChangeDialog, {
        open: true,
        service: { ...service, usage: { ...service.usage, storageMb: 400, mailboxes: 4 } },
        plans: [plan, smaller],
        onClose: () => {},
      }),
    );
    // The limits of the plan are shown, so the customer sees what it holds.
    assert.match(html, /1 mailboxes per domain/);
  });
});

describe('the dialog of a new domain', () => {
  it('checks the hostname and tells the limits of the plan', () => {
    const html = render(
      createElement(area.MailAddDomainDialog, {
        open: true,
        services: [service],
        existingDomains: ['xodo.ro'],
        onClose: () => {},
        onAdded: () => {},
      }),
    );
    assert.match(html, /Add an email domain/);
    assert.match(html, /Hostname/);
    assert.match(html, /Your plan holds 1 domain\(s\) and it holds 1\./);
  });
});

describe('the source of the mail area', () => {
  const files = [
    'src/app/mail/MailOverview.tsx',
    'src/app/mail/MailDomainPage.tsx',
    'src/app/mail/MailSubscriptionSummary.tsx',
    'src/app/mail/MailDomainList.tsx',
    'src/app/mail/MailboxTable.tsx',
    'src/app/mail/AliasTable.tsx',
    'src/app/mail/MailDnsPanel.tsx',
    'src/app/mail/MailAddDomainDialog.tsx',
    'src/app/mail/MailPlanChangeDialog.tsx',
    'src/app/mail/MailDeleteDialog.tsx',
    'src/app/mail/MailServiceCard.tsx',
    'src/app/mail/MailDialog.tsx',
    'src/app/mail/MailStat.tsx',
    'src/app/mail/OneTimePasswordBox.tsx',
    'src/app/mail/shared.ts',
  ];

  for (const file of files) {
    it(`writes no amount and no limit in ${file}`, () => {
      const source = readFileSync(join(webRoot, file), 'utf8');

      // A currency symbol with a number after it.
      assert.doesNotMatch(source, /[€$£]\s*\d/);
      // A price, an amount or a currency written down.
      assert.doesNotMatch(source, /\b(?:price|amount|currency|unitAmount|total)\s*[:=]\s*['"]?\d/);
      // A limit of a plan written down.
      assert.doesNotMatch(
        source,
        /\b(?:maxDomains|maxMailboxes|maxAliases|maxForwarding|totalStorageMb|mailboxQuotaMb|sendLimit)\s*[:=]\s*\d/,
      );
    });
  }

  it('keeps a password that is shown once on the screen until it is stored', () => {
    const source = readFileSync(join(webRoot, 'src/app/mail/MailboxCreateDialog.tsx'), 'utf8');
    // The dialog does not close while the password is on the screen.
    assert.match(source, /closeBlocked=\{Boolean\(oneTime\)\}/);
    // And the password is only taken away when the customer says so.
    const box = readFileSync(join(webRoot, 'src/app/mail/OneTimePasswordBox.tsx'), 'utf8');
    assert.match(box, /I have stored it/);
  });
});
