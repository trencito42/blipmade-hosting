import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Over', lastName: 'Owner', name: 'Over Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const instance = (n: number) => ({ id: `i${n}`, name: ['Shop', 'Blog', 'Docs'][n - 1], status: 'running', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-03T00:00:00.000Z', stale: false }, product: { slug: 'wordpress', name: 'WordPress', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: `https://shop${n}.apps.blipmade.com`, createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false });

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances') return json(route, { instances: [1, 2, 3].map(instance) });
    if (path === '/vps') return json(route, { servers: [] });
    if (path === '/mail/services') return json(route, { services: [] });
    if (path === '/billing/summary') return json(route, { currency: 'EUR', monthlyEstimate: 2700, nextRenewal: { at: '2026-12-01T00:00:00.000Z', amount: 900, currency: 'EUR', subscriptionId: 's1' }, currentPeriodEnd: null, paymentMethod: null, hasStripeCustomer: false, subscriptions: [] });
    if (path === '/catalog/products') return json(route, { products: [] });
    return json(route, {});
  });
}

test('the services of the overview are divided rows that link to the service', async ({ page }) => {
  await stub(page);
  await page.goto('/app');
  const rows = page.locator('main ul > li').filter({ has: page.locator('a[href^="/app/instances/"]') });
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('a')).toHaveAttribute('href', '/app/instances/i1');
  const metrics = await rows.evaluateAll((nodes) => nodes.map((node) => ({ height: Math.round(node.getBoundingClientRect().height), top: getComputedStyle(node).borderTopWidth, bottom: getComputedStyle(node).borderBottomWidth, background: getComputedStyle(node.querySelector('a')!).backgroundColor })));
  for (const row of metrics) expect(row.height).toBeLessThan(90);
  // A line between the rows, none above the first and none under the last; the rows are not cards.
  expect(metrics.map((row) => row.top)).toEqual(['0px', '1px', '1px']);
  expect(metrics.every((row) => row.bottom === '0px')).toBe(true);
  expect(metrics.every((row) => row.background === 'rgba(0, 0, 0, 0)')).toBe(true);
});

test('the overview fits at 390px with the rows divided', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app');
  await expect(page.locator('a[href="/app/instances/i1"]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
