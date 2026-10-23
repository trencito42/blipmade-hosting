import fs from 'node:fs';

/**
 * The browser tooling sits in its own directory on the host, so it is loaded
 * from there by its path.
 */
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

/**
 * The pages that were rebuilt: the empty state of the list of instances, the
 * page of a product and the catalog on a page of its own.
 *
 * The script looks at the pages a customer sees, takes a picture of each one
 * and reports what it finds. It never clicks on something that costs money.
 */

const BASE = process.env.BM_BASE ?? 'http://10.77.0.13:3000';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const SHOT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/new';

const problems = [];
const notes = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console error: ${message.text().slice(0, 160)}`);
});
page.on('pageerror', (error) => problems.push(`page error: ${String(error).slice(0, 160)}`));

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

// --- sign in ----------------------------------------------------------------

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/app(\/|$)/, { timeout: 15000 });
notes.push('signed in');

// --- the empty state of the instances ---------------------------------------

await page.goto(`${BASE}/app/instances`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const emptyText = await page.innerText('body');
check(/deploy/i.test(emptyText), 'the empty state of the instances does not offer anything to deploy');
await shot('instances-empty');

// The button of the empty state must lead to the catalog, not to one product.
const deployLinks = await page.$$eval('a[href*="/app/deploy/"], a[href*="/apps"]', (nodes) =>
  nodes.map((node) => node.getAttribute('href')),
);
notes.push(`links of the empty state: ${deployLinks.join(', ')}`);

// --- the page of a product --------------------------------------------------

await page.goto(`${BASE}/apps/discord-bot`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const productText = await page.innerText('body');
check(/discord/i.test(productText), 'the page of the product does not name the product');
check(/deploy/i.test(productText), 'the page of the product does not offer the deploy action');
await shot('product-discord-bot');

const productLinks = await page.$$eval('a', (nodes) => nodes.map((node) => node.getAttribute('href')).filter(Boolean));
notes.push(`links of the product page: ${productLinks.slice(0, 12).join(', ')}`);

// --- the catalog on a page of its own ---------------------------------------

await page.goto(`${BASE}/apps`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const catalogText = await page.innerText('body');
check(/discord/i.test(catalogText), 'the catalog does not list the product');
await shot('catalog');

// --- the deploy page and the promotion field --------------------------------

await page.goto(`${BASE}/app/deploy/discord-bot`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const deployText = await page.innerText('body');
check(
  !/is not valid/i.test(deployText),
  'the deploy page shows an error for the promotion code although no code was typed',
);
await shot('deploy-review');

// --- a narrow screen -------------------------------------------------------

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/apps/discord-bot`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 2, `the page of the product is ${overflow} pixels too wide on a small screen`);
await shot('product-mobile');

await browser.close();

console.log(notes.join('\n'));
console.log(`problems: ${problems.length}`);
for (const problem of problems) console.log(`- ${problem}`);
process.exit(problems.length ? 1 : 0);
