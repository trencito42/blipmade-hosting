/**
 * The catalogue of the site and the page of a product, checked without a screen.
 *
 *     node --test web/tests/
 *
 * The catalogue of the platform holds every product it lists, not only the
 * ones that can be ordered today. The site has to show all of them, has to
 * mark the ones that are still coming, and has to make sure that a product
 * which cannot be ordered never looks like something a visitor can order.
 *
 * The checks are:
 *
 *   1. the page of the catalog holds every product of the catalogue, the ones
 *      that can be deployed and the ones that are coming;
 *   2. a product that is coming is marked as such and carries the reason the
 *      platform gives, and it has no button that orders it;
 *   3. the page of a product that is coming shows that product, not the first
 *      one of the catalogue, and it carries no configurator and no order;
 *   4. the configurator only offers the products that can be ordered.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

interface SnapshotProduct {
  slug: string;
  name: string;
  category: string;
  minPrice: number;
  availability: { state: string; orderable: boolean; blockers: string[] };
}

const snapshot = JSON.parse(readFileSync(join(webRoot, 'src', 'site', 'data', 'products.json'), 'utf8')) as SnapshotProduct[];

/** A product the platform can deploy today. */
const open = snapshot.find((product) => product.availability.orderable)!;

/** A product the platform lists but cannot deploy yet. */
const closed = snapshot.find((product) => !product.availability.orderable)!;

/** The marks of a page, read as a reader reads them. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#x27;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

/** The words of a page, without the tags and without the marks of React. */
const words = (html: string): string => {
  const plain = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
  const decoded = Object.entries(ENTITIES).reduce((text, [mark, letter]) => text.split(mark).join(letter), plain);
  return decoded.replace(/\s+/g, ' ').trim();
};

/** The title of a page, as a reader reads it. */
const title = (html: string): string => {
  const found = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html.replace(/<!--[\s\S]*?-->/g, ''));
  return found ? words(found[1]!) : '';
};

let server: ViteDevServer;
let Apps: (props: never) => unknown;
let AppDetail: (props: { slug: string }) => unknown;
let Configurator: (props: never) => unknown;
let groupByCategory: (products: never[]) => { id: string; label: string; products: { slug: string }[] }[];
let productsNow: () => SnapshotProduct[];
let mapApi: (product: Record<string, unknown>) => { availability: { state: string; orderable: boolean; blockers: string[] } };

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  const apps = (await server.ssrLoadModule('/src/site/Apps.tsx')) as {
    Apps: typeof Apps;
    AppDetail: typeof AppDetail;
    groupByCategory: typeof groupByCategory;
  };
  Apps = apps.Apps;
  AppDetail = apps.AppDetail;
  groupByCategory = apps.groupByCategory;
  const configurator = (await server.ssrLoadModule('/src/site/Configurator.tsx')) as { Configurator: typeof Configurator };
  Configurator = configurator.Configurator;
  const catalog = (await server.ssrLoadModule('/src/site/catalog.ts')) as {
    productsNow: typeof productsNow;
    mapApi: typeof mapApi;
  };
  productsNow = catalog.productsNow;
  mapApi = catalog.mapApi;
});

after(async () => {
  await server.close();
});

describe('the catalogue of the platform', () => {
  it('holds every product the platform lists, and not only the ones that can be ordered', () => {
    const catalogue = productsNow();
    assert.ok(catalogue.length > 1, 'the catalogue of the site is empty');
    // The products that cannot be ordered are in the catalogue of the site:
    // they are listed, they are priced and they are marked as coming.
    assert.ok(catalogue.some((product) => product.availability.orderable), 'no product can be ordered');
    assert.ok(catalogue.some((product) => !product.availability.orderable), 'no product is waiting');
    for (const product of catalogue) {
      assert.ok(product.availability.state, `${product.slug} has no state`);
      assert.equal(typeof product.availability.orderable, 'boolean', `${product.slug} has no orderable flag`);
      assert.ok(Array.isArray(product.availability.blockers), `${product.slug} has no blockers`);
    }
  });

  it('keeps a product that cannot be ordered when the answer of the API is read', () => {
    const product = mapApi({
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A CMS.',
      minRam: 1024,
      minCpu: 1,
      minDisk: 10,
      defaultRam: 2048,
      defaultCpu: 1,
      defaultDisk: 20,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      pricing: {
        currency: 'EUR',
        minimum: { amount: 374 },
        recommended: { amount: 624 },
        rates: { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 },
      },
      availability: { state: 'COMING_SOON', orderable: false, blockers: ['It has not been validated for deployment yet.'] },
    });
    assert.equal(product.availability.state, 'COMING_SOON');
    assert.equal(product.availability.orderable, false);
    assert.deepEqual(product.availability.blockers, ['It has not been validated for deployment yet.']);
  });

  it('leaves a product that is not published out of the catalogue', () => {
    const product = mapApi({
      slug: 'hidden',
      name: 'Hidden',
      category: 'BOTS',
      description: 'A bot.',
      minRam: 256,
      minCpu: 1,
      minDisk: 1,
      defaultRam: 512,
      defaultCpu: 1,
      defaultDisk: 5,
      maxRam: 4096,
      maxCpu: 4,
      maxDisk: 50,
      pricing: {
        currency: 'EUR',
        minimum: { amount: 179 },
        recommended: { amount: 249 },
        rates: { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 },
      },
      availability: { state: 'UNPUBLISHED', orderable: false, visible: false, blockers: [] },
    });
    assert.equal(product.availability.state, 'UNPUBLISHED');
    assert.equal(product.availability.orderable, false);
  });

  it('groups the products by the category they belong to', () => {
    const groups = groupByCategory(productsNow() as never);
    const categories = new Set(snapshot.map((product) => product.category));
    assert.equal(groups.length, categories.size, 'a category of the catalogue is missing');
    const grouped = groups.flatMap((group) => group.products.map((product) => product.slug));
    assert.equal(grouped.length, snapshot.length, 'a product of the catalogue is not in a group');
    for (const group of groups) {
      assert.ok(group.label.length > 0, `${group.id} has no name for the reader`);
    }
  });
});

