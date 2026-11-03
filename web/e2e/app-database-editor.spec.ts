import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'database-owner', email: 'db@example.test', firstName: 'DB', lastName: 'Owner', name: 'DB Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onCreate?: (body: Record<string, unknown>) => void) {
  let created = false;
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/databases' && req.method() === 'GET') return json(route, { databases: created ? [{ id: 'db-1', name: 'shop', database: 'u1_shop', username: 'u1', host: 'db.internal', port: 3306, password: null }] : [], limit: 3 });
    if (path === '/instances/instance-1/databases' && req.method() === 'POST') { const body = req.postDataJSON() as Record<string, unknown>; onCreate?.(body); created = true; return json(route, { created: true }, 201); }
    if (path === '/instances/instance-1/databases/db-1/credentials') return json(route, { credentials: { host: 'db.internal', port: 3306, database: 'u1_shop', username: 'u1', password: 'db-secret-42' } });
    return json(route, {});
  });
}
test.describe('dedicated database editor', () => {
  test('creates, reloads provider state and displays generated credentials', async ({ page }) => {
    let payload: Record<string, unknown> | undefined; await stub(page, (body) => { payload = body; });
    await page.goto('/app/instances/instance-1/databases/new');
    await page.getByLabel('Database name').fill('shop'); await page.getByLabel('Allowed address').fill('*');
    await page.getByRole('button', { name: 'Create database' }).click();
    await expect(page.getByText('db-secret-42')).toBeVisible(); await expect(page.getByText('Unsaved changes')).toBeVisible();
    expect(payload).toEqual({ database: 'shop', remote: '%' });
    await page.getByRole('button', { name: 'I have stored the credentials' }).click(); await page.waitForURL('**/app/instances/instance-1/databases');
  });
  test('fits at 390px with action reachable', async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto('/app/instances/instance-1/databases/new'); await expect(page.getByRole('button', { name: 'Create database' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false); });
});
