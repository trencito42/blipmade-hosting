import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'restore-owner', email: 'restore@example.test', firstName: 'Restore', lastName: 'Owner', name: 'Restore Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onRestore?: () => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/backups' && req.method() === 'GET') return json(route, { backups: [{ id: 'backup-1', name: 'Before upgrade', size: 2048, created_at: '2026-11-03T10:00:00Z', is_locked: true, kind: 'manual' }], limit: 5, preset: 'off' });
    if (path === '/instances/instance-1/backups/backup-1/restore' && req.method() === 'POST') { onRestore?.(); return json(route, { restored: true }); }
    return json(route, {});
  });
}
test.describe('dedicated backup restore editor', () => {
  test('requires exact name and acknowledgement before restore', async ({ page }) => {
    let called = false; await stub(page, () => { called = true; }); await page.goto('/app/instances/instance-1/backups/backup-1/restore');
    const submit = page.getByRole('button', { name: 'Restore backup' }); await expect(submit).toBeDisabled();
    await page.getByLabel('Type “Before upgrade” to confirm').fill('Before upgrade'); await expect(submit).toBeDisabled();
    await page.getByText('I understand this replaces current files').click(); await submit.click(); await page.waitForURL('**/app/instances/instance-1/backups'); expect(called).toBe(true);
  });
  test('guards confirmation state and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto('/app/instances/instance-1/backups/backup-1/restore'); await page.getByLabel('Type “Before upgrade” to confirm').fill('Before');
    page.once('dialog', async (dialog) => dialog.dismiss()); await page.getByRole('link', { name: 'Back to backups' }).click(); await expect(page).toHaveURL(/backup-1\/restore$/); await expect(page.getByRole('button', { name: 'Restore backup' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
