import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const OPTIONS = { options: [{ id: 'o1', code: 'dedicated-ip', name: 'Dedicated IP', description: null, amount: 300, currency: 'EUR', recurring: true, active: true, product: null }], note: '' };

test.describe('add-ons and the yearly discount on their own pages', () => {
  test('a new add-on is posted', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/options' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/options') return OPTIONS;
      return undefined;
    });
    await page.goto('/admin/pricing/addons/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Create the add-on' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Code').fill('backup-plus');
    await page.getByLabel('Name').fill('Backup plus');
    await page.getByLabel('Amount (cents)').fill('250');
    await go.click();
    await expect.poll(() => sent).toEqual({ code: 'backup-plus', name: 'Backup plus', amount: 250 });
  });
  test('editing sends only what changed; the discount is validated', async ({ page }) => {
    let patch: unknown; let settings: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/options/o1' && method === 'PATCH') { patch = body; return {}; }
      if (path === '/admin/options') return OPTIONS;
      if (path === '/admin/settings' && method === 'PUT') { settings = body; return {}; }
      if (path === '/admin/settings') return { settings: { 'pricing.yearly_discount_percent': { value: 10 } } };
      return undefined;
    });
    await page.goto('/admin/pricing/addons/o1/edit');
    await page.getByLabel('Amount (cents)').fill('400');
    await page.getByRole('button', { name: 'Save the add-on' }).click();
    await expect.poll(() => patch).toEqual({ amount: 400 });
    await page.goto('/admin/pricing/discounts/edit');
    await expect(page.getByLabel('Percent (0 to 50)')).toHaveValue('10');
    await page.getByLabel('Percent (0 to 50)').fill('60');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.getByLabel('Percent (0 to 50)').fill('15');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => settings).toEqual({ 'pricing.yearly_discount_percent': { value: 15 } });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/options' ? OPTIONS : undefined));
    await page.goto('/admin/pricing/addons/o1/edit');
    await expect(page.getByLabel('Amount (cents)')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
