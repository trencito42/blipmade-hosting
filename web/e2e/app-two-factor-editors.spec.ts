import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Two', lastName: 'Owner', name: 'Two Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const QR = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const CODES = ['AAAA-1111', 'BBBB-2222', 'CCCC-3333', 'DDDD-4444'];

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Calls { setup: number; enable: unknown[]; disable: unknown[]; renew: unknown[] }

async function stub(page: Page, enabled: boolean, calls: Calls) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings/security') return json(route, { twoFactor: { enabled, enabledAt: enabled ? '2026-10-01T00:00:00.000Z' : null, backupCodesLeft: 7 }, passkeys: [] });
    if (path === '/settings') return json(route, { profile: { firstName: 'Two', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    if (path === '/settings/api-keys') return json(route, { keys: [] });
    if (path === '/settings/2fa/setup' && req.method() === 'POST') { calls.setup += 1; return json(route, { secret: 'ABCDEFGHIJKLMNOP', qrSvg: QR }); }
    if (path === '/settings/2fa/enable' && req.method() === 'POST') { calls.enable.push(req.postDataJSON()); return json(route, { backupCodes: CODES }); }
    if (path === '/settings/2fa/disable' && req.method() === 'POST') { calls.disable.push(req.postDataJSON()); return json(route, {}); }
    if (path === '/settings/2fa/backup-codes' && req.method() === 'POST') { calls.renew.push(req.postDataJSON()); return json(route, { backupCodes: CODES }); }
    return json(route, {});
  });
}
const fresh = (): Calls => ({ setup: 0, enable: [], disable: [], renew: [] });

test.describe('dedicated two-factor pages', () => {
  test('setup makes no key on a visit, then proves it with a code and keeps the backup codes', async ({ page }) => {
    const calls = fresh();
    await stub(page, false, calls);
    await page.goto('/app/settings/security/2fa');
    await expect(page.locator('h1:visible')).toHaveText('Set up two-factor authentication');
    await expect(page.getByRole('button', { name: 'Start the setup' })).toBeEnabled();
    expect(calls.setup).toBe(0);
    await page.getByRole('button', { name: 'Start the setup' }).click();
    await expect(page.getByText('ABCD EFGH IJKL MNOP')).toBeVisible();
    expect(calls.setup).toBe(1);
    await expect(page.getByRole('button', { name: 'Turn on' })).toBeDisabled();
    await page.locator('input[autocomplete="one-time-code"]').first().click();
    await page.keyboard.type('123456');
    await expect(page.getByRole('list', { name: 'Backup codes' })).toBeVisible();
    expect(calls.enable).toEqual([{ code: '123456' }]);
    for (const code of CODES) await expect(page.getByText(code)).toBeVisible();
    await page.getByRole('button', { name: 'I saved them' }).click();
    await page.waitForURL('**/app/settings?tab=security');
  });

  test('leaving the page with codes that were not saved asks first', async ({ page }) => {
    await stub(page, false, fresh());
    await page.goto('/app/settings/security/2fa');
    await page.getByRole('button', { name: 'Start the setup' }).click();
    await page.locator('input[autocomplete="one-time-code"]').first().click();
    await page.keyboard.type('123456');
    await expect(page.getByRole('list', { name: 'Backup codes' })).toBeVisible();
    let message = '';
    page.once('dialog', async (dialog) => { message = dialog.message(); await dialog.dismiss(); });
    await page.getByRole('link', { name: 'Back to security' }).click();
    expect(message).toContain('not saved your backup codes');
    await expect(page).toHaveURL(/security\/2fa$/);
  });

  test('turning off needs the password and a code, and posts them exactly', async ({ page }) => {
    const calls = fresh();
    await stub(page, true, calls);
    await page.goto('/app/settings/security/2fa/disable');
    const confirm = page.getByRole('button', { name: 'Turn off' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Password').fill('Secret-Password-1');
    await page.getByLabel('Code or backup code').fill('654321');
    await confirm.click();
    await page.waitForURL('**/app/settings?tab=security');
    expect(calls.disable).toEqual([{ password: 'Secret-Password-1', code: '654321' }]);
  });

  test('new backup codes need a code from the app and show the new ones once', async ({ page }) => {
    const calls = fresh();
    await stub(page, true, calls);
    await page.goto('/app/settings/security/2fa/backup-codes');
    await page.locator('input[autocomplete="one-time-code"]').first().click();
    await page.keyboard.type('111222');
    await expect(page.getByRole('list', { name: 'Backup codes' })).toBeVisible();
    expect(calls.renew).toEqual([{ code: '111222' }]);
  });

  test('the pages refuse the wrong state and fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, true, fresh());
    await page.goto('/app/settings/security/2fa');
    await expect(page.getByText('Two-factor authentication is already on')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start the setup' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/app/settings?tab=security');
    await expect(page.getByRole('link', { name: 'Turn off' })).toHaveAttribute('href', '/app/settings/security/2fa/disable');
  });
});
