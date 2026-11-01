#!/usr/bin/env node
/**
 * Writes the guide of every product of the catalogue that the platform can
 * deploy and that has no guide yet.
 *
 * The guide of a product says what a deployment of it does today, what the
 * customer has to fill in and what the platform checks. Every fact in it is
 * read from a file of the repository, so the guide cannot drift away from the
 * catalogue or from the egg of the product:
 *
 *   - `pterodactyl-eggs/manifest.json` and the egg of the product: the image,
 *     the startup command and the variables of the egg;
 *   - `web/src/site/data/products.json`: the name, the category, the
 *     description and the price of the product;
 *   - `scripts/product-probes.json`: what was measured on the node when the
 *     product was opened for ordering.
 *
 * The pages that are already written by hand are not touched: only the
 * products of the measured file are written, and a page that is there is
 * replaced by the one of this script.
 *
 * Usage: node scripts/build-product-guides.mjs [--dry]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const manifest = read('pterodactyl-eggs/manifest.json');
const catalogue = read('web/src/site/data/products.json');
const measured = read('scripts/product-probes.json');
const pagesPath = join(root, 'web/src/content/docs/pages.json');
const pages = read('web/src/content/docs/pages.json');

const dry = process.argv.includes('--dry');
const today = '2026-11-01';

const bySlug = new Map(manifest.products.map((entry) => [entry.slug, entry]));
const catalogueBySlug = new Map(catalogue.map((entry) => [entry.slug, entry]));

/** Internal provider names are not useful instructions for a customer. */
const publicText = (text) => String(text).replace(/pterodactyl/gi, 'control panel');

/** The category of a product, as a reader reads it. */
const CATEGORY = {
  GAMES: 'Games',
  DEVELOPER_TOOLS: 'Developer tools',
  AUTOMATION: 'Automation',
  MONITORING: 'Monitoring',
  DATABASES: 'Databases',
  BOTS: 'Bots',
  WEB_CMS: 'Web & CMS',
};

/** The group of the documentation a product belongs to. */
const GROUP = {
  DATABASES: 'databases',
};

/** What the platform checks, in the words of a customer. */
function checkOf(probe) {
  if (probe.kind === 'tcp') {
    return 'Blipmade checks whether the service accepts a connection on its assigned port. The Overview page uses that check together with the container state; it does not inspect your private data.';
  }
  const status = probe.expectStatus?.[0];
  if (status === undefined) {
    return 'Blipmade makes an HTTP request to the service on its assigned port. A normal success or redirect marks the application as reachable.';
  }
  return `Blipmade makes an HTTP request to the service on its assigned port. This product normally answers with HTTP ${status}, so that response is accepted by its health check.`;
}

