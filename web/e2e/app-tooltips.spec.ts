import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Tip', lastName: 'Owner', name: 'Tip Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const DOMAINS = [1, 2, 3].map((n) => ({ id: `d${n}`, instanceId: 'i1', instanceName: 'Shop', hostname: `site-${n}.apps.blipmade.com`, status: 'active', targetPort: 80, dnsRecords: [], lastError: null, platform: true, addressChangeAvailableAt: null, verification: { host: null, token: null, verified: true, verifiedAt: null, expiresAt: null } }));

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/domains') return json(route, { domains: DOMAINS });
    if (path === '/settings') return json(route, { profile: { firstName: 'Tip', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    if (path === '/settings/security') return json(route, { twoFactor: { enabled: false, enabledAt: null, backupCodesLeft: 0 }, passkeys: [] });
    if (path === '/settings/security/activity') return json(route, { activity: [], pagination: { hasMore: false, nextCursor: null } });
    if (path === '/settings/api-keys') return json(route, { keys: [] });
    return json(route, {});
  });
}

test.describe('the tooltips of the design', () => {
  test('a hint shows in a bubble of the app, not in the native tooltip', async ({ page }) => {
    await stub(page);
    await page.goto('/app/domains');
    const del = page.locator('article').first().getByRole('link', { name: 'Delete' });
    // The browser's own tooltip is never used for a hint of the app.
    await expect(del).not.toHaveAttribute('title', /.+/);
    await expect(del).toHaveAttribute('data-tip', /stops resolving/);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await del.hover();
    const bubble = page.getByRole('tooltip');
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText('Delete this domain');
    await expect(del).toHaveAttribute('aria-describedby', 'bm-tooltip');
    // The bubble does not take a click: the button under the pointer still works.
    expect(await bubble.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');
    await page.mouse.move(5, 400);
    await expect(bubble).toHaveCount(0);
    await expect(del).not.toHaveAttribute('aria-describedby', 'bm-tooltip');
  });

  test('the keyboard opens the bubble on focus and Escape closes it', async ({ page }) => {
    await stub(page);
    await page.goto('/app/domains');
    const change = page.locator('article').first().getByRole('link', { name: 'Change' });
    await change.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip')).toContainText('once in 7 days');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('a click on a button leaves no bubble behind', async ({ page }) => {
    await stub(page);
    await page.goto('/app/domains');
    const change = page.locator('article').first().getByRole('link', { name: 'Change' });
    await change.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await change.click();
    await page.waitForURL('**/app/domains/d1/edit');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('the description of a panel is an info mark, not a paragraph', async ({ page }) => {
    await stub(page);
    await page.goto('/app/settings?tab=security');
    await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
    const sentence = 'Asks for a code from an authenticator app after your password';
    await expect(page.getByText(sentence)).toHaveCount(0);
    const mark = page.getByRole('button', { name: 'About Two-factor authentication' });
    await mark.hover();
    await expect(page.getByRole('tooltip')).toContainText(sentence);
    await page.mouse.move(5, 500);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    // A tap or a click on the mark opens and closes the bubble too (a touch screen has no hover).
    await mark.click();
    await expect(page.getByRole('tooltip')).toContainText(sentence);
    await mark.click();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('the bubble stays inside the screen at the right edge and the bottom', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await stub(page);
    await page.goto('/app/domains');
    const del = page.locator('article').first().getByRole('link', { name: 'Delete' });
    await del.hover();
    const box = await page.getByRole('tooltip').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(800);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(500);
  });

  test('the field hints of the editors are info marks, and the page of an editor has one heading', async ({ page }) => {
    await stub(page);
    await page.goto('/app/settings/api-keys/new');
    await expect(page.locator('h1:visible')).toHaveText('New API key');
    await expect(page.getByText(/A key reaches the services of your account/)).toHaveCount(0);
    await page.getByRole('button', { name: 'About New API key' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('A key reaches the services of your account');
  });
});
