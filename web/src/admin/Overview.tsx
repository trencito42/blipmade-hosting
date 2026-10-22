import { useEffect, useRef } from 'react';
import { ApiError, get, type SessionUser } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { useSession } from '../session';
import { ErrorState, Field, ListRow, LoadingBlock, Money, Panel, SoftButton, StatTile } from '../ui-app';

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

export function useStaffUser(): StaffUser | null {
  const { user } = useSession();
  return user ? (user as StaffUser) : null;
}

/** Administrators hold every permission server-side, so the client mirrors that. */
export function can(user: StaffUser | null, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return (user.permissions ?? []).includes(permission);
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

/** Dense mode: 38 px controls, 14 px body. */
export const denseInput =
  'h-[38px] w-full rounded-full bg-s2 px-4 text-[14px] text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3';
export const denseSelect =
  'h-[38px] w-full appearance-none rounded-full bg-s2 px-4 text-[14px] text-ink outline-none transition-colors duration-[180ms] focus:bg-s3';
export const denseButton =
  'inline-flex h-[38px] items-center justify-center gap-2 rounded-full px-4 text-[13.5px] font-bold transition-colors duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';
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
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    // Focus the reason field once, when the dialog opens. Re-running this on
    // every render would steal the focus while the operator types.
    reasonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-[440px] rounded-[22px] bg-s1 p-5">
        <h2 className="text-[18px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
        {description && <p className="mt-2 text-[14.5px] leading-relaxed text-ink2">{description}</p>}
        <div className="mt-4">
          <Field label={reasonLabel} error={error ?? undefined} htmlFor="admin-confirm-reason">
            <textarea
              id="admin-confirm-reason"
              ref={reasonRef}
              rows={3}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Recorded in the audit log."
              className="w-full rounded-2xl bg-s2 p-3 text-[14px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3"
            />
          </Field>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SoftButton onClick={onCancel} disabled={busy}>
            Cancel
          </SoftButton>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              destructive
                ? 'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-bad px-5 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-bad/85 focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50'
                : densePrimary
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

export default function Overview() {
  const state = useAsync((signal) => get<{ overview: AdminOverview }>('/admin/overview', undefined, signal), []);
  const overview = state.data?.overview;
  const currency = overview?.currency ?? 'EUR';

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

  const nothingYet = customers === 0 && instances === 0;

  return (
    <div className="grid gap-4">
      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Customers" value={customers ?? DASH} hint="Accounts with the customer role." />
        <StatTile label="Instances" value={instances ?? DASH} hint="Every instance on the platform." />
        <StatTile label="Active instances" value={active ?? DASH} hint="Online, provisioning or restarting." />
        <StatTile label="Open tickets" value={openTickets ?? DASH} hint="Not closed." />
        <StatTile label="Orders today" value={ordersToday ?? DASH} hint="Placed since midnight." />
        <StatTile
          label="Revenue this month"
          value={revenue === null ? DASH : <Money amount={revenue} currency={currency} period="month" />}
          hint="Paid and fulfilled orders this month."
        />
        <StatTile
          label="Monthly recurring revenue"
          value={mrr === null ? DASH : <Money amount={mrr} currency={currency} period="month" />}
          hint="Active subscriptions that are not cancelled."
        />
        {failures !== null && failures > 0 ? (
          <Link
            to="/admin/services"
            className="rounded-2xl bg-warn/12 p-4 transition-colors duration-[180ms] hover:bg-warn/20 focus-visible:ring-2 focus-visible:ring-acc"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-warn">Provisioning failures</p>
            <p className="mt-1 font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-warn">{failures}</p>
            <p className="mt-1 text-[12.5px] text-ink2">Instances stuck in failed. Open the services list to retry them.</p>
          </Link>
        ) : (
          <StatTile
            label="Provisioning failures"
            value={failures ?? DASH}
            hint="Instances with status failed."
          />
        )}
      </section>

      {nothingYet && (
        <Panel title="No accounts yet">
          <p className="text-[14px] text-ink2">
            The platform has no customers and no instances. Numbers appear here as soon as the API reports them.
          </p>
        </Panel>
      )}

      <Panel title="Go to" description="The panels above come from the overview endpoint. Everything else lives in its own list.">
        <div className="grid gap-1.5">
          <ListRow title="Customers" meta="Search accounts, invoices and tickets" to="/admin/customers" />
          <ListRow title="Orders" meta="Every order with its status and total" to="/admin/orders" />
          <ListRow title="Services" meta="Instances across nodes, with provisioning retries" to="/admin/services" />
          <ListRow title="Support queue" meta="Tickets, assignments and internal notes" to="/admin/tickets" />
          <ListRow title="Infrastructure" meta="Nodes, capacity headroom and eggs" to="/admin/infrastructure" />
          <ListRow title="Audit log" meta="Every staff action the API recorded" to="/admin/audit" />
        </div>
      </Panel>

      <p className="px-1 text-[12.5px] text-ink3">
        Counts come from <span className="font-mono">GET /api/admin/overview</span>. Values the API does not return are shown as
        {` ${DASH} `}
        — they are not estimated.
      </p>
    </div>
  );
}
