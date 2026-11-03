import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('server import on its own page', () => {
  test('posts the panel server and the customer', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/instances/import' && method === 'POST') { sent = body; return {}; }
      return undefined;
    });
    await page.goto('/admin/services/import');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Import server' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Panel server number').fill('42');
    await page.getByLabel('Customer id').fill('u1');
    await go.click();
    await expect.poll(() => sent).toEqual({ pterodactylServerId: 42, userId: 'u1' });
    await expect(page).toHaveURL(/\/admin\/services$/);
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page);
    await page.goto('/admin/services/import');
    await expect(page.getByLabel('Customer id')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
