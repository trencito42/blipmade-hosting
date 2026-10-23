import type { ReactNode } from 'react';
import { ApiError, type Instance } from '../../lib/api';
import { ErrorState } from '../../ui-app';

/**
 * The pieces every tab of the instance page shares: the names of the tabs,
 * the formatting of the values the API returns and the honest state of a
 * request that did not work.
 */

export type TabId =
  | 'overview'
  | 'console'
  | 'files'
  | 'databases'
  | 'backups'
  | 'network'
  | 'startup'
  | 'schedules'
  | 'settings'
  | 'activity';

export const TABS: { value: TabId; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'console', label: 'Console' },
  { value: 'files', label: 'Files' },
  { value: 'databases', label: 'Databases' },
  { value: 'backups', label: 'Backups' },
  { value: 'network', label: 'Network' },
  { value: 'startup', label: 'Startup' },
  { value: 'schedules', label: 'Schedules' },
  { value: 'settings', label: 'Settings' },
  { value: 'activity', label: 'Activity' },
];

/** What every tab receives from the page that owns it. */
export interface TabProps {
  /** The Blipmade record of the instance, with the limits the customer bought. */
  instance: Instance;
  /** Moves the page to another tab, so a tab can point at its neighbour. */
  onGoTo?: (tab: TabId) => void;
}

// --- formatting ------------------------------------------------------------

/** Purchased memory, never live usage. */
export function fmtRam(mb: number): string {
  if (!Number.isFinite(mb)) return '—';
  if (mb < 1024) return `${mb} MB`;
  return `${Math.round((mb / 1024) * 100) / 100} GB`;
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100} GB`;
}

export function fmtUptime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} m`;
  return `${minutes} m`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The permissions of a file. The panel writes them as octal digits, for
 * example "0644".
 */
export function fmtMode(mode: string | number | null | undefined): string {
  if (mode === null || mode === undefined) return '—';
  const text = String(mode).trim();
  if (!text) return '—';
  const digits = text.replace(/^0o/i, '');
  if (!/^[0-7]+$/.test(digits)) return text;
  return digits.padStart(3, '0');
}

/**
 * The number of the permission bits that a permission written in octal
 * stands for: 644 is 420.
 */
export function parseMode(octal: string): number | null {
  const clean = octal.trim().replace(/^0o/i, '');
  if (!/^[0-7]{1,4}$/.test(clean)) return null;
  return parseInt(clean, 8);
}

// --- paths -----------------------------------------------------------------

export function joinPath(directory: string, name: string): string {
  if (!directory || directory === '/') return `/${name}`;
  return `${directory.replace(/\/+$/, '')}/${name}`;
}

export function parentPath(path: string): string {
  const clean = path.replace(/\/+$/, '');
  const cut = clean.lastIndexOf('/');
  if (cut <= 0) return '/';
  return clean.slice(0, cut);
}

export function baseName(path: string): string {
  const clean = path.replace(/\/+$/, '');
  const cut = clean.lastIndexOf('/');
  return cut === -1 ? clean : clean.slice(cut + 1);
}

/** The archive format a file name points at, when it points at one. */
export function archiveFormatOf(name: string): 'tar' | 'zip' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar';
  return null;
}

// --- errors ----------------------------------------------------------------

/**
 * The error of a request, told apart by what it means.
 *
 * A panel that cannot serve an operation yet is not a failure of the page:
 * the key bridge of the panel is missing, and the message of the API says
 * what has to happen. That message is shown as it is, so the customer knows
 * what to do.
 */
export function errorTitle(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    if (error.status === 503 || error.code === 'unavailable') return 'Not available yet';
    if (error.status === 404) return 'Not found';
    if (error.status === 403) return 'Not allowed';
  }
  return fallback;
}

export function errorMessage(error: unknown, fallback = 'The request could not be completed.'): string {
  if (error instanceof ApiError) {
    if (error.status === 503 || error.code === 'unavailable') {
      return error.message || 'The panel cannot serve this operation yet.';
    }
    if (error.status === 404) {
      return error.message || 'This instance is not in your account, or it does not exist any more.';
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * The honest state of a request that did not work: what went wrong and a
 * way to try again.
 */
export function ApiErrorState({
  error,
  onRetry,
  title,
  message,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  message?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <ErrorState
      title={title ?? errorTitle(error)}
      message={message ?? errorMessage(error)}
      requestId={apiError?.requestId}
      onRetry={onRetry}
    />
  );
}

/** A row of a definition list, with a label that never grows too long. */
export function Detail({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{label}</dt>
      <dd className={`min-w-0 break-words text-[14.5px] text-ink ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/** The buttons of a row, wrapped so they never push the page sideways. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
