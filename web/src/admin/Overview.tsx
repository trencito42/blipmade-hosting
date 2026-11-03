import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get, type SessionUser } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { useSession } from '../session';
import { ErrorState, Field, LoadingBlock, Money, Panel, SoftButton, StatTile } from '../ui-app';
import { can } from './permissions';

/**
 * Staff dashboard — GET /api/admin/overview.
 *
 * Every number on this page comes from the API. No trend, no percentage change
 * and no estimate is invented: a metric the server does not return is shown as
 * "—" with the "Not available yet" hint.
 *
 * This file also carries the small shared kit the other admin pages use
 * (session permissions, e-mail masking, dense controls and the reason-carrying
 * confirm dialog) because the admin area is limited to the page files of this
 * task.
 */

/* -------------------------------------------------------------------------- */
/* shared admin kit                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The session payload carries the staff permission list. The shared session type
 * does not declare it yet, so admin code widens it locally.
 */
export type StaffUser = SessionUser & { permissions?: string[] };

export const DASH = '—';

export { can } from './permissions';

/**
 * The real session of the operator.
 *
 * The answer of the login endpoint carries an empty permission list, so the
 * admin area reads the session from the API again. The answer is kept for the
 * account, so the screens of the area share one read and a screen that opens
 * later does not wait for it again.
 */
const sessionUsers = new Map<string, StaffUser | null>();
const sessionReads = new Map<string, Promise<StaffUser | null>>();

function readSession(userId: string): Promise<StaffUser | null> {
  const cached = sessionReads.get(userId);
  if (cached) return cached;
  const read = get<{ user: SessionUser | null }>('/auth/session')
    .then((data) => {
      const real = data.user ? ({ ...data.user, permissions: data.user.permissions ?? [] } as StaffUser) : null;
      sessionUsers.set(userId, real);
      return real;
    })
    .catch((error: unknown) => {
      // A failed read is not kept: the screen asks again when it is retried.
      sessionReads.delete(userId);
      sessionUsers.delete(userId);
      throw error;
    });
  sessionReads.set(userId, read);
  return read;
}

export interface AdminSession {
  /** The operator, with the permission list the server really holds. */
  staff: StaffUser | null;
  /** True while the real permission list is still being read. */
  loading: boolean;
  /** Why the real permission list could not be read. */
  error: string | null;
  /** Reads the real session again. */
  reload: () => void;
}

/**
 * The operator of the admin area, with the permissions the server really holds.
 *
 * A session that cannot be read is an error the operator sees, not an empty
 * permission list: a broken admin must never look like a role without rights.
 */
export function useAdminSession(): AdminSession {
  const { user } = useSession();
  const staff = user ? (user as StaffUser) : null;
  const userId = staff?.id ?? null;
  // The answer of the login endpoint carries an empty permission list. An
  // administrator holds every permission anyway, so the read is only needed
  // for the other roles.
  const needsRead = userId !== null && staff?.role !== 'ADMIN' && (staff?.permissions ?? []).length === 0;

  const [read, setRead] = useState<{ id: string; staff: StaffUser | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId || !needsRead) return;
    let alive = true;
    readSession(userId)
      .then((real) => {
        if (alive) setRead({ id: userId, staff: real, error: null });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        const message = cause instanceof ApiError ? cause.message : 'The session could not be read.';
        setRead({ id: userId, staff: null, error: message });
      });
    return () => {
      alive = false;
    };
  }, [userId, needsRead, attempt]);

  // The answer of this render, or the one a screen of the area read before.
  const known =
    read && read.id === userId
      ? read
      : userId !== null && sessionUsers.has(userId)
        ? { id: userId, staff: sessionUsers.get(userId) ?? null, error: null }
        : null;

  const reload = useCallback(() => {
    if (!userId) return;
    sessionReads.delete(userId);
    sessionUsers.delete(userId);
    setRead(null);
    setAttempt((value) => value + 1);
  }, [userId]);

  const permissions = known ? (known.staff?.permissions ?? []) : (staff?.permissions ?? []);

  return {
    staff: staff ? { ...staff, permissions } : null,
    loading: needsRead && !known,
    error: known?.error ?? null,
    reload,
  };
}

