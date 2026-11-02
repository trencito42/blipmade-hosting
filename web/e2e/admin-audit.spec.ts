import { readFileSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * A look at every screen of the back office in a real browser.
 *
 * It runs against a disposable stack (see scripts/admin-audit.sh), signs in as the administrator that
 * the seed created, opens every admin route on a desktop and on a phone, and records what is wrong:
 * errors in the console, requests that failed, screens that show an error state, a page that scrolls
 * sideways, and a page with no heading. It writes a report and a screenshot of each screen.
 */

const seed = JSON.parse(readFileSync(process.env.AUDIT_SEED ?? 'admin-audit-seed.json', 'utf8')) as Record<string, string>;
const OUT = process.env.AUDIT_OUT ?? 'admin-audit-out';

const ROUTES = [
  '/admin', '/admin/customers', `/admin/customers/${seed.customerId}`, '/admin/orders', `/admin/orders/${seed.orderId}`,
  '/admin/services', `/admin/services/${seed.instanceId}`, '/admin/vps', '/admin/products', '/admin/pricing', '/admin/tickets',
  '/admin/knowledge', '/admin/promotions', `/admin/promotions/${seed.promotionId}`, '/admin/infrastructure', '/admin/incidents',
  '/admin/reports', '/admin/queues', '/admin/abuse', '/admin/ops', '/admin/mail', '/admin/mail/plans', '/admin/audit',
  '/admin/staff', '/admin/settings', '/admin/email-templates', '/admin/content', '/admin/tools', '/admin/notifications',
];

const BAD_TEXT = /could not be (loaded|read)|something went wrong|unexpected error|\bundefined\b|\[object Object\]|\bNaN\b/;

interface Finding { route: string; viewport: string; kind: string; detail: string }
const findings: Finding[] = [];

async function visit(page: Page, route: string, viewport: string) {
  const seen: Finding[] = [];
  const note = (kind: string, detail: string) => seen.push({ route, viewport, kind, detail: detail.slice(0, 300) });
  const onConsole = (message: import('@playwright/test').ConsoleMessage) => { if (message.type() === 'error') note('console', message.text()); };
  const onPageError = (error: Error) => note('pageerror', error.message);
  const onResponse = (response: import('@playwright/test').Response) => {
    const url = response.url();
    if (url.includes('/api/') && response.status() >= 400) note('http', `${response.status()} ${response.request().method()} ${new URL(url).pathname}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => note('slow', 'the network did not settle in 15 s'));
    await page.waitForTimeout(400);
    const text = await page.locator('body').innerText();
    const bad = text.match(BAD_TEXT);
    if (bad) note('text', `the screen shows "${bad[0]}"`);
    if (!(await page.locator('h1, h2, [role="heading"]').first().isVisible().catch(() => false))) note('structure', 'no heading is visible');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) note('layout', `the page scrolls sideways by ${overflow}px`);
    if (page.url().includes('/login')) note('auth', 'the screen sent the administrator to the login page');
    mkdirSync(`${OUT}/shots`, { recursive: true });
    await page.screenshot({ path: `${OUT}/shots/${viewport}${route.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
  findings.push(...seen);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  const login = await page.request.post('/api/auth/login', { data: { email: seed.adminEmail, password: seed.password } });
  expect(login.status(), 'the administrator can sign in').toBe(200);
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report.json`, JSON.stringify(findings, null, 2));
});

for (const [viewport, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`every admin screen opens on a ${viewport}`, async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await page.setViewportSize(size);
    for (const route of ROUTES) await visit(page, route, viewport);
    const hard = findings.filter((f) => f.viewport === viewport && ['pageerror', 'auth'].includes(f.kind));
    expect(hard, JSON.stringify(hard, null, 2)).toEqual([]);
  });
}

test('the new controls are on the screens that own them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const expectOn = async (route: string, text: string | RegExp) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(text).first(), `${route} shows ${text}`).toBeVisible({ timeout: 15_000 });
  };
  await expectOn('/admin/pricing', 'Yearly discount');
  await expectOn('/admin/pricing', 'Add-ons');
  await expectOn(`/admin/customers/${seed.customerId}`, 'Game panel access');
  await expectOn(`/admin/customers/${seed.customerId}`, 'Mark as paid');
  await expectOn('/admin/services', 'Import a server');
  await page.goto('/admin/content', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('option[value="site.announcement"]')).toHaveCount(1, { timeout: 15_000 });
  await expectOn('/admin/vps', 'Allocations');
});

test('the yearly discount can be set from the screen and is read back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/pricing', { waitUntil: 'domcontentloaded' });
  const field = page.getByLabel('Percent (0 to 50)');
  await field.fill('12');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/12% off/)).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Percent (0 to 50)')).toHaveValue('12');
  await field.fill('0');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/discount is off/)).toBeVisible({ timeout: 10_000 });
});

test('an open invoice can be marked as paid from the customer screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/customers/${seed.customerId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Mark as paid' }).first().click();
  await page.getByRole('textbox').last().fill('BANK-TRANSFER-0001');
  await page.getByRole('button', { name: 'Mark as paid' }).last().click();
  await expect(page.getByText(/INV-AUDIT-1 is paid/)).toBeVisible({ timeout: 10_000 });
});

async function setDiscount(page: Page, value: number) {
  const state = await page.request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === 'bm_csrf')?.value ?? '';
  return page.request.put('/api/admin/settings', { headers: { 'X-CSRF-Token': csrf }, data: { 'pricing.yearly_discount_percent': { value } } });
}

test('a customer can choose a yearly term on Deploy and the price follows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const set = await setDiscount(page, 10);
  expect(set.status(), 'the administrator can set the discount').toBe(200);
  try {
    const login = await page.request.post('/api/auth/login', { data: { email: 'customer@audit.test', password: seed.password } });
    expect(login.status(), 'the customer can sign in').toBe(200);

    const quoted: { period?: string; total: number; items: { breakdown?: { discount?: number } }[] }[] = [];
    page.on('response', async (response) => {
      if (response.url().endsWith('/api/catalog/quote') && response.ok()) quoted.push(await response.json());
    });

    await page.goto('/app/deploy/audit-bot', { waitUntil: 'domcontentloaded' });
    const monthly = page.getByRole('radio', { name: 'Monthly' });
    const yearly = page.getByRole('radio', { name: 'Yearly' });
    await expect(monthly).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
    await expect(page.getByText('Total per month').first()).toBeVisible();

    await yearly.click();
    await expect(yearly).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Total per year').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Yearly discount').first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/shots/deploy-yearly.png`, fullPage: true });

    const month = quoted.find((entry) => entry.period === 'MONTHLY');
    const year = quoted.find((entry) => entry.period === 'YEARLY');
    expect(month, 'a monthly quote was asked for').toBeTruthy();
    expect(year, 'a yearly quote was asked for').toBeTruthy();
    expect(year!.total).toBe(Math.round(month!.total * 12 * 0.9));
    expect(year!.items[0].breakdown?.discount).toBeLessThan(0);

    await monthly.click();
    await expect(page.getByText('Total per month').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Yearly discount')).toHaveCount(0);
  } finally {
    await page.request.post('/api/auth/login', { data: { email: seed.adminEmail, password: seed.password } });
    await setDiscount(page, 0);
  }
});

test('a customer can choose a yearly term for a virtual server', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const login = await page.request.post('/api/auth/login', { data: { email: 'customer@audit.test', password: seed.password } });
  expect(login.status(), 'the customer can sign in').toBe(200);
  await page.goto('/app/vps/new', { waitUntil: 'domcontentloaded' });
  const monthly = page.getByRole('radio', { name: 'Monthly' });
  const yearly = page.getByRole('radio', { name: 'Yearly' });
  await expect(monthly).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
  await expect(page.getByText('a month').first()).toBeVisible();
  await yearly.click();
  await expect(yearly).toHaveAttribute('aria-checked', 'true');
  // 12 x 2.49 = 29.88, from the server's quote.
  await expect(page.getByText('a year').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/29[.,]88/).first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/shots/vps-yearly.png`, fullPage: true });
});
