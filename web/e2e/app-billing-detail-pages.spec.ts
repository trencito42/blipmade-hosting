import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Bill', lastName: 'Owner', name: 'Bill Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const ORDER = (status: string) => ({ id: 'o1', number: 'BM-100', status, total: 1800, discount: 200, currency: 'EUR', createdAt: '2026-11-01T10:00:00.000Z', items: [
  { id: 'it1', name: 'WordPress hosting', productSlug: 'wordpress', quantity: 1, unitAmount: 1000, total: 1000, fulfillmentStatus: 'FULFILLED', fulfillmentError: null },
  { id: 'it2', name: 'Mail plan', productSlug: 'mail', quantity: 2, unitAmount: 500, total: 1000, fulfillmentStatus: 'FAILED', fulfillmentError: 'The domain is not routed yet.' },
] });
const SUBSCRIPTION = (cancelAtPeriodEnd: boolean) => ({ id: 's1', instanceId: 'i1', serviceKind: 'server', serviceId: 'i1', instanceName: 'Shop', status: 'active', amount: 900, currency: 'EUR', currentPeriodEnd: '2026-12-01T00:00:00.000Z', cancelAtPeriodEnd });

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, opts: { orderStatus?: string; cancelAtPeriodEnd?: boolean; checkout?: string[] } = {}) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/orders/o1' && req.method() === 'GET') return json(route, { order: ORDER(opts.orderStatus ?? 'PAID') });
    if (path === '/orders' && req.method() === 'GET') return json(route, { orders: [ORDER('AWAITING_PAYMENT')], pagination: {} });
    if (path === '/orders/o1/checkout' && req.method() === 'POST') { opts.checkout?.push('o1'); return json(route, { url: 'https://pay.example.test/checkout/o1' }); }
    if (path === '/billing/subscriptions') return json(route, { subscriptions: [SUBSCRIPTION(opts.cancelAtPeriodEnd ?? false)] });
    if (path === '/billing/summary') return json(route, { currency: 'EUR', monthlyEstimate: 900, currentPeriodEnd: null, paymentMethod: null, hasStripeCustomer: false, subscriptions: [] });
    if (path === '/billing/payment-state') return json(route, { payments: { available: true, test: false, reason: null } });
    if (path === '/billing/invoices') return json(route, { invoices: [{ id: 'inv1', number: 'INV-2026-0001', status: 'paid', amount: 840, tax: 160, total: 1000, currency: 'EUR', hostedUrl: null, pdfUrl: null, billingAddress: null, lines: [], createdAt: '2026-10-01T10:00:00.000Z', periodStart: null, periodEnd: null }], company: {} });
    if (path === '/billing/credit') return json(route, { credit: 2500, currency: 'EUR' });
    if (path === '/billing/closed-services') return json(route, { services: [{ id: 'c1', name: 'Old blog', cancelledAt: '2026-10-01T00:00:00.000Z', deletedOn: '2026-12-01T00:00:00.000Z' }] });
    if (path === '/billing/credit') return json(route, { credit: 0, currency: 'EUR' });
    return json(route, {});
  });
  await page.route('https://pay.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>pay</title>paid' }));
}