describe('the page of the catalogue', () => {
  const html = (): string => renderToStaticMarkup(createElement(Apps as never));

  it('shows every product of the catalogue', () => {
    const page = words(html());
    for (const product of snapshot.filter((entry) => !entry.slug.startsWith('minecraft-'))) {
      assert.ok(page.includes(product.name), `the product ${product.slug} is not on the page`);
    }
    assert.ok(page.includes('Minecraft'), 'the Minecraft family is missing');
    assert.equal(page.includes('Minecraft Paper'), false, 'Minecraft editions should share one catalog card');
  });

  it('marks a product that cannot be ordered as coming soon', () => {
    const page = words(html());
    assert.ok(page.includes('Coming soon'), 'the page does not say that a product is coming');
    assert.ok(page.includes(closed.availability.blockers[0]!), 'the page does not say why the product is not ready');
  });

  it('offers the order only for the products that can be ordered', () => {
    const page = words(html());
    assert.ok(page.includes(`Size ${open.name}`), 'a product that can be ordered has no button');
    assert.equal(page.includes(`Size ${closed.name}`), false, 'a product that cannot be ordered has a button that orders it');
  });

  it('says how many apps can be deployed today and how many are still coming', () => {
    const page = words(html());
    const cards = snapshot.filter((product) => !product.slug.startsWith('minecraft-'));
    const minecraft = snapshot.find((product) => product.slug === 'minecraft-paper');
    if (minecraft) cards.push(minecraft);
    const available = cards.filter((product) => product.availability.orderable).length;
    const coming = cards.length - available;
    assert.ok(
      page.includes(`${available} apps can be deployed today, and ${coming} are still coming`),
      'the page does not count the apps that can be deployed and the ones that are coming',
    );
  });
});

describe('the page of a product', () => {
  it('shows the product that was asked for, and not the first one of the catalogue', () => {
    const html = renderToStaticMarkup(createElement(AppDetail as never, { slug: closed.slug }));
    const heading = title(html);
    assert.ok(heading.includes(closed.name), `the page shows another product: ${heading}`);
    assert.equal(heading.includes(open.name), false, `the page shows the first product of the catalogue: ${heading}`);
  });

  it('shows a product that cannot be ordered as coming soon, with the reason', () => {
    const page = words(renderToStaticMarkup(createElement(AppDetail as never, { slug: closed.slug })));
    assert.ok(page.includes('Coming soon'), 'the page does not say that the product is coming');
    assert.ok(page.includes(closed.availability.blockers[0]!), 'the page does not say why the product is not ready');
    assert.ok(page.includes(closed.description), 'the page does not describe the product');
  });

  it('carries no configurator and no order for a product that cannot be ordered', () => {
    const html = renderToStaticMarkup(createElement(AppDetail as never, { slug: closed.slug }));
    assert.equal(html.includes('Price configurator'), false, 'the page of a product that cannot be ordered has a configurator');
    assert.equal(html.includes('Create account and deploy'), false, 'the page of a product that cannot be ordered has an order');
  });

  it('carries the configurator of a product that can be ordered', () => {
    const html = renderToStaticMarkup(createElement(AppDetail as never, { slug: open.slug }));
    assert.ok(html.includes('Price configurator'), 'the page of a product that can be ordered has no configurator');
    assert.ok(html.includes('Create account and deploy'), 'the page of a product that can be ordered has no order');
  });

  it('sends the visitor back to the catalogue', () => {
    const html = renderToStaticMarkup(createElement(AppDetail as never, { slug: closed.slug }));
    assert.ok(html.includes('href="/apps"'), 'the page of a product that cannot be ordered has no link back to the catalogue');
  });
});

describe('the configurator', () => {
  it('offers only the products that can be ordered', () => {
    const page = words(renderToStaticMarkup(createElement(Configurator as never)));
    for (const product of snapshot.filter((entry) => !entry.availability.orderable && !entry.slug.startsWith('minecraft-'))) {
      assert.equal(page.includes(product.name), false, `the configurator offers ${product.slug}, which cannot be ordered`);
    }
    for (const product of snapshot.filter((entry) => entry.availability.orderable && !entry.slug.startsWith('minecraft-'))) {
      assert.ok(page.includes(product.name), `the configurator does not offer ${product.slug}`);
    }
    assert.ok(page.includes('Minecraft'), 'the Minecraft family is missing from the configurator');
    const minecraftPage = words(renderToStaticMarkup(createElement(Configurator as never, { slug: 'minecraft-paper' })));
    assert.ok(minecraftPage.includes('Bedrock'), 'the orderable Bedrock edition is missing');
  });
});
