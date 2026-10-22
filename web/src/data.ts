import type { IconName } from './icons';

export const CATEGORIES = ['All', 'Web & CMS', 'Developer Tools', 'Monitoring', 'Automation', 'Bots', 'Databases'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface App { name: string; cat: Exclude<Category, 'All'>; blurb: string; from: number; mb: number; disk: number; icon: IconName }

/**
 * Sample apps for the Studio simulation and the marketing scenes.
 *
 * These entries are illustrative only. `from` is a placeholder rate card, not
 * a price of the platform, and the list is not the catalog: it holds products
 * the platform does not offer. The real catalog is served by the API
 * (GET /api/catalog/products) and the homepage renders the amounts it
 * returns. Never present an amount or an app from this list as the offer of
 * the platform.
 */
export const APPS: App[] = [
  { name: 'WordPress', cat: 'Web & CMS', blurb: 'Websites, blogs and stores with the most popular CMS.', from: 1.49, mb: 512, disk: 5, icon: 'globe' },
  { name: 'Ghost', cat: 'Web & CMS', blurb: 'Modern publishing platform for newsletters and blogs.', from: 1.99, mb: 512, disk: 5, icon: 'doc' },
  { name: 'Forgejo', cat: 'Developer Tools', blurb: 'Lightweight self-hosted Git forge.', from: 2.49, mb: 1024, disk: 5, icon: 'code' },
  { name: 'Code Server', cat: 'Developer Tools', blurb: 'VS Code in the browser, on your own resources.', from: 2.99, mb: 1024, disk: 5, icon: 'term' },
  { name: 'Uptime Kuma', cat: 'Monitoring', blurb: 'Simple uptime monitoring with status pages.', from: 1.49, mb: 256, disk: 5, icon: 'mon' },
  { name: 'Grafana', cat: 'Monitoring', blurb: 'Dashboards for metrics and logs.', from: 2.49, mb: 512, disk: 5, icon: 'chart' },
  { name: 'n8n', cat: 'Automation', blurb: 'Workflow automation you control.', from: 2.99, mb: 1024, disk: 5, icon: 'flow' },
  { name: 'Discord Bot', cat: 'Bots', blurb: 'Run your bot 24/7 from Node.js or Python.', from: 1.49, mb: 256, disk: 5, icon: 'bot' },
  { name: 'PostgreSQL', cat: 'Databases', blurb: 'Reliable relational database.', from: 4.49, mb: 1024, disk: 5, icon: 'db' },
  { name: 'MySQL', cat: 'Databases', blurb: 'The classic relational database.', from: 4.49, mb: 1024, disk: 5, icon: 'db' },
  { name: 'Redis', cat: 'Databases', blurb: 'In-memory store for caching and queues.', from: 4.49, mb: 512, disk: 1, icon: 'bolt' },
  { name: 'MongoDB', cat: 'Databases', blurb: 'Document database for flexible data.', from: 4.99, mb: 1024, disk: 5, icon: 'db' },
];

export const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

export const FAQ = [
  ['What am I billed for?', 'The memory, CPU and storage you configure for each app or database, billed monthly. No setup fees.'],
  ['How do upgrades work?', 'Change the resources from the dashboard whenever you need more. No new server to buy and nothing to migrate.'],
  ['What is included?', 'Access to files, logs, domains and usage for every instance.'],
  ['How do I cancel?', 'From the billing page in your dashboard. Your service runs until the end of the paid period.'],
  ['How do I get support?', 'Open a ticket from the dashboard. Response times will be published before launch.'],
] as const;

export const fmtMb = (m: number) => (m < 1024 ? `${m} MB` : `${m / 1024} GB`);
export const minLabel = (a: App) => `${fmtMb(a.mb)} · ${a.disk} GB disk`;
/** Illustrative rate card: the app's starting price plus whatever is added above its minimum. */
export const priceOf = (a: App, mb: number, cpu: number, disk: number) =>
  a.from + Math.max(0, (mb - a.mb) / 1024) * 0.6 + (cpu - 1) * 0.4 + Math.max(0, disk - a.disk) * 0.02;
