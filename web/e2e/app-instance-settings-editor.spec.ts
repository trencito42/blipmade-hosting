import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'instance-owner', email: 'owner@example.test', firstName: 'Instance', lastName: 'Owner', name: 'Instance Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onPatch?: (body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/settings' && req.method() === 'GET') return json(route, { name: 'Production API', description: 'Handles customer traffic', suspended: false, can_reinstall: true, egg: 'node', docker_image: 'node:22', limits: { memory: 2048, disk: 10240 } });
    if (path === '/instances/instance-1/settings' && req.method() === 'PATCH') { const body = req.postDataJSON() as Record<string, unknown>; onPatch?.(body); return json(route, { name: body.name, description: body.description, suspended: false, can_reinstall: true, egg: 'node', docker_image: 'node:22', limits: { memory: 2048, disk: 10240 } }); }
    return json(route, {});
  });
}
test.describe('dedicated instance settings editor', () => {
  test('loads current values, validates and patches the exact settings contract', async ({ page }) => {
    let payload: Record<string, unknown> | undefined; await stub(page, (body) => { payload = body; });
    await page.goto('/app/instances/instance-1/settings/edit');
    await expect(page.getByLabel('Name')).toHaveValue('Production API');
    await page.getByLabel('Name').fill('Production API v2'); await page.getByLabel('Description').fill('Primary customer traffic');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.waitForURL('**/app/instances/instance-1/settings');
    expect(payload).toEqual({ name: 'Production API v2', description: 'Primary customer traffic' });
  });
  test('guards a dirty draft and remains usable at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto('/app/instances/instance-1/settings/edit');
    await page.getByLabel('Name').fill('Unsaved name');
    page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('Discard these instance settings'); await dialog.dismiss(); });
    await page.getByRole('link', { name: 'Back to instance settings' }).click();
    await expect(page).toHaveURL(/settings\/edit$/); await expect(page.getByRole('button', { name: 'Save settings' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
