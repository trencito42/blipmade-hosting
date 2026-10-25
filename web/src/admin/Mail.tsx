import { useEffect, useState } from 'react';
import {
  getAdminMailHealth,
  listAdminMailDomains,
  listAdminMailJobs,
  retryAdminMailJob,
  type AdminMailDomain,
  type AdminMailHealth,
  type AdminMailJob,
  type AdminMailListQuery,
  type AdminMailPagination,
} from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import {
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Panel,
  StatTile,
  StatusPill,
  useToast,
} from '../ui-app';
import { DASH, LiveRegion, can, denseGhost, denseInput, denseSelect, denseSoft, fmtDateTime, useAdminSession } from './Overview';

/**
 * The back office of the hosted mail.
 *
 * Three things are shown here: whether the mail system answers, every domain
 * of mail of every customer, and the work the platform still owes to the
 * mail system.
 *
 * Every number comes from the API. When the numbers the platform holds and
 * the numbers the mail system holds are not the same, the difference is
 * written out, with the number that differs, because a silent difference is
 * a difference nobody looks at. When the mail system cannot be reached, the
 * page says so and does not present the numbers of the platform as if they
 * were the numbers of the mail system.
 */

/** How many rows a page of the API holds. */
const PAGE_SIZE = 50;

/** The states a hosted mail domain can be in. */
const DOMAIN_STATES = [
  { value: '', label: 'Every state' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'error', label: 'Error' },
  { value: 'suspended', label: 'Suspended' },
];

