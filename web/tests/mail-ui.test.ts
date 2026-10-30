/**
 * The page of the email hosting, checked without a screen.
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
 * Four things are checked here:
 *
 *   1. the name of a domain is checked before it is sent, so a page address
 *      is never taken for a hostname;
 *   2. the DNS records are shown with their purpose, and the customer is
 *      told plainly when the mail is not delivered yet;
 *   3. the password the server made is shown once and stays on the screen
 *      while the list of the mailboxes is loaded again;
 *   4. nothing is deleted without a confirmation.
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
interface MailUi {
  default: (props: Record<string, unknown>) => unknown;
  MailDomainSection: (props: Record<string, unknown>) => unknown;
  MailDeleteDialog: (props: Record<string, unknown>) => unknown;
  OneTimePasswordBox: (props: Record<string, unknown>) => unknown;
  validateMailDomainName: (name: string) => string | null;
  validateMailLocalPart: (part: string) => string | null;
  validateMailAlias: (input: string, domainName: string) => string | null;
  mailAliasAddress: (input: string, domainName: string) => string | null;
  runMailDelete: (request: unknown) => Promise<string | null>;
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
  icon: string;
}

let ui: MailUi;
let server: ViteDevServer;
let routes: RouteDef[] = [];
let customerNav: NavEntry[] = [];

/** The calls the page made to the server, while the test watches them. */
const calls: { url: string; method: string }[] = [];

