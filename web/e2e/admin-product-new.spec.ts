import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('new product on its own page', () => {
  test('the list links to it and the form posts the product', async ({ page }) => {
    let sent: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/products' && method === 'POST') { sent = body as Record<string, unknown>; return { product: { id: 'p1', slug: 'new-app', name: 'New app' } }; }
      if (path === '/admin/products') return { products: [] };
      return undefined;
    });
    await page.goto('/admin/products');
    await page.getByRole('link', { name: 'New product' }).click();
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.getByLabel('Slug').fill('new-app');
    await page.getByLabel('Name').fill('New app');
    await page.getByLabel('Description').fill('A small app for the catalog');
    await page.getByRole('button', { name: 'Create product' }).first().click();
    await expect.poll(() => sent?.slug).toBe('new-app');
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page);
    await page.goto('/admin/products/new');
    await expect(page.getByLabel('Slug')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
