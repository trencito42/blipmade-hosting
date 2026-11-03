import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'u', email: 'u@example.test', firstName: 'N', lastName: 'P', name: 'N P', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const PREFS = { accountSecurity: true, ordersBilling: true, billing: true, hostingServices: true, support: true, domainsEmail: true, incidents: true, productUpdates: false, marketing: false, emailChannel: true, inAppChannel: true };
async function json(route: Route, body: unknown) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/notifications/preferences') return json(route, { preferences: PREFS, categories: [{ key: 'marketing', label: 'Offers', description: 'News', channels: ['email'], essential: false }] });
    return json(route, {});
  });
}
test.describe('notification preferences page', () => {
  test('is its own page with one title and a way back', async ({ page }) => {
    await stub(page); await page.goto('/app/settings/notifications');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('#preference-marketing')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to settings' })).toBeVisible();
  });
  test('the settings tab links to it instead of showing switches', async ({ page }) => {
    await stub(page); await page.goto('/app/settings?tab=notifications');
    await expect(page.locator('#preference-marketing')).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit preferences' }).click();
    await expect(page).toHaveURL(/\/app\/settings\/notifications$/);
  });
});
