import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Dom', lastName: 'Owner', name: 'Dom Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

const DOMAINS = [
  { id: 'dom-platform', instanceId: 'i1', instanceName: 'Shop', hostname: 'shop.apps.blipmade.com', status: 'active', targetPort: 80, dnsRecords: [], lastError: null, platform: true, addressChangeAvailableAt: null, verification: { host: null, token: null, verified: true, verifiedAt: null, expiresAt: null } },
  { id: 'dom-custom', instanceId: 'i1', instanceName: 'Shop', hostname: 'shop.example.test', status: 'active', targetPort: 80, dnsRecords: [], lastError: null, platform: false, addressChangeAvailableAt: null, verification: { host: null, token: null, verified: true, verifiedAt: null, expiresAt: null } },
];

async function stub(page: Page, calls: string[], bodies: unknown[] = []) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/domains' && req.method() === 'GET') return json(route, { domains: DOMAINS });
    if (path === '/domains/dom-platform/address' && req.method() === 'PUT') { calls.push('address'); bodies.push(req.postDataJSON()); return json(route, { domain: { ...DOMAINS[0], hostname: 'newshop.apps.blipmade.com' } }); }
    if (path === '/domains/dom-custom' && req.method() === 'DELETE') { calls.push('delete'); return json(route, { ok: true }); }
    return json(route, {});
  });
}

test.describe('dedicated domain pages', () => {
  test('renames the platform address with the exact name', async ({ page }) => {
    const calls: string[] = []; const bodies: unknown[] = [];
    await stub(page, calls, bodies);
    await page.goto('/app/domains/dom-platform/edit');
    await page.getByLabel('Address name').fill('newshop');
    await page.getByRole('button', { name: 'Change address' }).click();
    await page.waitForURL('**/app/domains');
    expect(calls).toEqual(['address']);
    expect(bodies).toEqual([{ name: 'newshop' }]);
  });

  test('refuses to rename a custom domain', async ({ page }) => {
    await stub(page, []);
    await page.goto('/app/domains/dom-custom/edit');
    await expect(page.getByText('This is your own domain')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change address' })).toBeDisabled();
  });

  test('delete needs the exact hostname and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const calls: string[] = [];
    await stub(page, calls);
    await page.goto('/app/domains/dom-custom/delete');
    const confirm = page.getByRole('button', { name: 'Delete domain' });
    await expect(confirm).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.getByLabel(/Type/).fill('shop.example.test');
    await confirm.click();
    await page.waitForURL('**/app/domains');
    expect(calls).toEqual(['delete']);
  });

  test('the list is compact: one divided row per domain, grouped actions with tooltips', async ({ page }) => {
    await stub(page, []);
    await page.goto('/app/domains');
    const rows = page.locator('article');
    await expect(rows).toHaveCount(2);
    const heights = await rows.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    expect(heights[0]).toBeLessThan(90);
    const borders = await rows.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).borderTopWidth + '/' + getComputedStyle(node).borderBottomWidth));
    expect(borders[1]).toBe('1px/0px');
    expect(borders[0]).toBe('0px/0px');
    await expect(page.getByRole('link', { name: 'Delete' }).first()).toHaveAttribute('data-tip', /Delete this domain/);
    await expect(page.getByRole('link', { name: 'Change' })).toHaveAttribute('data-tip', /once in 7 days/);
    await page.screenshot({ path: '/tmp/claude-0/-root/aae46db4-fcaf-4b45-85b9-bd3609e50f02/scratchpad/domains-list.png' });
  });

  test('on a domain row the status and the actions share one centre line with the name', async ({ page }) => {
    await stub(page, []);
    await page.goto('/app/domains');
    const row = page.locator('article').first();
    const centre = async (locator: ReturnType<typeof page.locator>) => locator.evaluate((node) => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; });
    const name = await centre(row.locator('p').first().locator('xpath=..'));
    const status = await centre(row.getByText('Active', { exact: true }));
    const actions = await centre(row.getByRole('group'));
    expect(Math.abs(status - actions)).toBeLessThan(2);
    expect(Math.abs(name - actions)).toBeLessThan(2);
  });
});
