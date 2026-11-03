import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const STAFF = { staff: [{ userId: 's1', email: 'sam@example.test', name: 'Sam', role: 'staff', title: null, permissions: ['tickets.read'] }], available: ['tickets.read', 'tickets.write', 'orders.read'] };

test.describe('staff rights on their own page', () => {
  test('the list links, the page saves after review', async ({ page }) => {
    let payload: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/staff' && method === 'GET') return STAFF;
      if (path === '/admin/staff/s1' && method === 'PUT') { payload = body as Record<string, unknown>; return { staff: { userId: 's1', permissions: [] } }; }
      return undefined;
    });
    await page.goto('/admin/staff');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit rights' }).first().click();
    await expect(page).toHaveURL(/\/admin\/staff\/s1\/permissions\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Review changes' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'tickets.write' }).check();
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('dialog')).toContainText('gains tickets.write');
    await page.getByRole('dialog').getByRole('button', { name: 'Save permissions' }).click();
    await expect(page).toHaveURL(/\/admin\/staff$/);
    expect(payload).toEqual({ permissions: ['tickets.read', 'tickets.write'] });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/staff' ? STAFF : undefined));
    await page.goto('/admin/staff/s1/permissions/edit');
    await expect(page.getByRole('checkbox', { name: 'orders.read' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
