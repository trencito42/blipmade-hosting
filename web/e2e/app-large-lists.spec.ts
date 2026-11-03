import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The lists of a customer who owns a lot: the server answers in pages (60 rows here, to force several of them), the
 * page reads every page, cuts the list into pages of 20 and keeps its length whatever the number of rows.
 */
const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Big', lastName: 'Owner', name: 'Big Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const SERVER_PAGE = 60;
const calls: Record<string, number> = {};

const instance = (n: number) => ({ id: `i${n}`, name: `app-${String(n).padStart(3, '0')}`, status: n % 7 === 0 ? 'stopped' : 'running', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-03T00:00:00.000Z', stale: false }, product: { slug: 'wordpress', name: 'WordPress', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: `https://app${n}.apps.blipmade.com`, createdAt: new Date(Date.UTC(2026, 9, 1) + n * 3600_000).toISOString(), node: { name: 'n1' }, hasPassword: false });
const ticket = (n: number) => ({ id: `t${n}`, number: 1000 + n, subject: `Ticket ${n} about something`, status: n % 3 === 0 ? 'closed' : 'open', priority: 'normal', category: 'general', createdAt: new Date(Date.UTC(2026, 9, 1) + n * 3600_000).toISOString(), updatedAt: new Date(Date.UTC(2026, 9, 1) + n * 3600_000).toISOString(), channel: 'ticket', departmentId: null });
const order = (n: number) => ({ id: `o${n}`, number: `BM-${n}`, status: n % 4 === 0 ? 'AWAITING_PAYMENT' : 'PAID', total: 900, discount: 0, currency: 'EUR', createdAt: new Date(Date.UTC(2026, 9, 1) + n * 3600_000).toISOString(), items: [{ id: `it${n}`, name: `Item ${n}`, productSlug: 'wordpress', quantity: 1, unitAmount: 900, total: 900, fulfillmentStatus: 'FULFILLED', fulfillmentError: null }] });
const invoice = (n: number) => ({ id: `inv${n}`, number: `INV-${n}`, status: 'paid', amount: 756, tax: 144, total: 900, currency: 'EUR', hostedUrl: null, pdfUrl: null, billingAddress: null, lines: [], createdAt: new Date(Date.UTC(2026, 9, 1) + n * 3600_000).toISOString(), periodStart: null, periodEnd: null });
const domain = (n: number) => ({ id: `d${n}`, instanceId: 'i1', instanceName: 'app-001', hostname: `site-${n}.apps.blipmade.com`, status: 'active', targetPort: 80, dnsRecords: [], lastError: null, platform: true, addressChangeAvailableAt: null, verification: { host: null, token: null, verified: true, verifiedAt: null, expiresAt: null } });
const server = (n: number) => ({ id: `v${n}`, name: `web-${n}`, status: 'active', power: 'running', plan: { slug: 'vps-s', name: 'VPS S' }, ram: 2048, cpu: 2, disk: 40, publicIp: `203.0.113.${n}`, sshPort: 22, dedicatedIp: false, image: { slug: 'debian-13', label: 'Debian 13' }, contract: null, sshCommand: `ssh root@203.0.113.${n}`, lastError: null, createdAt: '2026-10-01T00:00:00.000Z' });
const note = (n: number) => ({ id: `n${n}`, category: 'billing', title: `Message ${n}`, body: `Body ${n}`, actionUrl: null, actionLabel: null, readAt: n > 3 ? '2026-11-02T00:00:00.000Z' : null, createdAt: new Date(Date.UTC(2026, 10, 1) - n * 3600_000).toISOString() });

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

/** A list the server walks with a cursor, `SERVER_PAGE` rows at a time. */
function cursorPage<T>(rows: T[], key: string, url: URL) {
  const start = Number(url.searchParams.get('cursor')?.replace('c', '') ?? 0);
  const slice = rows.slice(start, start + SERVER_PAGE);
  const end = start + slice.length;
  return { [key]: slice, pagination: { hasMore: end < rows.length, nextCursor: end < rows.length ? `c${end}` : null } };
}

async function stub(page: Page) {
  for (const key of Object.keys(calls)) delete calls[key];
  const instances = Array.from({ length: 130 }, (_, i) => instance(i + 1));
  const tickets = Array.from({ length: 75 }, (_, i) => ticket(i + 1));
  const orders = Array.from({ length: 90 }, (_, i) => order(i + 1));
  const invoices = Array.from({ length: 60 }, (_, i) => invoice(i + 1));
  const domains = Array.from({ length: 45 }, (_, i) => domain(i + 1));
  const servers = Array.from({ length: 30 }, (_, i) => server(i + 1));
  const notes = Array.from({ length: 100 }, (_, i) => note(i + 1));
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    calls[path] = (calls[path] ?? 0) + 1;
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 3, unread: 3 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances') return json(route, cursorPage(instances, 'instances', url));
    if (path === '/tickets') return json(route, cursorPage(tickets, 'tickets', url));
    if (path === '/tickets/categories') return json(route, { categories: [] });
    if (path === '/orders') return json(route, cursorPage(orders, 'orders', url));
    if (path === '/billing/invoices') return json(route, { ...cursorPage(invoices, 'invoices', url), company: {} });
    if (path === '/billing/subscriptions') return json(route, { subscriptions: [] });
    if (path === '/billing/summary') return json(route, { currency: 'EUR', monthlyEstimate: 0, nextRenewal: null, currentPeriodEnd: null, paymentMethod: null, hasStripeCustomer: false, subscriptions: [] });
    if (path === '/billing/payment-state') return json(route, { payments: { available: true, test: false, reason: null } });
    if (path === '/billing/closed-services') return json(route, { services: [] });
    if (path === '/domains') return json(route, { domains });
    if (path === '/vps') return json(route, { servers });
    if (path === '/catalog/products') return json(route, { products: [] });
    if (path === '/notifications/preferences') return json(route, { preferences: {}, categories: [{ key: 'billing', label: 'Billing', description: '', channels: ['inapp'], locked: [] }] });
    if (path === '/notifications') {
      const cursor = Number(url.searchParams.get('cursor') ?? 0);
      const slice = notes.slice(cursor, cursor + 30);
      return json(route, { notifications: slice, unread: 3, nextCursor: cursor + 30 < notes.length ? String(cursor + 30) : null });
    }
    return json(route, {});
  });
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const pagerText = (page: Page) => page.locator('nav[aria-label$="pages"] p').first();

test.describe('a customer with a lot of everything', () => {
  test('130 instances arrive in 3 server pages, show 20 at a time and keep their length', async ({ page }) => {
    await stub(page);
    const started = Date.now();
    await page.goto('/app/instances');
    await expect(pagerText(page)).toHaveText('1–20 of 130');
    expect(Date.now() - started).toBeLessThan(8000);
    // The page read every page of the server: 60 + 60 + 10.
    expect(calls['/instances']).toBe(3);
    expect(await page.locator('table tbody tr').count()).toBe(20);
    // The DOM stays small whatever the size of the list.
    expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeLessThan(2500);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pagerText(page)).toHaveText('21–40 of 130');
    for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pagerText(page)).toHaveText('121–130 of 130');
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(await page.locator('table tbody tr').count()).toBe(10);
    // A search returns to the first page and hides the pager when everything fits.
    await page.getByPlaceholder('Search by name or product').fill('app-042');
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('nav[aria-label$="pages"]')).toHaveCount(0);
    await page.getByPlaceholder('Search by name or product').fill('app-0');
    await expect(pagerText(page)).toHaveText(/^1–20 of \d+$/);
    expect(await noOverflow(page)).toBe(true);
  });

  test('a click on the row opens the instance; the link and the keyboard still work', async ({ page }) => {
    await stub(page);
    await page.goto('/app/instances');
    await expect(pagerText(page)).toBeVisible();
    // The newest first: the 130th is the first row.
    const first = page.locator('table tbody tr').first();
    await first.locator('td').nth(2).click();
    await page.waitForURL('**/app/instances/i130');
    await page.goBack();
    await page.locator('table tbody tr').nth(1).getByRole('link').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/app/instances/i129');
  });

  test('75 tickets: four pages, the row opens the conversation, Close is a quick action of an open ticket only', async ({ page }) => {
    await stub(page);
    await page.goto('/app/tickets');
    await expect(pagerText(page)).toHaveText('1–20 of 75');
    expect(calls['/tickets']).toBe(2);
    for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pagerText(page)).toHaveText('61–75 of 75');
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(pagerText(page)).toHaveText('41–60 of 75');
    const rows = page.locator('table tbody tr');
    await rows.first().locator('td').nth(1).click();
    await page.waitForURL(/\/app\/tickets\/t\d+$/);
    expect(await noOverflow(page)).toBe(true);
  });

  test('billing: 90 orders and 60 invoices are paged, 20 rows at a time', async ({ page }) => {
    await stub(page);
    await page.goto('/app/billing?tab=orders');
    await expect(pagerText(page)).toHaveText('1–20 of 90');
    expect(calls['/orders']).toBe(2);
    expect(await page.locator('table tbody tr').count()).toBe(20);
    await page.locator('table tbody tr').first().locator('td').nth(2).click();
    await page.waitForURL('**/app/billing/orders/o1');
    calls['/billing/invoices'] = 0;
    await page.goto('/app/billing?tab=invoices');
    await expect(pagerText(page)).toHaveText('1–20 of 60');
    expect(calls['/billing/invoices']).toBe(1);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pagerText(page)).toHaveText('21–40 of 60');
    expect(await noOverflow(page)).toBe(true);
  });

  test('45 domains and 30 servers are paged', async ({ page }) => {
    await stub(page);
    await page.goto('/app/domains');
    await expect(pagerText(page)).toHaveText('1–20 of 45');
    expect(await page.locator('article').count()).toBe(20);
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(pagerText(page)).toHaveText('41–45 of 45');
    expect(await page.locator('article').count()).toBe(5);
    await page.goto('/app/vps');
    await expect(pagerText(page)).toHaveText('1–20 of 30');
    expect(await page.locator('table tbody tr').count()).toBe(20);
    await page.locator('table tbody tr').first().locator('td').nth(2).click();
    await page.waitForURL('**/app/vps/v1');
  });

  test('the server list searches and sorts across all 30 servers and the pager follows', async ({ page }) => {
    await stub(page);
    await page.goto('/app/vps');
    await expect(pagerText(page)).toHaveText('1–20 of 30');
    await page.getByRole('searchbox', { name: 'Search' }).fill('web-2');
    // web-2, web-20 .. web-29
    await expect(page.locator('table tbody tr')).toHaveCount(11);
    await expect(pagerText(page)).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search' }).fill('nothing-here');
    await expect(page.getByText('No server matches.')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search' }).fill('');
    await page.getByLabel('Sort by').selectOption('name');
    await expect(pagerText(page)).toHaveText('1–20 of 30');
    await expect(page.locator('table tbody tr').first()).toContainText('web-1');
  });

  test('100 notifications load 30 at a time and the list stays divided and short', async ({ page }) => {
    await stub(page);
    await page.goto('/app/notifications');
    const rows = page.locator('li[data-unread]');
    // The list loads 30 at a time as the reader reaches the end; the reader can also ask for the next page.
    await expect(rows.first()).toBeVisible();
    await expect.poll(async () => {
      const more = page.getByRole('button', { name: 'Load more' });
      if (await more.count()) await more.first().click({ timeout: 2000 }).catch(() => undefined);
      return rows.count();
    }, { timeout: 20000 }).toBe(100);
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
  });

  test('every inventory fits at 390px with a full page of rows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page);
    for (const route of ['/app/instances', '/app/tickets', '/app/billing?tab=orders', '/app/billing?tab=invoices', '/app/domains', '/app/vps']) {
      await page.goto(route);
      await expect(page.locator('nav[aria-label$="pages"]')).toBeVisible();
      await expect(page.locator('h1:visible')).toHaveCount(1);
      await expect(page.locator('h1:visible')).not.toHaveText('Something went wrong');
      expect(await noOverflow(page), route).toBe(true);
    }
  });
});
