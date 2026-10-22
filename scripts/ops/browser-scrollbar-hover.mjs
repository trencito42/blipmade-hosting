/**
 * Captures the scrollbar in its resting and hovered state.
 *
 * The mouse is placed directly over the thumb at the top of the track, then
 * the same strip is captured again after the pointer leaves it.
 */
import fs from 'node:fs';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'http://10.77.0.13:3000';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  ignoreDefaultArgs: ['--hide-scrollbars'],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const width = page.viewportSize().width;
const clip = { x: width - 30, y: 0, width: 30, height: 260 };

try {
  await page.goto(`${BASE}/docs`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(600);

  await page.mouse.move(width - 200, 400);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT_DIR}/scrollbar-rest.png`, clip });
  console.log('rest ->', `${OUT_DIR}/scrollbar-rest.png`);

  // Walk the pointer down the scrollbar track until it sits on the thumb.
  for (const y of [20, 40, 60, 90, 120]) {
    await page.mouse.move(width - 5, y);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT_DIR}/scrollbar-hover.png`, clip });
  console.log('hover ->', `${OUT_DIR}/scrollbar-hover.png`);
} catch (error) {
  console.log('failed:', error.message);
} finally {
  await browser.close();
}
