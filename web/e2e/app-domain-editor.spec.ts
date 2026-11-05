import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = {
  id: 'domain-editor-customer', email: 'domain@example.test', firstName: 'Domain', lastName: 'Owner',
  name: 'Domain Owner', role: 'CUSTOMER', emailVerified: true, permissions: [],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubDomainEditor(page: Page, onCreate?: (path: string, body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances' && request.method() === 'GET') {
      return json(route, { instances: [{
        id: 'instance-domain-1', name: 'Customer portal', status: 'active', access: 'owner',
        product: { name: 'Node.js', slug: 'nodejs', icon: 'node' },
      }] });
    }
    if (path === '/instances/instance-domain-1/domains' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      onCreate?.(path, body);
      return json(route, { domain: {
        id: 'domain-1', instanceId: 'instance-domain-1', instanceName: 'Customer portal', hostname: body.hostname,
        status: 'verifying', targetPort: 3000, dnsRecords: [], lastError: null,
        verification: { host: '_blipmade.app.example.com', token: 'proof-token', verified: false, verifiedAt: null, expiresAt: null, instructions: 'Publish TXT.' },
      } }, 201);
    }
    return json(route, {});
  });
}

test.describe('the dedicated add-domain editor', () => {
  test('validates, selects an owned instance and creates the exact claim', async ({ page }) => {
    let sent: { path: string; body: Record<string, unknown> } | undefined;
    await stubDomainEditor(page, (path, body) => { sent = { path, body }; });
    await page.goto('/app/domains/new');

    await expect(page.getByRole('heading', { name: 'Add a domain' })).toBeVisible();
    await page.getByRole('button', { name: 'Create domain claim' }).click();
    await expect(page.getByText('Enter the hostname you want to use.')).toBeVisible();

    const instance = page.getByRole('combobox', { name: 'Instance' });
    await instance.click();
    await expect(page.getByRole('option', { name: /Customer portal/ })).toBeVisible();
    await instance.press('ArrowDown');
    await instance.press('Enter');
    await page.getByLabel('Hostname').fill('App.Example.com');
    await page.getByRole('button', { name: 'Create domain claim' }).click();

    await page.waitForURL('**/app/domains?created=domain-1');
    expect(sent).toEqual({ path: '/instances/instance-domain-1/domains', body: { hostname: 'app.example.com', purpose: 'http' } });
  });

  test('fits the complete editor at 390px without horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubDomainEditor(page);
    await page.goto('/app/domains/new');
    await expect(page.getByRole('button', { name: 'Create domain claim' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
