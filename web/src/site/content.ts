import { eur, type Rates } from './pricing';

/**
 * The words of the public site.
 *
 * Everything that states a number is derived from the catalog, so the page
 * can never quote a rate the platform does not charge. The questions of the
 * home page quote the card of rates of the catalog, and they are built when
 * the catalog is known.
 */

/** A question of the home page and its answer. */
export interface Question {
  q: string;
  a: string;
}

/**
 * The questions of the home page.
 *
 * The card of rates is read from the catalog, so the answer that explains the
 * price is the price the customer is charged.
 */
export function faqFor(rates: Rates): Question[] {
  return [
    {
      q: 'How is the price calculated?',
      a: `Every product uses the same card of rates, per month: ${eur(rates.ramPerGb)} for each GB of RAM, ${eur(rates.cpuPerUnit)} for each vCPU, ${eur(rates.diskPerGb)} for each GB of disk and a ${eur(rates.baseFee)} base fee. The same resources cost the same in every product, and the configurator shows your exact total before you order.`,
    },
    {
      q: 'What do I get when I order?',
      a: 'A container with exactly the RAM, CPU and disk you chose, running the Node.js image of the platform. You upload your code in the Files tab, add variables in Startup and watch the Console. Nothing else is bundled in, so what runs is what you put there.',
    },
    {
      q: 'Can I change the resources later?',
      a: 'Yes. A change of resources is an order. An increase is applied once it is paid, a decrease is settled by the platform and lowers your next invoice, and the service restarts when a change is applied.',
    },
    {
      q: 'Are there backups?',
      a: 'Backups are manual today. You ask for an archive of the container files from the Backups tab and download it. Nothing runs on a schedule, so take one before every change that matters.',
    },
    {
      q: 'Can I use my own domain?',
      a: 'You can attach a hostname to an instance and prove that it is yours with a DNS record. Automatic HTTPS certificates for your own hostnames are not issued yet, so keep sensitive traffic behind a proxy of your own for now.',
    },
    {
      q: 'Is there SSH or SFTP?',
      a: 'Not today. You reach an instance through the file browser and the console in the dashboard. Both are on the same account as your billing, with no extra keys to manage.',
    },
    {
      q: 'How do I pay?',
      a: 'By card. You pay on a checkout page of Stripe, our payment provider, so your card details never reach Blipmade. Plans renew automatically, and you change the card or end a plan from Billing in your dashboard. Bank transfer and other methods are not available.',
    },
    {
      q: 'How do I reach support?',
      a: 'Open a ticket from your account. There is no phone and no live chat; the answer arrives in the same ticket and by email.',
    },
  ];
}

/** The copy of a product: what it is and who it is for. */
export type AppCopy = { tagline: string; lead: string; fits: string[]; note?: string; keywords: string };

/** The copy of a product the catalog does not carry. */
export const FALLBACK = (description: string): AppCopy => ({ tagline: description, lead: description, fits: [], keywords: '' });

/** The copy of the products of the platform. */
export const APP_COPY: Record<string, AppCopy> = {
  'discord-bot': {
    tagline: 'A bot that stays online, on resources you pick.',
    lead: 'Run a Node.js Discord bot around the clock without keeping a computer on. The container is sized to the megabyte, so a small bot costs a small amount and a busy one can grow.',
    fits: ['Moderation, music and utility bots', 'Bots that keep a small database file on disk', 'Webhooks and scheduled jobs next to your bot'],
    keywords: 'Discord bot hosting, Node.js bot hosting',
  },
  'code-server': {
    tagline: 'A container with room for your editor.',
    lead: 'Pick the memory and disk a browser-based editor needs and keep your projects on your own resources. The instance starts as a Node.js container; you install and configure Code Server yourself from the console.',
    fits: ['A remote workspace you can open from any laptop', 'Teaching or workshop environments', 'A place to build and run scripts away from your machine'],
    note: 'The platform does not install Code Server for you yet. The container, files, console and startup variables are ready.',
    keywords: 'Code Server hosting, VS Code in the browser',
  },
  postgresql: {
    tagline: 'A database that belongs to your instance.',
    lead: 'Order resources for a service that talks to PostgreSQL and create databases from the Databases tab, each with credentials of its own. Databases are not shared with your other instances.',
    fits: ['The data layer for a bot or a small web service', 'Side projects that outgrew a file on disk', 'Staging databases you can resize when the load changes'],
    note: 'The instance starts as a Node.js container. Databases are created per instance from the dashboard, and backups of the container do not include database data.',
    keywords: 'PostgreSQL hosting, managed database hosting',
  },
};

/** What the platform does today. */
export const TODAY = [
  'A container with the RAM, CPU and disk you choose',
  'File browser, console and startup variables in the dashboard',
  'Resize any time. The new price is shown before you pay',
  'Manual backups you can download',
  'Hostnames you attach to an instance',
  'Tickets answered in the same thread, plus email',
  'Payment by card, with an invoice for every payment',
];

/** What the platform does not do yet. */
export const NOT_YET = [
  'SSH or SFTP access',
  'Backups on a schedule',
  'Automatic HTTPS certificates for your own domains',
  'A phone line or live chat',
  'Published traffic or uptime guarantees',
];
