/**
 * Captures the hero and the catalog of the homepage, so the prices that the
 * page shows can be read from a screenshot.
 */
import fs from 'node:fs';

const BASE = process.env.BM_BASE ?? 'http://10.77.0.13:3000';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';
fs.mkdirSync(OUT_DIR, { recursive: true });

const PLAYWRIGHT =
  process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const apiCalls = [];
page.on('response', (response) => {
  const url = response.url();
  if (url.includes('/api/')) apiCalls.push(`${response.status()} ${url.replace(BASE, '')}`);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// The price line of the hero.
const priceLine = await page
  .locator('section')
  .first()
  .locator('p')
  .filter({ hasText: 'Apps from' })
  .first()
  .textContent()
  .catch(() => null);
console.log('hero price line:', priceLine?.trim());

// Every card of the catalog, with the price it shows.
const cards = await page.locator('#apps article, #apps [data-product], #apps > div > div').all();
const names = [];
for (const card of cards) {
  const text = (await card.textContent())?.replace(/\s+/g, ' ').trim();
  if (text && text.length < 400) names.push(text);
}
console.log('catalog cards:', names.length);
for (const name of names.slice(0, 12)) console.log('  -', name);

await page.locator('#apps').screenshot({ path: `${OUT_DIR}/catalog-desktop.png` }).catch(async () => {
  await page.screenshot({ path: `${OUT_DIR}/catalog-desktop.png` });
});
await page.locator('section').first().screenshot({ path: `${OUT_DIR}/hero-desktop.png` });

console.log('api calls:', [...new Set(apiCalls)].join(' | '));
await browser.close();
