import { useState } from 'react';
import { get } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Link } from '../../router';
import { Icon } from '../../icons';
import {
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  Segmented,
  SoftButton,
  StatusPill,
  TextInput,
} from '../../ui-app';
import { LiveRegion, can, denseGhost, fmtDate, maskEmail, useAdminSession } from '../Overview';
import type { TableColumn } from '../../lib/table';
import { ABUSE_STATE_TONES } from './types';
import type { AbuseList, AbuseReport } from './types';

/**
 * The queue of the reports of abuse — GET /api/admin/abuse
 *
 * The list is a table, not a stack of cards: every report is a row, and every
 * fact about it appears once. The closed cases are kept in their own tabs, so
 * the queue that still needs a decision is not crowded by the cases that were
 * closed long ago.
 *
 * The page is read from the server with the state, the search and the number
 * of the page. The server says how many reports there are, so the page is
 * never shown as if it were the whole of the queue.
 */

/** The tabs of the queue. */
export const ABUSE_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
] as const;

/** How many reports a page of the list holds. */
const PAGE_SIZE = 25;

/** The state of the filter of the list. */
export type AbuseTab = (typeof ABUSE_TABS)[number]['value'];

/**
 * The query the list is read with.
 *
 * The state of the filter, the number of the page and the search go to the
 * server, which says how many reports there are.
 */
export function abuseListQuery(
  tab: AbuseTab,
  page: number,
  search: string,
): Record<string, string | number | undefined> {
  return { status: tab, page, pageSize: PAGE_SIZE, q: search || undefined };
}

/**
 * The list of the reports.
 *
 * The columns are the facts about a report: what was reported, what it is
 * about, who reported it, where the case is and when it was written. On a
 * phone the same facts are shown as compact rows.
 */
