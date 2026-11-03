import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = {
  id: 'mail-domain-customer', email: 'mail@example.test', firstName: 'Mail', lastName: 'Owner',
  name: 'Mail Owner', role: 'CUSTOMER', emailVerified: true, permissions: [],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubMailEditor(page: Page, onCreate?: (path: string, body: Record<string, unknown>) => void) {
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
    if (path === '/mail/domains' && request.method() === 'GET') return json(route, { domains: [] });
    if (path === '/mail/services' && request.method() === 'GET') return json(route, { services: [{
      id: 'mail-service-1', status: 'ACTIVE', plan: { slug: 'starter', name: 'Starter Mail', category: 'mail' },
      limits: { maxDomains: 3, maxMailboxes: 10, maxAliases: 20, storageMb: 10240 },
      usage: { domains: 1, mailboxes: 2, storageMb: 120, storageLimitMb: 10240 }, domains: [],
      graceUntil: null, suspendedAt: null, cancelledAt: null, retentionUntil: null, lastError: null,
      createdAt: '2026-11-03T10:00:00.000Z',
    }] });
    if (path === '/mail/services/mail-service-1/domains' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      onCreate?.(path, body);
      return json(route, { domain: { id: 'mail-domain-1', name: body.name, verificationHost: '_blipmade.example.com', verificationToken: 'mail-proof' } }, 201);
    }
    return json(route, {});
  });
}

test.describe('the dedicated email-domain editor', () => {
  test('validates, preserves plan association and shows the ownership proof', async ({ page }) => {
    let sent: { path: string; body: Record<string, unknown> } | undefined;
    await stubMailEditor(page, (path, body) => { sent = { path, body }; });
    await page.goto('/app/mail/domains/new');
    await page.getByRole('button', { name: 'Add email domain' }).click();
    await expect(page.getByText(/hostname/i).first()).toBeVisible();
    await page.getByLabel('Email domain').fill('Example.COM');
    await page.getByRole('button', { name: 'Add email domain' }).click();

    await expect(page.getByRole('heading', { name: 'Email domain added' })).toBeVisible();
    await expect(page.getByText('_blipmade.example.com')).toBeVisible();
    await expect(page.getByText('mail-proof')).toBeVisible();
    expect(sent).toEqual({ path: '/mail/services/mail-service-1/domains', body: { name: 'example.com' } });
  });

  test('fits at 390px and keeps the primary action reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubMailEditor(page);
    await page.goto('/app/mail/domains/new');
    await expect(page.getByRole('button', { name: 'Add email domain' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
