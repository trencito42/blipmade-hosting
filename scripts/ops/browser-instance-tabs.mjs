/**
 * Walks the tabs of the instance page in a real browser.
 *
 * Every tab is opened, the page is given the time to answer and the result is
 * written down: the console errors, the horizontal scroll, the clipped text
 * and a picture of the tab.
 *
 * The tabs that need a server on the panel answer 503 while the key bridge of
 * the panel is not installed. That answer is expected and the page has to
 * show it as a state, not as a broken screen, so it is reported apart from the
 * failures of the layout.
 *
 * Environment:
 *   BM_BASE           the platform (default http://127.0.0.1:3000)
 *   BM_EMAIL          the customer account that signs in
 *   BM_PASSWORD       its password
 *   BM_INSTANCE_PATH  the path of the instance, for example /app/instances/<id>
 *   SHOT_DIR          where the images are written
 */
import fs from 'node:fs';

const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const INSTANCE_PATH = process.env.BM_INSTANCE_PATH ?? '';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/instance';

if (!EMAIL || !PASSWORD || !INSTANCE_PATH) {
  console.error('BM_EMAIL, BM_PASSWORD and BM_INSTANCE_PATH are needed.');
  process.exit(1);
}

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
];

const TABS = [
  'Overview',
  'Console',
  'Files',
  'Databases',
  'Backups',
  'Network',
  'Startup',
  'Schedules',
  'Settings',
  'Activity',
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const report = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));

  // The session.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => undefined);

  await page.goto(`${BASE}${INSTANCE_PATH}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  for (const tab of TABS) {
    const button = page.getByRole('tab', { name: tab, exact: true });
    if ((await button.count()) === 0) {
      report.push({ viewport: viewport.name, tab, found: false });
      continue;
    }
    errors.length = 0;
    await button.click();
    await page.waitForTimeout(1200);

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const clipped = [];
      for (const node of Array.from(document.querySelectorAll('button, a, h1, h2, h3, p, dt, dd, span'))) {
        const style = getComputedStyle(node);
        if (style.overflow === 'hidden' && style.textOverflow === 'ellipsis') continue;
        if (node.scrollWidth > node.clientWidth + 2 && node.clientWidth > 0) {
          const text = (node.textContent ?? '').trim();
          if (text) clipped.push(text.slice(0, 60));
        }
      }
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        horizontalScroll: root.scrollWidth > root.clientWidth + 1,
        clipped: clipped.slice(0, 5),
      };
    });

    const file = `${OUT_DIR}/${viewport.name}-${tab.toLowerCase()}.png`;
    await page.screenshot({ path: file, fullPage: true });

    report.push({
      viewport: viewport.name,
      tab,
      found: true,
      horizontalScroll: layout.horizontalScroll,
      clipped: layout.clipped,
      // The 503 of the panel is the honest state while the key bridge of the
      // panel is not installed. It is told apart from a failure of the page.
      panelUnavailable: errors.some((line) => line.includes('503')),
      errors: errors.filter((line) => !line.includes('503')),
    });
  }

  await context.close();
}

await browser.close();

fs.writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));

const problems = report.filter(
  (row) => row.horizontalScroll || row.clipped.length > 0 || row.errors.length > 0 || row.found === false,
);
console.log(`${report.length} tabs checked, ${problems.length} with problems`);
for (const row of problems) console.log(' -', JSON.stringify(row));

process.exit(problems.length === 0 ? 0 : 1);
