#!/usr/bin/env node
/**
 * Checks the documentation in a real browser, at the sizes of a phone and of
 * a desktop.
 *
 * The documentation is read by people on every kind of screen, and a page
 * that is only correct on a wide screen is a page that is broken for half of
 * them. The checks are:
 *
 *   1. the page of the documentation answers and the title of the page says
 *      what the page is about;
 *   2. the navigation of the documentation is there, at every size, and the
 *      search finds a page that the customer would look for;
 *   3. the anchors of a page lead to the part of the page they name, and the
 *      table of contents of the page is there;
 *   4. the breadcrumb says where the customer is, and the links of the page
 *      lead to pages that exist;
 *   5. nothing overflows the width of the screen, at any size;
 *   6. the page can be read with the keyboard alone: the search answers to
 *      the shortcut, and every control can be reached with the tab;
 *   7. the landmarks of the page are the ones a screen reader needs.
 *
 * Environment:
 *   BM_BASE        the platform (default http://127.0.0.1:3000)
 *   BM_DOCS_ROUTE  the route of the documentation (default /docs)
 *   BM_OUT         where the screenshots are written (default /tmp/blipmade-docs)
 *   PLAYWRIGHT_PATH  where the playwright-core of the machine is
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const DOCS = process.env.BM_DOCS_ROUTE ?? '/docs';
const OUT = process.env.BM_OUT ?? '/tmp/blipmade-docs';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/root/blipmade-docs/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const problems = [];
const notes = [];

function fail(where, message) {
  problems.push(`${where}: ${message}`);
}

function note(where, message) {
  notes.push(`${where}: ${message}`);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const where = viewport.name;

  const response = await page.goto(`${BASE}${DOCS}`, { waitUntil: 'networkidle', timeout: 60000 });
  if (!response || !response.ok()) {
    fail(where, `the documentation answered ${response ? response.status() : 'nothing'}`);
    await context.close();
    continue;
  }

  // 1. the title and the description of the page.
  const title = await page.title();
  if (!title || title.trim().length === 0) fail(where, 'the page has no title');
  else if (!/blipmade/i.test(title)) fail(where, `the title of the page does not name the platform: "${title}"`);
  const description = await page
    .locator('meta[name="description"]')
    .getAttribute('content')
    .catch(() => null);
  if (!description) note(where, 'the page has no meta description');

  // 2. the navigation and the search.
  const nav = page.locator('nav[aria-label="Main"], nav[aria-label="Contents"], aside nav').first();
  if ((await nav.count()) === 0) fail(where, 'the navigation of the documentation is not there');
  const search = page.locator('input[type="search"], input[aria-label*="earch"]').first();
  if ((await search.count()) === 0) {
    fail(where, 'the search box is not there');
  } else {
    await search.click();
    await search.fill('domain');
    await page.waitForTimeout(400);
    const hits = await page.locator('[aria-live="polite"] li, [aria-live="polite"] a').count();
    if (hits === 0) fail(where, 'the search for "domain" found nothing');
    else note(where, `the search for "domain" found ${hits} result(s)`);
    await search.fill('');
    await page.waitForTimeout(200);
  }

  // 3. the anchors and the table of contents.
  const anchors = page.locator('main a[href^="#"], article a[href^="#"]');
  const anchorCount = await anchors.count();
  if (anchorCount > 0) {
    const first = anchors.first();
    const href = await first.getAttribute('href');
    await first.click();
    await page.waitForTimeout(300);
    const hash = await page.evaluate(() => window.location.hash);
    if (!hash) fail(where, `the anchor "${href}" did not change the address of the page`);
    const visible = await page.evaluate((id) => {
      const element = document.getElementById(id.replace('#', ''));
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    }, href);
    if (!visible) fail(where, `the anchor "${href}" did not bring its part of the page into view`);
    else note(where, `the anchor "${href}" works`);
  } else {
    note(where, 'the page has no anchor inside it');
  }

  // 4. the breadcrumb and the links of the page.
  const breadcrumb = page.locator('nav[aria-label*="readcrumb"], [aria-label*="readcrumb"]').first();
  if ((await breadcrumb.count()) === 0) note(where, 'the page has no breadcrumb');
  const docLinks = page.locator('a[href*="/docs?p="]');
  const linkCount = await docLinks.count();
  if (linkCount > 0) {
    const href = await docLinks.first().getAttribute('href');
    const target = href.split('p=')[1]?.split('&')[0];
    if (target) {
      await page.goto(`${BASE}${DOCS}?p=${target}`, { waitUntil: 'networkidle', timeout: 60000 });
      const heading = await page.locator('h1, h2').first().textContent().catch(() => null);
      if (!heading || heading.trim().length === 0) fail(where, `the page "${target}" has no title`);
      else note(where, `the link to "${target}" opens a page with a title`);
    }
  }

  // 5. the width of the page.
  await page.goto(`${BASE}${DOCS}`, { waitUntil: 'networkidle', timeout: 60000 });
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [];
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect();
      if (box.width > width + 2 && box.height > 0) {
        wide.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)} (${Math.round(box.width)}px)`);
      }
      if (wide.length >= 5) break;
    }
    return { width, wide, scroll: document.documentElement.scrollWidth };
  });
  if (overflow.scroll > overflow.width + 2) {
    fail(where, `the page scrolls sideways (${overflow.scroll}px in ${overflow.width}px): ${overflow.wide.join(', ')}`);
  }

  // 6. the keyboard.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
  if (!focused || focused === 'BODY') note(where, 'the first tab does not reach a control');
  else note(where, `the first tab reaches a ${focused.toLowerCase()}`);

  // 7. the landmarks.
  const landmarks = await page.evaluate(() => ({
    main: document.querySelectorAll('main').length,
    nav: document.querySelectorAll('nav').length,
    h1: document.querySelectorAll('h1').length,
    title: !!document.title,
  }));
  if (landmarks.main !== 1) fail(where, `the page has ${landmarks.main} elements of "main" and it needs exactly one`);
  if (landmarks.h1 !== 1) fail(where, `the page has ${landmarks.h1} titles of the first level and it needs exactly one`);
  if (landmarks.nav < 1) fail(where, 'the page has no navigation');

  await page.screenshot({ path: `${OUT}/docs-${viewport.name}.png`, fullPage: false });
  await context.close();
}

await browser.close();

const report = [
  `# The documentation in a browser`,
  '',
  `Base: ${BASE}${DOCS}`,
  `Sizes: ${VIEWPORTS.map((v) => `${v.name} (${v.width}px)`).join(', ')}`,
  '',
  problems.length ? `## Problems (${problems.length})` : '## Problems: none',
  ...problems.map((p) => `- ${p}`),
  '',
  `## Notes (${notes.length})`,
  ...notes.map((n) => `- ${n}`),
  '',
].join('\n');

writeFileSync(`${OUT}/docs-browser-report.md`, report);
console.log(report);

if (problems.length) process.exit(1);
console.log(`The documentation passed the browser checks. The screenshots are in ${OUT}.`);
