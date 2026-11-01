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
      q: 'What will I pay?',
      a: `The configurator calculates the monthly price before checkout. For resource-based apps it uses ${eur(rates.ramPerGb)} per GB of RAM, ${eur(rates.cpuPerUnit)} per vCPU, ${eur(rates.diskPerGb)} per GB of storage and a ${eur(rates.baseFee)} base fee. Products with a fixed plan show that plan instead. Taxes, discounts and the final recurring total are shown before you pay.`,
    },
    {
      q: 'What do I get when I order?',
      a: 'The product you selected is installed automatically with the resources and settings shown during checkout. Apps, databases and game servers run in isolated containers; VPS plans create a virtual machine with SSH access. The order page shows provisioning progress and any action you still need to take.',
    },
    {
      q: 'Can I change the resources later?',
      a: 'For configurable app instances, yes. Open the instance, request the new limits and review the price before confirming. VPS plan changes and services with fixed plans use the options shown on their own management page. A restart may be required after a resource change.',
    },
    {
      q: 'Are there backups?',
      a: 'App instances support manual backups from the Backups tab. A backup remains tied to the instance and node, so download important copies and keep them elsewhere. Automatic customer backup schedules are not included unless a product page explicitly says otherwise.',
    },
    {
      q: 'Can I use my own domain?',
      a: 'Yes. Add the hostname to the instance, publish the DNS verification record and point it to Blipmade. After verification, the gateway routes the hostname and provisions HTTPS automatically. DNS propagation and certificate issuance can take a few minutes.',
    },
    {
      q: 'Is there SSH or SFTP?',
      a: 'VPS plans include SSH using the public key supplied at checkout. Managed app containers are operated through Files, Console, Startup and the product-specific tools in the dashboard; direct SSH is not offered for those containers.',
    },
    {
      q: 'How do I pay?',
      a: 'Checkout is handled by Stripe, so card details do not pass through Blipmade. Before confirming you see the discount, tax and recurring total. Billing shows invoices, subscriptions, renewal dates and the payment portal. A 100% discount can complete an eligible order without charging a card.',
    },
    {
      q: 'How do I reach support?',
      a: 'Open a ticket from Support and attach the relevant service and files or screenshots. Replies stay in the same thread and are also sent by email when delivery is available. Platform-wide incidents are published on the status page.',
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
  'Apps and game servers installed automatically from the product catalog',
  'Files, console, startup settings and product-specific tools in the dashboard',
  'Resource changes with the new price shown before confirmation',
  'Manual instance backups you can download',
  'Verified custom hostnames with automatic HTTPS',
  'Tickets answered in the same thread, plus email',
  'Payment by card, with an invoice for every payment',
];

/** What the platform does not do yet. */
export const NOT_YET = [
  'Direct SSH access to managed app containers (VPS plans include SSH)',
  'Backups on a schedule',
  'A phone line or live chat',
  'Published traffic or uptime guarantees',
];
