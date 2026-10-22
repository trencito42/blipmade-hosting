/**
 * Reads the live container state of a server through the panel's Client API.
 *
 * The Application API does not expose runtime state, so a panel session is
 * used exactly the way the panel's own UI does.
 */
import fs from 'node:fs';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.PTERODACTYL_URL ?? 'https://panel.blipmade.com';
const EMAIL = process.env.PANEL_EMAIL ?? 'blipmade-ops@blipmade.test';
const PASSWORD = process.env.PANEL_PASSWORD ?? 'BmOps-Verify-2026!';
const SERVER_UUID = process.env.PROBE_SERVER_UUID ?? '';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('input[name="username"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(3000);

  const xsrf = (await context.cookies(BASE)).find((c) => c.name === 'XSRF-TOKEN');
  const headers = { Accept: 'application/json' };
  if (xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrf.value);

  const info = await context.request.get(`${BASE}/api/client/servers/${SERVER_UUID}`);
  const body = await info.json();
  const attrs = body.attributes ?? body;
  console.log('=== server state ===');
  console.log(JSON.stringify({
    state: attrs.state,
    is_suspended: attrs.is_suspended,
    utilization: attrs.utilization,
    invocation: attrs.invocation,
    limits: attrs.limits,
    allocation: attrs.allocation,
    feature_limits: attrs.feature_limits,
    docker_image: attrs.docker_image,
    installed: attrs.installed,
  }, null, 2));

  for (const suffix of ['resources', 'files?page=1', 'websocket']) {
    const res = await context.request.get(`${BASE}/api/client/servers/${SERVER_UUID}/${suffix}`);
    const text = await res.text();
    console.log(`\n=== /${suffix} -> ${res.status()}`);
    console.log(text.slice(0, 700));
  }
} catch (error) {
  console.log('failed:', error.message);
} finally {
  await browser.close();
}
