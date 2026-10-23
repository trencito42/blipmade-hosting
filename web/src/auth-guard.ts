/**
 * The rules that decide where a visitor is sent when a session appears or
 * disappears.
 *
 * Everything in this module is pure, so it can be checked by tests without a
 * browser and without a session. The components that use it live in
 * `routes.tsx`.
 */

import type { Role } from './lib/api';

/**
 * The routes that only make sense without a session. A visitor who already has
 * one is sent away from them.
 */
export const GUEST_ROUTES = ['/login', '/register'] as const;

/**
 * The routes of the account flows. They stay reachable for everybody: a
 * customer who is signed in can still ask for a new password, and a visitor
 * who follows a verification link must be able to finish it.
 */
export const ACCOUNT_ROUTES = ['/forgot-password', '/reset-password', '/verify-email'] as const;

/** The areas that need a session. */
export const PROTECTED_ROUTES = ['/app', '/admin'] as const;

/** True for the roles that may open the admin area. */
export function isStaff(role: Role): boolean {
  return role === 'STAFF' || role === 'ADMIN';
}

/**
 * The landing page of a role. A customer lives in the customer area, staff
 * and administrators live in the admin area.
 */
export function homeOf(role: Role): '/app' | '/admin' {
  return isStaff(role) ? '/admin' : '/app';
}

/**
 * The path of a `next` value, without the query and without the fragment.
 */
function splitOf(value: string): { path: string; rest: string } {
  const hashAt = value.indexOf('#');
  const withoutHash = hashAt === -1 ? value : value.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : value.slice(hashAt);
  const queryAt = withoutHash.indexOf('?');
  return {
    path: queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt),
    rest: (queryAt === -1 ? '' : withoutHash.slice(queryAt)) + hash,
  };
}

/**
 * The path of a `next` value, written the way the browser will read it.
 *
 * The value is decoded and the `.` and `..` segments are resolved, so
 * `/app/../admin/orders` cannot pass as a path of the customer area. The
 * segments of the result are encoded again, so the value that is used for the
 * redirect is exactly the one that was checked.
 */
export function normalizePath(value: string): string | null {
  const { path, rest } = splitOf(value);
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // A broken escape is never a path of this site.
    return null;
  }
  if (!decoded.startsWith('/')) return null;

  const segments: string[] = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const out = `/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
  return out + rest;
}

/**
 * True when the value is a destination inside this site.
 *
 * Anything that could leave the site is refused: an absolute URL, a scheme
 * that is not a path, and the protocol relative form `//host/path`, which a
 * browser reads as another site.
 */
export function isInternalPath(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  // A backslash is read as a slash by some browsers, so `/\host` is treated
  // as `//host`.
  if (trimmed.startsWith('/\\')) return false;
  return !/[\x00-\x1f\x7f]/.test(trimmed);
}

/**
 * True when the `next` value is a destination the role is allowed to open.
 *
 * The rules are deliberately narrow:
 *
 * - it has to be a path of this site;
 * - it cannot be a guest route or an account route, because those would send
 *   the visitor straight back and loop;
 * - a customer may only be sent to the customer area, staff may open both.
 */
export function authorizedNext(role: Role, next: string | undefined | null): string | null {
  if (!isInternalPath(next)) return null;
  const normalized = normalizePath(next);
  if (!normalized) return null;
  const path = splitOf(normalized).path;
  if (!path) return null;

  for (const route of [...GUEST_ROUTES, ...ACCOUNT_ROUTES]) {
    if (path === route || path.startsWith(`${route}/`)) return null;
  }

  const allowed = isStaff(role) ? [...PROTECTED_ROUTES] : [PROTECTED_ROUTES[0]];
  for (const area of allowed) {
    if (path === area || path.startsWith(`${area}/`)) return normalized;
  }
  return null;
}

/**
 * Where a visitor goes after the session appears.
 *
 * The `next` value is only honoured when it is an allowed destination. Every
 * other case falls back to the landing page of the role, so the answer is
 * always a page of this site.
 */
export function postLoginTarget(role: Role, next: string | undefined | null): string {
  return authorizedNext(role, next) ?? homeOf(role);
}

/**
 * Where a visitor without a session is sent, and what is remembered for the
 * moment the session appears.
 *
 * The destination is the page they wanted, with its query, so a filter or a
 * step of a wizard is not lost. It is never a guest route, so signing in does
 * not send the visitor back to the form.
 */
export function loginRedirect(path: string, search = ''): string {
  const target = `${path}${search}`;
  const safe = isInternalPath(target) ? (normalizePath(target) ?? '/app') : '/app';
  return `/login?next=${encodeURIComponent(safe)}`;
}
