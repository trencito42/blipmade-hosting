import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'plan-customer', email: 'plan@example.test', firstName: 'Plan', lastName: 'Owner', name: 'Plan Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const limits = (domains: number, storage: number) => ({ maxDomains: domains, maxMailboxes: 20, maxAliases: 30, maxForwarding: 0, totalStorageMb: storage, mailboxQuotaMb: 1024, sendLimit: 100, sendInterval: 'day' });
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, calls: { plan: number; checkout: number; payload?: unknown }) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/mail/services') return json(route, { services: [{ id: 'service-1', status: 'ACTIVE', plan: { slug: 'starter', name: 'Starter', category: 'mail' }, limits: limits(1, 2048), usage: { domains: 1, mailboxes: 2, storageMb: 500, storageLimitMb: 2048 }, domains: [], graceUntil: null, suspendedAt: null, cancelledAt: null, retentionUntil: null, lastError: null, createdAt: '2026-11-03T10:00:00Z' }] });
    if (path === '/mail/plans') return json(route, { plans: [
      { id: 'p1', slug: 'starter', name: 'Starter', description: '', icon: 'mail', limits: limits(1, 2048), price: { amount: 500, currency: 'EUR', period: 'MONTHLY' }, prices: [{ amount: 500, currency: 'EUR', period: 'MONTHLY' }], availability: { state: 'available', orderable: true, blockers: [] }, onSale: true },
      { id: 'p2', slug: 'business', name: 'Business', description: '', icon: 'mail', limits: limits(5, 10240), price: { amount: 1200, currency: 'EUR', period: 'MONTHLY' }, prices: [{ amount: 1200, currency: 'EUR', period: 'MONTHLY' }], availability: { state: 'available', orderable: true, blockers: [] }, onSale: true },
    ] });
    if (path === '/mail/services/service-1/plan' && req.method() === 'POST') { calls.plan += 1; calls.payload = req.postDataJSON(); return json(route, { order: { id: 'order-1', number: 'BM-42' } }, 201); }
    if (path === '/orders/order-1/checkout' && req.method() === 'POST') { calls.checkout += 1; return json(route, { url: null, message: 'Checkout is temporarily unavailable.' }); }
    return json(route, {});
  });
}
test.describe('dedicated mail plan change', () => {
  test('reviews server prices and reuses the created order when checkout is retried', async ({ page }) => {
    const calls = { plan: 0, checkout: 0, payload: undefined as unknown }; await stub(page, calls);
    await page.goto('/app/mail/services/service-1/plan/change');
    await page.getByLabel(/Business/).check(); await page.getByRole('button', { name: 'Review change' }).click();
    await expect(page.getByRole('heading', { name: 'Review plan change' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and open checkout' }).click();
    await expect(page.getByRole('alert').getByText('Checkout is temporarily unavailable.')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and open checkout' }).click();
    expect(calls).toMatchObject({ plan: 1, checkout: 2, payload: { productSlug: 'business' } });
  });
  test('fits at 390px', async ({ page }) => { const calls = { plan: 0, checkout: 0 }; await page.setViewportSize({ width: 390, height: 844 }); await stub(page, calls); await page.goto('/app/mail/services/service-1/plan/change'); await expect(page.getByRole('button', { name: 'Review change' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false); });
});
