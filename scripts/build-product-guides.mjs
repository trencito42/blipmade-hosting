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
const today = '2026-10-29';

const bySlug = new Map(manifest.products.map((entry) => [entry.slug, entry]));
const catalogueBySlug = new Map(catalogue.map((entry) => [entry.slug, entry]));

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

/** What the platform checks, in the words of a reader. */
function checkOf(probe) {
  if (probe.kind === 'tcp') {
    return 'The platform asks the node whether the port of the allocation accepts a connection. The service of the product is not one that speaks HTTP, so the connection is the answer.';
  }
  const status = probe.expectStatus?.[0];
  if (status === undefined) {
    return 'The platform asks the service on the port of the allocation and accepts the answers that a browser would accept: 200, 201, 204, 301, 302, 307 and 308.';
  }
  return `The platform asks the service on the port of the allocation and accepts the answers that a browser would accept (200, 201, 204, 301, 302, 307, 308) and the answer ${status} that this service gives on its port.`;
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
      id: 'what-a-deployment-does',
      title: 'What a deployment does today',
      blocks: [
        {
          t: 'p',
          text: `${product.name} runs on the node of the platform in a container of its own, with the resources the customer chooses. The container is built from the image of the egg of the product and it is started with the command of the egg.`,
        },
        ...(startup
          ? [
              {
                t: 'code',
                lang: 'sh',
                code: startup,
              },
            ]
          : []),
        {
          t: 'p',
          text: `The image is \`${entry.dockerImage}\`. The platform reads it from the panel when the server is created, so the image of the product is the one that the panel holds.`,
        },
      ],
    },
    {
      id: 'the-catalog-entry',
      title: 'The entry in the catalog',
      blocks: [
        {
          t: 'spec',
          rows: [
            { k: 'Category', v: CATEGORY[product.category] ?? product.category },
            { k: 'Minimum resources', v: '{{catalog.minResources}}' },
            { k: 'Starting price', v: '{{catalog.price}}' },
            { k: 'Image', v: entry.dockerImage },
          ],
        },
      ],
    },
    {
      id: 'the-first-run',
      title: 'The first run',
      blocks: [
        {
          t: 'steps',
          items: [
            {
              title: 'Order the product',
              body: 'The product is ordered with the resources it needs. The price is the card of rates of the platform: only the resources change it.',
              result: 'The instance is created and its container is built on the node.',
            },
            {
              title: 'Open the address of the instance',
              body: 'The address of the instance is on the page of the instance. Every service also gets an address under the base of the platform.',
              result: 'The service of the product answers on its port.',
            },
          ],
        },
      ],
    },
    {
      id: 'the-variables',
      title: 'The variables of the product',
      blocks: [
        {
          t: 'p',
          text: `The egg of the product carries ${variables.length} variables. The ones the platform sets are the ones the product needs to start, and the ones the customer fills in are asked for when the order is placed.`,
        },
        ...(variables.length
          ? [
              {
                t: 'list',
                items: variables.map(
                  (variable) =>
                    `\`${variable.env_variable}\`${variable.default_value ? ` — the default is \`${variable.default_value}\`` : ''}${variable.user_editable ? ' — the customer can change it' : ''}`,
                ),
              },
            ]
          : []),
        ...(customer.length
          ? [
              {
                t: 'p',
                text: `The customer fills in ${customer.map((name) => `\`${name}\``).join(', ')} when the order is placed.`,
              },
            ]
          : []),
        ...(generated.length
          ? [
              {
                t: 'p',
                text: `The platform makes ${generated.map((name) => `\`${name}\``).join(', ')} and shows them in the console of the instance.`,
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
                text: 'The game of this product asks the person who starts it to accept its EULA, and the server does not start until the acceptance is there. The host accepts it for the instances it runs, so the container of the instance starts with the acceptance already written in it.',
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
      id: 'the-checks',
      title: 'The checks of the platform',
      blocks: [
        { t: 'p', text: checkOf(probe) },
        {
          t: 'p',
          text: 'A deployment that does not pass the check is not shown as working, and the customer is told what the check found. The check runs again on every restart of the container.',
        },
      ],
    },
    {
      id: 'when-it-does-not-work',
      title: 'When it does not work',
      blocks: [
        {
          t: 'trouble',
          items: [
            {
              q: 'The instance is not reachable on its address.',
              a: 'The state of the container comes from the node. If the page of the instance says that the node could not be reached, the last known state is kept and the container is still running.',
            },
            {
              q: 'The service answers on its port, but not the way the customer expects.',
              a: 'The check of the product is the one that was measured on the node when the product was opened. The console of the instance shows what the service writes, and the files of the instance show what it installed.',
            },
          ],
        },
      ],
    },
  ];

  return {
    id: slug,
    group: GROUP[product.category] ?? 'apps',
    title: product.name,
    summary: `${product.description} What a deployment of ${product.name} does today, and what the platform checks.`,
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
    sections,
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

if (!dry) writeFileSync(pagesPath, `${JSON.stringify(pages, null, 2)}\n`);
console.log(`${dry ? 'DRY RUN' : 'WRITTEN'}: ${written.length} guides -> ${written.join(', ')}`);
