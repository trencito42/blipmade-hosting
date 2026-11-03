import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Sub', lastName: 'Owner', name: 'Sub Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const END = '2026-12-01T00:00:00.000Z';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, state: { cancelAtPeriodEnd: boolean }, calls: string[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/billing/subscriptions' && req.method() === 'GET') {
      return json(route, { subscriptions: [{ id: 'sub-1', instanceId: 'i1', instanceName: 'Shop', status: 'active', amount: 900, currency: 'EUR', currentPeriodEnd: END, cancelAtPeriodEnd: state.cancelAtPeriodEnd }] });
    }
    if (path === '/billing/subscriptions/sub-1/cancel' && req.method() === 'POST') { calls.push('cancel'); return json(route, { subscription: {} }); }
    if (path === '/billing/subscriptions/sub-1/resume' && req.method() === 'POST') { calls.push('resume'); return json(route, { subscription: {} }); }
    return json(route, {});
  });
}

test.describe('dedicated subscription pages', () => {
  test('cancel needs the acknowledgement and sends one POST', async ({ page }) => {
    const calls: string[] = [];
    await stub(page, { cancelAtPeriodEnd: false }, calls);
    await page.goto('/app/billing/subscriptions/sub-1/cancel');
    const confirm = page.getByRole('button', { name: 'Cancel subscription' });
    await expect(confirm).toBeDisabled();
    await page.getByRole('checkbox').check();
    await confirm.click();
    await page.waitForURL('**/app/billing');
    expect(calls).toEqual(['cancel']);
  });

  test('resume is refused when the subscription already renews, and the page fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const calls: string[] = [];
    await stub(page, { cancelAtPeriodEnd: false }, calls);
    await page.goto('/app/billing/subscriptions/sub-1/resume');
    await expect(page.getByText('Already renewing')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume subscription' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(calls).toEqual([]);
  });

  test('resume sends one POST for a subscription that ends', async ({ page }) => {
    const calls: string[] = [];
    await stub(page, { cancelAtPeriodEnd: true }, calls);
    await page.goto('/app/billing/subscriptions/sub-1/resume');
    await page.getByRole('button', { name: 'Resume subscription' }).click();
    await page.waitForURL('**/app/billing');
    expect(calls).toEqual(['resume']);
  });
});
