import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Ada', lastName: 'Owner', name: 'Ada Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'daily81', status: 'online', access: 'owner', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-04T03:04:00.000Z', stale: false }, product: { slug: 'nodejs', name: 'Node.js', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 0, currency: 'EUR', url: 'https://daily81.apps.blipmade.com', createdAt: '2026-11-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false };

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { unread: 0 });
    if (path === '/instances/i1' && route.request().method() === 'GET') return json(route, { instance: INSTANCE });
    if (path === '/instances/i1/resources') return json(route, { resources: { state: 'offline', memory_bytes: 800_000_000, cpu_absolute: 40, disk: { used: 4096 }, network: { rx: 10, tx: 10 }, uptime: 50000 } });
    if (path === '/instances/i1/events') return json(route, { events: [] });
    if (path === '/instances/i1/profiles') return json(route, { profiles: [] });
    if (path === '/instances/i1/connect') return json(route, { enabled: false, supported: false, profile: null, state: null, address: null, fallback: null, note: null });
    if (path === '/catalog/families') return json(route, { families: [] });
    if (path === '/instances/i1/git') return json(route, { supported: true, configured: true, repoUrl: 'https://github.com/acme/app', branch: 'main', buildCommand: 'npm run build', startCommand: 'npm start', current: '20261103010000-oldrel01', status: { state: 'building', id: 'old-deploy', at: '2026-11-04T03:04:00.000Z', release: '', commit: '', message: 'building' }, releases: ['20261103010000-oldrel01'] });
    if (path === '/instances/i1/git/deployments') return json(route, { deployments: [
      { id: 'new-deploy', state: 'succeeded', action: 'build', by: 'owner', release: '20261103010000-oldrel01', commit: 'oldrel01', message: 'Application passed the health check.', at: '2026-11-03T01:10:00.000Z' },
      { id: 'old-deploy', state: 'interrupted', action: 'build', by: 'owner', release: '', commit: '', message: 'The worker stopped before this deployment finished.', at: '2026-11-04T03:04:00.000Z' },
    ] });
    return json(route, {});
  });
}

test('a stopped container drops stale processor and memory, and an old deploy is not still deploying', async ({ page }) => {
  await stub(page);
  await page.goto('/app/instances/i1');
  await expect(page.getByText('Stopped', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Not in use').first()).toBeVisible();
  await expect(page.getByText('800 MB')).toHaveCount(0);
  await page.goto('/app/instances/i1/git');
  await expect(page.getByRole('button', { name: 'Deploy now' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deploying…' })).toHaveCount(0);
  await expect(page.getByText('interrupted')).toBeVisible();
});
