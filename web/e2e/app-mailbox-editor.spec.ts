import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = {
  id: 'mailbox-customer', email: 'mailbox@example.test', firstName: 'Mailbox', lastName: 'Owner',
  name: 'Mailbox Owner', role: 'CUSTOMER', emailVerified: true, permissions: [],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubMailboxEditor(page: Page, onCreate?: (body: Record<string, unknown>) => void) {
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
    if (path === '/mail/domains/domain-1' && request.method() === 'GET') return json(route, { domain: {
      id: 'domain-1', name: 'example.com', status: 'active', mailboxes: 1, maxMailboxes: 5,
      aliases: 0, maxAliases: 10, createdAt: '2026-11-03T10:00:00.000Z', lastError: null,
    } });
    if (path === '/mail/domains/domain-1/mailboxes' && request.method() === 'GET') return json(route, { mailboxes: [] });
    if (path === '/mail/domains/domain-1/mailboxes' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      onCreate?.(body);
      return json(route, { mailbox: {
        id: 'mailbox-1', address: `${body.localPart}@example.com`, status: 'active', quotaMb: 1024,
        usedMb: 0, password: 'generated-secret-42', createdAt: '2026-11-03T10:01:00.000Z',
      } }, 201);
    }
    return json(route, {});
  });
}

test.describe('the dedicated mailbox editor', () => {
  test('validates, creates through the exact API and protects the one-time password', async ({ page }) => {
    let sent: Record<string, unknown> | undefined;
    await stubMailboxEditor(page, (body) => { sent = body; });
    await page.goto('/app/mail/domains/domain-1/mailboxes/new');

    await page.getByRole('button', { name: 'Create mailbox' }).click();
    await expect(page.getByText('Enter the name before the @.')).toBeVisible();
    await page.getByLabel('Name').fill('Support');
    await page.getByRole('button', { name: 'Create mailbox' }).click();

    await expect(page.getByRole('heading', { name: 'Mailbox created' })).toBeVisible();
    await expect(page.getByText('generated-secret-42')).toBeVisible();
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    expect(sent).toEqual({ localPart: 'support' });

    await page.getByRole('button', { name: 'I have stored the password' }).click();
    await page.waitForURL('**/app/mail/domains/domain-1');
  });

  test('fits at 390px without hiding the editor action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubMailboxEditor(page);
    await page.goto('/app/mail/domains/domain-1/mailboxes/new');
    await expect(page.getByRole('button', { name: 'Create mailbox' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
