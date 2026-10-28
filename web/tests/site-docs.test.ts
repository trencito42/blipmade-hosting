/**
 * The content of the documentation and the way the site draws it.
 *
 *     node --test web/tests/
 *
 * The documentation is written in files, with markers where a number of the
 * catalog stands and links to the other pages. The site draws those files, so
 * the checks here are made on the content and on the result of the drawing:
 *
 *   1. the summary of the documentation that the head of the pages uses is
 *      the content itself, and the two cannot drift apart;
 *   2. every link of the content names a page that exists;
 *   3. every marker of the content is resolved when the page is drawn: no
 *      `{{` is ever shown to a reader;
 *   4. the old form of the address of a page is written in the form the site
 *      uses.
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
const contentDir = join(webRoot, 'src', 'content', 'docs');

const pages = JSON.parse(readFileSync(join(contentDir, 'pages.json'), 'utf8')) as {
  id: string;
  title: string;
  summary: string;
  group: string;
  updated: string;
  keywords?: string[];
  catalogSlug?: string;
  sections: { id: string; title: string; blocks: { t: string; text?: string; items?: unknown[] }[] }[];
}[];
const groups = JSON.parse(readFileSync(join(contentDir, 'groups.json'), 'utf8')) as { id: string; label: string }[];
const summary = JSON.parse(readFileSync(join(webRoot, 'src', 'site', 'data', 'meta.json'), 'utf8')) as {
  id: string;
  title: string;
  summary: string;
  group: string;
  groupLabel: string;
  updated: string;
  keywords: string[];
  catalogSlug?: string;
}[];
const snapshot = JSON.parse(readFileSync(join(webRoot, 'src', 'site', 'data', 'products.json'), 'utf8')) as { slug: string }[];

let server: ViteDevServer;
let Blocks: (props: { blocks: unknown[]; product?: unknown }) => unknown;
let Inline: (props: { text: string; product?: unknown }) => unknown;
let rewriteHref: (href: string) => string;

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  const module = (await server.ssrLoadModule('/src/site/Blocks.tsx')) as {
    Blocks: typeof Blocks;
    Inline: typeof Inline;
    rewriteHref: typeof rewriteHref;
  };
  Blocks = module.Blocks;
  Inline = module.Inline;
  rewriteHref = module.rewriteHref;
});

after(async () => {
  await server.close();
});

/** The words of every block of every page. */
function everyText(): string {
  const texts: string[] = [];
  for (const page of pages) {
    for (const section of page.sections) {
      for (const block of section.blocks) {
        if (typeof block.text === 'string') texts.push(block.text);
        for (const item of block.items ?? []) {
          if (typeof item === 'string') texts.push(item);
          else if (item && typeof item === 'object') {
            for (const value of Object.values(item)) if (typeof value === 'string') texts.push(value);
          }
        }
      }
    }
  }
  return texts.join('\n');
}

describe('the summary of the documentation', () => {
  it('holds every page of the content', () => {
    assert.equal(summary.length, pages.length);
    assert.deepEqual(
      summary.map((entry) => entry.id),
      pages.map((page) => page.id),
    );
  });

  it('is the content, and not a copy that can drift away', () => {
    for (const page of pages) {
      const entry = summary.find((one) => one.id === page.id);
      assert.ok(entry, `the page ${page.id} is not in the summary`);
      assert.equal(entry!.title, page.title, `the title of ${page.id} differs`);
      assert.equal(entry!.summary, page.summary, `the summary of ${page.id} differs`);
      assert.equal(entry!.group, page.group, `the group of ${page.id} differs`);
      assert.equal(entry!.updated, page.updated, `the day of ${page.id} differs`);
      assert.equal(entry!.catalogSlug, page.catalogSlug, `the product of ${page.id} differs`);
      assert.deepEqual(entry!.keywords, page.keywords ?? [], `the words of ${page.id} differ`);
    }
  });

  it('knows the name of the group of every page', () => {
    const labels = new Map(groups.map((group) => [group.id, group.label]));
    for (const entry of summary) {
      assert.equal(entry.groupLabel, labels.get(entry.group), `the group of ${entry.id} has no name`);
    }
  });
});

