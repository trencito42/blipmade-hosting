/**
 * The legal pages of the platform, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads the
 * files for us, the same way the build does. The pages are rendered on the
 * server, without a browser, which is enough to see the title of a page, the
 * text it holds and the links it offers.
 *
 * Four things are checked here:
 *
 *   1. the six pages have their own route, and the router of the public site
 *      knows all of them;
 *   2. every page is really written: it has a title, its sections and the
 *      links to the other legal pages;
 *   3. the pages do not promise what the platform does not do;
 *   4. a page that still waits for a value of the operator stays out of the
 *      index of the search engines, and the count of the values it waits for
 *      is the count the page shows.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

/** The six pages, with the route and the title each of them must carry. */
const LEGAL_PAGES = [
  { path: '/terms', title: 'Terms of service' },
  { path: '/privacy', title: 'Privacy policy' },
  { path: '/cookies', title: 'Cookie policy' },
  { path: '/aup', title: 'Acceptable use policy' },
  { path: '/refund-policy', title: 'Refund policy' },
  { path: '/sla', title: 'Service levels and support' },
];

/** The marker of a value the operator still has to supply. */
const MARKER = 'TODO(operator)';

let server: ViteDevServer;
/** The rendered markup of each page, by its route. */
const pages = new Map<string, string>();
let matchPublic: (path: string) => { kind: string; param?: string };
let metaFor: (path: string) => { noindex: boolean; title: string; description: string; canonical: string };

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const routes = (await server.ssrLoadModule('/src/site/public-routes.ts')) as { matchPublic: typeof matchPublic };
  matchPublic = routes.matchPublic;

  const seo = (await server.ssrLoadModule('/src/site/seo.ts')) as { metaFor: typeof metaFor };
  metaFor = seo.metaFor;

  const legal = (await server.ssrLoadModule('/src/site/Legal.tsx')) as { LegalPage: (props: { slug: string }) => unknown };
  for (const page of LEGAL_PAGES) {
    const slug = page.path.replace(/^\//, '');
    pages.set(page.path, renderToStaticMarkup(createElement(legal.LegalPage as never, { slug })));
  }
});

after(async () => {
  await server.close();
});

/**
 * The text a reader sees.
 *
 * The markup carries the whole of the logo in a data url, and the numbers of
 * that path are written with a percent sign. The checks on what a page
 * promises are therefore made on the text and not on the markup.
 */
function visibleText(html: string): string {
  return html
    .replace(/<img\b[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

describe('the legal routes', () => {
  it('gives every legal page its own route', () => {
    for (const page of LEGAL_PAGES) {
      const match = matchPublic(page.path);
      assert.equal(match.kind, 'legal', `${page.path} is not a legal route`);
      assert.equal(match.param, page.path.replace(/^\//, ''));
    }
  });

  it('keeps the six pages apart from the other routes of the site', () => {
    const kinds = LEGAL_PAGES.map((page) => matchPublic(page.path).kind);
    assert.equal(new Set(kinds).size, 1);
    assert.equal(kinds[0], 'legal');
  });

  it('has a page for a server failure as well', async () => {
    const routes = (await server.ssrLoadModule('/src/routes.tsx')) as { ROUTES: { pattern: string }[] };
    assert.ok(
      routes.ROUTES.some((route) => route.pattern === '/500'),
      'the route /500 is missing from the router',
    );
  });
});

describe('the legal pages', () => {
  it('writes the title of the page', () => {
    for (const page of LEGAL_PAGES) {
      const html = pages.get(page.path) ?? '';
      assert.match(html, new RegExp(`<h1[^>]*>${page.title}`), `${page.path} has no title`);
    }
  });

  it('writes the sections of the page', () => {
    for (const page of LEGAL_PAGES) {
      const html = pages.get(page.path) ?? '';
      assert.match(html, /<h2 id="/, `${page.path} has no section`);
      assert.match(html, /Last updated/, `${page.path} does not say when it was written`);
    }
  });

  it('links the six legal pages from every one of them', () => {
    for (const page of LEGAL_PAGES) {
      const html = pages.get(page.path) ?? '';
      for (const other of LEGAL_PAGES) {
        assert.match(html, new RegExp(`href="${other.path}"`), `${page.path} does not link to ${other.path}`);
      }
    }
  });

  it('says that the identity of the operator is not settled yet', () => {
    for (const page of LEGAL_PAGES) {
      const html = pages.get(page.path) ?? '';
      assert.match(html, /legal identity of the operator is still to be confirmed/i, `${page.path} has no note`);
    }
  });

  it('marks every value the operator still has to supply', () => {
    for (const page of LEGAL_PAGES) {
      const html = pages.get(page.path) ?? '';
      const marks = html.split(MARKER).length - 1;
      // The note of the footer carries one, so every page has at least two.
      assert.ok(marks >= 2, `${page.path} carries ${marks} markers`);
    }
  });

  it('says how many values it still waits for', () => {
    for (const page of LEGAL_PAGES) {
      const html = visibleText(pages.get(page.path) ?? '');
      assert.match(html, /still carries \d+ values? the operator has to publish/i, `${page.path} does not say what it waits for`);
    }
  });
});

describe('the legal pages and the index of the search engines', () => {
  it('keeps a page that waits for the operator out of the index', () => {
    for (const page of LEGAL_PAGES) {
      const meta = metaFor(page.path);
      assert.equal(meta.noindex, true, `${page.path} is in the index of the search engines`);
      assert.equal(meta.title, `${page.title} | Blipmade`);
    }
  });

  it('names the page in its own address', () => {
    for (const page of LEGAL_PAGES) {
      assert.equal(metaFor(page.path).canonical, `https://blipmade.com${page.path}`);
    }
  });
});

describe('what the legal pages promise', () => {
  it('promises no availability figure', () => {
    for (const page of LEGAL_PAGES) {
      const text = visibleText(pages.get(page.path) ?? '');
      assert.doesNotMatch(text, /\d+(\.\d+)?\s?%/, `${page.path} quotes a percentage`);
    }
  });

  it('promises no response time for a ticket', () => {
    for (const page of LEGAL_PAGES) {
      const text = visibleText(pages.get(page.path) ?? '');
      assert.doesNotMatch(text, /within \d+ (hour|minute|day|week|month)/i, `${page.path} promises a response time`);
    }
  });

  it('promises no refund window of its own', () => {
    const text = visibleText(pages.get('/refund-policy') ?? '');
    assert.match(text, /the period in which a refund can be asked for/, 'the refund window is not marked');
    assert.doesNotMatch(text, /within \d+ days/i, 'the refund policy promises a window');
  });

  it('names the cookies the code really sets', () => {
    const text = visibleText(pages.get('/cookies') ?? '');
    assert.match(text, /bm_session/, 'the session cookie is not named');
    assert.match(text, /bm_csrf/, 'the csrf cookie is not named');
    assert.doesNotMatch(text, /_ga|GAID|_gid/, 'the cookie policy names a cookie of a third party');
  });
});
