import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Pass', lastName: 'Owner', name: 'Pass Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, onSave?: (body: unknown) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings/password' && req.method() === 'POST') { onSave?.(req.postDataJSON()); return json(route, { changed: true, closedSessions: 2 }); }
    return json(route, {});
  });
}

test.describe('dedicated password page', () => {
  test('validates, then posts the exact passwords', async ({ page }) => {
    let payload: unknown;
    await stub(page, (body) => { payload = body; });
    await page.goto('/app/settings/password');
    await page.getByLabel('Current password').fill('OldPassword1');
    await page.getByLabel('New password', { exact: true }).fill('NewPassword12');
    await page.getByLabel('Repeat the new password').fill('different');
    await page.getByRole('button', { name: 'Change the password' }).click();
    await expect(page.getByText('The two passwords do not match.')).toBeVisible();
    expect(payload).toBeUndefined();
    await page.getByLabel('Repeat the new password').fill('NewPassword12');
    await page.getByRole('button', { name: 'Change the password' }).click();
    await page.waitForURL('**/app/settings?tab=security');
    expect(payload).toEqual({ currentPassword: 'OldPassword1', newPassword: 'NewPassword12' });
  });

  test('guards a draft and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page);
    await page.goto('/app/settings/password');
    await page.getByLabel('Current password').fill('draft');
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Back to security' }).click();
    await expect(page).toHaveURL(/settings\/password$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
