import { expect, test, type Page, type Route } from '@playwright/test';

const CUSTOMER = {
  id: 'customer-ticket-editor',
  email: 'customer@example.test',
  firstName: 'Test',
  lastName: 'Customer',
  name: 'Test Customer',
  role: 'CUSTOMER',
  emailVerified: true,
  permissions: [],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubCustomerApp(page: Page, onCreate?: (payload: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: CUSTOMER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current') return json(route, { conversation: null });
    if (path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/tickets/categories') return json(route, { categories: [{ id: 'TECHNICAL', label: 'Technical' }, { id: 'BILLING', label: 'Billing' }] });
    if (path === '/instances') return json(route, { instances: [{ id: 'instance-1', name: 'Production API', status: 'ACTIVE' }] });
    if (path === '/mail/services') return json(route, { services: [] });
    if (path === '/tickets' && request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      onCreate?.(payload);
      return json(route, {
        ticket: {
          id: 'ticket-1', number: 1042, subject: payload.subject, category: payload.category, priority: payload.priority,
          status: 'OPEN', instanceId: payload.instanceId ?? null, instanceName: 'Production API', serviceName: 'Production API',
          createdAt: '2026-11-03T10:00:00.000Z', updatedAt: '2026-11-03T10:00:00.000Z', lastReplyAt: null,
          assignedTo: null, messageCount: 1,
        },
        initialMessageId: 'message-1',
      }, 201);
    }
    if (path === '/tickets/ticket-1') {
      return json(route, {
        ticket: {
          id: 'ticket-1', number: 1042, subject: 'API unavailable', category: 'TECHNICAL', priority: 'HIGH', status: 'OPEN',
          instanceId: 'instance-1', instanceName: 'Production API', serviceName: 'Production API', createdAt: '2026-11-03T10:00:00.000Z',
          updatedAt: '2026-11-03T10:00:00.000Z', lastReplyAt: null, assignedTo: null, messageCount: 1,
        },
        messages: [], events: [], pagination: { nextCursor: null },
      });
    }
    return json(route, {});
  });
}

test.describe('the dedicated new-ticket editor', () => {
  test('validates the page, sends the API contract and opens the created conversation', async ({ page }) => {
    let payload: Record<string, unknown> | undefined;
    await stubCustomerApp(page, (body) => { payload = body; });
    await page.goto('/app/tickets/new');

    await expect(page.getByRole('heading', { name: 'Open a new ticket' })).toBeVisible();
    await page.getByRole('button', { name: 'Create ticket' }).click();
    await expect(page.getByText('Give the ticket a subject.')).toBeVisible();

    await page.getByLabel('Subject').fill('API unavailable');
    await page.getByLabel('Category').selectOption('TECHNICAL');
    await page.getByRole('button', { name: 'High' }).click();
    await page.getByRole('combobox', { name: 'Related service' }).click();
    await page.getByRole('option', { name: /Production API/ }).click();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Requests started failing at 12:00 UTC with a 503 response.');
    await page.getByRole('button', { name: 'Create ticket' }).click();

    await page.waitForURL('**/app/tickets/ticket-1');
    expect(payload).toEqual({
      subject: 'API unavailable', category: 'TECHNICAL', priority: 'high',
      body: 'Requests started failing at 12:00 UTC with a 503 response.', instanceId: 'instance-1',
    });
  });

  test('guards a dirty draft and keeps it when navigation is cancelled', async ({ page }) => {
    await stubCustomerApp(page);
    await page.goto('/app/tickets/new');
    await page.getByLabel('Subject').fill('Keep this draft');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Discard this ticket draft');
      await dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Back to support' }).click();

    await expect(page).toHaveURL(/\/app\/tickets\/new$/);
    await expect(page.getByLabel('Subject')).toHaveValue('Keep this draft');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
  });

  test('keeps the editor and its actions reachable at a 390px phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubCustomerApp(page);
    await page.goto('/app/tickets/new');

    await expect(page.getByRole('heading', { name: 'Open a new ticket' })).toBeVisible();
    await expect(page.getByText('Drop files here or choose from your device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create ticket' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
