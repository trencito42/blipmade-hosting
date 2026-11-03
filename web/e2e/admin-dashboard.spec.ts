import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const OVERVIEW = { overview: { customers: 12, instances: 20, activeInstances: 17, openTickets: 3, ordersToday: 2, revenueMonth: 125000, mrr: 98000, currency: 'EUR', provisioningFailures: 2 } };

test.describe('admin dashboard', () => {
  test('an alert feed that opens the right places, KPI tiles that drill down, and the latest actions', async ({ page }) => {
    await stubAdmin(page, (path) => {
      if (path === '/admin/overview') return OVERVIEW;
      if (path === '/admin/incidents') return { incidents: [{ id: 'i1', title: 'Slow deploys', impact: 'major', resolvedAt: null, startedAt: '2026-11-03T08:00:00Z' }, { id: 'i0', title: 'Old', impact: 'minor', resolvedAt: '2026-11-01T00:00:00Z', startedAt: '2026-10-31T00:00:00Z' }] };
      if (path === '/admin/queues') return { queues: [{ name: 'email', label: 'Outgoing email', counts: { failed: 4 } }] };
      if (path === '/admin/dead-letters') return { failures: [], total: 0 };
      if (path === '/admin/webhooks/failed') return { failed: [] };
      if (path === '/admin/support/counts') return { counts: { sla_at_risk: 1 } };
      if (path === '/admin/audit') return { logs: [{ id: 'a1', action: 'order.refunded', actorEmail: 'staff@example.test', targetType: 'order', targetId: 'o1', createdAt: '2026-11-03T09:00:00Z' }], total: 1, pagination: { hasMore: false, nextCursor: null } };
      return undefined;
    });
    await page.goto('/admin');
    const feed = page.getByRole('region').filter({ hasText: 'Needs attention' }).or(page.locator('section').filter({ hasText: 'Needs attention' })).first();
    await expect(page.getByText('Slow deploys')).toBeVisible();
    await expect(page.getByText('Old', { exact: true })).toHaveCount(0);
    await expect(page.getByText('2 services failed to provision')).toBeVisible();
    await expect(page.getByText('4 failed jobs in the queues')).toBeVisible();
    await expect(page.getByText('1 conversation is at risk of missing the response target')).toBeVisible();
    void feed;
    await expect(page.getByRole('link', { name: /Customers/ }).first()).toHaveAttribute('href', '/admin/customers');
    await expect(page.getByRole('link', { name: 'order.refunded' })).toBeVisible();
    await page.getByText('4 failed jobs in the queues').click();
    await expect(page).toHaveURL(/\/admin\/queues$/);
  });
  test('a quiet platform says so, and the page fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => {
      if (path === '/admin/overview') return { overview: { ...OVERVIEW.overview, provisioningFailures: 0 } };
      if (path === '/admin/incidents') return { incidents: [] };
      if (path === '/admin/queues') return { queues: [] };
      if (path === '/admin/dead-letters') return { failures: [], total: 0 };
      if (path === '/admin/webhooks/failed') return { failed: [] };
      if (path === '/admin/support/counts') return { counts: {} };
      if (path === '/admin/audit') return { logs: [], total: 0, pagination: { hasMore: false, nextCursor: null } };
      return undefined;
    });
    await page.goto('/admin');
    await expect(page.getByText('Nothing needs attention now')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
