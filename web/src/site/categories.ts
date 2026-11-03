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
  { id: 'EMAIL_HOSTING', slug: 'email-hosting', label: 'Email hosting', icon: 'mail', blurb: 'Mailboxes on your own domain.' },
  { id: 'VPS', slug: 'servers', label: 'Servers (VPS)', icon: 'server', blurb: 'A server of your own, with root access.' },
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

/**
 * The flat colour of a category, for the tiles of the home page and the menus. One colour per category so a visitor learns
 * them: the text on top of each is the near-black of the page, which reads on every one of them.
 */
export const TONES: Record<string, string> = {
  GAMES: '#ff8a6b',
  BOTS: '#ffd166',
  DATABASES: '#7fd6ff',
  DEVELOPER_TOOLS: '#b6f26b',
  AUTOMATION: '#ff9fc2',
  MONITORING: '#9be7c4',
  WEB_CMS: '#ffb86b',
  EMAIL_HOSTING: '#c9b8ff',
  VPS: '#4ee595',
};

/** The tone of a category, with the mint of the brand for one the table does not know. */
export const toneOf = (id: string): string => TONES[id] ?? '#4ee595';
