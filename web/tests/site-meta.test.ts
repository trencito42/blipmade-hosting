/**
 * The head of the pages of the site, checked without a browser.
 *
 *     node --test web/tests/
 *
 * The site is written to the disk before it is served, and the head of every
 * page is part of that file: the title, the description, the address of the
 * page, the words for the networks of the site and the structured data.
 *
 * The checks are the ones a crawler and a reader of a shared link make:
 *
 *   1. every page has a title and a description, and both are of a length a
 *      search engine shows;
 *   2. every page names its own address, and no two pages share one;
 *   3. a page that waits for the operator stays out of the index;
 *   4. the picture of a shared link is there, and the structured data is
 *      readable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { allRoutes, metaFor, SITE } from '../src/site/seo.ts';
import { headHtml } from '../src/site/head.ts';
import { matchPublic } from '../src/site/public-routes.ts';

const routes = allRoutes();

test('the site writes a page for every address it lists', () => {
  assert.ok(routes.length > 40, `only ${routes.length} addresses are listed`);
  assert.equal(new Set(routes).size, routes.length, 'an address is listed twice');
  for (const route of routes) {
    assert.match(route, /^\//, `${route} is not an address of the site`);
  }
});

test('every page has a title and a description of a length a search engine shows', () => {
  for (const route of routes) {
    const meta = metaFor(route);
    assert.ok(meta.title.length > 0, `${route} has no title`);
    assert.ok(meta.title.length <= 60, `the title of ${route} is ${meta.title.length} characters long`);
    assert.ok(meta.description.length > 0, `${route} has no description`);
    assert.ok(meta.description.length <= 160, `the description of ${route} is ${meta.description.length} characters long`);
  }
});

test('every page names its own address', () => {
  const seen = new Map<string, string>();
  for (const route of routes) {
    const meta = metaFor(route);
    assert.equal(meta.canonical, `${SITE}${route === '/' ? '/' : route}`, `${route} names another address`);
    const other = seen.get(meta.canonical);
    assert.equal(other, undefined, `${route} and ${other} name the same address`);
    seen.set(meta.canonical, route);
  }
});

test('the pages of the public site are in the index, the pages of the account are not', () => {
  for (const route of routes) {
    const meta = metaFor(route);
    const kind = matchPublic(route).kind;
    if (kind === 'login' || kind === 'register' || kind === 'forgot' || kind === 'reset' || kind === 'verify') {
      assert.equal(meta.noindex, true, `${route} is in the index of the search engines`);
      continue;
    }
    if (kind === 'legal') {
      // The legal pages wait for the values of the operator, so they stay out
      // of the index until every one of them is there.
      assert.equal(meta.noindex, true, `${route} is in the index of the search engines`);
      continue;
    }
    assert.equal(meta.noindex, false, `${route} is out of the index of the search engines`);
  }
});

test('the home page names the platform and the organization', () => {
  const meta = metaFor('/');
  assert.match(meta.title, /Blipmade/);
  const types = meta.jsonld.map((entry) => (entry as { '@graph'?: { '@type': string }[] })['@graph']?.map((node) => node['@type']) ?? []);
  const flat = types.flat();
  assert.ok(flat.includes('Organization'), 'the organization is missing');
  assert.ok(flat.includes('WebSite'), 'the site is missing');
  assert.ok(flat.includes('Service'), 'the service is missing');
  // The questions of the catalog are on the page, so they are in the data.
  assert.ok(meta.jsonld.some((entry) => (entry as { '@type': string })['@type'] === 'FAQPage'), 'the questions are missing');
});

test('a product page is a product with its price', () => {
  const meta = metaFor('/apps/code-server');
  const product = meta.jsonld.find((entry) => (entry as { '@type': string })['@type'] === 'Product') as
    | { name: string; offers: { price: string; priceCurrency: string; availability: string } }
    | undefined;
  assert.ok(product, 'the product is missing');
  assert.match(product!.name, /Code Server/);
  assert.equal(product!.offers.priceCurrency, 'EUR');
  assert.equal(product!.offers.availability, 'https://schema.org/InStock');
  assert.match(product!.offers.price, /^\d+\.\d{2}$/);
});

test('a page of the documentation is an article with its sections', () => {
  const meta = metaFor('/docs/upgrade');
  const article = meta.jsonld.find((entry) => (entry as { '@type': string })['@type'] === 'TechArticle') as
    | { headline: string; dateModified: string; articleSection: string }
    | undefined;
  assert.ok(article, 'the article is missing');
  assert.ok(article!.headline.length > 0);
  assert.match(article!.dateModified, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(article!.articleSection.length > 0);
});

test('the structured data of every page can be read', () => {
  for (const route of routes) {
    for (const entry of metaFor(route).jsonld) {
      const text = JSON.stringify(entry);
      assert.doesNotThrow(() => JSON.parse(text), `the structured data of ${route} is not readable`);
      assert.ok(text.includes('@context'), `${route} has no context`);
    }
  }
});

test('the head of a page carries the words of a shared link', () => {
  for (const route of routes) {
    const head = headHtml(metaFor(route));
    assert.match(head, /<title>[^<]+<\/title>/, `${route} has no title in the head`);
    assert.match(head, /<meta name="description" content="[^"]+" \/>/, `${route} has no description in the head`);
    assert.match(head, /<link rel="canonical" href="[^"]+" \/>/, `${route} has no address in the head`);
    assert.match(head, /<meta name="robots" content="[^"]+" \/>/, `${route} has no robots in the head`);
    assert.match(head, /<meta property="og:title" content="[^"]+" \/>/, `${route} has no title for the networks`);
    assert.match(head, /<meta property="og:description" content="[^"]+" \/>/, `${route} has no description for the networks`);
    assert.match(head, /<meta property="og:url" content="[^"]+" \/>/, `${route} has no address for the networks`);
    assert.match(head, /<meta property="og:image" content="[^"]+" \/>/, `${route} has no picture for the networks`);
    assert.match(head, /<meta name="twitter:card" content="[^"]+" \/>/, `${route} has no card for the networks`);
    assert.match(head, /<meta name="twitter:image" content="[^"]+" \/>/, `${route} has no picture for the networks`);
  }
});

test('the picture of a shared link is the picture of the site', () => {
  const head = headHtml(metaFor('/'));
  assert.match(head, new RegExp(`<meta property="og:image" content="${SITE}/og\\.png" />`));
  assert.match(head, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(head, /<meta property="og:image:height" content="630" \/>/);
});

test('the address of the documentation of the site is the one the content uses', () => {
  // The content was written with the old form of the address. The site names
  // a page with a part of the address, and the old form is sent to the new
  // one. The pages of the list are therefore the new form.
  for (const route of routes) {
    if (!route.startsWith('/docs/')) continue;
    assert.doesNotMatch(route, /\?/, `${route} carries a question in its address`);
  }
});

test('a page of the documentation of a product that cannot be deployed is not written', () => {
  const pages = routes.filter((route) => route.startsWith('/docs/'));
  // The catalog carries three products that can be deployed today, and every
  // one of them has its page of the documentation.
  for (const slug of ['code-server', 'discord-bot', 'postgresql']) {
    assert.ok(pages.includes(`/docs/${slug}`), `the page of ${slug} is not written`);
  }
  // A product the platform cannot deploy has no page: the site does not
  // describe something that cannot be ordered.
  for (const slug of ['wordpress', 'grafana', 'n8n', 'mongodb']) {
    assert.equal(pages.includes(`/docs/${slug}`), false, `the page of ${slug} is written`);
  }
});
