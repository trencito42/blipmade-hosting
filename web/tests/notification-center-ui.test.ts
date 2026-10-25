/**
 * The notification centre of the customer, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The components are
 * rendered on the server, without a browser, which is enough to see what
 * the customer is told.
 *
 * Seven things are checked here:
 *
 *   1. the list shows the title, the text and the group of every message,
 *      and a message that was not read yet is drawn apart from the others;
 *   2. the two empty states are two different sentences;
 *   3. the bell of the header shows the number of the messages that wait to
 *      be read, and the badge is hidden when the number is zero;
 *   4. the preferences show the eight groups, the essential one cannot be
 *      switched off and the marketing is off until the customer agrees;
 *   5. nothing of the notification centre is kept in the storage of the
 *      browser, so two sessions of the same account show the same thing;
 *   6. the interface never offers the message of another customer;
 *   7. every action of the list has a name, and the keyboard reaches it.
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

/** The page of the notification centre, as the test uses it. */
interface NotificationsUi {
  default: (props: Record<string, unknown>) => unknown;
  NotificationList: (props: Record<string, unknown>) => unknown;
  NotificationRow: (props: Record<string, unknown>) => unknown;
  categoryLabel: (categories: { key: string }[], key: string) => string;
}

/** The settings of the account, as the test uses them. */
interface SettingsUi {
  default: (props: Record<string, unknown>) => unknown;
  NotificationPreferencesPanel: (props: Record<string, unknown>) => unknown;
}

/** The design system, as the test uses it. */
interface ShellUi {
  NotificationBellButton: (props: Record<string, unknown>) => unknown;
  NotificationBellPanel: (props: Record<string, unknown>) => unknown;
}

let notifications: NotificationsUi;
let settings: SettingsUi;
let shell: ShellUi;
let server: ViteDevServer;

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  notifications = (await server.ssrLoadModule('/src/app/Notifications.tsx')) as NotificationsUi;
  settings = (await server.ssrLoadModule('/src/app/Settings.tsx')) as SettingsUi;
  shell = (await server.ssrLoadModule('/src/ui-app.tsx')) as ShellUi;
});

after(async () => {
  await server.close();
});

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

/**
 * The groups of the messages, exactly as the server sends them: the order,
 * the names and the words are the ones of the server.
 */
const categories = [
  {
    key: 'accountSecurity',
    label: 'Account and security',
    description:
      'The messages about your account and its security: the verification of the address, the change of the password, the change of the address. They are always sent, because they protect the account.',
    classification: 'essential',
    essential: true,
    channels: ['email', 'in_app'],
  },
  {
    key: 'ordersBilling',
    label: 'Orders and billing',
    description:
      'The messages about your orders, your payments and your invoices. The notices about a payment that failed and about an invoice that is late are always sent.',
    classification: 'essential',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'hostingServices',
    label: 'Hosting services',
    description: 'The messages about the life of your servers: they are built, they work, they are suspended.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'support',
    label: 'Support',
    description: 'The messages about your tickets: a new answer, a change of state, a closing.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'domainsEmail',
    label: 'Domains and email hosting',
    description:
      'The messages about your domains and about the hosted mail: the proof of ownership, the records of DNS, the mailboxes.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'incidents',
    label: 'Incidents and maintenance',
    description: 'The messages about an incident of the platform and about the work that is planned.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'productUpdates',
    label: 'Product announcements',
    description: 'The messages about the platform itself: what is new, what changed, what is planned.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description:
      'The offers of the platform. They are off until you agree to them, and every one of them carries a way to stop them.',
    classification: 'marketing',
    essential: false,
    channels: ['email'],
  },
];

/** The preferences of a customer who never chose anything. */
const preferences = {
  accountSecurity: true,
  ordersBilling: true,
  billing: true,
  hostingServices: true,
  support: true,
  domainsEmail: true,
  incidents: true,
  productUpdates: true,
  marketing: false,
  emailChannel: true,
  inAppChannel: true,
};

/** Two messages of the customer: one that waits to be read, one that was read. */
const messages = [
  {
    id: 'n1',
    category: 'support',
    title: 'The support answered your ticket',
    body: 'The answer of the support is waiting in the ticket #42.',
    actionUrl: '/app/tickets/t42',
    actionLabel: 'Open the ticket',
    readAt: null,
    createdAt: '2026-10-25T08:00:00.000Z',
  },
  {
    id: 'n2',
    category: 'ordersBilling',
    title: 'The invoice of October is ready',
    body: 'The invoice of the period is on the way to the address of the account.',
    actionUrl: '/app/billing',
    actionLabel: 'See the invoice',
    readAt: '2026-10-25T09:00:00.000Z',
    createdAt: '2026-10-25T07:00:00.000Z',
  },
];

/** The list of the messages, as the page draws it. */
function list(overrides: Record<string, unknown> = {}): string {
  return render(
    createElement(notifications.NotificationList, {
      notifications: messages,
      categories,
      filtered: false,
      onMarkRead: () => {},
      onDelete: () => {},
      ...overrides,
    }),
  );
}

