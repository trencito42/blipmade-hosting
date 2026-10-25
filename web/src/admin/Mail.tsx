import { useEffect, useState } from 'react';
import {
  get,
  getAdminMailHealth,
  listAdminMailDomains,
  listAdminMailJobs,
  post,
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
  ButtonLink,
  Panel,
  StatTile,
  StatusPill,
  useToast,
} from '../ui-app';
import {
  DASH,
  LiveRegion,
  can,
  ConfirmWithReason,
  denseDanger,
  denseGhost,
  denseInput,
  denseSelect,
  denseSoft,
  fmtDateTime,
  useAdminSession,
} from './Overview';
import type { TableColumn } from '../lib/table';

/**
 * The back office of the hosted mail.
 *
 * Five things are shown here: whether the mail system answers, every domain
 * of mail of every customer, the work the platform still owes to the mail
 * system, every hosted mail service of every customer, and the use of the
 * platform.
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

/* -------------------------------------------------------------------------- */
/* the hosted mail services                                                    */
/* -------------------------------------------------------------------------- */

/** The use of a hosted mail service, as the API sends it. */
export interface AdminMailServiceUsage {
  /** How many domains the service holds. */
  domains: number;
  /** How many mailboxes the service holds. */
  mailboxes: number;
  /** The space the service uses, in megabytes. */
  storageMb: number;
  /** The space the service may hold, in megabytes. */
  storageLimitMb: number;
}

/** The limits that are applied to a hosted mail service. */
export interface AdminMailServiceLimits {
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  totalStorageMb: number;
  mailboxQuotaMb: number;
  sendLimit: number;
  sendInterval: string;
}

/** A hosted mail service of a customer, as the API sends it. */
export interface AdminMailService {
  id: string;
  userId: string;
  /** The address of the customer, when the API names it. */
  customerEmail?: string | null;
  plan: { slug: string; name: string };
  /** PENDING, PROVISIONING, ACTIVE, GRACE, SUSPENDED or CANCELLED. */
  status: string;
  usage: AdminMailServiceUsage;
  limits: AdminMailServiceLimits;
  /** The end of the grace, when the service is in grace. */
  graceUntil: string | null;
  suspendedAt: string | null;
  cancelledAt: string | null;
  /** The end of the time the data of the service is kept. */
  retentionUntil: string | null;
  /** The words of the last failure, when there is one. */
  lastError: string | null;
  createdAt: string;
}

/** The colour of a state of a service, so every state is read the same way. */
const SERVICE_TONE: Record<string, string> = {
  PENDING: 'pending',
  PROVISIONING: 'provisioning',
  ACTIVE: 'active',
  GRACE: 'degraded',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
};

/** What the operator can do with a service of a customer. */
export type AdminMailServiceAction = 'suspend' | 'resume' | 'cancel' | 'reactivate' | 'reprovision';

/** The name of an action, as the operator reads it. */
const SERVICE_ACTION_LABEL: Record<AdminMailServiceAction, string> = {
  suspend: 'Suspend',
  resume: 'Resume',
  cancel: 'Cancel',
  reactivate: 'Reactivate',
  reprovision: 'Host it again',
};

/** What an action did, as the operator reads it afterwards. */
const SERVICE_ACTION_DONE: Record<AdminMailServiceAction, string> = {
  suspend: 'suspended',
  resume: 'resumed',
  cancel: 'cancelled',
  reactivate: 'reactivated',
  reprovision: 'hosted again',
};

/**
 * The actions the operator may take on a service, in the order they are
 * offered.
 *
 * A service that is cancelled is only brought back: the other actions of a
 * service that no longer runs would be refused by the server.
 */
export function adminMailServiceActions(status: string): AdminMailServiceAction[] {
  if (status === 'CANCELLED') return ['reactivate'];
  const actions: AdminMailServiceAction[] = [status === 'SUSPENDED' ? 'resume' : 'suspend'];
  actions.push('cancel');
  actions.push('reprovision');
  return actions;
}

/**
 * Acts on a service of a customer.
 *
 * Without a service nothing is sent: an action always names the service it
 * is about.
 */
export async function runAdminMailServiceAction(
  service: AdminMailService | null,
  action: AdminMailServiceAction,
  reason?: string,
): Promise<boolean> {
  if (!service) return false;
  await post<{ ok: boolean }>(
    `/admin/mail/services/${encodeURIComponent(service.id)}/${action}`,
    action === 'suspend' && reason ? { reason } : undefined,
  );
  return true;
}

