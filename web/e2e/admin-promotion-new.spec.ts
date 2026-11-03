import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('new promotion on its own page', () => {
  test('creates the code and opens the campaign', async ({ page }) => {
    let payload: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/promotions' && method === 'POST') { payload = body as Record<string, unknown>; return { promotion: { id: 'p1', code: 'LAUNCH' } }; }
      if (path === '/admin/promotions/p1') return { promotion: { id: 'p1', code: 'LAUNCH', type: 'percent', value: 1000, maxRedemptions: null, maxPerUser: null, active: true, startsAt: null, endsAt: null, createdAt: '2026-11-01T00:00:00Z', stats: { redemptions: 0, reserved: 0, discountGranted: 0, revenue: 0, uniqueCustomers: 0, protectedCards: 0 }, redemptions: [], audit: [] } };
      return undefined;
    });
    await page.goto('/admin/promotions/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.getByLabel('Code').fill('launch');
    await page.getByLabel(/^Value/).fill('1000');
    await page.getByRole('button', { name: 'Create promotion' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create promotion' }).click();
    await expect(page).toHaveURL(/\/admin\/promotions\/p1$/);
    expect(payload).toMatchObject({ code: 'LAUNCH', type: 'PERCENT', value: 1000, active: true });
  });
  test('the list only links to it and the page fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/promotions' ? { promotions: [] } : undefined));
    await page.goto('/admin/promotions');
    await expect(page.getByLabel('Code')).toHaveCount(0);
    await page.getByRole('link', { name: 'New promotion' }).first().click();
    await expect(page).toHaveURL(/\/admin\/promotions\/new$/);
    await expect(page.getByRole('button', { name: 'Create promotion' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