export function useStaffUser(): StaffUser | null {
  return useAdminSession().staff;
}

/** Masks a personal address: j***@example.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return DASH;
  const at = email.indexOf('@');
  if (at < 1) return DASH;
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function fmtDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return DAY.format(date);
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return `${DAY.format(date)}, ${TIME.format(date)}`;
}

/**
 * The note that says the list on the screen is only the first rows of the list
 * the platform holds.
 *
 * The number behind it comes from the API, never from the length of the array
 * that arrived, so a list that is cut short is never shown as if it were the
 * whole of it.
 */
export function TruncationNote({ shown, total }: { shown: number; total: number | undefined }) {
  if (typeof total !== 'number' || total <= shown) return null;
  return (
    <p className="px-1 text-[12.5px] leading-relaxed text-ink3">
      Showing the first {shown} of {total}. The API returns the first rows only, so the older entries are not in this
      list.
    </p>
  );
}

/**
 * Dense mode: 38 px controls, 14 px body.
 *
 * On a phone the controls grow to 44px and the text of a field grows to 16px,
 * so a finger finds the control and iOS does not zoom the page when the field
 * is focused. The desktop keeps the dense look.
 */
export const denseInput =
  // scroll-mt keeps the sticky top bar from covering a field the phone scrolls
  // into view when it takes the focus.
  'h-11 w-full scroll-mt-24 rounded-xl border border-line bg-card px-4 text-[16px] text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:border-acc lg:h-[38px] lg:text-[14px]';
export const denseSelect =
  'h-11 w-full scroll-mt-24 appearance-none rounded-xl border border-line bg-card px-4 text-[16px] text-ink outline-none transition-colors duration-[180ms] focus:border-acc lg:h-[38px] lg:text-[14px]';
export const denseButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 lg:h-[38px]';
export const densePrimary = `${denseButton} bg-acc text-on-acc hover:bg-acc-h`;
export const denseSoft = `${denseButton} bg-s3 text-ink hover:bg-line`;
export const denseDanger = `${denseButton} bg-bad/12 text-bad hover:bg-bad/20`;
export const denseGhost = `${denseButton} bg-s2 text-ink2 hover:bg-s3 hover:text-ink`;

/** Announces the result of an async region to screen readers. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="sr-only" aria-live="polite">
      {message}
    </p>
  );
}

/**
 * Confirm dialog with a reason field. The shared ConfirmDialog has no slot for
 * the reason the staff rules require, so this one adds it. Same flat language.
 */
