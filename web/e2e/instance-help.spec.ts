import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Help', lastName: 'Owner', name: 'Help Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'Bot', status: 'online', access: 'owner', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-05T10:00:00.000Z', stale: false }, product: { slug: 'discord-bot', name: 'Discord Bot', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 0, currency: 'EUR', url: null, createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false };

const ISSUE = {
  verdict: 'issue',
  summary: 'The evidence that could be read matches a known problem.',
  findings: [{ id: 'node-crash', title: 'The Node.js process crashed', why: 'Node reported an exception that nothing in the app caught.', fix: 'Read the stack in the console.', confidence: 'high', tab: 'console' }],
  sources: [
    { id: 'console', label: 'Live console', state: 'unsupported', note: 'The console is a live stream and is not saved.' },
    { id: 'deploy-log', label: 'Deployment log', state: 'available', note: 'Read the deployment log.' },
  ],
};

const THIN = {
  verdict: 'insufficient',
  summary: 'Some evidence is missing or could not be read, so this is not a clean result.',
  findings: [],
  sources: [
    { id: 'console', label: 'Live console', state: 'unsupported', note: 'The console is a live stream and is not saved.' },
    { id: 'deploy-log', label: 'Deployment log', state: 'missing', note: 'The panel answered 404.' },
  ],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, diagnosis: unknown, posted: { body?: string }[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/instances/i1' && req.method() === 'GET') return json(route, { instance: INSTANCE });
    if (path === '/instances/i1/resources') return json(route, { resources: null });
    if (path === '/instances/i1/events') return json(route, { events: [] });
    if (path === '/instances/i1/profiles') return json(route, { profiles: [] });
    if (path === '/instances/i1/connect') return json(route, { enabled: false, supported: false, profile: null, state: null, address: null, fallback: null, note: null });
    if (path === '/catalog/families') return json(route, { families: [] });
    if (path === '/notifications/unread-count') return json(route, { unread: 0 });
    if (path === '/instances/i1/diagnose') return json(route, diagnosis);
    if (path === '/instances/i1/support-bundle') return json(route, { subject: 'Help with Bot', body: 'The Node.js process crashed. Deployment log: available.', instanceId: 'i1' });
    if (path === '/tickets' && req.method() === 'POST') {
      posted.push(req.postDataJSON() as { body?: string });
      return json(route, { ticket: { id: 'ticket-1' } }, 201);
    }
    if (path === '/tickets/ticket-1') return json(route, { ticket: { id: 'ticket-1', number: 1, subject: 'Help with Bot', status: 'OPEN', category: 'TECHNICAL', messages: [] } });
    if (path === '/tickets/categories') return json(route, { categories: [] });
    return json(route, {});
  });
}

test.describe('check my logs', () => {
  test('shows the sources, the problem, and opens the console', async ({ page }) => {
    await stub(page, ISSUE, []);
    await page.goto('/app/instances/i1');
    await page.getByRole('button', { name: 'Check my logs' }).click();
    await expect(page.getByTestId('diagnosis-summary')).toHaveText(ISSUE.summary);
    await expect(page.getByTestId('source-console')).toContainText('Not stored');
    await expect(page.getByTestId('source-deploy-log')).toContainText('Read');
    await expect(page.getByText('The Node.js process crashed')).toBeVisible();
    await page.getByRole('button', { name: 'Open Console' }).click();
    await expect(page).toHaveURL(/\/app\/instances\/i1\/console$/);
  });

  test('does not call a missing log a clean result, and the ticket carries the bundle', async ({ page }) => {
    const posted: { body?: string }[] = [];
    await stub(page, THIN, posted);
    await page.goto('/app/instances/i1');
    await page.getByRole('button', { name: 'Check my logs' }).click();
    await expect(page.getByTestId('diagnosis-summary')).toContainText('not a clean result');
    await expect(page.getByTestId('source-deploy-log')).toContainText('Not there');
    await page.getByRole('button', { name: 'Ask support, with details' }).click();
    await expect(page).toHaveURL(/\/app\/tickets\/ticket-1$/);
    expect(posted[0]?.body).toContain('Deployment log: available');
  });
});
