/**
 * Checks every route of the interface at the widths the design system asks
 * for: 320, 375, 390, 768, 1024 and 1440 px.
 *
 * For each route and each width it reports:
 *   - horizontal scrolling of the page (the page must never scroll sideways),
 *   - elements that stick out of the viewport on the right,
 *   - the size of the tap targets of the phone bottom bar,
 *   - whether the phone bottom bar is covered by something else,
 *   - console errors and failed requests.
 *
 * The report is written as JSON next to the screenshots and printed in a
 * short form.
 *
 * Environment:
 *   BM_BASE      the platform (default http://127.0.0.1:3000)
 *   BM_EMAIL     the account that signs in (optional)
 *   BM_PASSWORD  its password (optional, never printed)
 *   SHOT_DIR     where the report is written
 *   BM_SHOTS     when '1', a screenshot of every route and width is written
 */
import fs from 'node:fs';

const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots';
const WANT_SHOTS = process.env.BM_SHOTS === '1';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const WIDTHS = [320, 375, 390, 768, 1024, 1440];

const ROUTES = [
  { path: '/', name: 'home', auth: false },
  { path: '/login', name: 'login', auth: false },
  { path: '/register', name: 'register', auth: false },
  { path: '/forgot-password', name: 'forgot-password', auth: false },
  { path: '/verify-email', name: 'verify-email', auth: false },
  { path: '/status', name: 'status', auth: false },
  { path: '/docs', name: 'docs', auth: false },
  { path: '/app', name: 'app-overview', auth: true },
  { path: '/app/instances', name: 'app-instances', auth: true },
  // The detail page of an instance, when the account has one.
  ...(process.env.BM_INSTANCE_PATH
    ? [{ path: process.env.BM_INSTANCE_PATH, name: 'app-instance-detail', auth: true }]
    : []),
  { path: '/app/domains', name: 'app-domains', auth: true },
  { path: '/app/billing', name: 'app-billing', auth: true },
  { path: '/app/tickets', name: 'app-tickets', auth: true },
  { path: '/app/settings', name: 'app-settings', auth: true },
  { path: '/admin', name: 'admin-overview', auth: true },
  { path: '/admin/customers', name: 'admin-customers', auth: true },
  { path: '/admin/orders', name: 'admin-orders', auth: true },
  { path: '/admin/services', name: 'admin-services', auth: true },
  { path: '/admin/products', name: 'admin-products', auth: true },
  { path: '/admin/pricing', name: 'admin-pricing', auth: true },
  { path: '/admin/tickets', name: 'admin-tickets', auth: true },
  { path: '/admin/promotions', name: 'admin-promotions', auth: true },
  { path: '/admin/infrastructure', name: 'admin-infrastructure', auth: true },
  { path: '/admin/audit', name: 'admin-audit', auth: true },
  { path: '/admin/staff', name: 'admin-staff', auth: true },
  { path: '/admin/settings', name: 'admin-settings', auth: true },
];

/**
 * Everything that is measured in the page. It runs in the browser and returns
 * plain data, so nothing of the DOM leaks into the report.
 */
