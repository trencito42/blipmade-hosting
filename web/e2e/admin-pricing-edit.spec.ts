import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const PRICING = {
  rates: { ramPerGb: 100, cpuPerUnit: 200, diskPerGb: 10, baseFee: 50 },
  prices: [{ id: 'pr1', productId: 'p1', product: { id: 'p1', name: 'Minecraft', slug: 'minecraft', minRam: 2048, minCpu: 1, minDisk: 10, fulfilment: 'SERVER' }, period: 'MONTHLY', baseAmount: 0, ramPerGb: 100, cpuPerUnit: 200, diskPerGb: 10, currency: 'EUR', active: true }],
};

test.describe('pricing editors on their own pages', () => {
  test('the rate card saves after the review', async ({ page }) => {
    let saved: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/pricing/rates' && method === 'PUT') { saved = body; return { rates: PRICING.rates }; }
      if (path === '/admin/pricing') return PRICING;
      return undefined;
    });
    await page.goto('/admin/pricing/rates/edit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.getByLabel('Per GB memory (cents)').fill('150');
    await page.getByRole('button', { name: /Review|Save/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('150');
    await dialog.getByRole('button').filter({ hasText: /Save/ }).click();
    await expect.poll(() => saved).toMatchObject({ ramPerGb: 150, cpuPerUnit: 200 });
  });
  test('the price page opens and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/pricing' ? PRICING : undefined));
    await page.goto('/admin/pricing/products/pr1/edit');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Minecraft');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/admin/pricing/products/missing/edit');
    await expect(page.getByText('Price not found.')).toBeVisible();
  });
});
