import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const LOG = { id: 'a1', actorId: 'u9', actorEmail: 'staff@example.test', action: 'order.refunded', targetType: 'order', targetId: 'o1', meta: { reason: 'Customer asked', amount: 1500 }, ip: '203.0.113.9', createdAt: '2026-11-02T10:00:00Z' };
const RELATED = { ...LOG, id: 'a0', action: 'order.paid', actorEmail: null, actorId: null, meta: null, createdAt: '2026-11-01T10:00:00Z' };

test.describe('one audit entry on its own page', () => {
  test('the list links to it and it shows detail, target and related entries', async ({ page }) => {
    await stubAdmin(page, (path) => {
      if (path === '/admin/audit/a1') return { log: LOG, related: [RELATED] };
      if (path === '/admin/audit') return { logs: [LOG], total: 1, pagination: { hasMore: false, nextCursor: null } };
      return undefined;
    });
    await page.goto('/admin/audit');
    await page.getByText('order.refunded').first().click();
    await expect(page).toHaveURL(/\/admin\/audit\/a1$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('Customer asked')).toBeVisible();
    await expect(page.getByRole('link', { name: 'open' })).toHaveAttribute('href', '/admin/orders/o1');
    await expect(page.getByRole('link', { name: 'order.paid' })).toBeVisible();
  });
  test('fits at 390px and a missing entry says so', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path, _method, _body, route) => {
      if (path === '/admin/audit/a1') return { log: LOG, related: [RELATED] };
      if (path === '/admin/audit/nope') { void route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Audit entry not found.' }) }); return undefined; }
      return undefined;
    });
    await page.goto('/admin/audit/a1');
    await expect(page.getByText('Customer asked')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
