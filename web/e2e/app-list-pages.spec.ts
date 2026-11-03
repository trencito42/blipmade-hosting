import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'List', lastName: 'Owner', name: 'List Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const inst = (n: number) => ({ id: `i${n}`, name: ['Shop', 'Minecraft server', 'Docs'][n - 1], status: ['running', 'running', 'stopped'][n - 1], runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-03T00:00:00.000Z', stale: false }, product: { slug: 'wordpress', name: ['WordPress', 'Minecraft', 'Node'][n - 1], icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900 * n, currency: 'EUR', url: `https://app${n}.apps.blipmade.com`, createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false });
const ticket = (n: number) => ({ id: `t${n}`, number: 100 + n, subject: ['Cannot log in to my panel', 'Invoice question', 'Server slow'][n - 1], status: ['open', 'answered', 'closed'][n - 1], priority: 'normal', category: 'general', createdAt: `2026-11-0${n}T10:00:00.000Z`, updatedAt: `2026-11-0${n}T12:00:00.000Z`, channel: 'ticket', departmentId: null });

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
    if (path === '/instances') return json(route, { instances: [1, 2, 3].map(inst) });
    if (path === '/tickets') return json(route, { tickets: [1, 2, 3].map(ticket) });
    if (path === '/tickets/categories') return json(route, { categories: [] });
    if (path === '/catalog/products') return json(route, { products: [] });
    return json(route, {});
  });
}

const centre = (locator: ReturnType<Page['locator']>) => locator.evaluate((node) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; });

test('the instances page writes its title once and aligns the access code field with its button', async ({ page }) => {
  await stub(page);
  await page.goto('/app/instances');
  await expect(page.locator('h1:visible')).toHaveCount(1);
  await expect(page.locator('h1:visible')).toHaveText('Apps & databases');
  await expect(page.getByRole('heading', { name: /Apps & Databases/i })).toHaveCount(1);
  const input = page.getByLabel('Got an access code?');
  const button = page.getByRole('button', { name: 'Use code' });
  expect(Math.abs((await centre(input)) - (await centre(button)))).toBeLessThan(2);
  const heights = await Promise.all([input, button].map((locator) => locator.evaluate((node) => Math.round(node.getBoundingClientRect().height))));
  expect(heights[0]).toBe(heights[1]);
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(3);
  const lines = await rows.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node.querySelector('td')!).borderTopWidth));
  expect(lines).toEqual(['0px', '1px', '1px']);
});

test('the tickets page aligns the docs search and groups the row actions', async ({ page }) => {
  await stub(page);
  await page.goto('/app/tickets');
  const search = page.getByLabel('Search the documentation first');
  const go = page.getByRole('search').getByRole('button', { name: 'Search' });
  expect(Math.abs((await centre(search)) - (await centre(go)))).toBeLessThan(2);
  const open = page.locator('table tbody tr').nth(0).getByRole('group', { name: 'Actions for ticket 101' });
  await expect(open.getByRole('link', { name: 'Reply to ticket 101' })).toHaveAttribute('title', /reply/i);
  await expect(open.getByRole('button', { name: 'Close ticket 101' })).toHaveAttribute('title', /Close this ticket/);
  const closed = page.locator('table tbody tr').nth(2).getByRole('group', { name: 'Actions for ticket 103' });
  await expect(closed.getByRole('button')).toHaveCount(0);
  const row = await centre(page.locator('table tbody tr').nth(0));
  expect(Math.abs((await centre(open)) - row)).toBeLessThan(2);
});

test('both pages fit at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  for (const route of ['/app/instances', '/app/tickets']) {
    await page.goto(route);
    await expect(page.locator('h1:visible')).toHaveCount(1);
    await expect(page.locator('h1:visible')).not.toHaveText('Something went wrong');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), route).toBe(false);
  }
});
