import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Mail', lastName: 'Owner', name: 'Mail Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const limits = (boxes: number, mb: number) => ({ maxDomains: 1, maxMailboxes: boxes, maxAliases: 20, maxForwarding: 5, totalStorageMb: mb, mailboxQuotaMb: 512, sendLimit: 200, sendInterval: 'DAY' });
const plan = (slug: string, name: string, boxes: number, mb: number, month: number, year: number | null, onSale = true) => ({
  id: slug, slug, name, description: `${name} plan`, icon: 'mail', limits: limits(boxes, mb), availability: { available: onSale, blockers: [] },
  price: { amount: month, currency: 'EUR', period: 'MONTHLY' },
  prices: [{ amount: month, currency: 'EUR', period: 'MONTHLY' }, ...(year ? [{ amount: year, currency: 'EUR', period: 'YEARLY' }] : [])],
  onSale,
});
const PLANS = [plan('mail-starter', 'Starter', 2, 512, 300, 3000), plan('mail-pro', 'Pro', 10, 5120, 900, 9000), plan('mail-off', 'Future', 50, 51200, 2000, null, false)];

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, orders: unknown[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/mail/plans') return json(route, { plans: PLANS });
    if (path === '/orders' && req.method() === 'POST') { orders.push(req.postDataJSON()); return json(route, { order: { id: 'o1', number: 'BM-1', status: 'PENDING', total: 0, currency: 'EUR', createdAt: '2026-11-03T00:00:00.000Z', items: [] } }); }
    if (path === '/orders/o1/checkout') return json(route, { url: null, message: 'Payment is not set up here.' });
    return json(route, {});
  });
}

test.describe('the email checkout', () => {
  test('lists only the plans on sale, switches plan and term, validates the domain, reviews and posts the exact order', async ({ page }) => {
    const orders: unknown[] = [];
    await stub(page, orders);
    await page.goto('/app/email/checkout?plan=mail-starter');
    await expect(page.locator('input[name="mail-plan"]')).toHaveCount(2);
    await expect(page.getByText('Future')).toHaveCount(0);
    await page.locator('label', { hasText: 'Pro' }).click();
    await expect(page).toHaveURL(/plan=mail-pro/);
    await expect(page.getByRole('radiogroup', { name: 'Billing term' }).or(page.locator('[aria-label="Billing term"]'))).toBeVisible();
    await page.locator('[aria-label="Billing term"]').getByText('Yearly').click();
    const review = page.getByRole('button', { name: 'Review' });
    await expect(review).toBeDisabled();
    await page.getByLabel('Mail domain').fill('not a domain');
    await review.click();
    await expect(page.getByText(/domain|hostname/i).first()).toBeVisible();
    expect(orders).toEqual([]);
    await page.getByLabel('Mail domain').fill('Acme.RO');
    await review.click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.getByText('acme.ro')).toBeVisible();
    await expect(page.getByText('Yearly')).toBeVisible();
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page.getByText('Payment is not set up here.')).toBeVisible();
    expect(orders).toEqual([{ items: [{ productSlug: 'mail-pro', mailDomain: 'acme.ro' }], period: 'YEARLY' }]);
  });

  test('Back from the review returns to the form with the domain kept', async ({ page }) => {
    await stub(page, []);
    await page.goto('/app/email/checkout?plan=mail-starter');
    await page.getByLabel('Mail domain').fill('acme.ro');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Mail domain')).toHaveValue('acme.ro');
  });

  test('a plan that is not on sale cannot be bought and the page fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, []);
    await page.goto('/app/email/checkout?plan=mail-off');
    await expect(page.getByText('This plan is not on sale at the moment.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/app/email/checkout?plan=mail-starter');
    await expect(page.getByRole('button', { name: 'Review' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
