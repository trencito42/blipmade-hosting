import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Close', lastName: 'Owner', name: 'Close Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, requestedAt: string | null, calls: { post: unknown[]; del: number }) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings') return json(route, { profile: { firstName: 'Close', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: requestedAt, services: 2, subscriptions: 2 } });
    if (path === '/settings/account/closure' && req.method() === 'POST') { calls.post.push(req.postDataJSON()); return json(route, { requestedAt: '2026-11-03T00:00:00.000Z', message: 'ok' }); }
    if (path === '/settings/account/closure' && req.method() === 'DELETE') { calls.del += 1; return json(route, {}); }
    return json(route, {});
  });
}

test.describe('dedicated account closure page', () => {
  test('needs the password and the exact phrase, then posts the request', async ({ page }) => {
    const calls = { post: [] as unknown[], del: 0 };
    await stub(page, null, calls);
    await page.goto('/app/settings/closure');
    await expect(page.getByText('This account has 2 active services and 2 subscriptions.')).toBeVisible();
    const send = page.getByRole('button', { name: 'Ask for the account to be closed' });
    await expect(send).toBeDisabled();
    await page.getByLabel('Your password').fill('Secret-Password-1');
    await page.getByLabel(/Type CLOSE MY ACCOUNT/).fill('close my account');
    await expect(send).toBeDisabled();
    await page.getByLabel(/Type CLOSE MY ACCOUNT/).fill('CLOSE MY ACCOUNT');
    await send.click();
    await page.waitForURL('**/app/settings?tab=account');
    expect(calls.post).toEqual([{ password: 'Secret-Password-1', confirmation: 'CLOSE MY ACCOUNT' }]);
  });

  test('a recorded request can be taken back with one DELETE', async ({ page }) => {
    const calls = { post: [] as unknown[], del: 0 };
    await stub(page, '2026-11-02T10:00:00.000Z', calls);
    await page.goto('/app/settings/closure');
    await expect(page.getByText(/recorded on 2 Nov 2026/)).toBeVisible();
    await page.getByRole('button', { name: 'Take the request back' }).click();
    await page.waitForURL('**/app/settings?tab=account');
    expect(calls.del).toBe(1);
    expect(calls.post).toEqual([]);
  });

  test('guards a draft, links from the tab and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, null, { post: [], del: 0 });
    await page.goto('/app/settings/closure');
    await page.getByLabel('Your password').fill('draft');
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Back to settings' }).click();
    await expect(page).toHaveURL(/settings\/closure$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/app/settings?tab=account');
    await expect(page.getByRole('link', { name: 'Close the account' })).toHaveAttribute('href', '/app/settings/closure');
  });
});