/** The use of a service, in one line. */
function ServiceUsage({ service }: { service: AdminMailService }) {
  const usage = service.usage;
  if (!usage) return <span className="text-ink3">{DASH}</span>;
  const space = Number.isFinite(usage.storageLimitMb)
    ? `${usage.storageMb} MB of ${usage.storageLimitMb} MB`
    : `${usage.storageMb} MB`;
  return (
    <span className="block font-mono text-[12.5px] text-ink2">
      {usage.domains} domains · {usage.mailboxes} mailboxes · {space}
    </span>
  );
}

/** The life of a service: when it began and when it will end. */
function ServiceLife({ service }: { service: AdminMailService }) {
  const moments: { label: string; value: string | null | undefined }[] = [
    { label: 'Since', value: service.createdAt },
    { label: 'Grace until', value: service.graceUntil },
    { label: 'Suspended at', value: service.suspendedAt },
    { label: 'Cancelled at', value: service.cancelledAt },
    { label: 'Kept until', value: service.retentionUntil },
  ];
  return (
    <span className="block min-w-0">
      {moments.map((moment) => (
        <span key={moment.label} className="block text-[12.5px] text-ink2">
          {moment.label}: {moment.value ? fmtDateTime(moment.value) : DASH}
        </span>
      ))}
    </span>
  );
}

/**
 * Every hosted mail service of every customer.
 *
 * The customer, the plan, the state, the use and the life of every service
 * come from the API. The actions the operator may take are the ones the
 * state of the service allows.
 */
