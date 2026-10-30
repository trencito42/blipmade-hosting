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
const ROUTES = ['/app', '/app/deploy', '/app/instances', '/app/vps', '/app/instances/i1', '/app/vps/v1', '/app/domains', '/app/mail', '/app/billing', '/app/tickets', '/app/settings', '/app/notifications'];
const SIZES = [[320, 700], [390, 844], [768, 1024], [1280, 800], [1920, 1000]];
const SCREENSHOT_SIZES = new Set([390, 1280]);
const KINDS = (process.env.KINDS ?? 'full,new,down').split(',');

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
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
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
        let keyboard = null;
        if (width === 1280) {
          // Tab through the page: every stop must show where the focus is, and the focus must not get stuck.
          await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
          const stops = [];
          for (let i = 0; i < 30; i += 1) {
            await page.keyboard.press('Tab');
            stops.push(await page.evaluate(() => {
              const el = document.activeElement;
              if (!el || el === document.body) return null;
              const css = getComputedStyle(el);
              const outline = css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0;
              const shadow = css.boxShadow !== 'none';
              const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30);
              return { label, tag: el.tagName.toLowerCase(), visible: outline || shadow };
            }));
          }
          const real = stops.filter(Boolean);
          let stuck = 0;
          for (let i = 2; i < real.length; i += 1) if (real[i].label === real[i - 1].label && real[i].label === real[i - 2].label) stuck += 1;
          keyboard = { sample: real.map((stop) => stop.label).join(" | "), stops: real.length, withoutIndicator: real.filter((stop) => !stop.visible).map((stop) => `${stop.tag}:${stop.label}`).slice(0, 5), stuck };
        }
        report.push({ kind, route, width, keyboard, overflow: overflow.wide, scrollWidth: overflow.scrollWidth, offenders: overflow.offenders, errors: [...errors] });
      } catch (error) {
        // A page that cannot be opened is a finding, not the end of the run.
        console.log(`  could not check ${kind} ${route} @${width}: ${String(error).slice(0, 140)}`);
        report.push({ kind, route, width, overflow: false, scrollWidth: 0, offenders: [], errors: [`check failed: ${String(error).slice(0, 140)}`] });
        break;
      }
      errors.length = 0;
    }
    await context.close().catch(() => undefined);
  }
}
await browser.close().catch(() => undefined);

await writeFile(`${OUT}/report-${KINDS.join('-')}.json`, JSON.stringify(report, null, 1));
const overflowing = report.filter((entry) => entry.overflow);
const erroring = report.filter((entry) => entry.errors.length);
console.log(`checked ${report.length} page views: ${overflowing.length} with horizontal overflow, ${erroring.length} with errors`);
const keyed = report.filter((entry) => entry.keyboard);
const unfocusable = keyed.filter((entry) => entry.keyboard.withoutIndicator.length || entry.keyboard.stuck || entry.keyboard.stops < 3);
console.log(`keyboard: ${keyed.length} pages tabbed, ${unfocusable.length} with a stop that shows no focus, a trap or too few stops`);
for (const entry of unfocusable.slice(0, 20)) console.log(`  keyboard ${entry.kind} ${entry.route}: stops=${entry.keyboard.stops} stuck=${entry.keyboard.stuck} no-indicator=${entry.keyboard.withoutIndicator.join(", ")}\n    ${entry.keyboard.sample}`);
for (const entry of overflowing.slice(0, 12)) console.log(`  overflow ${entry.kind} ${entry.route} @${entry.width}: ${entry.scrollWidth}px ${entry.offenders.join(' | ')}`);
for (const entry of erroring.slice(0, 8)) console.log(`  errors ${entry.kind} ${entry.route} @${entry.width}: ${entry.errors[0]}`);