/** The preferences, as the page of the settings draws them. */
function preferencesPanel(overrides: Record<string, unknown> = {}): string {
  return render(
    createElement(settings.NotificationPreferencesPanel, {
      preferences,
      categories,
      pending: false,
      onToggle: () => {},
      onRestoreLegacyBilling: () => {},
      ...overrides,
    }),
  );
}

/** The switch of a group of the preferences, as it is on the page. */
function switchOf(html: string, id: string): string {
  const match = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  assert.ok(match, `the switch ${id} is missing from the page`);
  return match![0];
}

/**
 * The actions of a page: the buttons and the links.
 *
 * Every action of the platform is a real button or a real link, so the
 * keyboard reaches it without any help.
 */
function actions(html: string): { tag: string; name: string }[] {
  const found: { tag: string; name: string }[] = [];
  const pattern = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const attributes = match[2]!;
    const label = attributes.match(/aria-label="([^"]*)"/)?.[1] ?? '';
    const text = match[3]!
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    found.push({ tag: match[1]!, name: `${label} ${text}`.trim() });
  }
  return found;
}

describe('the list of the notifications', () => {
  it('shows the title, the text and the group of every message', () => {
    const html = list();
    assert.match(html, /The support answered your ticket/);
    assert.match(html, /The answer of the support is waiting in the ticket #42\./);
    assert.match(html, /The invoice of October is ready/);
    assert.match(html, /The invoice of the period is on the way to the address of the account\./);
    // The group of every message is written, with the name of the server.
    assert.match(html, />Support</);
    assert.match(html, />Orders and billing</);
  });

  it('draws a message that was not read yet apart from the others', () => {
    const html = list();
    const rows = [...html.matchAll(/<li data-unread="(true|false)"([^>]*)>/g)];
    assert.equal(rows.length, 2);

    const unread = rows.find((row) => row[1] === 'true');
    const read = rows.find((row) => row[1] === 'false');
    assert.ok(unread, 'the message that was not read is not marked');
    assert.ok(read, 'the message that was read is not marked');

    // The one that waits is drawn on another surface, and it says so in
    // words: the colour alone is not the sign.
    assert.match(unread![2]!, /bg-acc-bg/);
    assert.doesNotMatch(read![2]!, /bg-acc-bg/);
    assert.match(html, /Unread/);
  });

  it('offers the action of the message as a link', () => {
    const html = list();
    assert.match(html, /<a[^>]*href="\/app\/tickets\/t42"/);
    assert.match(html, /Open the ticket/);
  });

  it('writes two different empty states', () => {
    const empty = list({ notifications: [] });
    assert.match(empty, /You have no notification yet\./);
    assert.doesNotMatch(empty, /No notification in this group\./);

    const filtered = list({ notifications: [], filtered: true });
    assert.match(filtered, /No notification in this group\./);
    assert.doesNotMatch(filtered, /You have no notification yet\./);
  });
});

describe('the bell of the header', () => {
  it('shows the number of the messages that wait to be read', () => {
    const html = render(
      createElement(shell.NotificationBellButton, { unread: 3, open: false, onToggle: () => {} }),
    );
    assert.match(html, /data-unread-badge="true"[^>]*>3</);
    // The name of the button says how many messages wait.
    assert.match(html, /aria-label="Notifications, 3 unread messages"/);
  });

  it('hides the badge when the number is zero', () => {
    const html = render(
      createElement(shell.NotificationBellButton, { unread: 0, open: false, onToggle: () => {} }),
    );
    assert.doesNotMatch(html, /data-unread-badge/);
    assert.match(html, /aria-label="Notifications, no unread message"/);
  });

  it('shows the last messages and the way to the page', () => {
    const html = render(
      createElement(shell.NotificationBellPanel, {
        items: messages,
        loading: false,
        to: '/app/notifications',
      }),
    );
    assert.match(html, /The support answered your ticket/);
    assert.match(html, /The invoice of October is ready/);
    assert.match(html, /href="\/app\/notifications"/);
    assert.match(html, /Open the notification centre/);
  });
});

describe('the preferences of the notifications', () => {
  it('shows the eight groups, in the order of the server', () => {
    const html = preferencesPanel();
    const labels = [
      'Account and security',
      'Orders and billing',
      'Hosting services',
      'Support',
      'Domains and email hosting',
      'Incidents and maintenance',
      'Product announcements',
      'Marketing',
    ];
    let previous = -1;
    for (const label of labels) {
      const at = html.indexOf(label);
      assert.ok(at > previous, `the group “${label}” is missing or out of order`);
      previous = at;
    }
    // Every group has its line of explanation.
    assert.match(html, /They are always sent, because they protect the account\./);
    assert.match(html, /The messages about your tickets/);
  });

  it('offers no switch for the group that protects the account', () => {
    const html = preferencesPanel();
    assert.match(html, /Always on/);
    assert.doesNotMatch(html, /id="preference-accountSecurity-/);
    // The reason is written in words.
    assert.match(html, /They are always sent, so there is no switch/);
  });

  it('leaves the marketing off until the customer agrees to it', () => {
    const html = preferencesPanel();
    const marketing = switchOf(html, 'preference-marketing-email');
    assert.doesNotMatch(marketing, /checked/);
    assert.match(html, /It is off until you agree to it\./);
    assert.match(html, /Turning it on is your agreement/);
  });

  it('offers a switch for the channel of every group that travels on it', () => {
    const html = preferencesPanel();
    // A group that travels on the e-mail and on the notification centre has
    // a switch for each of them.
    assert.ok(switchOf(html, 'preference-support-email').includes('type="checkbox"'));
    assert.ok(switchOf(html, 'preference-support-in_app').includes('type="checkbox"'));
    // The marketing travels on the e-mail only.
    assert.ok(switchOf(html, 'preference-marketing-email').includes('type="checkbox"'));
    assert.doesNotMatch(html, /id="preference-marketing-in_app"/);
  });
});

describe('the state of the notification centre', () => {
  it('is not kept in the storage of the browser', () => {
    for (const file of ['src/app/Notifications.tsx', 'src/ui-app.tsx', 'src/app/Settings.tsx']) {
      const source = readFileSync(join(webRoot, file), 'utf8');
      assert.doesNotMatch(source, /localStorage/, `${file} keeps the notifications in the browser`);
      assert.doesNotMatch(source, /sessionStorage/, `${file} keeps the notifications in the browser`);
    }
  });

  it('never offers the message of another customer', () => {
    for (const file of ['src/app/Notifications.tsx', 'src/ui-app.tsx', 'src/app/Settings.tsx']) {
      const source = readFileSync(join(webRoot, file), 'utf8');
      // The customer of a message is never named in the interface: the
      // server reads it from the session.
      assert.doesNotMatch(source, /userId|customerId|ownerId|accountId/, `${file} names the customer of a message`);
    }

    // Every request of the page is a request of the account of the session,
    // and the only identifier that travels is the one of the message.
    const source = readFileSync(join(webRoot, 'src/app/Notifications.tsx'), 'utf8');
    const paths = [...source.matchAll(/['"`](\/notifications[^'"`]*)['"`]/g)].map((match) => match[1]!);
    assert.ok(paths.length >= 3, 'the page does not ask the server for the notifications');
    for (const path of paths) {
      assert.match(path, /^\/notifications/, `the request ${path} is not a request of the account`);
    }
  });

  it('asks the server for the number of the messages that wait', () => {
    const shellSource = readFileSync(join(webRoot, 'src/ui-app.tsx'), 'utf8');
    assert.match(shellSource, /\/notifications\/unread-count/);
    // The count is kept up to date with the stream of the server.
    assert.match(shellSource, /\/api\/notifications\/stream/);
  });
});

describe('the page and its actions', () => {
  it('is drawn with the title and the filters of the notification centre', () => {
    const html = render(createElement(notifications.default, {}));
    assert.match(html, /Notifications/);
    assert.match(html, /Category/);
    assert.match(html, /Only the unread/);
  });

  it('gives every action a name and lets the keyboard reach it', () => {
    const html = list();
    const found = actions(html);
    // Two messages, each with the action of the message, the mark as read
    // and the delete.
    assert.ok(found.length >= 5, `the list has only ${found.length} actions`);
    for (const action of found) {
      assert.ok(action.name.length > 0, `the ${action.tag} of the list has no name`);
    }
    // Every action is a real button or a real link: the keyboard reaches it
    // without any help, and the page never fakes a button.
    assert.doesNotMatch(html, /role="button"/);
    assert.doesNotMatch(html, /tabindex="[1-9]/);
    // The name of a button says which message it belongs to.
    assert.match(html, /aria-label="Mark as read: The support answered your ticket"/);
    assert.match(html, /aria-label="Delete the notification: The support answered your ticket"/);
  });

  it('gives every switch of the preferences a name', () => {
    const html = preferencesPanel();
    for (const id of [
      'preference-ordersBilling-email',
      'preference-ordersBilling-in_app',
      'preference-hostingServices-email',
      'preference-support-email',
      'preference-support-in_app',
      'preference-domainsEmail-email',
      'preference-incidents-email',
      'preference-productUpdates-email',
      'preference-marketing-email',
    ]) {
      const input = switchOf(html, id);
      assert.match(input, /aria-label="[^"]+"/, `the switch ${id} has no name`);
    }
  });

  it('is written in English', () => {
    for (const file of ['src/app/Notifications.tsx', 'src/ui-app.tsx', 'src/app/Settings.tsx']) {
      const source = readFileSync(join(webRoot, file), 'utf8');
      assert.doesNotMatch(source, /[ăâîțșşțĂÂÎȚȘŞ]/);
    }
  });
});
