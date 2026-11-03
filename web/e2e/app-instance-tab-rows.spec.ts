import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Tab', lastName: 'Owner', name: 'Tab Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'Shop', status: 'running', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-03T00:00:00.000Z', stale: false }, product: { slug: 'wordpress', name: 'WordPress', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: 'https://shop.apps.blipmade.com', createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false };
const BACKUPS = [1, 2, 3].map((n) => ({ id: `b${n}`, name: `backup-${n}`, size: 1048576 * n, created_at: `2026-11-0${n}T10:00:00.000Z`, is_locked: false, kind: n === 2 ? 'scheduled' : 'manual' }));

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/i1') return json(route, { instance: INSTANCE });
    if (path === '/instances/i1/backups') return json(route, { backups: BACKUPS, limit: 5, storage: 'local', preset: 'daily', lastRun: null, nextRun: null });
    return json(route, {});
  });
}

test('the backup rows are divided, their actions are one group with tooltips and share a centre line with the cells', async ({ page }) => {
  await stub(page);
  await page.goto('/app/instances/i1/backups');
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(3);
  const lines = await rows.evaluateAll((nodes) => nodes.map((node) => ({ top: getComputedStyle(node.querySelector('td')!).borderTopWidth, bottom: getComputedStyle(node.querySelector('td')!).borderBottomWidth })));
  expect(lines.map((line) => line.top)).toEqual(['0px', '1px', '1px']);
  expect(lines.every((line) => line.bottom === '0px')).toBe(true);
  const first = rows.first();
  const group = first.getByRole('group', { name: 'Actions' });
  await expect(group.getByRole('button', { name: 'Download' })).toHaveAttribute('title', 'Download this backup');
  await expect(group.getByRole('link', { name: 'Restore' })).toHaveAttribute('title', /Restore this backup/);
  await expect(group.getByRole('button', { name: 'Delete' })).toHaveAttribute('title', 'Delete this backup for good');
  const centre = async (locator: ReturnType<typeof page.locator>) => locator.evaluate((node) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; });
  const row = await centre(first);
  expect(Math.abs((await centre(group)) - row)).toBeLessThan(2);
  expect(Math.abs((await centre(first.getByText('backup-1'))) - row)).toBeLessThan(2);
});

test('the backups fit at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app/instances/i1/backups');
  await expect(page.getByText(/3 of 5 kept/)).toBeVisible();
  const cards = page.locator('main div.md\\:hidden > div');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
