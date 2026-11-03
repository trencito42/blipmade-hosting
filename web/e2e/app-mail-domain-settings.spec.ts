import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'domain-settings-customer', email: 'owner@example.test', firstName: 'Domain', lastName: 'Owner', name: 'Domain Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onDelete?: () => void) {
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/mail/domains/domain-1' && request.method() === 'GET') return json(route, { domain: { id: 'domain-1', name: 'example.com', status: 'active', quotaMb: 1024, usedMb: 100, maxMailboxes: 5, maxAliases: 10, mailboxes: 2, aliases: 3, dkimPublic: null, webmailUrl: null, lastError: null, createdAt: '2026-11-03T10:00:00.000Z' } });
    if (path === '/mail/domains/domain-1' && request.method() === 'DELETE') { onDelete?.(); return json(route, { ok: true }); }
    return json(route, {});
  });
}
test.describe('email domain deletion safety page', () => {
  test('requires exact name and acknowledgement before the real delete call', async ({ page }) => {
    let deleted = false; await stub(page, () => { deleted = true; });
    await page.goto('/app/mail/domains/domain-1/settings');
    const remove = page.getByRole('button', { name: 'Permanently delete domain' });
    await expect(remove).toBeDisabled();
    await page.getByLabel('Type example.com to confirm').fill('example.com');
    await page.getByText(/I understand that mail delivery stops/).click();
    await expect(remove).toBeEnabled(); await remove.click();
    await page.waitForURL('**/app/mail'); expect(deleted).toBe(true);
  });
  test('fits the destructive review at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await stub(page);
    await page.goto('/app/mail/domains/domain-1/settings');
    await expect(page.getByRole('button', { name: 'Permanently delete domain' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
