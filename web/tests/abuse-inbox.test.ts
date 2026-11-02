/**
 * The queue of the reports of abuse, checked without a screen.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The pages are rendered on the
 * server, without a browser, which is enough to see what the staff is told
 * and which actions a case offers.
 *
 * The rules of the case live on the server: the state of the case and the
 * actions it allows come with the report. These tests therefore check that
 * the interface shows what the server sends, and that it never shows an
 * action the case does not allow.
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

interface AbuseUi {
  default: (props: Record<string, unknown>) => unknown;
  AbuseReportList: (props: Record<string, unknown>) => unknown;
  AbusePager: (props: Record<string, unknown>) => unknown;
  ABUSE_TABS: { value: string; label: string }[];
  abuseListQuery: (tab: string, page: number, search: string) => Record<string, string | number | undefined>;
}

interface AbuseDetailUi {
  AbuseCaseHeader: (props: Record<string, unknown>) => unknown;
  AbuseEvidence: (props: Record<string, unknown>) => unknown;
  AbuseNoteList: (props: Record<string, unknown>) => unknown;
  AbuseActivityTrail: (props: Record<string, unknown>) => unknown;
  AbuseSidebar: (props: Record<string, unknown>) => unknown;
  AbuseSuspendDialog: (props: Record<string, unknown>) => unknown;
}

let inbox: AbuseUi;
let detail: AbuseDetailUi;
let server: ViteDevServer;

const SERVICE = {
  id: 'inst_1',
  name: 'mail.example',
  status: 'ONLINE',
  createdAt: '2026-10-01T10:00:00.000Z',
  suspendedAt: null,
  customer: {
    id: 'user_1',
    email: 'owner@example.com',
    name: 'A Customer',
    role: 'CUSTOMER',
    suspendedAt: null,
  },
  product: { name: 'Web hosting', slug: 'web-hosting' },
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rep_1',
    category: 'spam',
    target: 'spammer.example',
    details: 'The host sends mail to everybody, every hour of the day.',
    evidenceUrl: 'https://example.com/evidence',
    reporterName: 'A concerned person',
    reporterEmail: 'reporter@example.com',
    status: 'open',
    statusLabel: 'Open',
    resolution: null,
    instanceId: 'inst_1',
    createdAt: '2026-10-20T09:30:00.000Z',
    resolvedAt: null,
    reopenedAt: null,
    enforcement: null,
    enforcementLabel: '',
    enforcementAt: null,
    enforcedBy: null,
    service: SERVICE,
    allowedActions: ['investigating', 'resolve', 'dismiss', 'suspend'],
    lastActivityAt: '2026-10-21T11:00:00.000Z',
    ...overrides,
  };
}

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  inbox = (await server.ssrLoadModule('/src/admin/abuse/AbuseInbox.tsx')) as AbuseUi;
  detail = (await server.ssrLoadModule('/src/admin/abuse/AbuseDetail.tsx')) as AbuseDetailUi;
});

after(async () => {
  await server.close();
});

function render(element: unknown): string {
  return renderToStaticMarkup(element as never);
}

/** The text of the page, without the marks React leaves between two texts. */
function plain(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('the queue of the reports of abuse', () => {
  it('has the five tabs of the queue, and starts on the active ones', () => {
    assert.deepEqual(
      inbox.ABUSE_TABS.map((tab) => tab.value),
      ['active', 'investigating', 'resolved', 'dismissed', 'all'],
    );
    assert.deepEqual(
      inbox.ABUSE_TABS.map((tab) => tab.label),
      ['Active', 'Investigating', 'Resolved', 'Dismissed', 'All'],
    );

    const html = plain(render(createElement(inbox.default, {})));
    for (const label of ['Active', 'Investigating', 'Resolved', 'Dismissed', 'All']) {
      assert.match(html, new RegExp(label));
    }
    // The closed cases are not the first queue the staff sees.
    assert.match(html, /aria-selected="true"[^>]*>Active</);
  });

  it('asks the API for the tab, the page and the search', () => {
    assert.deepEqual(inbox.abuseListQuery('active', 1, ''), { status: 'active', page: 1, pageSize: 25, q: undefined });
    assert.deepEqual(inbox.abuseListQuery('dismissed', 3, 'archived'), {
      status: 'dismissed',
      page: 3,
      pageSize: 25,
      q: 'archived',
    });
  });

  it('is a table with a column for every fact, not a stack of cards', () => {
    const html = plain(render(createElement(inbox.AbuseReportList, { reports: [report()], revealEmails: false })));

    for (const header of ['Category', 'Reported target', 'Linked service', 'Reporter', 'Status', 'Created', 'Last activity']) {
      assert.match(html, new RegExp(header));
    }
    // The case of a report has its own page.
    assert.match(html, /href="\/admin\/abuse\/rep_1"/);
    // The facts of the report are shown once.
    assert.match(html, /spammer\.example/);
    assert.match(html, /mail\.example/);
  });

  it('keeps the address of the reporter hidden until the staff asks for it', () => {
    const hidden = plain(render(createElement(inbox.AbuseReportList, { reports: [report()], revealEmails: false })));
    assert.ok(!hidden.includes('reporter@example.com'));
    assert.match(hidden, /r\*\*\*@example\.com/);

    const shown = plain(render(createElement(inbox.AbuseReportList, { reports: [report()], revealEmails: true })));
    assert.match(shown, /reporter@example\.com/);
  });

  it('says how many reports there are, and does not go before the first page', () => {
    const html = plain(
      render(createElement(inbox.AbusePager, { page: 2, pages: 5, total: 63, onPage: () => {} })),
    );
    assert.match(html, /Page 2 of 5/);
    assert.match(html, /63 reports/);
    assert.match(html, /Previous/);
    assert.match(html, /Next/);
    // The button of the first page is off.
    assert.match(html, /Previous[^]*?disabled/);
  });
});

describe('the page of one report of abuse', () => {
  it('offers the actions of the state the case is in', () => {
    const html = plain(
      render(createElement(detail.AbuseCaseHeader, { report: report(), onAction: () => {} })),
    );
    assert.match(html, /Start the investigation/);
    assert.match(html, /Resolve the report/);
    assert.match(html, /Dismiss the report/);
    assert.match(html, /Suspend the service/);
    // The case is open: it has no date of closing yet.
    assert.match(html, /Reported/);
    assert.match(html, /Closed/);
  });

  it('offers only the reopen on a dismissed case, and never a suspension', () => {
    const html = plain(
      render(
        createElement(detail.AbuseCaseHeader, {
          report: report({
            status: 'dismissed',
            statusLabel: 'Dismissed',
            allowedActions: ['reopen'],
            resolution: 'The report was about another platform.',
            resolvedAt: '2026-10-22T08:00:00.000Z',
          }),
          onAction: () => {},
        }),
      ),
    );
    assert.match(html, /Reopen the investigation/);
    assert.ok(!html.includes('Suspend the service'));
    assert.ok(!html.includes('Start the investigation'));
    assert.ok(!html.includes('Dismiss the report'));
  });

  it('offers only the reopen on a closed case', () => {
    const html = plain(
      render(
        createElement(detail.AbuseCaseHeader, {
          report: report({ status: 'resolved', statusLabel: 'Resolved', allowedActions: ['reopen'] }),
          onAction: () => {},
        }),
      ),
    );
    assert.match(html, /Reopen the investigation/);
    assert.ok(!html.includes('Suspend the service'));
  });

  it('shows the evidence and the reporter', () => {
    const html = plain(render(createElement(detail.AbuseEvidence, { report: report() })));
    assert.match(html, /sends mail to everybody/);
    assert.match(html, /https:\/\/example\.com\/evidence/);
    assert.match(html, /A concerned person/);
    assert.match(html, /reporter@example\.com/);
    assert.match(html, /mail\.example/);
  });

  it('shows the notes and the trail of the case', () => {
    const detailAnswer = {
      report: report(),
      service: SERVICE,
      notes: [{ id: 'n1', body: 'The customer was told about the mail.', authorId: 'u1', authorEmail: 'staff@blipmade.test', createdAt: '2026-10-21T10:00:00.000Z' }],
      activity: [
        {
          id: 'a1',
          action: 'admin.abuse.dismissed',
          actorEmail: 'staff@blipmade.test',
          meta: { reason: 'The report was about another platform.' },
          createdAt: '2026-10-21T10:05:00.000Z',
        },
      ],
      related: [],
    };

    const notes = plain(render(createElement(detail.AbuseNoteList, { notes: detailAnswer.notes })));
    assert.match(notes, /The customer was told about the mail/);
    assert.match(notes, /staff@blipmade\.test/);

    const trail = plain(render(createElement(detail.AbuseActivityTrail, { detail: detailAnswer })));
    assert.match(trail, /Report dismissed/);
    assert.match(trail, /The report was about another platform/);
  });

  it('shows the service and the customer of the case', () => {
    const html = plain(
      render(
        createElement(detail.AbuseSidebar, {
          detail: { report: report(), service: SERVICE, notes: [], activity: [], related: [] },
        }),
      ),
    );
    assert.match(html, /mail\.example/);
    assert.match(html, /owner@example\.com/);
    assert.match(html, /href="\/admin\/services\/inst_1"/);
    assert.match(html, /href="\/admin\/customers\/user_1"/);
  });

  it('asks for the name of the service before it suspends it', () => {
    const html = plain(
      render(
        createElement(detail.AbuseSuspendDialog, {
          open: true,
          serviceName: 'mail.example',
          reason: 'The host keeps sending mail.',
          onReasonChange: () => {},
          confirmation: '',
          onConfirmationChange: () => {},
          busy: false,
          error: null,
          onConfirm: () => {},
          onCancel: () => {},
        }),
      ),
    );
    assert.match(html, /Suspend mail\.example/);
    assert.match(html, /Type mail\.example to confirm/);
    assert.match(html, /Why is the service suspended\?/);
    // The button waits for the name of the service and for the reason.
    assert.match(html, /disabled/);
  });

  it('never says only "Done." when an action worked', () => {
    const source = readFileSync(join(webRoot, 'src/admin/abuse/AbuseDetail.tsx'), 'utf8');
    assert.ok(!source.includes("'Done.'"));
    assert.match(source, /Report dismissed\./);
    assert.match(source, /Investigation reopened\./);
    assert.match(source, /Service suspended\./);
    assert.match(source, /Report resolved\./);
  });
});
