import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Profile', lastName: 'Owner', name: 'Profile Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'Paper', status: 'running', access: 'owner', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-07T00:00:00.000Z', stale: false }, product: { slug: 'minecraft-paper', name: 'Paper', icon: 'box' }, ram: 2048, cpu: 2, disk: 20, price: 900, currency: 'EUR', url: null, createdAt: '2026-11-01T00:00:00.000Z', node: null, hasPassword: false };
const PROFILE = { id: 'p1', name: 'Tournament', productSlug: 'minecraft-paper', ram: 2048, cpu: 2, disk: 20, manifest: {}, snapshotSha256: 'a'.repeat(64), createdAt: '2026-11-07T00:00:00.000Z' };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, posts: { path: string; body: unknown }[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/i1') return json(route, { instance: INSTANCE });
    if (path === '/instances/i1/game-capabilities') return json(route, { manifest: { family: 'minecraft-java', features: { addons: { supported: true, available: true }, git: { supported: false, available: false } }, primaryTabs: ['overview', 'console', 'minecraft', 'addons', 'backups', 'settings'] } });
    if (path === '/instances/i1/profiles' && req.method() === 'GET') return json(route, { profiles: [PROFILE] });
    if (path === '/instances/i1/profile-activations' && req.method() === 'GET') return json(route, { jobs: [{ id: 'j-old', profileId: 'p1', status: 'recovery_required', progress: 65, step: 'Recovery required', error: 'Worker interrupted.' }] });
    if (path === '/instances/i1/profiles/p1/activation-preview') return json(route, { eligible: true, blockers: [], changes: { install: [{ slug: 'luckperms', version: '5.4.0' }], remove: [] } });
    if (req.method() === 'POST') { posts.push({ path, body: req.postDataJSON() }); return json(route, { job: { id: 'j1', status: 'pending' } }, 202); }
    return json(route, {});
  });
}

test('a customer previews a pinned profile, queues it, and can request explicit recovery', async ({ page }) => {
  const posts: { path: string; body: unknown }[] = [];
  await stub(page, posts);
  await page.goto('/app/instances/i1');
  await page.getByRole('button', { name: 'Preview activation' }).click();
  await expect(page.getByText(/Install 1 and remove 0 pinned artifact/)).toBeVisible();
  await page.getByRole('button', { name: 'Queue activation' }).click();
  await expect(page.getByText(/Activation queued/)).toBeVisible();
  await page.getByRole('button', { name: 'Request restore' }).click();
  await expect(page.getByText('Restore the verified backup?')).toBeVisible();
  await page.getByRole('button', { name: 'Request restore' }).last().click();
  const activation = posts.find((call) => call.path === '/instances/i1/profiles/p1/activate');
  expect((activation?.body as { idempotencyKey?: string }).idempotencyKey).toBeTruthy();
  expect(posts.some((call) => call.path === '/instances/i1/profile-activations/j-old/recover')).toBe(true);
});
