import type { IconName } from '../icon-map';

/**
 * The categories of the catalog.
 *
 * The API names a category with a code. This table says what a visitor reads
 * for each code, which icon stands for it and the address fragment the catalog
 * uses to open on it. A category the table does not know is still shown, with
 * the name the API carries.
 */
export interface CategoryMeta {
  /** The code the API carries. */
  id: string;
  /** The fragment of the address: `/apps#games`. */
  slug: string;
  /** The name a visitor reads. */
  label: string;
  icon: IconName;
  /** One line that says what the category holds. */
  blurb: string;
}

/** The categories, in the order a reader walks through them. */
export const CATEGORIES: CategoryMeta[] = [
  { id: 'GAMES', slug: 'games', label: 'Games', icon: 'game', blurb: 'Servers for the games you play with friends.' },
  { id: 'DEVELOPER_TOOLS', slug: 'developer-tools', label: 'Developer tools', icon: 'code', blurb: 'Workspaces, search and tools for the way you build.' },
  { id: 'DATABASES', slug: 'databases', label: 'Databases', icon: 'db', blurb: 'Databases with their own credentials.' },
  { id: 'BOTS', slug: 'bots', label: 'Bots', icon: 'bot', blurb: 'Always-on bots for your community.' },
  { id: 'AUTOMATION', slug: 'automation', label: 'Automation', icon: 'flow', blurb: 'Queues, messaging and workflows that run on their own.' },
  { id: 'MONITORING', slug: 'monitoring', label: 'Monitoring', icon: 'mon', blurb: 'Dashboards and checks for everything else you run.' },
  { id: 'WEB_CMS', slug: 'web-cms', label: 'Web & CMS', icon: 'globe', blurb: 'Sites and content platforms.' },
];

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

/** What the site knows about a category code. */
export function categoryOf(id: string): CategoryMeta {
  return BY_ID.get(id) ?? { id, slug: id.toLowerCase().replace(/_/g, '-'), label: id, icon: 'box', blurb: '' };
}

/** The position of a category in the order of the catalog. */
export function categoryOrder(id: string): number {
  const index = CATEGORIES.findIndex((category) => category.id === id);
  return index === -1 ? CATEGORIES.length : index;
}
