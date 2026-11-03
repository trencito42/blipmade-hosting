import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const ORDER = {
  id: 'o1', number: 'BM-1001', status: 'paid', fulfillmentStatus: 'failed', kind: 'new', total: 1500, discount: 0, currency: 'EUR', createdAt: '2026-11-01T10:00:00Z', paidAt: '2026-11-01T10:01:00Z',
  stripeCheckoutSessionId: null, stripePaymentIntentId: null, billingAddress: null,
  user: { id: 'u1', email: 'cust@example.test', firstName: 'Cora', lastName: 'Customer', suspendedAt: null },
  promotion: null, risk: null, items: [], payments: [{ id: 'pay1', amount: 1500, currency: 'EUR', status: 'succeeded', failureMessage: null, stripePaymentIntentId: null, stripeChargeId: null, stripeCustomerId: null, stripeSubscriptionId: null, stripeInvoiceId: null, createdAt: '2026-11-01T10:01:00Z' }],
  invoices: [], webhooks: [], events: [], audit: [],
};

test.describe('order actions on their own pages', () => {
  test('retry delivery needs a reason and posts it', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/orders/o1/retry-fulfilment' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/orders/o1') return { order: ORDER };
      return undefined;
    });
    await page.goto('/admin/orders/o1');
    await page.getByRole('link', { name: 'Retry delivery' }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/o1\/retry$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Retry delivery' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Reason for the audit log').fill('Node was down');
    await go.click();
    await expect(page).toHaveURL(/\/admin\/orders\/o1$/);
    expect(sent).toEqual({ reason: 'Node was down' });
  });
  test('refund also needs the typed order number; fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/orders/o1/refund' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/orders/o1') return { order: ORDER };
      return undefined;
    });
    await page.goto('/admin/orders/o1/refund');
    await page.getByLabel('Reason for the audit log').fill('Customer asked');
    const go = page.getByRole('button', { name: 'Refund payment' });
    await expect(go).toBeDisabled();
    await page.getByLabel(/Type BM-1001/).fill('BM-1001');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await go.click();
    await expect(page).toHaveURL(/\/admin\/orders\/o1$/);
    expect(sent).toEqual({ reason: 'Customer asked' });
  });

  test('a partial refund validates the amount against the order and posts cents', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/orders/o1/partial-refund' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/orders/o1') return { order: ORDER };
      return undefined;
    });
    await page.goto('/admin/orders/o1/partial-refund');
    const go = page.getByRole('button', { name: 'Refund this amount' });
    await page.getByLabel('Reason').fill('Partial downtime');
    await page.getByLabel(/^Amount/).fill('99');
    await expect(go).toBeDisabled();
    await page.getByLabel(/^Amount/).fill('5.50');
    await go.click();
    await expect.poll(() => sent).toEqual({ amount: 550, reason: 'Partial downtime' });
  });
});
