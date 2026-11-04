import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Con', lastName: 'Nect', name: 'Con Nect', role: 'CUSTOMER', emailVerified: true, permissions: [] };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, calls: { unlink?: { url: string; body: unknown } } = {}) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/account/connections' && req.method() === 'GET') {
      return json(route, {
        providers: [
          { id: 'github', label: 'GitHub', enabled: true },
          { id: 'google', label: 'Google', enabled: true },
          { id: 'discord', label: 'Discord', enabled: true },
        ],
        identities: [{ provider: 'github', displayName: 'octo', avatarUrl: null, connectedAt: '2026-11-01T00:00:00.000Z', lastUsedAt: null }],
        githubInstallations: [],
        discordCommunity: null,
      });
    }
    if (path === '/account/connections/github' && req.method() === 'DELETE') {
      calls.unlink = { url: path, body: req.postDataJSON() };
      return json(route, {});
    }
    return json(route, {});
  });
}

test.describe('connected accounts', () => {
  test('one heading, divided rows on one centre line, no dialog, no overflow at 390px', async ({ page }) => {
    await stub(page);
    await page.goto('/app/settings/connections');
    await expect(page.locator('h1:visible')).toHaveCount(1);
    await expect(page.locator('h1:visible')).toHaveText('Connected accounts');
    const rows = page.locator('section', { hasText: 'Sign-in providers' }).locator('li');
    await expect(rows).toHaveCount(3);
    expect(await rows.nth(0).evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
    expect(await rows.nth(1).evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
    const centres = await rows.nth(0).evaluate((li) => {
      const mid = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      return [mid(li.querySelector('p')!), mid(li.querySelector('a')!)];
    });
    expect(Math.abs(centres[0] - centres[1])).toBeLessThan(14);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/connections-390.png', fullPage: true });
  });

  test('disconnecting is a page of its own and sends the password', async ({ page }) => {
    const calls: { unlink?: { url: string; body: unknown } } = {};
    await stub(page, calls);
    await page.goto('/app/settings/connections');
    await page.getByRole('link', { name: 'Disconnect' }).click();
    await expect(page).toHaveURL(/\/app\/settings\/connections\/github\/disconnect$/);
    await expect(page.locator('h1:visible')).toHaveText('Disconnect GitHub');
    await page.getByLabel('Current password (if you use one)').fill('secret-pass-1');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/settings\/connections\?disconnected=1$/);
    expect(calls.unlink?.body).toEqual({ password: 'secret-pass-1' });
    await expect(page.getByText('Provider disconnected.')).toBeVisible();
  });
});
