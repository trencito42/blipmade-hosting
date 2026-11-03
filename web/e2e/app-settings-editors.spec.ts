import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Set', lastName: 'Owner', name: 'Set Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const ADDRESS = { fullName: 'Set Owner', companyName: '', line1: '1 Main Street', line2: '', city: 'Bucharest', region: '', postalCode: '010101', country: 'RO', taxId: '' };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, bodies: Record<string, unknown>) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings' && req.method() === 'GET') {
      return json(route, { profile: { firstName: 'Set', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: ADDRESS, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    }
    if (path === '/settings/email' && req.method() === 'POST') { bodies.email = req.postDataJSON(); return json(route, { message: 'Check your new inbox.', delivered: true, pendingEmail: 'new@example.test' }); }
    if (path === '/settings/billing-address' && req.method() === 'PUT') { bodies.address = req.postDataJSON(); return json(route, {}); }
    return json(route, {});
  });
}

test.describe('dedicated settings pages', () => {
  test('email change validates and posts the exact address', async ({ page }) => {
    const bodies: Record<string, unknown> = {};
    await stub(page, bodies);
    await page.goto('/app/settings/email/change');
    await page.getByLabel('New email address').fill('not-an-email');
    await page.getByRole('button', { name: 'Send the confirmation link' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    expect(bodies.email).toBeUndefined();
    await page.getByLabel('New email address').fill('new@example.test');
    await page.getByRole('button', { name: 'Send the confirmation link' }).click();
    await page.waitForURL('**/app/settings');
    expect(bodies.email).toEqual({ email: 'new@example.test' });
  });

  test('billing address loads the saved values and saves the exact change', async ({ page }) => {
    const bodies: Record<string, unknown> = {};
    await stub(page, bodies);
    await page.goto('/app/settings/billing-address');
    await expect(page.getByLabel('Address line 1')).toHaveValue('1 Main Street');
    await page.getByLabel('Address line 1').fill('2 Side Road');
    await page.getByRole('button', { name: 'Save billing address' }).click();
    await page.waitForURL('**/app/settings');
    expect(bodies.address).toMatchObject({ line1: '2 Side Road', city: 'Bucharest', country: 'RO' });
  });

  test('both pages guard a draft and fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, {});
    await page.goto('/app/settings/email/change');
    await page.getByLabel('New email address').fill('draft@example.test');
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Back to settings' }).click();
    await expect(page).toHaveURL(/email\/change$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/app/settings/billing-address');
    await expect(page.getByRole('button', { name: 'Save billing address' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
