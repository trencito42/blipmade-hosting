import fs from 'node:fs';

/**
 * Finds the elements that do not fit on a phone.
 *
 * The script opens a route at a width and reports every element that is
 * wider than the screen, with the path that leads to it, so the overflow can
 * be found in the code.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const WIDTH = Number(process.env.BM_WIDTH ?? 320);
const ROUTES = (process.env.BM_ROUTES ?? '/').split(',');

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

  const report = await page.evaluate((width) => {
    const root = document.documentElement;
    const path = (element) => {
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 4) {
        let name = current.tagName.toLowerCase();
        if (current.id) name += `#${current.id}`;
        else if (current.className && typeof current.className === 'string') {
          name += `.${current.className.trim().split(/\s+/).slice(0, 3).join('.')}`;
        }
        parts.unshift(name);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };

    const wide = [];
    const small = [];
    let extreme = { right: 0, path: '', width: 0 };
    for (const element of document.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;

      if (box.right > extreme.right) {
        extreme = { right: Math.round(box.right), path: path(element), width: Math.round(box.width) };
      }

      // An element that is wider than the screen and that is not inside a
      // container that scrolls on purpose.
      if (box.right > width + 1 || box.width > width + 1) {
        let parent = element.parentElement;
        let scrolls = false;
        while (parent && parent !== document.body) {
          const parentStyle = getComputedStyle(parent);
          if (parentStyle.overflowX === 'auto' || parentStyle.overflowX === 'scroll' || parentStyle.overflowX === 'hidden') {
            scrolls = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!scrolls) {
          wide.push({ right: Math.round(box.right), line: `${Math.round(box.width)}px right=${Math.round(box.right)} ${path(element)}` });
        }
      }

      const isControl =
        element.tagName === 'BUTTON' ||
        element.tagName === 'SELECT' ||
        element.getAttribute('role') === 'button' ||
        (element.tagName === 'A' && box.height >= 32 && box.width >= 28);
      if (!isControl) continue;
      if (box.height < 36 || box.width < 28) {
        small.push(`${Math.round(box.width)}x${Math.round(box.height)} ${path(element)}`);
      }
    }
    wide.sort((a, b) => b.right - a.right);
    return { overflow: root.scrollWidth - root.clientWidth, wide: wide.slice(0, 12).map((w) => w.line), small: small.slice(0, 12), extreme };
  }, WIDTH);

  console.log(`--- ${route} at ${WIDTH}px: overflow ${report.overflow}`);
  console.log(`  extreme right=${report.extreme.right} width=${report.extreme.width} ${report.extreme.path}`);
  for (const line of report.wide) console.log(`  wide  ${line}`);
  for (const line of report.small) console.log(`  small ${line}`);
}

await browser.close();