test.describe('billing detail pages', () => {
  test('an order shows every line with its delivery, and a paid order has no pay button', async ({ page }) => {
    await stub(page, { orderStatus: 'PAID' });
    await page.goto('/app/billing/orders/o1');
    await expect(page.getByText('Order BM-100')).toBeVisible();
    await expect(page.getByText('WordPress hosting')).toBeVisible();
    await expect(page.getByText(/2 ×.*Failed/)).toBeVisible();
    await expect(page.getByText('The domain is not routed yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
  });

  test('an order that waits for payment can be paid from the page with one checkout request', async ({ page }) => {
    const checkout: string[] = [];
    await stub(page, { orderStatus: 'AWAITING_PAYMENT', checkout });
    await page.goto('/app/billing/orders/o1');
    await page.getByRole('button', { name: 'Pay now' }).click();
    await page.waitForURL('https://pay.example.test/checkout/o1');
    expect(checkout).toEqual(['o1']);
  });

  test('a subscription shows its price and period and links to the right action and service', async ({ page }) => {
    await stub(page, { cancelAtPeriodEnd: false });
    await page.goto('/app/billing/subscriptions/s1');
    await expect(page.getByText('Shop').first()).toBeVisible();
    await expect(page.getByText('Renews on')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cancel at period end' })).toHaveAttribute('href', '/app/billing/subscriptions/s1/cancel');
    await expect(page.getByRole('link', { name: 'Open the service' })).toHaveAttribute('href', '/app/instances/i1');

    const second = await page.context().newPage();
    await stub(second, { cancelAtPeriodEnd: true });
    await second.goto('/app/billing/subscriptions/s1');
    await expect(second.getByText('Ends on')).toBeVisible();
    await expect(second.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/app/billing/subscriptions/s1/resume');
  });

  test('billing sections have an address each and show only their own content', async ({ page }) => {
    await stub(page, {});
    await page.goto('/app/billing');
    const sections = page.getByRole('navigation', { name: 'Billing sections' });
    await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Orders awaiting payment')).toBeVisible();
    await expect(page.getByText('Payment method').first()).toBeVisible();
    await expect(page.getByText('Old blog')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Order #BM-100' })).toHaveAttribute('href', '/app/billing/orders/o1');
    await expect(page.getByText('INV-2026-0001')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Shop', exact: true })).toHaveCount(0);

    await sections.getByRole('link', { name: 'Subscriptions' }).click();
    await expect(page).toHaveURL(/\/app\/billing\?tab=subscriptions$/);
    await expect(sections.getByRole('link', { name: 'Subscriptions' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Shop', exact: true })).toHaveAttribute('href', '/app/billing/subscriptions/s1');
    await expect(page.getByText('Orders awaiting payment')).toHaveCount(0);
    await page.screenshot({ path: '/tmp/claude-0/-root/aae46db4-fcaf-4b45-85b9-bd3609e50f02/scratchpad/billing-subscriptions.png' });

    await sections.getByRole('link', { name: 'Orders', exact: true }).click();
    await expect(page.getByRole('link', { name: '#BM-100' }).first()).toHaveAttribute('href', '/app/billing/orders/o1');
    await expect(page.getByText('WordPress hosting, Mail plan').first()).toBeVisible();

    await sections.getByRole('link', { name: 'Invoices' }).click();
    await expect(page.getByText('INV-2026-0001').first()).toBeVisible();
    await expect(page.getByText('Old blog')).toHaveCount(0);

    // A reload keeps the section: the address says which one it is.
    await page.reload();
    await expect(sections.getByRole('link', { name: 'Invoices' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('INV-2026-0001').first()).toBeVisible();
  });

  test('the sections and the detail pages fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, {});
    for (const route of ['/app/billing', '/app/billing?tab=subscriptions', '/app/billing?tab=orders', '/app/billing?tab=invoices', '/app/billing/orders/o1', '/app/billing/subscriptions/s1']) {
      await page.goto(route);
      await expect(page.locator('h1:visible')).toHaveCount(1);
      await expect(page.locator('h1:visible')).not.toHaveText('Something went wrong');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), route).toBe(false);
    }
  });

  test('on a subscription row the name, the status, the price and the button share one centre line', async ({ page }) => {
    await stub(page, {});
    await page.goto('/app/billing?tab=subscriptions');
    const row = page.locator('main div').filter({ has: page.getByRole('link', { name: 'Shop', exact: true }) }).filter({ has: page.getByRole('link', { name: 'Cancel Shop' }) }).last();
    const centre = async (locator: ReturnType<typeof page.locator>) => locator.evaluate((node) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; });
    const name = await centre(row.getByRole('link', { name: 'Shop', exact: true }).locator('xpath=..'));
    const status = await centre(row.getByText('Active', { exact: true }));
    const price = await centre(row.getByText('€9.00').first());
    const button = await centre(row.getByRole('link', { name: 'Cancel Shop' }));
    expect(Math.abs(status - button)).toBeLessThan(2);
    expect(Math.abs(price - button)).toBeLessThan(2);
    expect(Math.abs(name - button)).toBeLessThan(2);
  });

  test('credit shows the balance and history merges orders and invoices, newest first', async ({ page }) => {
    await stub(page, {});
    await page.goto('/app/billing?tab=credit');
    await expect(page.getByText('€25.00')).toBeVisible();
    await page.goto('/app/billing?tab=history');
    const rows = page.locator('main li').filter({ has: page.getByRole('link', { name: /^(Order|Invoice) / }) });
    await expect(rows).toHaveCount(2);
    // The order of 2026-11-01 comes before the invoice of 2026-10-01.
    await expect(rows.nth(0)).toContainText('Order #BM-100');
    await expect(rows.nth(1)).toContainText('Invoice INV-2026-0001');
    await rows.nth(0).getByRole('link').click();
    await page.waitForURL('**/app/billing/orders/o1');
  });
});
