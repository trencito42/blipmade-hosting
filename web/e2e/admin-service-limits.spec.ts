import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const SERVICE = { id: 's1', name: 'Survival', panel: { databases: 1, backups: 2, allocations: 3 } };

test.describe('service panel limits on their own page', () => {
  test('saves the three limits with a reason', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/instances/s1/feature-limits' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/services/s1') return { service: SERVICE };
      return undefined;
    });
    await page.goto('/admin/services/s1/limits/edit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Save limits' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Backups').fill('5');
    await page.getByLabel('Reason').fill('Plan upgrade');
    await go.click();
    await expect(page).toHaveURL(/\/admin\/services\/s1$/);
    expect(sent).toEqual({ databases: 1, backups: 5, allocations: 3, reason: 'Plan upgrade' });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/services/s1' ? { service: SERVICE } : undefined));
    await page.goto('/admin/services/s1/limits/edit');
    await expect(page.getByLabel('Databases')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