describe('the links of the content', () => {
  it('names a page that exists', () => {
    const ids = new Set(pages.map((page) => page.id));
    const links = [...everyText().matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]!);
    assert.ok(links.length > 0, 'the content has no link at all');
    for (const link of links) {
      if (!link.startsWith('/docs')) continue;
      const id = link.replace('/docs?p=', '').replace('/docs/', '');
      assert.ok(ids.has(id), `the link ${link} names a page that does not exist`);
    }
  });

  it('uses the form of the address the site uses', () => {
    assert.equal(rewriteHref('/docs?p=upgrade'), '/docs/upgrade');
    assert.equal(rewriteHref('/docs/upgrade'), '/docs/upgrade');
    assert.equal(rewriteHref('/apps'), '/apps');
    assert.equal(rewriteHref('https://example.org/x'), 'https://example.org/x');
  });

  it('is written in the new form when the content is drawn', () => {
    const html = renderToStaticMarkup(
      createElement(Inline as never, { text: 'Read the page about the upgrade: [the upgrade](/docs?p=upgrade).' }),
    );
    assert.match(html, /href="\/docs\/upgrade"/);
    assert.equal(html.includes('/docs?p='), false, 'a link of the old form survived');
  });
});

describe('the markers of the content', () => {
  it('are known, and there is no other one', () => {
    const markers = new Set([...everyText().matchAll(/\{\{([a-zA-Z.]+)\}\}/g)].map((match) => match[1]!));
    for (const marker of markers) {
      assert.ok(['planned', 'catalog.price', 'catalog.minResources'].includes(marker), `the marker ${marker} is unknown`);
    }
  });

  it('are all resolved when the page is drawn', () => {
    const blocks = [
      { t: 'p', text: 'This is {{planned}} and it costs {{catalog.price}} with {{catalog.minResources}}.' },
      { t: 'list', items: ['The page of the product is {{catalog.price}}.'] },
    ];
    const product = {
      slug: 'code-server',
      name: 'Code Server',
      min: { ram: 1024, cpu: 1, disk: 5 },
      def: { ram: 2048, cpu: 1, disk: 10 },
      max: { ram: 16384, cpu: 4, disk: 100 },
      minPrice: 349,
      recPrice: 574,
      rates: { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 },
      currency: 'EUR',
      description: '',
      category: '',
    };
    const html = renderToStaticMarkup(createElement(Blocks as never, { blocks, product }));
    assert.equal(html.includes('{{'), false, 'a marker was shown to the reader');
    assert.match(html, /Planned/);
    assert.match(html, /€3\.49/);
    assert.match(html, /1 GB RAM/);
  });

  it('are resolved in every page of the content', () => {
    for (const page of pages) {
      for (const section of page.sections) {
        for (const block of section.blocks) {
          const texts: string[] = [];
          if (typeof block.text === 'string') texts.push(block.text);
          for (const item of block.items ?? []) {
            if (typeof item === 'string') texts.push(item);
            else if (item && typeof item === 'object') {
              for (const value of Object.values(item)) if (typeof value === 'string') texts.push(value);
            }
          }
          for (const text of texts) {
            for (const match of text.matchAll(/\{\{([a-zA-Z.]+)\}\}/g)) {
              assert.ok(
                ['planned', 'catalog.price', 'catalog.minResources'].includes(match[1]!),
                `the page ${page.id} has the unknown marker ${match[1]}`,
              );
            }
          }
        }
      }
    }
  });
});

describe('the pages of the products', () => {
  it('are the pages of the products the platform can deploy', () => {
    const deployable = new Set(snapshot.map((product) => product.slug));
    for (const page of pages) {
      if (!page.catalogSlug) continue;
      assert.equal(deployable.has(page.catalogSlug), true, `the page ${page.id} is about a product that cannot be deployed`);
    }
  });

  it('are named after the product they are about', () => {
    for (const page of pages) {
      if (!page.catalogSlug) continue;
      assert.equal(page.id, page.catalogSlug, `the page ${page.id} does not carry the name of its product`);
    }
  });
});
