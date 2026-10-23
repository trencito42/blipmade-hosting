import fs from 'node:fs';

/**
 * Finds the element that forces a page to be wider than the screen.
 *
 * The script measures the minimum width of the elements of a route: an
 * element is set to `width: min-content` for a moment and the width it takes
 * is the width it asks for. The element that asks for the most is the one
 * that pushes the page.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const WIDTH = Number(process.env.BM_WIDTH ?? 320);
const ROUTES = (process.env.BM_ROUTES ?? '/').split(',');
const SELECTOR = process.env.BM_SELECTOR ?? '';
const MIN = Number(process.env.BM_MIN ?? WIDTH);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 780 } });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/app(\/|$)/, { timeout: 20000 });

for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const report = await page.evaluate(
    ({ width, selector, min }) => {
      const path = (element) => {
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 5) {
          let name = current.tagName.toLowerCase();
          if (current.id) name += `#${current.id}`;
          else if (current.className && typeof current.className === 'string') {
            name += `.${current.className.trim().split(/\s+/).slice(0, 4).join('.')}`;
          }
          parts.unshift(name);
          current = current.parentElement;
        }
        return parts.join(' > ');
      };

      const scope = selector ? document.querySelectorAll(selector) : document.querySelectorAll('body *');
      const rows = [];
      for (const element of scope) {
        const before = element.getAttribute('style');
        element.style.setProperty('width', 'min-content', 'important');
        element.style.setProperty('max-width', 'none', 'important');
        const needed = element.getBoundingClientRect().width;
        if (before === null) element.removeAttribute('style');
        else element.setAttribute('style', before);
        if (needed > min) {
          rows.push({ needed: Math.round(needed), path: path(element) });
        }
      }
      rows.sort((a, b) => b.needed - a.needed);
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rows: rows.slice(0, 10),
      };
    },
    { width: WIDTH, selector: SELECTOR, min: MIN },
  );

  console.log(`--- ${route} at ${WIDTH}px: overflow ${report.overflow}`);
  for (const row of report.rows) console.log(`  needs ${row.needed}px  ${row.path}`);
}

await browser.close();
