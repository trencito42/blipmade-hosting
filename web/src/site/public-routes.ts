import { LEGAL_PAGE_LIST } from '../legal/links';

/**
 * The routes of the public site.
 *
 * The matcher is in a module of its own, and it imports nothing but the list
 * of the legal pages. That is deliberate: the browser and the program that
 * writes the site to the disk have to agree on the address of every page, and
 * they cannot agree if each of them writes its own table.
 *
 * The matcher therefore only says what a path is. Which component draws it is
 * decided by the side that draws it: the browser splits the pages into
 * bundles, and the program that writes the site takes them all.
 */

/** The kinds of page of the public site. */
export type PublicKind = 'home' | 'apps' | 'app' | 'docs' | 'doc' | 'legal' | 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'notfound';

export interface PublicMatch {
  kind: PublicKind;
  /** The part of the address that names the thing, when the address has one. */
  param?: string;
  /** The route is only shown to a visitor without a session. */
  guestOnly?: boolean;
}

/** The legal pages, by the address they live on. */
const LEGAL = new Set(LEGAL_PAGE_LIST.map((page) => page.to.replace(/^\//, '')));

/**
 * The page of an address of the public site.
 *
 * An address that is not one of them is the page of an address that does not
 * exist.
 */
export function matchPublic(path: string): PublicMatch {
  const clean = path !== '/' ? path.replace(/\/+$/, '') : '/';

  if (clean === '/') return { kind: 'home' };
  if (clean === '/apps') return { kind: 'apps' };
  if (clean === '/docs') return { kind: 'docs' };

  if (clean.startsWith('/apps/')) {
    const param = clean.slice('/apps/'.length);
    if (param && !param.includes('/')) return { kind: 'app', param };
  }

  if (clean.startsWith('/docs/')) {
    const param = clean.slice('/docs/'.length);
    if (param && !param.includes('/')) return { kind: 'doc', param };
  }

  if (LEGAL.has(clean.slice(1))) return { kind: 'legal', param: clean.slice(1) };

  if (clean === '/login') return { kind: 'login', guestOnly: true };
  if (clean === '/register') return { kind: 'register', guestOnly: true };
  if (clean === '/forgot-password') return { kind: 'forgot' };
  if (clean === '/reset-password') return { kind: 'reset' };
  if (clean === '/verify-email') return { kind: 'verify' };

  return { kind: 'notfound' };
}
