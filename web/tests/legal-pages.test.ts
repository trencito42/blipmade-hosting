/**
 * The legal pages of the platform, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The test runner of the project reads TypeScript but not JSX, so Vite reads
 * the files for us, the same way the build does. The pages are rendered on the
 * server, without a browser, which is enough to see the title of a page, the
 * text it holds and the links it offers.
 *
 * Three things are checked here:
 *
 *   1. the six pages have their own route and the router knows all of them;
 *   2. every page is really written: it has a title, its sections and the
 *      links to the other legal pages;
 *   3. the pages do not promise what the platform does not do.
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
  { path: '/terms', title: 'Terms of service', module: '/src/pages/Terms.tsx' },
  { path: '/privacy', title: 'Privacy policy', module: '/src/pages/Privacy.tsx' },
  { path: '/cookies', title: 'Cookie policy', module: '/src/pages/Cookies.tsx' },
  { path: '/aup', title: 'Acceptable use policy', module: '/src/pages/Aup.tsx' },
  { path: '/refund-policy', title: 'Refund policy', module: '/src/pages/RefundPolicy.tsx' },
  { path: '/sla', title: 'Service levels and support', module: '/src/pages/Sla.tsx' },
];

/** The marker of a value the operator still has to supply. */
const MARKER = 'TODO(operator)';

interface RouteDef {
  pattern: string;
  component: unknown;
  title: string;
}

let server: ViteDevServer;
/** The rendered markup of each page, by its route. */
const pages = new Map<string, string>();
let routes: RouteDef[] = [];

before(async () => {
  server = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const router = (await server.ssrLoadModule('/src/routes.tsx')) as { ROUTES: RouteDef[] };
  routes = router.ROUTES;

  for (const page of LEGAL_PAGES) {
    const mod = (await server.ssrLoadModule(page.module)) as { default: () => unknown };
    pages.set(page.path, renderToStaticMarkup(createElement(mod.default as never)));
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
      const route = routes.find((entry) => entry.pattern === page.path);
      assert.ok(route, `the route ${page.path} is missing from the router`);
      assert.ok(route.component, `the route ${page.path} has no page`);
    }
  });

  it('keeps the six pages apart from the other routes of the site', () => {
    const patterns = routes.map((entry) => entry.pattern);
    assert.equal(new Set(patterns).size, patterns.length, 'two routes share a pattern');
    // A legal page is not behind the account: it has no area.
    for (const page of LEGAL_PAGES) {
      const route = routes.find((entry) => entry.pattern === page.path);
      assert.equal((route as RouteDef & { area?: string }).area, undefined, `${page.path} asks for an account`);
    }
  });

  it('has a page for a server failure as well', () => {
    const route = routes.find((entry) => entry.pattern === '/500');
    assert.ok(route, 'the route /500 is missing from the router');
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