export function ConfirmWithReason({
  open,
  title,
  description,
  confirmLabel,
  reasonLabel,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  busy,
  error,
  destructive = true,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  reasonLabel: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
  destructive?: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef(onCancel);
  const openerRef = useRef<HTMLElement | null>(null);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    // The control that opened the dialog keeps the focus, so it can be given
    // back when the dialog closes.
    openerRef.current = document.activeElement as HTMLElement | null;
    // Focus the reason field once, when the dialog opens. Re-running this on
    // every render would steal the focus while the operator types.
    reasonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      openerRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[440px] flex-col rounded-2xl bg-s1 p-5">
        <h2 className="shrink-0 text-[18px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {description && <p className="text-[14.5px] leading-relaxed text-ink2">{description}</p>}
          <div className="mt-4">
            <Field label={reasonLabel} error={error ?? undefined} htmlFor="admin-confirm-reason">
              <textarea
                id="admin-confirm-reason"
                ref={reasonRef}
                rows={3}
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                placeholder="Recorded in the audit log."
                className="w-full scroll-mt-24 rounded-2xl bg-s2 p-3 text-[16px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3 lg:text-[14px]"
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SoftButton onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            Cancel
          </SoftButton>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              destructive
                ? 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-bad px-5 text-[14.5px] font-semibold text-ink transition-colors duration-[180ms] hover:bg-bad/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'
                : 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'
            }
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* dashboard                                                                   */
/* -------------------------------------------------------------------------- */

interface AdminOverview {
  customers?: number;
  instances?: number;
  activeInstances?: number;
  openTickets?: number;
  ordersToday?: number;
  revenueMonth?: number;
  provisioningFailures?: number;
  mrr?: number;
  currency?: string;
}

function count(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface AttentionItem { key: string; tone: 'bad' | 'warn'; title: string; text: string; to: string }

/** A tile that opens the list its number comes from. */
function KpiLink({ to, ...props }: { to: string; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Link to={to} className="block rounded-2xl transition-colors duration-[180ms] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
      <StatTile {...props} />
    </Link>
  );
}

/** Reads one feed of the dashboard. A role without the permission, or a feed that fails, is left out instead of breaking the page. */
function useFeed<T>(allowed: boolean, path: string, params?: Record<string, string | number>) {
  return useAsync<T | null>(
    async (signal) => {
      if (!allowed) return null;
      try {
        return await get<T>(path, params, signal);
      } catch {
        return null;
      }
    },
    [allowed, path],
  );
}

export default function Overview() {
  const state = useAsync((signal) => get<{ overview: AdminOverview }>('/admin/overview', undefined, signal), []);
  const session = useAdminSession();
  const staff = session.staff;
  const overview = state.data?.overview;
  const currency = overview?.currency ?? 'EUR';

  const incidents = useFeed<{ incidents: { id: string; title: string; impact: string; resolvedAt: string | null; startedAt: string }[] }>(can(staff, 'infrastructure.read'), '/admin/incidents');
  const queues = useFeed<{ queues: { name: string; label: string; counts: Record<string, number> }[] }>(can(staff, 'infrastructure.read'), '/admin/queues');
  const deadLetters = useFeed<{ total: number }>(can(staff, 'infrastructure.read'), '/admin/dead-letters', { state: 'pending', limit: 1 });
  const webhooks = useFeed<{ failed: unknown[] }>(can(staff, 'infrastructure.read'), '/admin/webhooks/failed');
  const supportCounts = useFeed<{ counts: Record<string, number> }>(can(staff, 'tickets.read'), '/admin/support/counts');
  const recent = useFeed<{ logs: { id: string; action: string; actorEmail: string | null; targetType: string | null; targetId: string | null; createdAt: string }[] }>(can(staff, 'audit.read'), '/admin/audit', { limit: 8 });

  if (state.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={4} label="Loading the dashboard" />
      </div>
    );
  }

  if (state.error || !overview) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="The dashboard could not be loaded"
          message={state.error?.message ?? 'The overview did not come back.'}
          requestId={state.error instanceof ApiError ? state.error.requestId : undefined}
          onRetry={state.reload}
        />
      </div>
    );
  }

  const customers = count(overview.customers);
  const instances = count(overview.instances);
  const active = count(overview.activeInstances);
  const openTickets = count(overview.openTickets);
  const ordersToday = count(overview.ordersToday);
  const revenue = count(overview.revenueMonth);
  const mrr = count(overview.mrr);
  const failures = count(overview.provisioningFailures);

  // The alert feed: only what needs a person, each item opening the place where it is dealt with.
  const attention: AttentionItem[] = [];
  const openIncidents = (incidents.data?.incidents ?? []).filter((entry) => !entry.resolvedAt);
  for (const incident of openIncidents.slice(0, 3)) {
    attention.push({ key: `incident-${incident.id}`, tone: incident.impact === 'critical' || incident.impact === 'major' ? 'bad' : 'warn', title: incident.title, text: `Open incident · ${incident.impact} · since ${new Date(incident.startedAt).toLocaleString()}`, to: '/admin/incidents' });
  }
  if (failures !== null && failures > 0) attention.push({ key: 'provisioning', tone: 'bad', title: `${failures} service${failures === 1 ? '' : 's'} failed to provision`, text: 'Open the services and retry them.', to: '/admin/services' });
  const failedJobs = (queues.data?.queues ?? []).reduce((sum, queue) => sum + (queue.counts.failed ?? 0), 0);
  if (failedJobs > 0) attention.push({ key: 'jobs', tone: 'warn', title: `${failedJobs} failed job${failedJobs === 1 ? '' : 's'} in the queues`, text: 'Look at the reason and retry or remove them.', to: '/admin/queues' });
  const dead = deadLetters.data?.total ?? 0;
  if (dead > 0) attention.push({ key: 'dead', tone: 'warn', title: `${dead} job${dead === 1 ? '' : 's'} failed for good`, text: 'They used up their attempts.', to: '/admin/tools' });
  const hooks = webhooks.data?.failed.length ?? 0;
  if (hooks > 0) attention.push({ key: 'webhooks', tone: 'warn', title: `${hooks} payment event${hooks === 1 ? '' : 's'} not processed`, text: 'Replay them from the tools page.', to: '/admin/tools' });
  const breached = supportCounts.data?.counts.sla_at_risk ?? 0;
  if (breached > 0) attention.push({ key: 'sla', tone: 'bad', title: `${breached} conversation${breached === 1 ? ' is' : 's are'} at risk of missing the response target`, text: 'Open the support queue.', to: '/admin/support' });

  const feedsLoading = [incidents, queues, deadLetters, webhooks, supportCounts].some((feed) => feed.loading);
  const nothingYet = customers === 0 && instances === 0;

  return (
    <div className="grid gap-4">
      <Panel title="Needs attention" description="Only what needs a person. Each item opens the place where it is dealt with.">
        {feedsLoading && attention.length === 0 ? (
          <LoadingBlock rows={1} label="Checking the platform" />
        ) : attention.length === 0 ? (
          <p className="text-[14px] text-ink2">Nothing needs attention now: no open incident, no failed provisioning and no failed job.</p>
        ) : (
          <ul className="grid gap-2">
            {attention.map((item) => (
              <li key={item.key}>
                <Link to={item.to} className={`block rounded-2xl p-3.5 transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${item.tone === 'bad' ? 'bg-bad/10 hover:bg-bad/15' : 'bg-warn/12 hover:bg-warn/20'}`}>
                  <span className={`block text-[14.5px] font-semibold ${item.tone === 'bad' ? 'text-bad' : 'text-warn'}`}>{item.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ink2">{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiLink to="/admin/customers" label="Customers" value={customers ?? DASH} hint="Accounts with the customer role." />
        <KpiLink to="/admin/services" label="Active instances" value={active ?? DASH} hint={instances === null ? 'Online, provisioning or restarting.' : `of ${instances} on the platform`} />
        <KpiLink to="/admin/tickets" label="Open tickets" value={openTickets ?? DASH} hint="Not closed." />
        <KpiLink to="/admin/orders" label="Orders today" value={ordersToday ?? DASH} hint="Placed since midnight." />
        <KpiLink to="/admin/reports" label="Revenue this month" value={revenue === null ? DASH : <Money amount={revenue} currency={currency} period="month" />} hint="Paid and fulfilled orders this month." />
        <KpiLink to="/admin/reports" label="Monthly recurring revenue" value={mrr === null ? DASH : <Money amount={mrr} currency={currency} period="month" />} hint="Active subscriptions that are not cancelled." />
      </section>

      {nothingYet && (
        <Panel title="No accounts yet">
          <p className="text-[14px] text-ink2">The platform has no customers and no instances. Numbers appear here as soon as the API reports them.</p>
        </Panel>
      )}

      {can(staff, 'audit.read') && (
        <Panel title="Latest operator actions" description="The newest entries of the audit log." action={<Link to="/admin/activity" className="text-[13.5px] font-medium text-acc hover:underline">All activity</Link>}>
          {recent.loading && !recent.data ? <LoadingBlock rows={2} label="Loading the actions" />
            : !recent.data || recent.data.logs.length === 0 ? <p className="text-[14px] text-ink2">No action recorded yet.</p>
            : (
              <ol className="divide-y divide-line">
                {recent.data.logs.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
                    <Link to={`/admin/audit/${encodeURIComponent(row.id)}`} className="font-mono text-acc hover:underline">{row.action}</Link>
                    <span className="min-w-0 truncate text-ink2">{row.actorEmail ? maskEmail(row.actorEmail) : 'the platform'}{row.targetType ? ` · ${row.targetType}` : ''}</span>
                    <span className="font-mono text-[12px] text-ink3">{fmtDateTime(row.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )}
        </Panel>
      )}
    </div>
  );
}
