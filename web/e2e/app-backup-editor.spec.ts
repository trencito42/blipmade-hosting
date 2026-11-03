import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'backup-owner', email: 'backup@example.test', firstName: 'Backup', lastName: 'Owner', name: 'Backup Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onCreate?: (body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/backups' && req.method() === 'GET') return json(route, { backups: [{ id: 'backup-1', name: 'Existing', size: 1000, created_at: '2026-11-03T10:00:00Z', is_locked: false, kind: 'manual' }], limit: 5, storage: 'node', preset: 'off', lastRun: null, nextRun: null });
    if (path === '/instances/instance-1/backups' && req.method() === 'POST') { const body = req.postDataJSON() as Record<string, unknown>; onCreate?.(body); return json(route, { backup: { id: 'backup-2', name: body.name } }, 202); }
    return json(route, {});
  });
}
test.describe('dedicated backup editor', () => {
  test('validates and sends the exact asynchronous backup request', async ({ page }) => {
    let payload: Record<string, unknown> | undefined; await stub(page, (body) => { payload = body; }); await page.goto('/app/instances/instance-1/backups/new');
    await page.getByRole('button', { name: 'Create backup' }).click(); await expect(page.getByText('Enter a name for this backup.')).toBeVisible();
    await page.getByLabel('Backup name').fill('Before upgrade'); await page.getByText('Lock this backup').click(); await page.getByRole('button', { name: 'Create backup' }).click();
    await page.waitForURL('**/app/instances/instance-1/backups'); expect(payload).toEqual({ name: 'Before upgrade', locked: true });
  });
  test('guards a draft and fits at 390px', async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto('/app/instances/instance-1/backups/new'); await page.getByLabel('Backup name').fill('Draft'); page.once('dialog', async (dialog) => dialog.dismiss()); await page.getByRole('link', { name: 'Back to backups' }).click(); await expect(page).toHaveURL(/backups\/new$/); await expect(page.getByRole('button', { name: 'Create backup' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false); });
});
