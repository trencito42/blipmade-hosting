import { LEGAL_PAGE_LIST } from '../legal/links';

/**
 * The legal pages of the platform, and the values they still wait for.
 *
 * The module is here and not in `data.ts`, because `data.ts` reads the whole
 * of the documentation: a module that holds the list of the legal pages and
 * the count of the values the operator still has to supply should not carry
 * the text of the documentation with it.
 */

export const LEGAL_PAGES = LEGAL_PAGE_LIST.map((page) => ({ slug: page.to.replace(/^\//, ''), title: page.label }));

/** The name of a legal page. */
export const legalTitle = (slug: string): string => LEGAL_PAGES.find((page) => page.slug === slug)?.title ?? slug;

/**
 * The legal pages that still wait for a value of the operator.
 *
 * A legal page that carries a value the operator has not supplied yet says so
 * on the page, and it stays out of the index of the search engines until the
 * value is there. The count is checked by the test of the legal pages, so it
 * cannot drift away from the pages themselves.
 */
export const LEGAL_UNRESOLVED: Record<string, number> = {
  terms: 10,
  privacy: 11,
  cookies: 3,
  aup: 3,
  'refund-policy': 6,
  sla: 6,
};

/** Whether a legal page still waits for the operator. */
export const legalUnresolved = (slug: string): number => LEGAL_UNRESOLVED[slug] ?? 0;