export function AbuseReportList({ reports, revealEmails }: { reports: AbuseReport[]; revealEmails: boolean }) {
  const email = (value: string) => (revealEmails ? value : maskEmail(value));

  const columns: TableColumn<AbuseReport>[] = [
    {
      key: 'category',
      header: 'Category',
      nowrap: true,
      render: (report) => (
        <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink2">{report.category}</span>
      ),
    },
    {
      key: 'target',
      header: 'Reported target',
      truncate: true,
      render: (report) => (
        <Link
          to={`/admin/abuse/${report.id}`}
          className="block truncate text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          title={report.target}
        >
          {report.target}
        </Link>
      ),
    },
    {
      key: 'service',
      header: 'Linked service',
      truncate: true,
      render: (report) =>
        report.service ? (
          <span className="block min-w-0">
            <span className="block truncate text-ink" title={report.service.name}>
              {report.service.name}
            </span>
            <StatusPill status={report.service.status} />
          </span>
        ) : (
          <span className="text-ink3">Not on this platform</span>
        ),
    },
    {
      key: 'reporter',
      header: 'Reporter',
      truncate: true,
      render: (report) => (
        <span className="block min-w-0">
          <span className="block truncate text-ink" title={report.reporterName}>
            {report.reporterName}
          </span>
          <span className="block truncate font-mono text-[12.5px] text-ink3" title={email(report.reporterEmail)}>
            {email(report.reporterEmail)}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      nowrap: true,
      render: (report) => <StatusPill status={ABUSE_STATE_TONES[report.status]} label={report.statusLabel} />,
    },
    {
      key: 'created',
      header: 'Created',
      nowrap: true,
      render: (report) => <span className="text-ink2">{fmtDate(report.createdAt)}</span>,
    },
    {
      key: 'activity',
      header: 'Last activity',
      nowrap: true,
      render: (report) => <span className="text-ink2">{fmtDate(report.lastActivityAt ?? report.createdAt)}</span>,
    },
  ];

  return (
    <>
      <DataTable<AbuseReport> rows={reports} rowKey={(report) => report.id} columns={columns} minWidth="860px" />
      <CardList<AbuseReport> rows={reports} rowKey={(report) => report.id}>
        {(report) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="w-0 min-w-0 flex-1">
                <p className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink3">{report.category}</p>
                <Link
                  to={`/admin/abuse/${report.id}`}
                  className="block truncate text-[14.5px] font-medium text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  title={report.target}
                >
                  {report.target}
                </Link>
              </div>
              <StatusPill status={ABUSE_STATE_TONES[report.status]} label={report.statusLabel} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div className="col-span-2 min-w-0">
                <dt className="text-ink3">Service</dt>
                <dd className="truncate text-ink">{report.service ? report.service.name : 'Not on this platform'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Reporter</dt>
                <dd className="truncate text-ink" title={report.reporterName}>
                  {report.reporterName}
                </dd>
              </div>
              <div>
                <dt className="text-ink3">Created</dt>
                <dd className="text-ink">{fmtDate(report.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-ink3">Last activity</dt>
                <dd className="text-ink">{fmtDate(report.lastActivityAt ?? report.createdAt)}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardList>
    </>
  );
}

/** The pages of the list. The server says how many reports there are. */
export function AbusePager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[12.5px] text-ink3">
        Page {page} of {Math.max(pages, 1)} · {total} report{total === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <button type="button" className={denseGhost} onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <button type="button" className={denseGhost} onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
        </button>
      </div>
    </div>
  );
}

/** The queue of the reports of abuse. */
export default function AbuseInbox() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'services.write');
  const [tab, setTab] = useState<AbuseTab>('active');
  const [page, setPage] = useState(1);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [revealEmails, setRevealEmails] = useState(false);

  const state = useAsync(
    (signal) => get<AbuseList>('/admin/abuse', abuseListQuery(tab, page, search), signal),
    [tab, page, search],
  );

  const reports = state.data?.reports ?? [];
  const total = state.data?.total ?? 0;
  const pages = state.data?.pages ?? 0;

  const chooseTab = (value: AbuseTab) => {
    setTab(value);
    setPage(1);
  };

  const runSearch = () => {
    setSearch(typed.trim());
    setPage(1);
  };

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${reports.length} report${reports.length === 1 ? '' : 's'} on this page`} />
      <Panel
        title="Abuse reports"
        description="From the public form at /abuse. The reporter is a person who wrote to the platform, so their details stay in the staff area."
        actionBelow
        action={
          <button
            type="button"
            aria-pressed={revealEmails}
            onClick={() => setRevealEmails((value) => !value)}
            title="Revealing addresses is a local view change. The API has no endpoint that records a reveal."
            className={revealEmails ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
          >
            <Icon name={revealEmails ? 'eyeOff' : 'eye'} size={16} />
            {revealEmails ? 'Mask e-mails' : 'Show e-mails'}
          </button>
        }
      >
        <div className="grid gap-3">
          <Segmented
            ariaLabel="Filter the reports by state"
            value={tab}
            onChange={chooseTab}
            options={ABUSE_TABS.map((entry) => ({ value: entry.value, label: entry.label }))}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <TextInput
                label="Search the reports"
                hint="The target, the text of the report, the reporter or the name of the service. The closed cases are in the archive too."
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="A hostname, an address or a service"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" className={denseGhost} onClick={runSearch}>
                Search
              </button>
              {search && (
                <button
                  type="button"
                  className={denseGhost}
                  onClick={() => {
                    setTyped('');
                    setSearch('');
                    setPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {state.loading ? (
            <LoadingBlock rows={4} label="Loading the reports" />
          ) : state.error ? (
            <ErrorState
              title="The reports could not be loaded"
              message={state.error.message}
              onRetry={state.reload}
            />
          ) : !reports.length ? (
            <EmptyState
              title={search ? 'No report matches that search.' : 'No report here.'}
              description={
                search
                  ? 'Try another word, or pick another tab.'
                  : tab === 'active'
                    ? 'The queue of the reports that still need a decision is empty.'
                    : 'Reports made on the public form appear here.'
              }
            />
          ) : (
            <div className="grid gap-3">
              <AbuseReportList reports={reports} revealEmails={revealEmails} />
              <AbusePager page={state.data?.page ?? page} pages={pages} total={total} onPage={setPage} />
            </div>
          )}
        </div>
      </Panel>

      {!mayWrite && (
        <p className="px-1 text-[13px] text-ink3">
          Your role does not hold &quot;services.write&quot;, so the reports are read-only for you.
        </p>
      )}
    </div>
  );
}
