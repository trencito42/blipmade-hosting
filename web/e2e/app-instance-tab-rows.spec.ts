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
  await expect(group.getByRole('button', { name: 'Download' })).toHaveAttribute('data-tip', 'Download this backup');
  await expect(group.getByRole('link', { name: 'Restore' })).toHaveAttribute('data-tip', /Restore this backup/);
  await expect(group.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-tip', 'Delete this backup for good');
  const centre = async (locator: ReturnType<typeof page.locator>) => locator.evaluate((node) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; });
  const row = await centre(first);
  expect(Math.abs((await centre(group)) - row)).toBeLessThan(2);
  expect(Math.abs((await centre(first.getByText('backup-1'))) - row)).toBeLessThan(2);
});

test('the backups fit at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app/instances/i1/backups');
  await expect(page.getByRole('heading', { name: 'Backups' }).first()).toBeVisible();
  const cards = page.locator('main div.md\\:hidden > div');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('the instance sections: the everyday ones first, the others in a categorized Advanced directory, and a deep link opens its section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto('/app/instances/i1/backups');
  const main = page.getByRole('group', { name: 'Instance sections' }).or(page.locator('[aria-label="Instance sections"]'));
  await expect(main.getByRole('tab', { name: 'Backups' }).or(main.getByRole('button', { name: 'Backups' })).first()).toBeVisible();
  await expect(page.locator('[aria-label="Advanced instance sections"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  const more = page.locator('[aria-label="Advanced instance sections"]');
  await expect(more).toBeVisible();
  await expect(more.getByText('Server setup', { exact: true })).toBeVisible();
  await expect(more.getByText('Operations', { exact: true })).toBeVisible();
  for (const name of ['Network', 'Startup', 'Schedules', 'Activity']) await expect(more.getByRole('link', { name, exact: true })).toBeVisible();
  // An advanced deep link keeps the directory open and marks its current page.
  await page.goto('/app/instances/i1/network');
  await expect(page.locator('[aria-label="Advanced instance sections"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Network', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

for (const width of [320, 357, 390, 768]) {
  test(`the instance header does not overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await stub(page);
    await page.goto('/app/instances/i1/backups');
    const parts = {
      name: page.locator('header p[title="Shop"]'),
      open: page.getByRole('link', { name: /^Open/ }).first(),
      power: page.getByRole('group', { name: 'Power' }),
    };
    for (const locator of Object.values(parts)) await expect(locator).toBeVisible();
    const rects = Object.fromEntries(await Promise.all(Object.entries(parts).map(async ([key, locator]) => [key, await locator.boundingBox()])));
    expect(rects.name!.width).toBeGreaterThan(60);
    const keys = Object.keys(rects);
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = rects[keys[i]!]!; const b = rects[keys[j]!]!;
        const overlap = a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
        expect(overlap, `${keys[i]} and ${keys[j]} overlap at ${width}px`).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
}
