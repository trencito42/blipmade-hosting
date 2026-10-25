/**
 * The storefront of hosted mail, the add-on of hosted mail at the checkout of
 * a server and the dashboard of the mail services, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The components are rendered
 * on the server, without a browser, which is enough to see what the customer
 * is told.
 *
 * Six things are checked here:
 *
 *   1. the storefront shows the limits and the price of the platform, and a
 *      plan that is not on sale is shown as not on sale, with the reason of
 *      the platform, and cannot be bought;
 *   2. no amount and no limit is written in the source of the interface: every
 *      number the customer reads comes from the API;
 *   3. the add-on of hosted mail of a server is never preselected and it is a
 *      line of its own in the summary of the order;
 *   4. the order that carries the add-on has two lines, and the line of the
 *      mail has no resources of its own;
 *   5. the dashboard shows the state of a service, the use of it and the proof
 *      of ownership, and a proof that is refused is an explanation and not an
 *      error;
 *   6. nothing is cancelled without a confirmation.
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

/** The storefront, as the test uses it. */
interface StorefrontUi {
  default: (props: Record<string, unknown>) => unknown;
  MailPlanCard: (props: Record<string, unknown>) => unknown;
  mailPlanBlockers: (plan: unknown) => string[];
  mailCheckoutPath: (slug: string) => string;
  MAIL_CHECKOUT_PATH: string;
}

/** The dashboard of the mail, as the test uses it. */
interface MailUi {
  default: (props: Record<string, unknown>) => unknown;
  MailServiceCard: (props: Record<string, unknown>) => unknown;
  MailOwnershipProof: (props: Record<string, unknown>) => unknown;
  MailServiceCancelDialog: (props: Record<string, unknown>) => unknown;
  runMailServiceCancel: (request: unknown) => Promise<boolean>;
  validateMailDomainName: (name: string) => string | null;
}

/** The checkout of a server, as the test uses it. */
interface DeployUi {
  buildDeployOrderItems: (server: unknown, mail: unknown) => Record<string, unknown>[];
  DeployMailLine: (props: Record<string, unknown>) => unknown;
}

let storefront: StorefrontUi;
let mail: MailUi;
let deploy: DeployUi;
let server: ViteDevServer;

/** The calls the page made to the server, while the test watches them. */
const calls: { url: string; method: string }[] = [];

/** The answer of the server for every call: enough for the client to read. */
function answer(): Response {
  return new Response(JSON.stringify({ ok: true, plans: [], services: [], domains: [] }), {
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
  // document does not exist without a browser. The stub gives it the cookie of
  // a signed in customer and records the calls, so no call ever leaves the
  // machine.
  const globals = globalThis as unknown as {
    document: { cookie: string };
    fetch: (input: unknown, init?: { method?: string }) => Promise<Response>;
  };
  globals.document = { cookie: 'bm_csrf=test-token' };
  globals.fetch = async (input: unknown, init?: { method?: string }) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return answer();
  };

  storefront = (await server.ssrLoadModule('/src/app/EmailHosting.tsx')) as StorefrontUi;
  mail = (await server.ssrLoadModule('/src/app/Mail.tsx')) as MailUi;
  deploy = (await server.ssrLoadModule('/src/app/Deploy.tsx')) as DeployUi;
});

after(async () => {
  await server.close();
});

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

/** A plan of hosted mail, as the public catalog of the platform sends it. */
const plan = {
  id: 'p1',
  slug: 'mail-starter',
  name: 'Starter',
  description: 'A hostname, a few mailboxes and a place for the mail.',
  icon: 'mail',
  limits: {
    maxDomains: 2,
    maxMailboxes: 5,
    maxAliases: 20,
    maxForwarding: 3,
    totalStorageMb: 2048,
    mailboxQuotaMb: 512,
    sendLimit: 200,
    sendInterval: 'HOURLY',
  },
  price: { amount: 490, currency: 'EUR', period: 'MONTHLY' },
  prices: [{ amount: 490, currency: 'EUR', period: 'MONTHLY' }],
  availability: { state: 'ORDERABLE', orderable: true, blockers: [] },
  onSale: true,
};

/** A plan of hosted mail whose sale is closed by the operator. */
const closedPlan = {
  ...plan,
  id: 'p2',
  slug: 'mail-business',
  name: 'Business',
  price: null,
  prices: [],
  availability: {
    state: 'CLOSED',
    orderable: false,
    blockers: ['The sale of hosted mail is closed at the moment.'],
  },
  onSale: false,
};

