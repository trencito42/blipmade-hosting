import { DOC_GROUPS, DOC_PAGES } from '../content/docs/schema';

export { LEGAL_PAGES, legalTitle, legalUnresolved, LEGAL_UNRESOLVED } from './legal';

/**
 * The content of the public site.
 *
 * The documentation is the content of the platform: the groups, the pages and
 * the blocks of a page are read from the same files the dashboard reads, so
 * the two never drift apart.
 *
 * The legal pages are the six pages of the platform. The list is here and not
 * in the pages themselves, so the footer of the site and the router of the
 * site always name the same six pages.
 */

export type Block =
  | { t: 'p'; text: string }
  | { t: 'note'; text: string; tone?: string }
  | { t: 'callout'; text: string; tone?: string }
  | { t: 'list'; items: string[] }
  | { t: 'steps'; items: { title: string; body: string; result?: string }[] }
  | { t: 'spec'; rows: { k: string; v: string }[] }
  | { t: 'code'; lang?: string; code: string }
  | { t: 'trouble'; items: { q: string; a: string }[] };

export type Section = { id: string; title: string; blocks: Block[] };

export type Article = {
  id: string;
  group: string;
  title: string;
  summary: string;
  keywords: string[];
  updated: string;
  sections: Section[];
  next?: string[];
  related?: string[];
  catalogSlug?: string;
};

export type Group = { id: string; label: string; order: number; description: string };

/** The groups of the documentation, in the order a customer walks through them. */
export const docGroups: Group[] = DOC_GROUPS;

/** The pages of the documentation. */
export const articles: Article[] = DOC_PAGES;

/** The page of a documentation id. */
export const articleById = (id: string): Article | undefined => articles.find((article) => article.id === id);

/** The page of a product, when the documentation has one. */
export const articleForProduct = (slug: string): Article | undefined =>
  articles.find((article) => article.catalogSlug === slug) ?? articleById(slug);
