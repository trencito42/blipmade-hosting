import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Nav', lastName: 'Owner', name: 'Nav Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };

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
    if (path === '/instances') return json(route, { instances: [] });
    if (path === '/vps') return json(route, { servers: [] });
    if (path === '/domains') return json(route, { domains: [] });
    if (path === '/mail/services') return json(route, { services: [] });
    if (path === '/mail/domains') return json(route, { domains: [] });
    if (path === '/catalog/products') return json(route, { products: [] });
    return json(route, {});
  });
}

test.describe('the phone bar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has Overview, Services, Deploy, Support and More; Services holds apps, servers, domains and email', async ({ page }) => {
    await stub(page);
    await page.goto('/app/vps');
    const bar = page.locator('[data-bottom-nav]');
    await expect(bar).toBeVisible();
    for (const name of ['Overview', 'Services', 'Deploy', 'Support']) await expect(bar.getByRole('link', { name })).toHaveCount(1);
    await expect(bar.getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
    await expect(bar.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current', 'page');
    const sw = page.getByRole('navigation', { name: 'Services' });
    await expect(sw).toBeVisible();
    await expect(sw.getByRole('link')).toHaveText(['Apps', 'Servers', 'Domains', 'Email']);
    await expect(sw.getByRole('link', { name: 'Servers' })).toHaveAttribute('aria-current', 'page');
    await sw.getByRole('link', { name: 'Domains' }).click();
    await page.waitForURL('**/app/domains');
    await expect(bar.getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
    // More opens the list of every page.
    await bar.getByRole('button', { name: /More/i }).click();
    const sheet = page.getByRole('dialog').or(page.locator('[aria-label="All pages"]'));
    await expect(sheet.getByRole('link', { name: 'Billing' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Settings' })).toBeVisible();
    // The sheet is the list of every page.
    await expect(sheet.getByRole('link', { name: 'Servers' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('the services switch is not on other pages', async ({ page }) => {
    await stub(page);
    await page.goto('/app/billing');
    await expect(page.getByRole('navigation', { name: 'Services' })).toHaveCount(0);
  });
});

test('on a desktop the switch is hidden and the sidebar lists every page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto('/app/vps');
  await expect(page.getByRole('navigation', { name: 'Services' })).toBeHidden();
  for (const name of ['Apps & databases', 'Servers', 'Domains', 'Email', 'Billing']) await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
});
