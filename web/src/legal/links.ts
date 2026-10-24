/**
 * The legal pages of the platform, and the routes they live on.
 *
 * The list is here and not in the pages themselves, so the footer of the site
 * and the router of the site always name the same six pages. The module holds
 * no text: the footer is in the main bundle and must not drag the whole of
 * the legal pages into it.
 */

export interface LegalLink {
  /** The route of the page. */
  to: string;
  /** The name of the page, as it is written on the page itself. */
  label: string;
  /** The short name of the page, as it is written in the footer. */
  nav: string;
}

export const LEGAL_LINKS = {
  terms: { to: '/terms', label: 'Terms of service', nav: 'Terms' },
  privacy: { to: '/privacy', label: 'Privacy policy', nav: 'Privacy' },
  cookies: { to: '/cookies', label: 'Cookie policy', nav: 'Cookies' },
  aup: { to: '/aup', label: 'Acceptable use policy', nav: 'Acceptable use' },
  refund: { to: '/refund-policy', label: 'Refund policy', nav: 'Refunds' },
  sla: { to: '/sla', label: 'Service levels and support', nav: 'Service levels' },
} as const satisfies Record<string, LegalLink>;

/** The six pages, in the order they are read. */
export const LEGAL_PAGE_LIST: LegalLink[] = [
  LEGAL_LINKS.terms,
  LEGAL_LINKS.privacy,
  LEGAL_LINKS.cookies,
  LEGAL_LINKS.aup,
  LEGAL_LINKS.refund,
  LEGAL_LINKS.sla,
];
