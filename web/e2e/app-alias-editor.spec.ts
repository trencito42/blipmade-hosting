import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = { id: 'alias-customer', email: 'alias@example.test', firstName: 'Alias', lastName: 'Owner', name: 'Alias Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }

async function stubAliasEditor(page: Page, onCreate?: (body: Record<string, unknown>) => void) {
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
    if (path === '/mail/domains/domain-1' && request.method() === 'GET') return json(route, { domain: { id: 'domain-1', name: 'example.com', status: 'active', mailboxes: 1, maxMailboxes: 5, aliases: 0, maxAliases: 10, createdAt: '2026-11-03T10:00:00.000Z', lastError: null } });
    if (path === '/mail/domains/domain-1/mailboxes' && request.method() === 'GET') return json(route, { mailboxes: [{ id: 'mailbox-1', address: 'support@example.com', status: 'active', quotaMb: 1024, usedMb: 0, createdAt: '2026-11-03T10:00:00.000Z' }] });
    if (path === '/mail/domains/domain-1/aliases' && request.method() === 'GET') return json(route, { aliases: [] });
    if (path === '/mail/domains/domain-1/aliases' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>; onCreate?.(body);
      return json(route, { alias: { id: 'alias-1', alias: body.alias, target: body.target, createdAt: '2026-11-03T10:01:00.000Z' } }, 201);
    }
    return json(route, {});
  });
}

test.describe('the dedicated alias editor', () => {
  test('validates and forwards through the exact same-domain mailbox payload', async ({ page }) => {
    let sent: Record<string, unknown> | undefined;
    await stubAliasEditor(page, (body) => { sent = body; });
    await page.goto('/app/mail/domains/domain-1/aliases/new');
    await page.getByRole('button', { name: 'Create alias' }).click();
    await expect(page.getByText('Enter the address that should receive the mail.')).toBeVisible();
    await page.getByLabel('Alias').fill('Info');
    await page.getByRole('button', { name: 'Create alias' }).click();
    await page.waitForURL('**/app/mail/domains/domain-1');
    expect(sent).toEqual({ alias: 'info@example.com', target: 'support@example.com' });
  });

  test('fits at 390px with its action reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await stubAliasEditor(page);
    await page.goto('/app/mail/domains/domain-1/aliases/new');
    await expect(page.getByRole('button', { name: 'Create alias' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
