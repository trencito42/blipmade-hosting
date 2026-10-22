/**
 * Captures the Blipmade customer and admin areas at phone and desktop widths.
 *
 * The four states the design system asks for (loading, empty, error,
 * populated) are exercised by signing in, so the screenshots show real data
 * instead of placeholders.
 *
 * Environment:
 *   BM_BASE       the platform (default http://127.0.0.1:3000)
 *   BM_EMAIL      the account that signs in (optional, the public pages are
 *                 captured without it)
 *   BM_PASSWORD   its password (optional, never printed)
 *   SHOT_DIR      where the images are written
 */
import fs from 'node:fs';

const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots';

if (!EMAIL || !PASSWORD) {
  console.log('warning: BM_EMAIL and BM_PASSWORD are not set.');
  console.log('Only the public pages are captured; the signed-in areas are skipped.');
}

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

const PAGES = [
  { path: '/', name: 'home', auth: false },
  { path: '/login', name: 'login', auth: false },
  { path: '/register', name: 'register', auth: false },
  { path: '/status', name: 'status', auth: false },
  { path: '/docs', name: 'docs', auth: false },
  { path: '/app', name: 'app-overview', auth: true },
  { path: '/app/instances', name: 'app-instances', auth: true },
  { path: '/app/billing', name: 'app-billing', auth: true },
  { path: '/app/tickets', name: 'app-tickets', auth: true },
  { path: '/app/settings', name: 'app-settings', auth: true },
  { path: '/admin', name: 'admin-overview', auth: true },
  { path: '/admin/products', name: 'admin-products', auth: true },
  { path: '/admin/orders', name: 'admin-orders', auth: true },
  { path: '/admin/customers', name: 'admin-customers', auth: true },
  { path: '/admin/infrastructure', name: 'admin-infrastructure', auth: true },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
});

const results = [];

for (const viewport of VIEWPORTS) {
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

  // Sign in once per viewport so the guarded pages show real data.
  if (EMAIL && PASSWORD) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('input[name="email"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').click(),
    ]);
    await page.waitForTimeout(2500);
    console.log(`[${viewport.name}] after login:`, page.url());
  }

  for (const target of PAGES) {
    if (target.auth && !EMAIL) continue;
    try {
      await page.goto(`${BASE}${target.path}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1800);
      const file = `${OUT_DIR}/${target.name}-${viewport.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const size = fs.statSync(file).size;
      console.log(`  ${target.path} -> ${file} (${Math.round(size / 1024)} kB)`);
      results.push({ path: target.path, viewport: viewport.name, file });
    } catch (error) {
      console.log(`  ${target.path} FAILED: ${error.message}`);
    }
  }

  await context.close();
}

await browser.close();
fs.writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(results, null, 2));
console.log(`\ncaptured ${results.length} screenshots -> ${OUT_DIR}`);
