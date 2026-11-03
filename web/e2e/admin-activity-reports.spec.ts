import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const row = (id: string, action: string, createdAt: string, targetId = 'o1') => ({ id, actorId: 'u9', actorEmail: 'staff@example.test', action, targetType: 'order', targetId, meta: null, ip: null, createdAt });
const REPORT = { generatedAt: '2026-11-03T10:00:00Z', months: ['2026-09', '2026-10'], mrr: { EUR: 1000 }, customers: 5, activeSubscriptions: 3, pastDue: 0, revenue: [{ currency: 'EUR', series: [1500, 2550] }], signups: [2, 3], cancellations: [0, 1], byProduct: [{ name: '=cmd|calc', currency: 'EUR', total: 4050, orders: 4 }], topCustomers: [{ email: 'cora@example.test', currency: 'EUR', total: 4050 }] };

test.describe('activity explorer and report export', () => {
  test('groups by day, passes the filters to the server, and opens an entry', async ({ page }) => {
    const queries: string[] = [];
    await stubAdmin(page, (path, method, _body, route) => {
      if (path === '/admin/audit' && method === 'GET') {
        queries.push(new URL(route.request().url()).search);
        return { logs: [row('a2', 'order.refunded', '2026-11-02T10:00:00Z'), row('a1', 'order.paid', '2026-11-01T10:00:00Z')], total: 2, pagination: { hasMore: false, nextCursor: null } };
      }
      return undefined;
    });
    await page.goto('/admin/activity');
    await expect(page.getByRole('link', { name: 'order.refunded' })).toBeVisible();
    await expect(page.locator('section h2, h2').filter({ hasText: /November/ })).toHaveCount(2);
    await page.getByLabel('Target id').fill('o1');
    await expect.poll(() => queries.some((q) => q.includes('targetId=o1'))).toBe(true);
    await page.getByRole('link', { name: 'order.paid' }).click();
    await expect(page).toHaveURL(/\/admin\/audit\/a1$/);
  });
  test('the export previews the file and neutralises a formula in a cell', async ({ page }) => {
    await stubAdmin(page, (path) => (path === '/admin/reports' ? REPORT : undefined));
    await page.goto('/admin/reports/exports');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('15.00')).toBeVisible();
    await page.getByLabel('Data').selectOption('products');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('blipmade-products-12-months.csv');
    const text = await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8');
    expect(text).toContain("'=cmd|calc");
    expect(text).not.toMatch(/(^|,)=cmd/m);
  });
});
