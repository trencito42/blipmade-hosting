/**
 * Opens the customer area in a real browser, with disposable fixtures for the API, and checks
 * what a reader would see: a screenshot for every page and every size, a horizontal overflow
 * check, and the errors of the console.
 *
 * Usage (the built site must be served, for example with `npx vite preview --port 4174`):
 *   node e2e/console-shots.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { answers } from './console-fixtures.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4174';
const OUT = process.argv[3] ?? '/tmp/console-shots';
const ROUTES = ['/app', '/app/deploy', '/app/instances', '/app/vps', '/app/domains', '/app/mail', '/app/billing', '/app/tickets', '/app/settings', '/app/notifications'];
const SIZES = [[320, 700], [390, 844], [768, 1024], [1280, 800], [1920, 1000]];
const SCREENSHOT_SIZES = new Set([390, 1280]);
const KINDS = ['full', 'new', 'down'];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

// The public catalog is the real one, read once, so the deploy page is checked with real products.
const probe = await browser.newContext();
let catalog = { products: [] };
try {
  const response = await probe.request.get('https://blipmade.com/api/catalog/products');
  if (response.ok()) catalog = await response.json();
} catch {
  /* the page is then checked with an empty catalog */
}
await probe.close();

for (const kind of KINDS) {
  const data = answers(kind);
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 160)}`));
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' && !/Failed to load resource/.test(text)) errors.push(`console: ${text.slice(0, 160)}`);
    });
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^\/api/, '');
      const key = `${route.request().method()} ${path}`;
      if (path === '/catalog/products') return route.fulfill({ json: catalog });
      if (kind === 'down' && path !== '/auth/session') return route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'The service is temporarily unavailable.' } } });
      if (path.endsWith('/events')) return route.fulfill({ json: { events: kind === 'full' ? answers('full')['GET /instances'].instances.length ? [{ id: 'e1', type: 'runtime_state', message: 'The node reported the state "running" for this instance at 12:00.', createdAt: new Date().toISOString() }] : [] : [] } });
      if (data[key]) return route.fulfill({ json: data[key] });
      return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Not found' } } });
    });

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => {
        const limit = window.innerWidth;
        const wide = document.documentElement.scrollWidth > limit + 1;
        const offenders = [];
        if (wide) {
          for (const element of document.querySelectorAll('body *')) {
            const box = element.getBoundingClientRect();
            if (box.width > 0 && box.right > limit + 1 && offenders.length < 3) offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)} right=${Math.round(box.right)}`);
          }
        }
        return { wide, scrollWidth: document.documentElement.scrollWidth, offenders };
      });
      if (SCREENSHOT_SIZES.has(width)) {
        const name = `${kind}${route.replace(/\//g, '_')}-${width}.png`;
        await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
      }
      report.push({ kind, route, width, overflow: overflow.wide, scrollWidth: overflow.scrollWidth, offenders: overflow.offenders, errors: [...errors] });
      errors.length = 0;
    }
    await context.close();
  }
}
await browser.close();

await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const overflowing = report.filter((entry) => entry.overflow);
const erroring = report.filter((entry) => entry.errors.length);
console.log(`checked ${report.length} page views: ${overflowing.length} with horizontal overflow, ${erroring.length} with errors`);
for (const entry of overflowing.slice(0, 12)) console.log(`  overflow ${entry.kind} ${entry.route} @${entry.width}: ${entry.scrollWidth}px ${entry.offenders.join(' | ')}`);
for (const entry of erroring.slice(0, 8)) console.log(`  errors ${entry.kind} ${entry.route} @${entry.width}: ${entry.errors[0]}`);
