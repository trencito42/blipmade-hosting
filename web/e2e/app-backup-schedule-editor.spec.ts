import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'schedule-owner', email: 'schedule@example.test', firstName: 'Schedule', lastName: 'Owner', name: 'Schedule Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onSave?: (body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/backups' && req.method() === 'GET') return json(route, { backups: [], limit: 5, storage: 'node', preset: 'off', lastRun: '2026-11-02T03:30:00Z', nextRun: null });
    if (path === '/instances/instance-1/backup-schedule' && req.method() === 'PUT') { const body = req.postDataJSON() as Record<string, unknown>; onSave?.(body); return json(route, { preset: body.preset }); }
    return json(route, {});
  });
}
test.describe('dedicated backup schedule editor', () => {
  test('sends the exact supported preset', async ({ page }) => {
    let payload: Record<string, unknown> | undefined; await stub(page, (body) => { payload = body; }); await page.goto('/app/instances/instance-1/backup-schedule/edit');
    await expect(page.getByRole('button', { name: 'Save schedule' })).toBeDisabled();
    await page.getByText('Every Sunday', { exact: true }).click(); await page.getByRole('button', { name: 'Save schedule' }).click();
    await page.waitForURL('**/app/instances/instance-1/backups'); expect(payload).toEqual({ preset: 'weekly' });
  });
  test('guards a changed schedule and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto('/app/instances/instance-1/backup-schedule/edit'); await page.getByText('Every day', { exact: true }).click();
    page.once('dialog', async (dialog) => dialog.dismiss()); await page.getByRole('link', { name: 'Back to backups' }).click(); await expect(page).toHaveURL(/backup-schedule\/edit$/); await expect(page.getByRole('button', { name: 'Save schedule' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
