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

test('the instances page writes its title once and links the access code page', async ({ page }) => {
  await stub(page);
  await page.goto('/app/instances');
  await expect(page.locator('h1:visible')).toHaveCount(1);
  await expect(page.locator('h1:visible')).toHaveText('Apps & databases');
  await expect(page.getByRole('heading', { name: /Apps & Databases/i })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Access code' })).toHaveAttribute('href', '/app/instances/redeem');
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(3);
  const lines = await rows.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node.querySelector('td')!).borderTopWidth));
  expect(lines).toEqual(['0px', '1px', '1px']);
});

test('the tickets page aligns the docs search and keeps Close for an open ticket only', async ({ page }) => {
  await stub(page);
  await page.goto('/app/tickets');
  const search = page.getByLabel('Search the documentation');
  const go = page.getByRole('search').getByRole('button', { name: 'Search' });
  expect(Math.abs((await centre(search)) - (await centre(go)))).toBeLessThan(2);
  const rows = page.locator('table tbody tr');
  await expect(rows.nth(0).getByRole('button', { name: 'Close ticket 101' })).toHaveAttribute('data-tip', /Close this ticket/);
  await expect(rows.nth(2).getByRole('button')).toHaveCount(0);
  await rows.nth(0).locator('td').nth(1).click();
  await page.waitForURL(/\/app\/tickets\/t\d+$/);
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

test('the instances can be filtered by type, and the type filter only lists owned types', async ({ page }) => {
  await stub(page);
  await page.goto('/app/instances');
  const type = page.locator('label', { hasText: 'Type' }).locator('select');
  await expect(type.locator('option')).toHaveText(['All types', 'Minecraft', 'Node', 'WordPress']);
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  await type.selectOption('Minecraft');
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.locator('table tbody tr').first()).toContainText('Minecraft server');
  await type.selectOption('all');
  await expect(page.locator('table tbody tr')).toHaveCount(3);
});