/** The states a job of the mail can be in. */
const JOB_STATES = [
  { value: '', label: 'Every state' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
];

/** The colour of a state of a job, so every state is read the same way. */
const JOB_TONE: Record<string, string> = {
  queued: 'pending',
  running: 'provisioning',
  done: 'active',
  failed: 'failed',
};

/** The space of a domain, in the megabytes the API sends. */
function fmtSpace(usedMb: number, quotaMb: number): string {
  if (!Number.isFinite(usedMb)) return DASH;
  if (!Number.isFinite(quotaMb)) return `${usedMb} MB`;
  return `${usedMb} MB of ${quotaMb} MB`;
}

/**
 * The health of the mail, as the operator reads it.
 *
 * The panel shows both sides: what the mail system holds and what the
 * platform believes it holds. A difference is written out with the number
 * that differs.
 */
export function AdminMailHealthPanel({ health }: { health: AdminMailHealth }) {
  const { service, platform, system, consistent } = health;
  const reachable = service.reachable;

  const counts = [
    { key: 'domains', label: 'Domains', platform: platform.domains, system: system.domains },
    { key: 'mailboxes', label: 'Mailboxes', platform: platform.mailboxes, system: system.mailboxes },
    { key: 'aliases', label: 'Aliases', platform: platform.aliases, system: system.aliases },
  ];
  const different = reachable ? counts.filter((count) => count.platform !== count.system) : [];

  const disk = service.disk;

  return (
    <div className="grid gap-3">
      <section aria-label="The state of the mail system" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Configured"
          value={service.configured ? 'Yes' : 'No'}
          hint="Whether this environment points at a mail system."
        />
        <StatTile
          label="Answers"
          value={reachable ? 'Yes' : 'No'}
          hint="Whether the mail system answered the request."
        />
        <StatTile label="Version" value={service.version ?? DASH} hint="The version the mail system reports." />
        <StatTile
          label="Disk used"
          value={disk ? `${disk.used} of ${disk.total} (${disk.usedPercent})` : DASH}
          hint="The disk of the mail system."
        />
      </section>

      {!reachable || consistent === null ? (
        <div role="status" className="rounded-2xl bg-bad/10 px-4 py-3">
          <p className="text-[14.5px] font-extrabold text-bad">The mail system cannot be reached.</p>
          <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink2">
            {service.error ?? 'The mail system did not answer the request.'}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">
            The numbers the mail system holds are not known, so the two sides cannot be compared. The numbers below are
            the numbers of the platform only.
          </p>
        </div>
      ) : consistent === false ? (
        <div role="status" className="rounded-2xl bg-warn/12 px-4 py-3">
          <p className="text-[14.5px] font-extrabold text-warn">The two sides do not hold the same numbers.</p>
          <ul className="mt-1.5 grid gap-1 text-[13.5px] leading-relaxed text-ink2">
            {different.map((count) => (
              <li key={count.key}>
                {count.label}: the platform holds {count.platform}, the mail system holds {count.system}.
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3">
          <p className="text-[14.5px] font-extrabold text-acc">Both sides hold the same numbers.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">
            The platform and the mail system hold the same domains, the same mailboxes and the same aliases.
          </p>
        </div>
      )}

      <dl className="grid gap-2 sm:grid-cols-3">
        {counts.map((count) => (
          <div key={count.key} className="rounded-2xl bg-s2 p-3">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{count.label}</dt>
            <dd className="mt-1 font-mono text-[15px] text-ink">
              {count.platform}
              <span className="text-ink3"> on the platform, </span>
              {reachable ? count.system : DASH}
              <span className="text-ink3"> in the mail system</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="px-1 text-[12.5px] text-ink3">
        {platform.failedJobs} failed job{platform.failedJobs === 1 ? '' : 's'} on the platform. The work that failed is
        listed below.
      </p>
    </div>
  );
}

/**
 * Every hosted mail domain, with the customer that owns it.
 *
 * The state of the domain, the number of mailboxes and of aliases, the space
 * it uses and the words of the last failure all come from the API.
 */
export function AdminMailDomainsTable({ domains }: { domains: AdminMailDomain[] }) {
  return (
    <>
      <DataTable<AdminMailDomain>
        rows={domains}
        rowKey={(domain) => domain.id}
        minWidth="900px"
        columns={[
          {
            key: 'name',
            header: 'Domain',
            truncate: true,
            render: (domain: AdminMailDomain) => (
              <span className="block min-w-0">
                <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={domain.name}>
                  {domain.name}
                </span>
                <span className="block truncate font-mono text-[12.5px] text-ink3">
                  added {fmtDateTime(domain.createdAt)}
                </span>
              </span>
            ),
          },
          {
            key: 'customer',
            header: 'Customer',
            truncate: true,
            render: (domain: AdminMailDomain) => (
              <span className="block truncate font-mono text-[12.5px] text-ink2" title={domain.customer.email}>
                {domain.customer.email}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'State',
            nowrap: true,
            render: (domain: AdminMailDomain) => <StatusPill status={domain.status} label={domain.status} />,
          },
          {
            key: 'mailboxes',
            header: 'Mailboxes',
            align: 'right',
            nowrap: true,
            render: (domain: AdminMailDomain) => (
              <span className="font-mono text-[12.5px] text-ink2">{domain.mailboxes}</span>
            ),
          },
          {
            key: 'aliases',
            header: 'Aliases',
            align: 'right',
            nowrap: true,
            render: (domain: AdminMailDomain) => <span className="font-mono text-[12.5px] text-ink2">{domain.aliases}</span>,
          },
          {
            key: 'space',
            header: 'Space used',
            align: 'right',
            nowrap: true,
            render: (domain: AdminMailDomain) => (
              <span className="font-mono text-[12.5px] text-ink2">{fmtSpace(domain.usedMb, domain.quotaMb)}</span>
            ),
          },
          {
            key: 'error',
            header: 'Last error',
            className: 'max-w-[280px]',
            render: (domain: AdminMailDomain) =>
              domain.lastError ? (
                <span className="block break-words text-[12.5px] text-bad">{domain.lastError}</span>
              ) : (
                <span className="text-ink3">{DASH}</span>
              ),
          },
        ]}
      />
      <CardList<AdminMailDomain> rows={domains} rowKey={(domain) => domain.id}>
        {(domain) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={domain.name}>
                  {domain.name}
                </p>
                <p className="truncate font-mono text-[12.5px] text-ink3" title={domain.customer.email}>
                  {domain.customer.email}
                </p>
              </div>
              <StatusPill status={domain.status} label={domain.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-ink3">Mailboxes</dt>
                <dd className="font-mono text-ink">{domain.mailboxes}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Aliases</dt>
                <dd className="font-mono text-ink">{domain.aliases}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-ink3">Space used</dt>
                <dd className="font-mono break-words text-ink">{fmtSpace(domain.usedMb, domain.quotaMb)}</dd>
              </div>
              {domain.lastError && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-ink3">Last error</dt>
                  <dd className="break-words text-bad">{domain.lastError}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </CardList>
    </>
  );
}

/**
 * The work the platform owes to the mail system.
 *
 * A failed job that can be repeated offers the repeat. A failed job that
 * cannot be repeated says so, instead of offering a button the server will
 * refuse.
 */
export function AdminMailJobsTable({
  jobs,
  mayRepeat,
  onRepeat,
}: {
  jobs: AdminMailJob[];
  /** Whether the role of the operator may repeat a job. */
  mayRepeat: boolean;
  onRepeat: (job: AdminMailJob) => void;
}) {
  return (
    <>
      <DataTable<AdminMailJob>
        rows={jobs}
        rowKey={(job) => job.id}
        minWidth="960px"
        columns={[
          {
            key: 'kind',
            header: 'Work',
            truncate: true,
            render: (job: AdminMailJob) => (
              <span className="block truncate font-mono text-[12.5px] font-bold text-ink" title={job.kind}>
                {job.kind}
              </span>
            ),
          },
          {
            key: 'domain',
            header: 'Domain',
            truncate: true,
            render: (job: AdminMailJob) => (
              <span className="block truncate font-mono text-[12.5px] text-ink2" title={job.domain?.name ?? undefined}>
                {job.domain?.name ?? DASH}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'State',
            nowrap: true,
            render: (job: AdminMailJob) => (
              <StatusPill status={JOB_TONE[job.status] ?? job.status} label={job.status} />
            ),
          },
          {
            key: 'attempts',
            header: 'Attempts',
            align: 'right',
            nowrap: true,
            render: (job: AdminMailJob) => <span className="font-mono text-[12.5px] text-ink2">{job.attempts}</span>,
          },
          {
            key: 'moment',
            header: 'Last change',
            nowrap: true,
            render: (job: AdminMailJob) => <span className="text-ink2">{fmtDateTime(job.updatedAt)}</span>,
          },
          {
            key: 'error',
            header: 'Last failure',
            className: 'max-w-[280px]',
            render: (job: AdminMailJob) =>
              job.lastError ? (
                <span className="block break-words text-[12.5px] text-bad">{job.lastError}</span>
              ) : (
                <span className="text-ink3">{DASH}</span>
              ),
          },
          {
            key: 'action',
            header: 'Action',
            nowrap: true,
            render: (job: AdminMailJob) => (
              <AdminMailJobAction job={job} mayRepeat={mayRepeat} onRepeat={onRepeat} />
            ),
          },
        ]}
      />
      <CardList<AdminMailJob> rows={jobs} rowKey={(job) => job.id}>
        {(job) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[13.5px] font-bold text-ink" title={job.kind}>
                  {job.kind}
                </p>
                <p className="truncate font-mono text-[12.5px] text-ink3" title={job.domain?.name ?? undefined}>
                  {job.domain?.name ?? DASH}
                </p>
              </div>
              <StatusPill status={JOB_TONE[job.status] ?? job.status} label={job.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-ink3">Attempts</dt>
                <dd className="font-mono text-ink">{job.attempts}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Last change</dt>
                <dd className="text-ink">{fmtDateTime(job.updatedAt)}</dd>
              </div>
              {job.lastError && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-ink3">Last failure</dt>
                  <dd className="break-words text-bad">{job.lastError}</dd>
                </div>
              )}
            </dl>
            <div className="mt-2.5">
              <AdminMailJobAction job={job} mayRepeat={mayRepeat} onRepeat={onRepeat} />
            </div>
          </div>
        )}
      </CardList>
    </>
  );
}

/**
 * The action of a job.
 *
 * Only a failed job whose work can be repeated offers the repeat.
 */
function AdminMailJobAction({
  job,
  mayRepeat,
  onRepeat,
}: {
  job: AdminMailJob;
  mayRepeat: boolean;
  onRepeat: (job: AdminMailJob) => void;
}) {
  if (job.status !== 'failed') return <span className="text-ink3">{DASH}</span>;
  if (!job.retryable) {
    return (
      <span className="block max-w-[220px] whitespace-normal text-[12.5px] text-ink3">This job cannot be repeated.</span>
    );
  }
  if (!mayRepeat) return <span className="text-ink3">{DASH}</span>;
  return (
    <button type="button" onClick={() => onRepeat(job)} className={denseGhost}>
      Repeat
    </button>
  );
}

/**
 * The confirmation of a repeat.
 *
 * The repeat is given to the mail system only after the operator confirmed
 * it, so the dialog names the work that is repeated.
 */
export function AdminMailRetryDialog({
  job,
  busy,
  onConfirm,
  onCancel,
}: {
  job: AdminMailJob | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!job) return null;
  return (
    <ConfirmDialog
      open
      title="Repeat this job?"
      description={`The work "${job.kind}" is given to the mail system again. It was tried ${job.attempts} ${
        job.attempts === 1 ? 'time' : 'times'
      }. The domain is ${job.domain?.name ?? 'not known'}.`}
      confirmLabel="Repeat the job"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/**
 * The failure of the API, with the words of the failure.
 *
 * The page never writes a failure of its own: the words of the server are
 * the ones the operator reads.
 */
export function AdminMailError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
      {message}
    </p>
  );
}

/**
 * The end of a list that is walked with a cursor.
 *
 * The cursor of the next page is the one the API sent with the page on the
 * screen, so the next page is the one that follows it.
 */
export function AdminMailPager({
  shown,
  total,
  hasMore,
  pending,
  onLoadMore,
}: {
  shown: number;
  total: number | undefined;
  hasMore: boolean;
  pending: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="px-1 text-[12.5px] text-ink3">
        {shown} shown{total === undefined ? '' : ` of ${total}`}.
      </p>
      {hasMore && (
        <button type="button" onClick={onLoadMore} disabled={pending} className={denseSoft}>
          {pending ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

/** The cursor of the page that follows the one on the screen. */
export function adminMailNextCursor(pagination: AdminMailPagination | null | undefined): string | null {
  if (!pagination || !pagination.hasMore) return null;
  return pagination.nextCursor;
}

/** The query of the domains of the mail, as the API wants it. */
export function adminMailDomainsQuery(input: {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): AdminMailListQuery {
  return {
    limit: input.limit,
    cursor: input.cursor,
    status: input.status || undefined,
    search: input.search?.trim() || undefined,
  };
}

/** The query of the jobs of the mail, as the API wants it. */
export function adminMailJobsQuery(input: {
  status?: string;
  cursor?: string;
  limit?: number;
}): AdminMailListQuery {
  return {
    limit: input.limit,
    cursor: input.cursor,
    status: input.status || undefined,
  };
}

/**
 * Repeats a job of the mail that failed.
 *
 * Without a job nothing is repeated and the server is never asked: a repeat
 * always needs a confirmation.
 */
export async function runAdminMailRetry(job: AdminMailJob | null): Promise<AdminMailJob | null> {
  if (!job) return null;
  const { job: repeated } = await retryAdminMailJob(job.id);
  return repeated;
}

/** The rows of a page of the mail. */
interface AdminMailRows<T> {
  rows: T[];
  total: number;
  pagination: AdminMailPagination;
}

/**
 * A list of the mail that is walked with the cursor of the API.
 *
 * The rows of the pages that were walked are kept, so "Load more" adds to
 * the list on the screen instead of replacing it. The answer of the API
 * replaces the rows when the filters change, because it is another list.
 */
function useAdminMailPage<T>(
  load: (cursor: string | undefined, signal: AbortSignal | undefined) => Promise<AdminMailRows<T>>,
  deps: unknown[],
) {
  const first = useAsync<AdminMailRows<T>>((signal) => load(undefined, signal), deps);

  const [walked, setWalked] = useState<{
    rows: T[];
    cursor: string | null;
    hasMore: boolean;
    total: number | undefined;
  }>({ rows: [], cursor: null, hasMore: false, total: undefined });

  useEffect(() => {
    const page = first.data;
    if (!page) return;
    setWalked({
      rows: page.rows,
      cursor: adminMailNextCursor(page.pagination),
      hasMore: page.pagination.hasMore,
      total: page.total,
    });
  }, [first.data]);

  const more = useAction(async () => {
    const cursor = walked.cursor;
    if (!cursor) return;
    const page = await load(cursor, undefined);
    setWalked((current) => ({
      rows: [...current.rows, ...page.rows],
      cursor: adminMailNextCursor(page.pagination),
      hasMore: page.pagination.hasMore,
      total: page.total,
    }));
  });

  return {
    rows: walked.rows,
    total: walked.total,
    hasMore: walked.hasMore,
    loading: first.loading,
    error: first.error,
    reload: first.reload,
    loadMore: more.run,
    loadingMore: more.pending,
    errorMore: more.error,
  };
}

export default function Mail() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [domainState, setDomainState] = useState('');
  const [jobState, setJobState] = useState('');
  const [pendingRetry, setPendingRetry] = useState<AdminMailJob | null>(null);

  // The search is sent after a pause, so a word is not a request per letter.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const health = useAsync((signal) => getAdminMailHealth(signal), []);

  const domains = useAdminMailPage<AdminMailDomain>(
    async (cursor, signal) => {
      const page = await listAdminMailDomains(
        adminMailDomainsQuery({
          search: appliedSearch,
          status: domainState,
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        }),
        signal,
      );
      return { rows: page.domains, total: page.total, pagination: page.pagination };
    },
    [appliedSearch, domainState],
  );

  const jobs = useAdminMailPage<AdminMailJob>(
    async (cursor, signal) => {
      const page = await listAdminMailJobs(
        adminMailJobsQuery({ status: jobState, cursor: cursor ?? undefined, limit: PAGE_SIZE }),
        signal,
      );
      return { rows: page.jobs, total: page.total, pagination: page.pagination };
    },
    [jobState],
  );

  const mayRepeat = can(staff, 'infrastructure.write');

  const retry = useAction(async (job: AdminMailJob) => {
    const repeated = await runAdminMailRetry(job);
    if (!repeated) return null;
    toast.push(`The work ${repeated.kind} was given to the mail system again.`, 'ok');
    jobs.reload();
    return repeated;
  });

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${domains.rows.length} domains, ${jobs.rows.length} jobs`} />

      <Panel
        title="Mail health"
        description="Whether the mail system answers, and whether the numbers it holds are the numbers the platform holds."
      >
        {health.loading ? (
          <LoadingBlock rows={2} label="Loading the health of the mail" />
        ) : health.error ? (
          <ErrorState
            title="The health of the mail could not be loaded"
            message={health.error.message}
            onRetry={health.reload}
          />
        ) : health.data ? (
          <AdminMailHealthPanel health={health.data} />
        ) : null}
      </Panel>

      <Panel
        title="Domains"
        description="Every domain of mail of every customer, with the customer that owns it. The search looks at the name of the domain and at the address of the customer."
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Search" htmlFor="admin-mail-search" hint="The name of the domain or the address of the customer.">
              <input
                id="admin-mail-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="acme.ro"
                className={denseInput}
              />
            </Field>
            <Field label="State" htmlFor="admin-mail-domain-state">
              <select
                id="admin-mail-domain-state"
                value={domainState}
                onChange={(event) => setDomainState(event.target.value)}
                className={denseSelect}
              >
                {DOMAIN_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {domains.loading ? (
            <LoadingBlock rows={3} label="Loading the domains" />
          ) : domains.error ? (
            <ErrorState title="The domains could not be loaded" message={domains.error.message} onRetry={domains.reload} />
          ) : !domains.rows.length ? (
            <EmptyState
              title="No domain matches these filters."
              description="Clear the search or the state to see more of the domains."
            />
          ) : (
            <div className="grid gap-3">
              <AdminMailDomainsTable domains={domains.rows} />
              <AdminMailPager
                shown={domains.rows.length}
                total={domains.total}
                hasMore={domains.hasMore}
                pending={domains.loadingMore}
                onLoadMore={() => void domains.loadMore()}
              />
            </div>
          )}

          <AdminMailError message={domains.errorMore} />
        </div>
      </Panel>

      <Panel
        title="Jobs"
        description="The work the platform owes to the mail system. A failed job can be repeated when the work itself can be repeated."
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="State" htmlFor="admin-mail-job-state">
              <select
                id="admin-mail-job-state"
                value={jobState}
                onChange={(event) => setJobState(event.target.value)}
                className={denseSelect}
              >
                {JOB_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {jobs.loading ? (
            <LoadingBlock rows={3} label="Loading the jobs" />
          ) : jobs.error ? (
            <ErrorState title="The jobs could not be loaded" message={jobs.error.message} onRetry={jobs.reload} />
          ) : !jobs.rows.length ? (
            <EmptyState title="No job matches this state." description="Choose another state to see more of the work." />
          ) : (
            <div className="grid gap-3">
              <AdminMailJobsTable jobs={jobs.rows} mayRepeat={mayRepeat} onRepeat={(job) => setPendingRetry(job)} />
              <AdminMailPager
                shown={jobs.rows.length}
                total={jobs.total}
                hasMore={jobs.hasMore}
                pending={jobs.loadingMore}
                onLoadMore={() => void jobs.loadMore()}
              />
            </div>
          )}

          {!mayRepeat && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;infrastructure.write&quot;, so a job cannot be repeated from here.
            </p>
          )}

          <AdminMailError message={jobs.errorMore} />
          <AdminMailError message={retry.error} />
        </div>
      </Panel>

      <AdminMailRetryDialog
        job={pendingRetry}
        busy={retry.pending}
        onCancel={() => setPendingRetry(null)}
        onConfirm={() => {
          if (!pendingRetry) return;
          // The dialog closes when the work was repeated and when the server
          // refused it, so the words of the refusal are read outside of it.
          void retry.run(pendingRetry).finally(() => setPendingRetry(null));
        }}
      />
    </div>
  );
}
