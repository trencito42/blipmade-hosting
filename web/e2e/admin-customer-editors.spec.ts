import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('customer credit and note on their own pages', () => {
  test('credit needs amount, reason and the typed amount', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/customers/u1/credit' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/customers/u1/credit') return { canCredit: true, providerBalance: 0, entries: [] };
      return undefined;
    });
    await page.goto('/admin/customers/u1/credit/adjust');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Give the credit' });
    await page.getByLabel('Amount (EUR)').fill('5');
    await page.getByLabel('Reason').fill('Downtime on 30 Oct');
    await expect(go).toBeDisabled();
    await page.getByLabel('Type 5.00 to confirm').fill('5.00');
    await go.click();
    await expect.poll(() => sent).toEqual({ amount: 500, currency: 'EUR', reason: 'Downtime on 30 Oct' });
  });
  test('note posts the body; both fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/customers/u1/notes' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/customers/u1/credit') return { canCredit: true, providerBalance: 0, entries: [] };
      return undefined;
    });
    await page.goto('/admin/customers/u1/credit/adjust');
    await expect(page.getByLabel('Amount (EUR)')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/admin/customers/u1/notes/new');
    await page.getByLabel('Note').fill('Called about the invoice');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.getByRole('button', { name: 'Add the note' }).click();
    await expect.poll(() => sent).toEqual({ body: 'Called about the invoice' });
  });

  test('suspend needs a reason and posts it; reinstate says so', async ({ page }) => {
    let sent: unknown;
    const customer = (suspendedAt: string | null) => ({ customer: { id: 'u1', email: 'cora@example.test', suspendedAt, instances: [{}, {}] } });
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/customers/u1/suspend' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/customers/u1') return customer(null);
      if (path === '/admin/customers/u2') return customer('2026-11-01T00:00:00Z');
      return undefined;
    });
    await page.goto('/admin/customers/u1/account-action');
    await expect(page.getByRole('heading', { level: 1, name: 'Suspend the customer' })).toBeVisible();
    const go = page.getByRole('button', { name: 'Suspend customer' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Reason (required)').fill('Chargeback');
    await go.click();
    await expect.poll(() => sent).toEqual({ suspended: true, reason: 'Chargeback' });
    await page.goto('/admin/customers/u2/account-action');
    await expect(page.getByRole('heading', { level: 1, name: 'Reinstate the customer' })).toBeVisible();
  });
});
