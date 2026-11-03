import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const PROMOTION = { id: 'p1', code: 'LAUNCH', type: 'percent', value: 1000, maxRedemptions: 100, maxPerUser: 1, active: true, startsAt: null, endsAt: null, createdAt: '2026-11-01T00:00:00Z', stats: { redemptions: 3, reserved: 5, discountGranted: 0, revenue: 0, uniqueCustomers: 3, protectedCards: 0 }, redemptions: [], audit: [] };

test.describe('campaign settings on their own page', () => {
  test('saves only after the review and returns to the campaign', async ({ page }) => {
    let payload: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/promotions/p1' && method === 'PATCH') { payload = body as Record<string, unknown>; return { promotion: PROMOTION }; }
      if (path === '/admin/promotions/p1') return { promotion: PROMOTION };
      return undefined;
    });
    await page.goto('/admin/promotions/p1');
    await page.getByRole('link', { name: 'Edit settings' }).click();
    await expect(page).toHaveURL(/\/admin\/promotions\/p1\/edit$/);
    await expect(page.getByRole('button', { name: 'Review changes' })).toBeDisabled();
    await page.getByLabel('Total redemption cap').fill('2');
    await expect(page.getByRole('alert')).toContainText('cap above current reservations');
    await page.getByLabel('Total redemption cap').fill('250');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save campaign' }).click();
    await expect(page).toHaveURL(/\/admin\/promotions\/p1$/);
    expect(payload).toMatchObject({ maxRedemptions: 250, maxPerUser: 1, active: true });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/promotions/p1' ? { promotion: PROMOTION } : undefined));
    await page.goto('/admin/promotions/p1/edit');
    await expect(page.getByLabel('Total redemption cap')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