/** The guide of one product. */
function guideFor(slug, probe) {
  const entry = bySlug.get(slug);
  const product = catalogueBySlug.get(slug);
  if (!entry) throw new Error(`The manifest carries no product called ${slug}.`);
  if (!product) throw new Error(`The catalogue carries no product called ${slug}.`);

  const egg = entry.eggFile ? read(`pterodactyl-eggs/${entry.eggFile}`) : null;
  const startup = typeof egg?.startup === 'string' ? egg.startup : '';
  const variables = (egg?.variables ?? []).filter((variable) => variable.env_variable);
  const customer = Object.keys(entry.customerVariables ?? {});
  const generated = Object.keys(entry.generatedVariables ?? {});

  const sections = [
    {
      id: 'overview',
      title: `About ${product.name}`,
      blocks: [
        {
          t: 'p',
          text: `${publicText(product.description)} Blipmade installs ${product.name} in an isolated container and applies the resources and settings selected during checkout. You do not need to upload an installer or assemble the container yourself.`,
        },
        {
          t: 'p',
          text: 'After provisioning, use Overview for state and usage, Console for live output, Files for persistent files, Startup for the settings this product exposes, and Backups before a risky change.',
        },
      ],
    },
    {
      id: 'the-catalog-entry',
      title: 'Plan details',
      blocks: [
        {
          t: 'spec',
          rows: [
            { k: 'Category', v: CATEGORY[product.category] ?? product.category },
            { k: 'Minimum resources', v: '{{catalog.minResources}}' },
            { k: 'Starting price', v: '{{catalog.price}}' },
          ],
        },
      ],
    },
    {
      id: 'deploy',
      title: `Deploy ${product.name}`,
      blocks: [
        {
          t: 'steps',
          items: [
            {
              title: 'Order the product',
              body: 'Open the product page, choose the resources and complete the fields shown for this product. Review the monthly total, discount and tax before confirming the order.',
            },
            {
              title: 'Wait for provisioning',
              body: 'The order creates the service and shows its progress. Keep the page open or return from Apps; provisioning continues in the background. If a step fails, the page shows the failure instead of claiming the service is online.',
            },
            {
              title: 'Finish the product setup',
              body: 'Open the service, read Console for the first-start output and complete any setup page or credential prompt the product exposes. Use the generated app hostname or attach a verified domain when the service is ready.',
            },
          ],
        },
      ],
    },
    {
      id: 'settings',
      title: 'Settings available in Startup',
      blocks: [
        {
          t: 'p',
          text: `${product.name} exposes ${variables.length} startup setting${variables.length === 1 ? '' : 's'}. Blipmade keeps infrastructure values read-only and only lets you change the fields intended for the customer. Secret values are stored encrypted.`,
        },
        ...(variables.length
          ? [
              {
                t: 'list',
                items: variables.map(
                  (variable) =>
                    `\`${variable.env_variable}\`${variable.default_value ? ` — default: \`${variable.default_value}\`` : ''}${variable.user_editable ? ' — editable in Startup' : ' — managed by Blipmade'}`,
                ),
              },
            ]
          : []),
        ...(customer.length
          ? [
              {
                t: 'p',
                text: `Checkout asks for ${customer.map((name) => `\`${name}\``).join(', ')}. These values are saved with the service so a restart or reinstall can use the same configuration.`,
              },
            ]
          : []),
        ...(generated.length
          ? [
              {
                t: 'p',
                text: `Blipmade generates ${generated.map((name) => `\`${name}\``).join(', ')}. Copy generated credentials from the protected credentials panel; they are not printed into public activity or support messages.`,
              },
            ]
          : []),
      ],
    },
    ...(Array.isArray(egg?.features) && egg.features.includes('eula')
      ? [
          {
            id: 'the-eula',
            title: 'The EULA of the game',
            blocks: [
              {
                t: 'p',
                text: 'This game requires acceptance of its EULA. Checkout shows the agreement and records your acceptance with the order; provisioning does not start without it.',
              },
              {
                t: 'p',
                text: 'The customer accepts the EULA of the game as well by ordering the product: https://aka.ms/MinecraftEULA',
              },
            ],
          },
        ]
      : []),
    {
      id: 'health',
      title: 'Health and availability',
      blocks: [
        { t: 'p', text: checkOf(probe) },
        {
          t: 'p',
          text: 'Starting means the process is still coming up; Online means the container and product check agree. If the node cannot be reached, the last known state is marked as stale instead of being presented as a fresh result.',
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      blocks: [
        {
          t: 'trouble',
          items: [
            {
              q: 'The instance is not reachable on its address.',
              a: 'Check Overview for the live state, then Console for the first error after startup. Confirm that the assigned port and editable Startup values match the product guide. If the state is marked stale, wait for the node check before reinstalling anything.',
            },
            {
              q: 'The service answers on its port, but not the way the customer expects.',
              a: 'The service may be running but still require its own first-time setup. Open its address, read Console and check the product settings. Include the service in a support ticket if the container is online but the application remains unusable.',
            },
          ],
        },
      ],
    },
  ];
  const publicSections = JSON.parse(JSON.stringify(sections).replace(/pterodactyl/gi, 'control panel'));

  return {
    id: slug,
    group: GROUP[product.category] ?? 'apps',
    title: product.name,
    summary: `Deploy and manage ${product.name} on Blipmade: plan details, setup fields, health checks and troubleshooting.`,
    keywords: [product.name.toLowerCase(), product.category.toLowerCase().replace(/_/g, ' '), 'deploy'],
    updated: today,
    catalogSlug: slug,
    // The pages that come after the guide and the pages that belong to it.
    // The convention is the one of the guides that are written by hand.
    next: ['first-app', 'files'],
    related:
      (GROUP[product.category] ?? 'apps') === 'databases'
        ? ['resources', 'backups', 'postgresql', 'support']
        : ['resources', 'backups', 'console', 'support'],
    sections: publicSections,
  };
}

const written = [];
for (const [slug, probe] of Object.entries(measured)) {
  const page = guideFor(slug, probe);
  const index = pages.findIndex((entry) => entry.catalogSlug === slug || entry.id === slug);
  if (index >= 0) pages[index] = page;
  else pages.push(page);
  written.push(slug);
}

// Product pages that are no longer in the catalog are not useful reference
// material. Keeping them in the content made search and validation disagree
// with what a customer can actually order.
const catalogueSlugs = new Set(catalogue.map((entry) => entry.slug));
const published = pages.filter((page) => !page.catalogSlug || catalogueSlugs.has(page.catalogSlug));
if (!dry) writeFileSync(pagesPath, `${JSON.stringify(published, null, 2)}\n`);
console.log(`${dry ? 'DRY RUN' : 'WRITTEN'}: ${written.length} guides -> ${written.join(', ')}`);