export function AdminMailServicesTable({
  services,
  mayWrite,
  onAction,
}: {
  services: AdminMailService[];
  mayWrite: boolean;
  onAction: (service: AdminMailService, action: AdminMailServiceAction) => void;
}) {
  const columns: TableColumn<AdminMailService>[] = [
    {
      key: 'customer',
      header: 'Customer',
      truncate: true,
      render: (service: AdminMailService) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[12.5px] text-ink" title={service.customerEmail ?? undefined}>
            {service.customerEmail ?? DASH}
          </span>
          <span className="block truncate font-mono text-[11.5px] text-ink3" title={service.id}>
            {service.id}
          </span>
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      truncate: true,
      render: (service: AdminMailService) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13.5px] text-ink" title={service.plan?.name}>
            {service.plan?.name ?? DASH}
          </span>
          <span className="block truncate font-mono text-[11.5px] text-ink3" title={service.plan?.slug}>
            {service.plan?.slug ?? DASH}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      nowrap: true,
      render: (service: AdminMailService) => (
        <StatusPill status={SERVICE_TONE[service.status] ?? service.status} label={service.status} />
      ),
    },
    {
      key: 'usage',
      header: 'Use',
      className: 'max-w-[280px]',
      render: (service: AdminMailService) => <ServiceUsage service={service} />,
    },
    {
      key: 'life',
      header: 'Life',
      className: 'max-w-[220px]',
      render: (service: AdminMailService) => <ServiceLife service={service} />,
    },
    {
      key: 'error',
      header: 'Last failure',
      className: 'max-w-[240px]',
      render: (service: AdminMailService) =>
        service.lastError ? (
          <span className="block break-words text-[12.5px] text-bad">{service.lastError}</span>
        ) : (
          <span className="text-ink3">{DASH}</span>
        ),
    },
    ...(mayWrite
      ? ([
          {
            key: 'actions',
            header: 'Action',
            align: 'right',
            render: (service: AdminMailService) => (
              <span className="flex flex-wrap justify-end gap-2">
                {adminMailServiceActions(service.status).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => onAction(service, action)}
                    className={action === 'cancel' ? denseDanger : denseGhost}
                  >
                    {SERVICE_ACTION_LABEL[action]}
                  </button>
                ))}
              </span>
            ),
          },
        ] satisfies TableColumn<AdminMailService>[])
      : []),
  ];

  return (
    <>
      <DataTable<AdminMailService> rows={services} rowKey={(service) => service.id} minWidth="1080px" columns={columns} />
      <CardList<AdminMailService> rows={services} rowKey={(service) => service.id}>
        {(service) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="w-0 min-w-0 flex-1">
                <p className="truncate font-mono text-[13.5px] font-bold text-ink" title={service.customerEmail ?? undefined}>
                  {service.customerEmail ?? DASH}
                </p>
                <p className="truncate text-[12.5px] text-ink3" title={service.plan?.name}>
                  {service.plan?.name ?? DASH}
                </p>
              </div>
              <StatusPill status={SERVICE_TONE[service.status] ?? service.status} label={service.status} />
            </div>
            <dl className="mt-2 grid gap-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-ink3">Use</dt>
                <dd className="min-w-0">
                  <ServiceUsage service={service} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-ink3">Life</dt>
                <dd className="min-w-0">
                  <ServiceLife service={service} />
                </dd>
              </div>
              {service.lastError && (
                <div className="min-w-0">
                  <dt className="text-ink3">Last failure</dt>
                  <dd className="break-words text-bad">{service.lastError}</dd>
                </div>
              )}
            </dl>
            {mayWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                {adminMailServiceActions(service.status).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => onAction(service, action)}
                    className={action === 'cancel' ? denseDanger : denseGhost}
                  >
                    {SERVICE_ACTION_LABEL[action]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardList>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* the use of the platform                                                     */
/* -------------------------------------------------------------------------- */

/** A limit of sending, as the API sends it. */
export interface AdminMailSendingLimit {
  /** The domain the limit belongs to, when the API names it. */
  domain?: string | null;
  domainName?: string | null;
  name?: string | null;
  /** How many messages the window holds. */
  limit?: number | null;
  value?: number | null;
  amount?: number | null;
  /** How many messages are left in the window. */
  remaining?: number | null;
  /** The window in which the limit is counted. */
  interval?: string | null;
  window?: string | null;
  period?: string | null;
  /** Anything else the API sends. */
  [key: string]: unknown;
}

/** The use of the platform, as the API sends it. */
export interface AdminMailUsage {
  /** How many hosted mail services the platform holds. */
  services: number;
  /** How many domains of mail they hold. */
  domains: number;
  /** How many mailboxes they hold. */
  mailboxes: number;
  /** The space they use, in megabytes. */
  storageMb: number;
  /** How many services there are in every state. */
  byStatus: Record<string, number>;
  /** The limits of sending that are applied. */
  sendingLimits: AdminMailSendingLimit[];
  /** The health of the mail system. */
  health: {
    /** Whether this environment points at a mail system at all. */
    configured: boolean;
    /** Whether the mail system answered the request. */
    reachable: boolean;
    /** The version the mail system reports. */
    version: string | null;
    /** The disk of the mail system. Null when the mail system did not answer. */
    disk: { used: string; total: string; usedPercent: string } | null;
    /** The words of the failure, when there is one. */
    error: string | null;
  };
}

/**
 * The rows of a limit of sending.
 *
 * The API is the only one who knows what a limit of sending carries, so the
 * rows are the fields it sends and nothing else.
 */
export function adminMailSendingLimitRows(limit: AdminMailSendingLimit): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const text = (value: unknown): string | null => {
    if (typeof value === 'string') return value.trim() === '' ? null : value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  };

  const domain = text(limit.domain ?? limit.domainName ?? limit.name);
  if (domain) rows.push({ label: 'Domain', value: domain });

  const amount = text(limit.limit ?? limit.value ?? limit.amount);
  if (amount) rows.push({ label: 'Messages', value: amount });

  const remaining = text(limit.remaining);
  if (remaining) rows.push({ label: 'Left', value: remaining });

  const interval = text(limit.interval ?? limit.window ?? limit.period);
  if (interval) rows.push({ label: 'Window', value: interval });

  return rows;
}

/**
 * The state of the mail system.
 *
 * A mail system that does not answer is a state, not a number of zeros that
 * looks like a measure.
 */
export function AdminMailSystemHealth({ health }: { health: AdminMailUsage['health'] }) {
  const reachable = Boolean(health?.reachable);
  const disk = health?.disk;

  return (
    <section aria-label="The state of the mail system" className="grid gap-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">The mail system</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Configured"
          value={health?.configured ? 'Yes' : 'No'}
          hint="Whether this environment points at a mail system."
        />
        <StatTile label="Answers" value={reachable ? 'Yes' : 'No'} hint="Whether the mail system answered the request." />
        <StatTile label="Version" value={health?.version ?? DASH} hint="The version the mail system reports." />
        <StatTile
          label="Disk used"
          value={disk ? `${disk.used} of ${disk.total} (${disk.usedPercent})` : DASH}
          hint="The disk of the mail system."
        />
      </div>

      {!reachable && (
        <div role="status" className="rounded-2xl bg-bad/10 px-4 py-3">
          <p className="text-[14.5px] font-extrabold text-bad">The mail system cannot be reached.</p>
          <p className="mt-1 break-words text-[13.5px] leading-relaxed text-ink2">
            {health?.error ?? 'The mail system did not answer the request.'}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink2">
            The numbers of the platform are the numbers of the platform. The numbers of the mail system are not known, so
            they are not shown as zeros.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The use of the platform by the hosted mail.
 *
 * How many services, domains, mailboxes and megabytes there are, how many
 * services there are in every state, the limits of sending that are applied
 * and the health of the mail system. Every number comes from the API.
 */
export function AdminMailUsagePanel({ usage }: { usage: AdminMailUsage }) {
  const reachable = Boolean(usage?.health?.reachable);
  const byStatus = Object.entries(usage?.byStatus ?? {});

  return (
    <div className="grid gap-4">
      <section aria-label="The use of the platform" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Services" value={usage?.services ?? DASH} hint="The hosted mail services the platform holds." />
        <StatTile label="Domains" value={usage?.domains ?? DASH} hint="The domains of mail of every service." />
        <StatTile label="Mailboxes" value={usage?.mailboxes ?? DASH} hint="The mailboxes of every service." />
        <StatTile label="Space used" value={`${usage?.storageMb ?? DASH} MB`} hint="The space the mail holds." />
      </section>

      <section aria-label="The services by state" className="grid gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Services by state</p>
        {byStatus.length ? (
          <dl className="grid gap-2 sm:grid-cols-3">
            {byStatus.map(([status, count]) => (
              <div key={status} className="rounded-2xl bg-s2 p-3">
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">
                  {status.replace(/_/g, ' ')}
                </dt>
                <dd className="mt-1 font-mono text-[18px] text-ink">{count}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="px-1 text-[13px] text-ink3">The API holds no state of the services.</p>
        )}
      </section>

      <section aria-label="The limits of sending" className="grid gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Limits of sending</p>
        {!reachable ? (
          <p role="status" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] leading-relaxed text-ink2">
            The limits of sending are not known: the mail system did not answer, so they are not counted here as zeros.
          </p>
        ) : usage?.sendingLimits?.length ? (
          <ul className="grid gap-2">
            {usage.sendingLimits.map((limit, index) => {
              const rows = adminMailSendingLimitRows(limit);
              return (
                <li key={index} className="rounded-2xl bg-s2 p-3">
                  {rows.length ? (
                    <dl className="grid gap-1 sm:grid-cols-2">
                      {rows.map((row) => (
                        <div key={row.label} className="min-w-0">
                          <dt className="text-ink3">{row.label}</dt>
                          <dd className="font-mono break-words text-ink">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="font-mono text-ink2">{DASH}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-1 text-[13px] text-ink3">No limit of sending is applied.</p>
        )}
      </section>

      <AdminMailSystemHealth health={usage.health} />
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

/**
 * The mail services, walked with the cursor of the API.
 *
 * The API sends the cursor of the next page with the page on the screen, so
 * the next page is the one that follows it. The rows of the pages that were
 * walked are kept, so "Load more" adds to the list instead of replacing it.
 */
function useAdminMailServices() {
  const first = useAsync<{ services: AdminMailService[]; nextCursor?: string | null }>(
    (signal) => get<{ services: AdminMailService[]; nextCursor?: string | null }>('/admin/mail/services', undefined, signal),
    [],
  );

  const [walked, setWalked] = useState<{
    rows: AdminMailService[];
    cursor: string | null;
    hasMore: boolean;
  }>({ rows: [], cursor: null, hasMore: false });

  useEffect(() => {
    const page = first.data;
    if (!page) return;
    setWalked({
      rows: page.services ?? [],
      cursor: page.nextCursor ?? null,
      hasMore: Boolean(page.nextCursor),
    });
  }, [first.data]);

  const more = useAction(async () => {
    const cursor = walked.cursor;
    if (!cursor) return;
    const page = await get<{ services: AdminMailService[]; nextCursor?: string | null }>('/admin/mail/services', {
      cursor,
    });
    setWalked((current) => ({
      rows: [...current.rows, ...(page.services ?? [])],
      cursor: page.nextCursor ?? null,
      hasMore: Boolean(page.nextCursor),
    }));
  });

  return {
    rows: walked.rows,
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
  // The action the operator asked for on a service, and the reason of a
  // suspension. The action is only sent once it is confirmed.
  const [pendingService, setPendingService] = useState<{
    service: AdminMailService;
    action: AdminMailServiceAction;
  } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // The search is sent after a pause, so a word is not a request per letter.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const health = useAsync((signal) => getAdminMailHealth(signal), []);

  const services = useAdminMailServices();

  const usage = useAsync((signal) => get<AdminMailUsage>('/admin/mail/usage', undefined, signal), []);

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
  const mayWriteService = can(staff, 'mail.write');

  const retry = useAction(async (job: AdminMailJob) => {
    const repeated = await runAdminMailRetry(job);
    if (!repeated) return null;
    toast.push(`The work ${repeated.kind} was given to the mail system again.`, 'ok');
    jobs.reload();
    return repeated;
  });

  const serviceAction = useAction(async (service: AdminMailService, action: AdminMailServiceAction, reason?: string) => {
    const done = await runAdminMailServiceAction(service, action, reason);
    if (!done) return null;
    toast.push(`The service was ${SERVICE_ACTION_DONE[action]}.`, 'ok');
    services.reload();
    usage.reload();
    return done;
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
      <LiveRegion
        message={`${domains.rows.length} domains, ${jobs.rows.length} jobs, ${services.rows.length} mail services`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink to="/admin/mail/plans" variant="soft">
          The plans of hosted mail
        </ButtonLink>
        <span className="text-sm text-slate-500">
          The plans, their limits and their prices live on their own page.
        </span>
      </div>

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

      <Panel
        title="Mail services"
        description="Every hosted mail service of every customer: the plan it runs on, the state it is in, the use it makes of the platform and the life it still has."
      >
        <div className="grid gap-3">
          {services.loading ? (
            <LoadingBlock rows={3} label="Loading the mail services" />
          ) : services.error ? (
            <ErrorState
              title="The mail services could not be loaded"
              message={services.error.message}
              onRetry={services.reload}
            />
          ) : !services.rows.length ? (
            <EmptyState title="No customer bought a plan of hosted mail yet." description="The services appear here as they are bought." />
          ) : (
            <div className="grid gap-3">
              <AdminMailServicesTable
                services={services.rows}
                mayWrite={mayWriteService}
                onAction={(service, action) => {
                  // A suspension asks for a reason and a cancellation is a
                  // destructive act: both are confirmed before they are sent.
                  if (action === 'suspend' || action === 'cancel') {
                    setSuspendReason('');
                    setPendingService({ service, action });
                    return;
                  }
                  void serviceAction.run(service, action);
                }}
              />
              <AdminMailPager
                shown={services.rows.length}
                total={undefined}
                hasMore={services.hasMore}
                pending={services.loadingMore}
                onLoadMore={() => void services.loadMore()}
              />
            </div>
          )}

          {!mayWriteService && (
            <p className="px-1 text-[13px] text-ink3">
              Your role does not hold &quot;mail.write&quot;, so a service cannot be acted on from here.
            </p>
          )}

          <AdminMailError message={services.errorMore} />
          <AdminMailError message={serviceAction.error} />
        </div>
      </Panel>

      <Panel
        title="The use of the platform"
        description="What the hosted mail uses of the platform, how many services there are in every state, the limits of sending that are applied and the state of the mail system."
      >
        {usage.loading ? (
          <LoadingBlock rows={3} label="Loading the use of the platform" />
        ) : usage.error ? (
          <ErrorState
            title="The use of the platform could not be loaded"
            message={usage.error.message}
            onRetry={usage.reload}
          />
        ) : usage.data ? (
          <AdminMailUsagePanel usage={usage.data} />
        ) : null}
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

      {pendingService?.action === 'suspend' && (
        <ConfirmWithReason
          open
          title={`Suspend the service of ${pendingService.service.customerEmail ?? pendingService.service.id}`}
          description={`The service of the plan ${pendingService.service.plan?.name ?? 'of the customer'} is suspended. The mailboxes stop receiving mail and the domain stops sending it. The reason is written in the log of the platform.`}
          confirmLabel="Suspend the service"
          reasonLabel="Why the service is suspended"
          reason={suspendReason}
          onReasonChange={setSuspendReason}
          error={serviceAction.error}
          busy={serviceAction.pending}
          onCancel={() => setPendingService(null)}
          onConfirm={() => {
            void serviceAction.run(pendingService.service, 'suspend', suspendReason.trim() || undefined).then((result) => {
              // The dialog stays open when the server refused, because the
              // words of the refusal are written inside it.
              if (!result) return;
              setPendingService(null);
              setSuspendReason('');
            });
          }}
        />
      )}

      {pendingService?.action === 'cancel' && (
        <ConfirmDialog
          open
          title={`Cancel the service of ${pendingService.service.customerEmail ?? pendingService.service.id}`}
          description={`The service of the plan ${pendingService.service.plan?.name ?? 'of the customer'} is cancelled. The data of the service is kept until the end of the time the platform holds it, and the service can be brought back until then.`}
          confirmLabel="Cancel the service"
          busy={serviceAction.pending}
          onCancel={() => setPendingService(null)}
          onConfirm={() => {
            void serviceAction.run(pendingService.service, 'cancel').then((result) => {
              // The dialog closes when the service was cancelled and when the
              // server refused it, so the words of the refusal are read
              // outside of it.
              setPendingService(null);
              return result;
            });
          }}
        />
      )}
    </div>
  );
}
