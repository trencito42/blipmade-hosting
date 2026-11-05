import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const CUSTOMERS = { customers: [{ id: 'u1', email: 'a@example.test', name: 'Ann', verified: true, suspended: false, createdAt: '2026-10-01T00:00:00Z', instanceCount: 1, orderCount: 0, ticketCount: 0, monthlyValue: 0, tags: [] }, { id: 'u2', email: 'b@example.test', name: 'Bob', verified: true, suspended: false, createdAt: '2026-10-02T00:00:00Z', instanceCount: 0, orderCount: 0, ticketCount: 0, monthlyValue: 0, tags: [] }], total: 2, pagination: { hasMore: false, nextCursor: null } };

test.describe('bulk tags on their own page', () => {
  test('the picked accounts go to the page and the tag is added to them', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/customers/bulk-tags' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/tags') return { tags: [] };
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/customers') return CUSTOMERS;
      return undefined;
    });
    await page.goto('/admin/customers');
    await page.getByLabel('Select Ann').check();
    await page.getByLabel('Select Bob').check();
    await expect(page.getByLabel('Tag')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit tags' }).click();
    await expect(page).toHaveURL(/\/admin\/customers\/bulk-edit$/);
    await expect(page.getByText('2 accounts picked')).toBeVisible();
    await page.getByLabel('Tag').fill('vip');
    await page.getByRole('button', { name: 'Add the tag' }).click();
    await expect.poll(() => sent).toEqual({ ids: ['u1', 'u2'], add: ['vip'] });
  });
  test('with nothing picked the page says so', async ({ page }) => {
    await stubAdmin(page);
    await page.goto('/admin/customers/bulk-edit');
    await expect(page.getByText('No account is picked.').first()).toBeVisible();
  });
});
