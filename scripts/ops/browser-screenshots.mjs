/**
 * Captures the interface of the platform at a phone size and at a desktop
 * size, so the two can be compared.
 *
 * The guarded pages need a session, and the customer pages and the staff pages
 * need different sessions, so every role gets its own browser context.
 *
 * Environment:
 *   BM_BASE            the platform (default http://127.0.0.1:3000)
 *   BM_EMAIL           the customer account that signs in (optional)
 *   BM_PASSWORD        its password (optional, never printed)
 *   BM_ADMIN_EMAIL     the staff account that signs in (optional)
 *   BM_ADMIN_PASSWORD  its password (optional, never printed)
 *   SHOT_DIR           where the images are written
 */
import fs from 'node:fs';

const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.BM_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.BM_ADMIN_PASSWORD ?? '';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots';

if (!EMAIL || !PASSWORD) {
  console.log('warning: BM_EMAIL and BM_PASSWORD are not set.');
}

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

/** The role says which session the page needs: none, a customer or a staff member. */
const PAGES = [
  { path: '/', name: 'home', role: null },
  { path: '/login', name: 'login', role: null },
  { path: '/register', name: 'register', role: null },
  { path: '/forgot-password', name: 'forgot-password', role: null },
  { path: '/status', name: 'status', role: null },
  { path: '/docs', name: 'docs', role: null },
  { path: '/app', name: 'app-overview', role: 'customer' },
  { path: '/app/instances', name: 'app-instances', role: 'customer' },
  { path: '/app/domains', name: 'app-domains', role: 'customer' },
  { path: '/app/billing', name: 'app-billing', role: 'customer' },
  { path: '/app/tickets', name: 'app-tickets', role: 'customer' },
  { path: '/app/settings', name: 'app-settings', role: 'customer' },
  { path: '/admin', name: 'admin-overview', role: 'admin' },
  { path: '/admin/customers', name: 'admin-customers', role: 'admin' },
  { path: '/admin/orders', name: 'admin-orders', role: 'admin' },
  { path: '/admin/services', name: 'admin-services', role: 'admin' },
  { path: '/admin/products', name: 'admin-products', role: 'admin' },
  { path: '/admin/pricing', name: 'admin-pricing', role: 'admin' },
  { path: '/admin/tickets', name: 'admin-tickets', role: 'admin' },
  { path: '/admin/infrastructure', name: 'admin-infrastructure', role: 'admin' },
  { path: '/admin/audit', name: 'admin-audit', role: 'admin' },
  { path: '/admin/staff', name: 'admin-staff', role: 'admin' },
  { path: '/admin/settings', name: 'admin-settings', role: 'admin' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

const results = [];

for (const viewport of VIEWPORTS) {
  /** One context per role, so the customer pages and the staff pages never share a session. */
  const contexts = new Map();

  for (const role of [null, 'customer', 'admin']) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
      locale: 'en-US',
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`  [console.error ${viewport.name}]`, msg.text().slice(0, 160));
    });

    const email = role === 'admin' ? ADMIN_EMAIL : EMAIL;
    const password = role === 'admin' ? ADMIN_PASSWORD : PASSWORD;
    if (role && email && password) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
        page.locator('button[type="submit"]').click(),
      ]);
      await page.waitForTimeout(2500);
      console.log(`[${viewport.name}] ${role} session:`, page.url());
    }

    contexts.set(role, { context, page });
  }

  for (const target of PAGES) {
    const { page } = contexts.get(target.role);
    if (target.role && !(target.role === 'admin' ? ADMIN_EMAIL : EMAIL)) continue;
    try {
      await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1800);
      const file = `${OUT_DIR}/${target.name}-${viewport.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const size = fs.statSync(file).size;
      console.log(`  ${target.path} -> ${file} (${Math.round(size / 1024)} kB)`);
      results.push({ path: target.path, viewport: viewport.name, role: target.role, file });
    } catch (error) {
      console.log(`  ${target.path} FAILED: ${error.message}`);
    }
  }

  for (const { context } of contexts.values()) await context.close();
}

await browser.close();
fs.writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(results, null, 2));
console.log(`\ncaptured ${results.length} screenshots -> ${OUT_DIR}`);
