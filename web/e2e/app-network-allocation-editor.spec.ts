import { expect, test, type Page, type Route } from '@playwright/test';
const CUSTOMER = { id: 'network-owner', email: 'network@example.test', firstName: 'Network', lastName: 'Owner', name: 'Network Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function stub(page: Page, onCreate?: (body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/allocations' && req.method() === 'GET') return json(route, { allocations: [{ id: 1, ip: '10.77.0.10', port: 30000, alias: 'primary', is_default: true }], limit: 3 });
    if (path === '/instances/instance-1/allocations' && req.method() === 'POST') { const body = req.postDataJSON() as Record<string, unknown>; onCreate?.(body); return json(route, { created: true }, 201); }
    return json(route, {});
  });
}
test.describe('dedicated network allocation editor', () => {
  test('validates and sends the exact allocation contract', async ({ page }) => {
    let payload: Record<string, unknown> | undefined; await stub(page, (body) => { payload = body; });
    await page.goto('/app/instances/instance-1/network/new');
    await page.getByLabel('IP address').fill('999.1.1.1'); await page.getByLabel('Port').fill('70000'); await page.getByRole('button', { name: 'Add address' }).click();
    await expect(page.getByText('Enter a valid IPv4 or IPv6 address.')).toBeVisible(); await expect(page.getByText('Use a port from 1 to 65535.')).toBeVisible();
    await page.getByLabel('IP address').fill('10.77.0.11'); await page.getByLabel('Port').fill('30001'); await page.getByLabel('Label (optional)').fill('bot');
    await page.getByRole('button', { name: 'Add address' }).click(); await page.waitForURL('**/app/instances/instance-1/network');
    expect(payload).toEqual({ ip: '10.77.0.11', port: 30001, alias: 'bot' });
  });
  test('guards a draft and fits at 390px', async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); await stub(page); await page.goto('/app/instances/instance-1/network/new'); await page.getByLabel('IP address').fill('10.77.0.12'); page.once('dialog', async (dialog) => { await dialog.dismiss(); }); await page.getByRole('link', { name: 'Back to network' }).click(); await expect(page).toHaveURL(/network\/new$/); await expect(page.getByRole('button', { name: 'Add address' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false); });
});
