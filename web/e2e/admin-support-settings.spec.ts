import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const handler = (path: string) => {
  if (path === '/admin/support/departments') return { departments: [{ id: 'd1', name: 'Technical', description: null, visible: true, members: 2, conversations: 0 }] };
  if (path === '/admin/support/guest') return { config: { enabled: false, retentionDays: 30, notice: 'Hello' } };
  if (path === '/admin/support/me') return { name: 'Ada Admin', avatar: null };
  if (path === '/admin/support/conversations') return { conversations: [], pagination: { hasMore: false } };
  if (path === '/admin/support/counts') return { counts: {} };
  if (path === '/admin/support/presence') return { staff: [] };
  return undefined;
};

test.describe('support settings out of the inbox', () => {
  test('the inbox links to the page that holds photo, visitor chat and departments', async ({ page }) => {
    await stubAdmin(page, handler);
    await page.goto('/admin/support');
    await expect(page.getByText('New department')).toHaveCount(0);
    await page.getByRole('link', { name: 'Support settings' }).click();
    await expect(page).toHaveURL(/\/admin\/support\/settings$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByLabel('New department')).toBeVisible();
    await expect(page.getByText('Technical')).toBeVisible();
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, handler);
    await page.goto('/admin/support/settings');
    await expect(page.getByLabel('New department')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
