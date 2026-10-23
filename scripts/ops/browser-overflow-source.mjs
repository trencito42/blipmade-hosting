import fs from 'node:fs';

/**
 * Finds the element that makes a page wider than the screen.
 *
 * The report walks the tree and writes down the elements whose content does
 * not fit into their own box, deepest first, so the element that causes the
 * overflow is named, and not only the boxes around it.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.BM_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.BM_ADMIN_PASSWORD ?? '';
const WIDTH = Number(process.env.BM_WIDTH ?? 440);
const HEIGHT = Number(process.env.BM_HEIGHT ?? 956);
const ROUTE = process.env.BM_ROUTE ?? '/admin/tickets';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 3,
  // With the mobile flags the layout viewport grows to the width of the
  // content, so a broken layout hides itself. Without them the viewport
  // stays at the width of the window and the broken layout is visible.
  isMobile: process.env.BM_DESKTOP_CONTEXT !== '1',
  hasTouch: true,
});
const page = await context.newPage();

// Without the viewport meta the layout viewport stays exactly as wide as the
// window, so a media query is measured against the real width of the phone
// and the layout cannot widen itself.
if (process.env.BM_STRIP_VIEWPORT === '1') {
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const type = response.headers()['content-type'] || '';
    if (!type.includes('text/html')) return route.fulfill({ response });
    const body = await response.text();
    await route.fulfill({
      response,
      body: body.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, ''),
      headers: { ...response.headers(), 'content-length': undefined },
    });
  });
}

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', ADMIN_EMAIL || EMAIL);
await page.fill('input[type="password"]', ADMIN_PASSWORD || PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/(app|admin)(\/|$)/, { timeout: 20000 });

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const path = (element) => {
    const parts = [];
    let current = element;
    while (current && current !== document.documentElement && parts.length < 8) {
      let name = current.tagName.toLowerCase();
      if (current.id) name += `#${current.id}`;
      else if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(Boolean).slice(0, 6);
        if (classes.length) name += `.${classes.join('.')}`;
      }
      parts.unshift(name);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  const info = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      path: path(element),
      tag: element.tagName.toLowerCase(),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      over: element.scrollWidth - element.clientWidth,
      rectWidth: Math.round(box.width),
      left: Math.round(box.left),
      right: Math.round(box.right),
      display: style.display,
      position: style.position,
      overflowX: style.overflowX,
      whiteSpace: style.whiteSpace,
      wordBreak: style.wordBreak,
      overflowWrap: style.overflowWrap,
      minWidth: style.minWidth,
      width: style.width,
      flex: style.flex,
      gridTemplateColumns: style.gridTemplateColumns,
      gridTemplateRows: style.gridTemplateRows,
      text: (element.textContent || '').trim().slice(0, 80),
    };
  };

  const overflowing = [...document.querySelectorAll('body *')].filter((element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return element.scrollWidth - element.clientWidth > 1 && element.clientWidth > 0;
  });

  // The deepest ones: the element that overflows and whose children do not.
  const deepest = overflowing.filter(
    (element) => !overflowing.some((other) => other !== element && element.contains(other)),
  );

  // The widest boxes of the document: the one that is wider than the screen
  // is what forces the layout viewport to grow.
  const widest = [...document.querySelectorAll('body *')]
    .map((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const box = element.getBoundingClientRect();
      if (!box.width) return null;
      return {
        ...info(element),
        rectWidth: Math.round(box.width),
        rectRight: Math.round(box.right),
        // The width the element asks for on its own, without the width it
        // was given.
        minContent: (() => {
          const probe = element.cloneNode(true);
          probe.style.width = 'min-content';
          probe.style.position = 'absolute';
          probe.style.visibility = 'hidden';
          probe.style.maxWidth = 'none';
          document.body.appendChild(probe);
          const width = Math.round(probe.getBoundingClientRect().width);
          probe.remove();
          return width;
        })(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rectWidth - a.rectWidth)
    .slice(0, 12);

  return {
    innerWidth: window.innerWidth,
    visualViewport: window.visualViewport ? Math.round(window.visualViewport.width) : null,
    scale: window.visualViewport ? window.visualViewport.scale : null,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    deepest: deepest.map(info),
    widest,
    all: overflowing.map(info),
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