const MEASURE = () => {
  const doc = document.documentElement;
  const width = window.innerWidth;

  /** The real test for sideways scrolling: can the page be pushed to the right? */
  window.scrollTo(9999, 0);
  const canScrollRight = window.scrollX;
  window.scrollTo(0, 0);

  /** True when an ancestor clips the element, so it may stick out on purpose. */
  const isClippedByAncestor = (element) => {
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) return true;
      parent = parent.parentElement;
    }
    return false;
  };

  /** The elements that stick out on the right. */
  const overflowing = [];
  for (const element of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.position === 'fixed') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // An element that scrolls on purpose is allowed to be wider than the page.
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
    // A strip that is clipped by its parent may stick out without a problem.
    if (isClippedByAncestor(element)) continue;
    if (rect.right > width + 1) {
      overflowing.push({
        tag: element.tagName.toLowerCase(),
        className: String(element.className).slice(0, 120),
        right: Math.round(rect.right),
      });
    }
  }

  /** The phone bottom bar and its tap targets. */
  const bar = document.querySelector('[data-bottom-nav]');
  let bottomNav = null;
  // On a wide screen the bar is hidden and the sidebar takes its place, so
  // there is nothing to measure.
  if (bar && getComputedStyle(bar).display !== 'none') {
    const rect = bar.getBoundingClientRect();
    const targets = [...bar.querySelectorAll('a, button')].map((item) => {
      const itemRect = item.getBoundingClientRect();
      return {
        label: (item.textContent || '').trim().slice(0, 24),
        width: Math.round(itemRect.width),
        height: Math.round(itemRect.height),
      };
    });
    const covered = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    bottomNav = {
      visible: rect.width > 0 && rect.height > 0,
      height: Math.round(rect.height),
      coveredBy: covered && !bar.contains(covered) ? covered.tagName.toLowerCase() : null,
      tooSmall: targets.filter((target) => target.height < 40 || target.width < 40),
      targets,
    };
  }

  /** The text that is cut off inside a box of a fixed size. */
  const clipped = [];
  for (const element of document.body.querySelectorAll('h1, h2, h3, p, span, li, td, th, label, a, button')) {
    const style = getComputedStyle(element);
    if (style.overflow === 'visible' || style.overflowY === 'visible') continue;
    if (style.textOverflow === 'ellipsis') continue;
    // The text that only exists for a screen reader is clipped on purpose.
    if (style.clipPath && style.clipPath.includes('inset')) continue;
    if (style.clip !== 'auto') continue;
    if (element.scrollWidth > element.clientWidth + 2 && element.clientWidth > 0) {
      clipped.push({
        tag: element.tagName.toLowerCase(),
        className: String(element.className).slice(0, 120),
        text: (element.textContent || '').trim().slice(0, 60),
      });
    }
  }

  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    canScrollRight,
    horizontalScroll: canScrollRight > 0,
    overflowing: overflowing.slice(0, 8),
    clipped: clipped.slice(0, 8),
    bottomNav,
  };
};

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const findings = [];

// One context for the whole run: the session is signed in once and the window
// is resized for every width. Signing in again for every width would eat the
// rate limit of the login endpoint.
const context = await browser.newContext({
  viewport: { width: WIDTHS[0], height: 800 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
});
const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url().slice(0, 120)}`);
});

if (EMAIL && PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  console.log(`signed in: ${page.url()}`);
}

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });

  for (const route of ROUTES) {
    if (route.auth && !EMAIL) continue;
    const entry = { path: route.path, width, errors: [], failed: [] };
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1200);
      const measured = await page.evaluate(MEASURE);
      Object.assign(entry, measured);
      entry.errors = consoleErrors.splice(0);
      entry.failed = failedRequests.splice(0);
      if (WANT_SHOTS) {
        const file = `${OUT_DIR}/${route.name}-${width}.png`;
        await page.screenshot({ path: file, fullPage: true });
        entry.shot = file;
      }
    } catch (error) {
      entry.errors = [`${error.message.split('\n')[0]}`];
    }
    findings.push(entry);

    const problems = [];
    if (entry.horizontalScroll) problems.push(`sideways scroll (${entry.scrollWidth}>${entry.clientWidth})`);
    if (entry.overflowing?.length) problems.push(`${entry.overflowing.length} element(s) out of the viewport`);
    if (entry.clipped?.length) problems.push(`${entry.clipped.length} clipped text`);
    if (entry.bottomNav?.tooSmall?.length) problems.push(`${entry.bottomNav.tooSmall.length} tap target(s) under 40px`);
    if (entry.bottomNav?.coveredBy) problems.push(`bottom bar covered by <${entry.bottomNav.coveredBy}>`);
    if (entry.errors?.length) problems.push(`${entry.errors.length} console error(s)`);
    console.log(
      `  ${String(width).padStart(4)}px ${route.path.padEnd(24)} ${problems.length ? '✗ ' + problems.join('; ') : 'ok'}`,
    );
  }
}

await context.close();

await browser.close();

fs.writeFileSync(`${OUT_DIR}/responsive-report.json`, JSON.stringify(findings, null, 2));

const broken = findings.filter(
  (entry) =>
    entry.horizontalScroll ||
    entry.overflowing?.length ||
    entry.clipped?.length ||
    entry.bottomNav?.tooSmall?.length ||
    entry.bottomNav?.coveredBy ||
    entry.errors?.length,
);
console.log(`\n${findings.length} checks, ${broken.length} with problems -> ${OUT_DIR}/responsive-report.json`);
for (const entry of broken) console.log(`  ${entry.width}px ${entry.path}`);
