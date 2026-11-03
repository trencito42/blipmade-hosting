import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Act', lastName: 'Owner', name: 'Act Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const instance = (n: number) => ({ id: `i${n}`, name: `app-${n}`, status: 'running', runtime: { state: 'running', condition: 'serving', checkedAt: null, stale: false }, product: { slug: 'wordpress', name: 'WordPress', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: null, createdAt: `2026-10-0${n}T00:00:00.000Z`, node: null, hasPassword: false });

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
    if (path === '/instances') return json(route, { instances: [1, 2].map(instance) });
    if (path === '/instances/i1/events') return json(route, { events: Array.from({ length: 15 }, (_, k) => ({ id: `e${k}`, type: 'power', message: `App event ${k}`, createdAt: `2026-11-01T10:${String(k).padStart(2, '0')}:00.000Z` })) });
    if (path === '/instances/i2/events') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'down' }) });
    if (path === '/vps') return json(route, { servers: [{ id: 'v1', name: 'web-1', status: 'active', power: 'running', plan: { slug: 'vps-s', name: 'VPS S' }, ram: 2048, cpu: 2, disk: 40, publicIp: null, sshPort: 22, dedicatedIp: false, contract: null, sshCommand: null, lastError: null, createdAt: '2026-10-01T00:00:00.000Z' }] });
    if (path === '/vps/v1/activity') return json(route, { activity: Array.from({ length: 10 }, (_, k) => ({ id: `a${k}`, text: `Server event ${k}`, byStaff: false, createdAt: `2026-11-02T10:${String(k).padStart(2, '0')}:00.000Z` })), next: null });
    return json(route, {});
  });
}

test('the activity merges apps and servers newest first, pages them, links to the service and says when a service could not be read', async ({ page }) => {
  await stub(page);
  await page.goto('/app/activity');
  const rows = page.locator('main li');
  await expect(rows.first()).toContainText('Server event 9');
  await expect(page.getByRole('status')).toContainText('Some services could not be read');
  await expect(page.locator('nav[aria-label="Activity pages"] p')).toHaveText('1–20 of 25');
  await expect(rows.first().getByRole('link', { name: 'web-1' })).toHaveAttribute('href', '/app/vps/v1?tab=activity');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('nav[aria-label="Activity pages"] p')).toHaveText('21–25 of 25');
  await expect(rows.last().getByRole('link', { name: 'app-1' })).toHaveAttribute('href', '/app/instances/i1/activity');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('the activity fits at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app/activity');
  await expect(page.locator('main li').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
