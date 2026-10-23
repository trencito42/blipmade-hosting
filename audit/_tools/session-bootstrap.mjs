import fs from 'node:fs';

/**
 * Signs in once per role and saves the storage state, so the other scripts of
 * the audit never have to sign in again.
 *
 * The login endpoint allows ten attempts every fifteen minutes for an
 * address. One sign-in per role and the rest of the audit reuses the cookie.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';

const ACCOUNTS = {
  customer: { email: process.env.BM_EMAIL, password: process.env.BM_PASSWORD },
  staff: { email: process.env.BM_ADMIN_EMAIL, password: process.env.BM_ADMIN_PASSWORD },
};

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
fs.mkdirSync(OUT, { recursive: true });

for (const [role, account] of Object.entries(ACCOUNTS)) {
  if (!account.email) {
    console.log(`skip ${role}: no credentials`);
    continue;
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|admin)(\/|$)/, { timeout: 25000 });
  const state = await context.storageState();
  fs.writeFileSync(`${OUT}/state-${role}.json`, JSON.stringify(state, null, 2));
  const user = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    return r.json();
  });
  console.log(`${role}: signed in, landed on ${new URL(page.url()).pathname}`);
  console.log(`  session user: ${JSON.stringify(user.user)}`);
  console.log(`  cookies: ${state.cookies.map((c) => c.name).join(', ')}`);
  await context.close();
}

await browser.close();