/** A mail service of the customer, as the dashboard receives it. */
const service = {
  id: 's1',
  status: 'ACTIVE' as const,
  plan: { slug: 'mail-starter', name: 'Starter', category: 'EMAIL_HOSTING' },
  limits: plan.limits,
  usage: { domains: 1, mailboxes: 3, storageMb: 120, storageLimitMb: 2048 },
  domains: [
    {
      id: 'd1',
      name: 'acme.ro',
      status: 'ACTIVE',
      ownershipStatus: 'UNVERIFIED' as const,
      verificationHost: '_blipmade.acme.ro',
      verificationToken: 'blipmade-verification=abc123',
      verifiedAt: null,
      quotaMb: 2048,
      usedMb: 120,
      mailboxCount: 3,
      aliasCount: 1,
      maxMailboxes: 5,
      maxAliases: 20,
      maxForwarding: 3,
      lastError: null,
    },
  ],
  graceUntil: null,
  suspendedAt: null,
  cancelledAt: null,
  retentionUntil: '2026-11-30T00:00:00.000Z',
  lastError: null,
  createdAt: '2026-10-20T10:00:00.000Z',
};

describe('the storefront of hosted mail', () => {
  it('shows the limits and the price that come from the API', () => {
    const html = render(createElement(storefront.MailPlanCard, { plan }));

    // The plan itself.
    assert.match(html, /Starter/);
    assert.match(html, /A hostname, a few mailboxes and a place for the mail\./);

    // Every limit of the plan, with the number the platform gave.
    assert.match(html, /Domains<\/dt><dd[^>]*>2<\/dd>/);
    assert.match(html, /Mailboxes per domain<\/dt><dd[^>]*>5<\/dd>/);
    assert.match(html, /Aliases per domain<\/dt><dd[^>]*>20<\/dd>/);
    assert.match(html, /Forwarding rules per domain<\/dt><dd[^>]*>3<\/dd>/);
    assert.match(html, /Space of the plan<\/dt><dd[^>]*>2 GB<\/dd>/);
    assert.match(html, /Space per mailbox<\/dt><dd[^>]*>512 MB<\/dd>/);
    assert.match(html, /Sending<\/dt><dd[^>]*>200 messages per hour<\/dd>/);

    // The price, with its period.
    assert.match(html, /4\.90/);
    assert.match(html, /\/mo/);
    assert.match(html, /per month/);
    assert.match(html, /data-on-sale="yes"/);
  });

  it('shows a plan that is not on sale as not on sale, with the reason', () => {
    const html = render(createElement(storefront.MailPlanCard, { plan: closedPlan }));

    assert.match(html, /Not on sale yet/);
    assert.match(html, /data-on-sale="no"/);
    // The reason is the one of the platform.
    assert.match(html, /The sale of hosted mail is closed at the moment\./);
    assert.deepEqual(storefront.mailPlanBlockers(closedPlan), [
      'The sale of hosted mail is closed at the moment.',
    ]);
  });

  it('cannot sell a plan that is not on sale, but it can still be read', () => {
    const html = render(createElement(storefront.MailPlanCard, { plan: closedPlan }));

    // The button of a plan that cannot be bought is disabled.
    assert.match(html, /<button[^>]*disabled[^>]*>\s*Not on sale yet/);
    assert.doesNotMatch(html, /Choose this plan/);

    // The plan itself is still read: its name, its description and its limits.
    assert.match(html, /Business/);
    assert.match(html, /A hostname, a few mailboxes and a place for the mail\./);
    assert.match(html, /Mailboxes per domain<\/dt><dd[^>]*>5<\/dd>/);
  });

  it('sends the customer to the checkout of the plan they chose', () => {
    const target = storefront.mailCheckoutPath('mail-starter');
    assert.match(target, /plan=mail-starter/);
    assert.match(target, new RegExp(storefront.MAIL_CHECKOUT_PATH.replace(/\//g, '\\/')));
  });

  it('renders as a public page of the site', () => {
    const html = render(createElement(storefront.default, {}));
    assert.match(html, /Email hosting/);
    assert.match(html, /Your own mail, on your own domain\./);
  });
});

describe('the source of the interface of hosted mail', () => {
  const files = ['src/app/EmailHosting.tsx', 'src/app/Mail.tsx', 'src/app/Deploy.tsx'];

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
});

describe('the add-on of hosted mail at the checkout of a server', () => {
  it('is never chosen by default', () => {
    const source = readFileSync(join(webRoot, 'src/app/Deploy.tsx'), 'utf8');

    // The state of the add-on starts empty: no plan is preselected.
    assert.match(source, /const \[mailPlanSlug, setMailPlanSlug\] = useState\(''\)/);
    // The first choice of the list is the one without hosted mail.
    assert.match(source, /<option value="">No email hosting<\/option>/);
  });

  it('is a line of its own in the summary of the order', () => {
    const html = render(
      createElement(deploy.DeployMailLine, {
        plan,
        amount: 490,
        currency: 'EUR',
        period: 'MONTHLY',
        hostname: 'acme.ro',
      }),
    );

    // Its own row, with its own recurring price, under the row of the server.
    assert.match(html, /<dt[^>]*>Hosted mail · Starter<\/dt>/);
    assert.match(html, /4\.90/);
    assert.match(html, /\/mo/);
    assert.match(html, /acme\.ro/);
  });

  it('is not in the summary when there is no add-on', () => {
    const html = render(
      createElement(deploy.DeployMailLine, {
        plan: null,
        amount: null,
        currency: null,
        period: '',
        hostname: '',
      }),
    );
    assert.equal(html, '');
  });
});

describe('the order that carries the add-on of hosted mail', () => {
  const serverLine = {
    productSlug: 'vps-small',
    name: 'acme',
    ram: 2048,
    cpu: 2,
    disk: 40,
    optionCodes: ['backup'],
  };

  it('sends the server and the hosted mail as two lines', () => {
    const items = deploy.buildDeployOrderItems(serverLine, {
      productSlug: 'mail-starter',
      mailDomain: 'acme.ro',
    });

    assert.equal(items.length, 2);

    const [first, second] = items as [Record<string, unknown>, Record<string, unknown>];
    assert.equal(first.productSlug, 'vps-small');
    assert.equal(first.ram, 2048);
    assert.equal(first.cpu, 2);
    assert.equal(first.disk, 40);

    assert.equal(second.productSlug, 'mail-starter');
    assert.equal(second.mailDomain, 'acme.ro');
    // The line of the mail names the plan and the domain, and nothing else.
    assert.equal('ram' in second, false);
    assert.equal('cpu' in second, false);
    assert.equal('disk' in second, false);
    assert.deepEqual(Object.keys(second).sort(), ['mailDomain', 'productSlug']);
  });

  it('sends one line when there is no add-on', () => {
    const items = deploy.buildDeployOrderItems(serverLine, null);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.productSlug, 'vps-small');
  });
});

describe('the dashboard of the mail services', () => {
  it('shows the section of the email hosting on the page', () => {
    const html = render(createElement(mail.default, {}));
    assert.match(html, /Email hosting/);
  });

  it('shows the state of the service, its use and its domains', () => {
    const html = render(
      createElement(mail.MailServiceCard, { service, plans: [plan], dns: [], proof: {} }),
    );

    // The state of the service, in a word.
    assert.match(html, /Active/);
    // The use of the service.
    assert.match(html, /3 \/ 5/);
    assert.match(html, /120 MB/);
    assert.match(html, /of 2 GB/);
    assert.match(html, /1 \/ 2/);
    // The domain and its state.
    assert.match(html, /acme\.ro/);
  });

  it('shows the proof of ownership and the record to publish', () => {
    const html = render(
      createElement(mail.MailServiceCard, {
        service,
        plans: [plan],
        dns: [],
        proof: {},
        onVerifyDomain: () => {},
      }),
    );

    assert.match(html, /The proof is not published yet/);
    assert.match(html, /_blipmade\.acme\.ro/);
    assert.match(html, /blipmade-verification=abc123/);
    assert.match(html, /Check the proof/);
  });

  it('shows a proof that is refused as an explanation and not as an error', () => {
    const message = 'The record of the proof has not been seen yet. Publish it and ask again.';
    const html = render(
      createElement(mail.MailServiceCard, {
        service,
        plans: [],
        dns: [],
        proof: { d1: { verified: false, message } },
      }),
    );

    assert.match(html, /The proof is not accepted yet\./);
    assert.match(html, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /data-proof-state="refused"/);

    // The answer of the server is an explanation of what to publish, so it is
    // not an error and it does not shout at the customer.
    const at = html.indexOf(message);
    assert.ok(at > 0);
    const before = html.slice(Math.max(0, at - 800), at);
    assert.match(before, /role="status"/);
    assert.doesNotMatch(before, /role="alert"/);
    assert.doesNotMatch(before, /text-bad/);
  });

  it('says that the webmail is not set up when the platform gives none', () => {
    const html = render(
      createElement(mail.MailServiceCard, { service, plans: [plan], dns: [], proof: {} }),
    );
    assert.match(html, /The webmail is not set up on this platform\./);
    assert.doesNotMatch(html, /Open webmail/);
  });
});

describe('the cancel of a mail service', () => {
  it('never reaches the server without a confirmation', async () => {
    const before = calls.length;
    const done = await mail.runMailServiceCancel(null);
    assert.equal(done, false);
    assert.equal(calls.length, before);
  });

  it('asks first, and says that the data is kept until the retention ends', () => {
    const html = render(
      createElement(mail.MailServiceCancelDialog, {
        request: service,
        onCancel: () => {},
        onConfirm: () => {},
      }),
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /Cancel this mail service\?/);
    assert.match(html, /The data of the service is kept until/);
  });
});