/** The answer of the server for every call: enough for the client to read. */
function answer(): Response {
  return new Response(JSON.stringify({ ok: true, domains: [], mailboxes: [], aliases: [] }), {
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

  ui = (await server.ssrLoadModule('/src/app/Mail.tsx')) as MailUi;
  const router = (await server.ssrLoadModule('/src/routes.tsx')) as { ROUTES: RouteDef[] };
  routes = router.ROUTES;
  const nav = (await server.ssrLoadModule('/src/nav.ts')) as { CUSTOMER_NAV: NavEntry[] };
  customerNav = nav.CUSTOMER_NAV;

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
  name: 'acme.ro',
  status: 'active' as const,
  quotaMb: 1024,
  usedMb: 120,
  maxMailboxes: 10,
  maxAliases: 20,
  mailboxes: 1,
  aliases: 1,
  dkimPublic: 'v=DKIM1; k=rsa; p=abc',
  webmailUrl: 'https://mail.acme.ro/',
  lastError: null,
  createdAt: '2026-10-20T10:00:00.000Z',
};

/** A mailbox of the domain above. */
const mailbox = {
  id: 'm1',
  address: 'contact@acme.ro',
  status: 'active' as const,
  quotaMb: 256,
  usedMb: 12,
  createdAt: '2026-10-20T10:05:00.000Z',
};

/** An alias of the domain above. */
const alias = {
  id: 'a1',
  alias: 'info@acme.ro',
  target: 'contact@acme.ro',
  createdAt: '2026-10-20T10:06:00.000Z',
};

/** The records the customer has to publish. */
const records = [
  {
    name: 'acme.ro',
    type: 'MX' as const,
    value: 'mx1.blipmade.com.',
    priority: 10,
    purpose: 'where the mail is delivered',
  },
  {
    name: 'dkim._domainkey.acme.ro',
    type: 'TXT' as const,
    value: 'v=DKIM1; k=rsa; p=abc',
    purpose: 'the key that proves the mail comes from this domain',
  },
];

/** The section of a domain, as the page builds it. */
function section(overrides: Record<string, unknown> = {}): string {
  return render(
    createElement(ui.MailDomainSection, {
      domain,
      mailboxes: [mailbox],
      aliases: [alias],
      records,
      verified: false,
      oneTimePassword: null,
      ...overrides,
    }),
  );
}

describe('the name of an email domain', () => {
  it('accepts the hostname of a domain', () => {
    assert.equal(ui.validateMailDomainName('acme.ro'), null);
    assert.equal(ui.validateMailDomainName('sub.acme.ro'), null);
    assert.equal(ui.validateMailDomainName('  acme.ro  '), null);
    assert.equal(ui.validateMailDomainName('ACME.RO'), null);
  });

  it('refuses a name that is not a hostname', () => {
    // A name without a dot is not a hostname.
    assert.ok(ui.validateMailDomainName('acme'));
    // A page is not a hostname.
    assert.ok(ui.validateMailDomainName('http://acme.ro'));
    // A path is not a hostname either.
    assert.ok(ui.validateMailDomainName('acme.ro/path'));
    // Nothing is not a hostname.
    assert.ok(ui.validateMailDomainName(''));
  });

  it('tells the customer what is wrong with the name', () => {
    assert.match(ui.validateMailDomainName('') ?? '', /Enter the hostname/);
    assert.match(ui.validateMailDomainName('acme') ?? '', /at least one dot/);
    assert.match(ui.validateMailDomainName('http://acme.ro') ?? '', /without a protocol/);
    assert.match(ui.validateMailDomainName('acme.ro/path') ?? '', /without a path/);
    assert.match(ui.validateMailDomainName('acme ro') ?? '', /cannot contain spaces/);
    assert.match(ui.validateMailDomainName('acme.-ro') ?? '', /not a valid hostname/);
  });

  it('checks the name of a mailbox and the alias of a domain', () => {
    assert.equal(ui.validateMailLocalPart('contact'), null);
    assert.ok(ui.validateMailLocalPart('contact acme'));
    assert.equal(ui.validateMailAlias('info', 'acme.ro'), null);
    assert.ok(ui.validateMailAlias('info@other.com', 'acme.ro'));
    // The alias always belongs to the domain of the page.
    assert.equal(ui.mailAliasAddress('info', 'acme.ro'), 'info@acme.ro');
    assert.equal(ui.mailAliasAddress('info@acme.ro', 'acme.ro'), 'info@acme.ro');
  });
});

describe('the DNS records of a domain', () => {
  it('shows every record with its value', () => {
    const html = section();
    for (const record of records) {
      assert.match(html, new RegExp(record.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(html, /MX/);
    assert.match(html, /TXT/);
  });

  it('says plainly that the mail is not delivered while the records are not there', () => {
    const html = section({ verified: false });
    assert.match(html, /Not verified yet/);
    assert.match(html, /not delivered/i);
    assert.match(html, /published at your registrar/);
  });

  it('says that the mail is delivered when the server has seen the records', () => {
    const html = section({ verified: true });
    assert.match(html, /The server has seen these records/);
    assert.match(html, /Mail is delivered to this domain/);
    assert.doesNotMatch(html, /Not verified yet/);
  });
});

describe('the password of a new mailbox', () => {
  const secret = 'k7-Generated-Secret-42';

  it('is shown once, in a box that says so', () => {
    const html = section({ oneTimePassword: { address: 'contact@acme.ro', password: secret } });
    // The password is on the screen, and it is on the screen once.
    assert.equal(html.split(secret).length - 1, 1);
    assert.match(html, /shown only once/i);
    assert.match(html, /store it/i);
    assert.match(html, /contact@acme\.ro/);
  });

  it('stays on the screen when the list of the mailboxes is loaded again', () => {
    // The list of the mailboxes is drawn again, with another mailbox in it.
    const reloaded = section({
      mailboxes: [{ ...mailbox, id: 'm2', address: 'sales@acme.ro' }],
      oneTimePassword: { address: 'contact@acme.ro', password: secret },
    });
    assert.equal(reloaded.split(secret).length - 1, 1);
    assert.match(reloaded, /shown only once/i);
    assert.match(reloaded, /sales@acme\.ro/);
  });

  it('is never written to the console, to the storage of the browser or to the address of the page', () => {
    const source = readFileSync(join(webRoot, 'src/app/Mail.tsx'), 'utf8');
    assert.doesNotMatch(source, /console\./);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /document\.cookie/);

    const html = section({ oneTimePassword: { address: 'contact@acme.ro', password: secret } });
    // The password is not in a link of the page, so it is not in the address
    // of the browser and not in the history of the customer.
    assert.doesNotMatch(html, new RegExp(`href="[^"]*${secret}`));
  });

  it('is not part of the list of the mailboxes', () => {
    // The server sends the password only when it made one, and the list of
    // the mailboxes never carries it.
    const html = section({ oneTimePassword: null });
    assert.doesNotMatch(html, new RegExp(secret));
  });
});

describe('a delete needs a confirmation', () => {
  it('asks the server for nothing when there is no confirmation', async () => {
    calls.length = 0;
    const result = await ui.runMailDelete(null);
    assert.equal(result, null);
    assert.equal(calls.length, 0);
  });

  it('asks before the delete and says that it cannot be undone', () => {
    const html = render(
      createElement(ui.MailDeleteDialog, {
        request: { kind: 'domain', domain },
        busy: false,
        onCancel: () => {},
        onConfirm: () => {},
      }),
    );
    assert.match(html, /role="dialog"/);
    assert.match(html, /Delete this email domain\?/);
    assert.match(html, /cannot be undone/);
    // The name of the domain has to be typed, so the delete is deliberate.
    assert.match(html, /Type acme\.ro to confirm/);
  });

  it('has no dialog when nothing is to be deleted', () => {
    const html = render(
      createElement(ui.MailDeleteDialog, {
        request: null,
        busy: false,
        onCancel: () => {},
        onConfirm: () => {},
      }),
    );
    assert.equal(html, '');
  });

  it('deletes a domain only once the customer confirmed it', async () => {
    calls.length = 0;
    const result = await ui.runMailDelete({ kind: 'domain', domain });
    assert.equal(result, 'domain');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'DELETE');
    assert.equal(calls[0]!.url, '/api/mail/domains/d1');
  });

  it('deletes a mailbox and an alias of the domain', async () => {
    calls.length = 0;
    assert.equal(await ui.runMailDelete({ kind: 'mailbox', domain, mailbox }), 'mailbox');
    assert.equal(calls[0]!.url, '/api/mail/domains/d1/mailboxes/m1');
    assert.equal(calls[0]!.method, 'DELETE');

    calls.length = 0;
    assert.equal(await ui.runMailDelete({ kind: 'alias', domain, alias }), 'alias');
    assert.equal(calls[0]!.url, '/api/mail/domains/d1/aliases/a1');
    assert.equal(calls[0]!.method, 'DELETE');
  });
});

describe('the page of the email hosting', () => {
  it('draws the form of a new domain', () => {
    const html = render(createElement(ui.default, {}));
    assert.match(html, /Add an email domain/);
    assert.match(html, /Hostname/);
    assert.match(html, /Your email domains/);
  });

  it('has its own route in the customer area', () => {
    const route = routes.find((entry) => entry.pattern === '/app/mail');
    assert.ok(route, 'the route /app/mail is missing from the router');
    assert.equal(route!.area, 'customer');
    assert.ok(route!.component, 'the route /app/mail has no page');
  });

  it('is in the navigation of the customer', () => {
    const entry = customerNav.find((item) => item.to === '/app/mail');
    assert.ok(entry, 'the page is not in the navigation of the customer');
    assert.equal(entry!.label, 'Email');
  });

  it('is written in English', () => {
    const source = readFileSync(join(webRoot, 'src/app/Mail.tsx'), 'utf8');
    // The platform speaks English in the customer area.
    assert.doesNotMatch(source, /[ăâîțșşțĂÂÎȚȘŞ]/);
    assert.match(source, /Add an email domain/);
    assert.match(source, /DNS records to publish/);
  });
});
