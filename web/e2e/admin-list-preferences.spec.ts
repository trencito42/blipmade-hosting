import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const CUSTOMER = { id: 'u1', email: 'ada@example.test', name: 'Ada Customer', role: 'customer', tags: [], createdAt: '2026-11-01T00:00:00Z', verified: true, suspended: false, instanceCount: 2, orderCount: 3, ticketCount: 1, monthlyValue: 1200 };

test('an operator saves, reapplies and keeps personal list preferences', async ({ page }) => {
  const views: { id: string; name: string; query: Record<string, unknown>; createdAt: string }[] = [];
  let saved: Record<string, unknown> | undefined;
  await stubAdmin(page, (path, method, body) => {
    if (path === '/admin/customers') return { customers: [CUSTOMER], total: 1, pagination: { hasMore: false, nextCursor: null } };
    if (path === '/admin/tags') return { tags: [] };
    if (path === '/admin/saved-views' && method === 'GET') return { views };
    if (path === '/admin/saved-views' && method === 'POST') {
      saved = body as Record<string, unknown>;
      const view = { id: 'v1', name: String(saved.name), query: saved.query as Record<string, unknown>, createdAt: new Date().toISOString() };
      views.push(view);
      return { view };
    }
    return undefined;
  });

  await page.goto('/admin/customers');
  await page.getByLabel('Accounts').selectOption('staff');
  await page.getByRole('searchbox', { name: 'Search' }).fill('Ada');
  await page.waitForTimeout(350);
  await page.getByText('Views', { exact: true }).click();
  await page.getByPlaceholder('View name').fill('Staff named Ada');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => saved).toMatchObject({ scope: 'customers', name: 'Staff named Ada', query: { search: 'Ada', role: 'staff', tag: '' } });

  await page.getByText('Views', { exact: true }).click();
  await page.getByLabel('Accounts').selectOption('all');
  await page.getByRole('searchbox', { name: 'Search' }).fill('');
  await page.getByText('Views', { exact: true }).click();
  await page.getByRole('button', { name: 'Staff named Ada', exact: true }).click();
  await expect(page.getByLabel('Accounts')).toHaveValue('staff');
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('Ada');

  await page.getByText('Views', { exact: true }).click();
  await page.getByText('Columns', { exact: true }).click();
  await page.getByLabel('Orders', { exact: true }).uncheck();
  await expect(page.getByRole('columnheader', { name: 'Orders' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Orders' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Customer' })).toBeVisible();
});

test('all four large lists expose views and columns on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAdmin(page, (path) => {
    if (path === '/admin/saved-views') return { views: [] };
    if (path === '/admin/customers') return { customers: [], total: 0, pagination: { hasMore: false, nextCursor: null } };
    if (path === '/admin/tags') return { tags: [] };
    if (path === '/admin/orders') return { orders: [], total: 0, pagination: { hasMore: false, nextCursor: null } };
    if (path === '/admin/services') return { services: [], total: 0 };
    if (path === '/admin/tickets') return { tickets: [], total: 0, pagination: { hasMore: false, nextCursor: null } };
    return undefined;
  });
  for (const path of ['/admin/customers', '/admin/orders', '/admin/services', '/admin/tickets']) {
    await page.goto(path);
    await expect(page.getByText('Views', { exact: true })).toBeVisible();
    await expect(page.getByText('Columns', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
});
