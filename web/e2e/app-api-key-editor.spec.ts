import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Key', lastName: 'Owner', name: 'Key Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const SECRET = 'bmk_live_0123456789abcdef0123456789abcdef';

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, calls: { create?: unknown; revoked?: string[] } = {}) {
  calls.revoked ??= [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings') return json(route, { profile: { firstName: 'Key', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    if (path === '/settings/security') return json(route, { twoFactor: { enabled: false, enabledAt: null, backupCodesLeft: 0 }, passkeys: [] });
    if (path === '/settings/api-keys' && req.method() === 'GET') {
      return json(route, { keys: [{ id: 'k1', name: 'deploy script', prefix: 'bmk_live_0123', scope: 'read', lastUsedAt: null, lastUsedIp: null, expiresAt: null, createdAt: '2026-11-01T00:00:00.000Z', expired: false }] });
    }
    if (path === '/settings/api-keys' && req.method() === 'POST') { calls.create = req.postDataJSON(); return json(route, { key: SECRET }); }
    if (path === '/settings/api-keys/k1' && req.method() === 'DELETE') { calls.revoked!.push('k1'); return json(route, {}); }
    return json(route, {});
  });
}

test.describe('dedicated API key page', () => {
  test('validates, posts the exact choice and shows the key once on the page', async ({ page }) => {
    const calls: { create?: unknown } = {};
    await stub(page, calls);
    await page.goto('/app/settings/api-keys/new');
    await expect(page.locator('h1:visible')).toHaveText('New API key');
    await page.getByLabel('Name').fill('x');
    await page.getByRole('button', { name: 'Make the key' }).click();
    await expect(page.getByText('Give the key a name of at least 2 characters.')).toBeVisible();
    expect(calls.create).toBeUndefined();
    await page.getByLabel('Name').fill('ci runner');
    await page.getByLabel('Read and write').check();
    await page.getByText('1 year').click();
    await page.getByRole('button', { name: 'Make the key' }).click();
    await expect(page.getByTestId('new-api-key')).toHaveText(SECRET);
    expect(calls.create).toEqual({ name: 'ci runner', scope: 'write', expiresInDays: 365 });
    // The secret is not in the address and not in the storage of the browser.
    expect(page.url()).not.toContain('bmk_');
    expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain('bmk_');
    await page.getByRole('button', { name: 'I saved it' }).click();
    await page.waitForURL('**/app/settings?tab=keys');
  });

  test('guards a draft and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page);
    await page.goto('/app/settings/api-keys/new');
    await page.getByLabel('Name').fill('draft');
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Back to security' }).click();
    await expect(page).toHaveURL(/api-keys\/new$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('revoking from the list asks first and sends one DELETE', async ({ page }) => {
    const calls: { revoked?: string[] } = {};
    await stub(page, calls);
    await page.goto('/app/settings?tab=keys');
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('Revoke this key?')).toBeVisible();
    expect(calls.revoked).toEqual([]);
    await page.getByRole('button', { name: 'Revoke key' }).click();
    await expect.poll(() => calls.revoked).toEqual(['k1']);
  });
});
