import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Note', lastName: 'Owner', name: 'Note Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const NOTE = (n: number, readAt: string | null) => ({ id: `n${n}`, category: 'billing', title: `Message ${n}`, body: `Body of message ${n}`, actionUrl: '/app/billing', actionLabel: 'Open billing', readAt, createdAt: `2026-11-0${n}T10:00:00.000Z` });

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { unread: 1, count: 1 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/notifications/preferences') return json(route, { preferences: {}, categories: [{ key: 'billing', label: 'Billing', description: '', channels: ['inapp'], locked: [] }] });
    if (path === '/notifications') return json(route, { notifications: [NOTE(3, null), NOTE(2, '2026-11-02T11:00:00.000Z'), NOTE(1, '2026-11-01T11:00:00.000Z')], unread: 1, pagination: { nextCursor: null, hasMore: false } });
    return json(route, {});
  });
}

test('the notifications are divided rows, the unread one is tinted and the actions are grouped with tooltips', async ({ page }) => {
  await stub(page);
  await page.goto('/app/notifications');
  const rows = page.locator('li[data-unread]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveAttribute('data-unread', 'true');
  const metrics = await rows.evaluateAll((nodes) => nodes.map((node) => ({ top: getComputedStyle(node).borderTopWidth, bottom: getComputedStyle(node).borderBottomWidth, tint: getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)' })));
  expect(metrics.map((row) => row.top)).toEqual(['0px', '1px', '1px']);
  expect(metrics.every((row) => row.bottom === '0px')).toBe(true);
  expect(metrics.map((row) => row.tint)).toEqual([true, false, false]);
  const read = rows.first().getByRole('button', { name: /Mark as read: Message 3/ });
  await expect(read).toHaveAttribute('data-tip', 'Mark this message as read');
  await expect(rows.first().getByRole('group', { name: 'Actions for this message' })).toBeVisible();
  await expect(rows.nth(1).getByRole('button', { name: /Mark as read/ })).toHaveCount(0);
});

test('the notifications fit at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app/notifications');
  await expect(page.locator('li[data-unread]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
