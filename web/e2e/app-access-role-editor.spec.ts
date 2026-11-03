import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'owner', email: 'owner@example.test', firstName: 'Access', lastName: 'Owner', name: 'Access Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const ACCESS = { members: [{ id: 'share-1', role: 'viewer', email: 'friend@example.test', name: 'Friend', since: '2026-10-01T00:00:00Z' }], invites: [] };
async function json(route: Route, body: unknown) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onPatch?: (body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/access' && req.method() === 'GET') return json(route, ACCESS);
    if (path === '/instances/instance-1/access/share-1' && req.method() === 'PATCH') { onPatch?.(req.postDataJSON() as Record<string, unknown>); return json(route, { id: 'share-1', role: 'manager' }); }
    return json(route, {});
  });
}
test.describe('dedicated access role editor', () => {
  test('changes the role of a member', async ({ page }) => {
    let payload: Record<string, unknown> | undefined; await stub(page, (body) => { payload = body; });
    await page.goto('/app/instances/instance-1/access/share-1/edit');
    await expect(page.getByText('friend@example.test')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save role' })).toBeDisabled();
    await page.getByLabel(/Manager/).check();
    await page.getByRole('button', { name: 'Save role' }).click();
    await expect(page).toHaveURL(/instances\/instance-1\/access$/);
    expect(payload).toEqual({ role: 'manager' });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await stub(page);
    await page.goto('/app/instances/instance-1/access/share-1/edit');
    await expect(page.getByRole('button', { name: 'Save role' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
