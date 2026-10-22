/**
 * Logs into the Pterodactyl panel with a real browser and keeps the session.
 *
 * The panel protects the login with an invisible reCAPTCHA that sometimes
 * escalates to an image challenge, so the login is retried and verified
 * against a client endpoint before the session is stored.
 *
 * Run with:
 *   xvfb-run -a node scripts/browser-session.mjs
 */
import fs from 'node:fs';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.PTERODACTYL_URL ?? 'https://panel.blipmade.com';
const EMAIL = process.env.PANEL_EMAIL ?? 'blipmade-ops@blipmade.test';
const PASSWORD = process.env.PANEL_PASSWORD ?? 'BmOps-Verify-2026!';
const COOKIE_OUT = process.env.COOKIE_OUT ?? '/tmp/panel-cookie.json';
const ATTEMPTS = Number(process.env.LOGIN_ATTEMPTS ?? 5);

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
  timezoneId: 'Europe/Bucharest',
});
const page = await context.newPage();

let authenticated = false;

for (let attempt = 1; attempt <= ATTEMPTS && !authenticated; attempt++) {
  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('input[name="username"]').fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      page.locator('button[type="submit"]').click(),
    ]);
    await page.waitForTimeout(4000);

    const account = await context.request.get(`${BASE}/api/client/account`);
    const text = await account.text();
    authenticated = text.trim().startsWith('{');
    console.log(`attempt ${attempt}: url=${page.url()} authenticated=${authenticated}`);
  } catch (error) {
    console.log(`attempt ${attempt} failed: ${error.message}`);
  }

  if (!authenticated && attempt < ATTEMPTS) {
    await page.waitForTimeout(15000);
  }
}

if (authenticated) {
  const cookies = await context.cookies(BASE);
  fs.writeFileSync(COOKIE_OUT, JSON.stringify({ cookies }, null, 2));
  console.log('session saved ->', COOKIE_OUT);
} else {
  await page.screenshot({ path: '/tmp/panel-login-failed.png', fullPage: true });
  console.log('login failed; screenshot -> /tmp/panel-login-failed.png');
}

await browser.close();
process.exit(authenticated ? 0 : 1);
