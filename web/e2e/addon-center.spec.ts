import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', name: 'Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'Paper', status: 'running', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-06T00:00:00.000Z', stale: false }, product: { slug: 'minecraft-paper', name: 'Minecraft Paper', icon: 'box' }, ram: 2048, cpu: 2, disk: 10, price: 900, currency: 'EUR', createdAt: '2026-11-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, onUpdate: (body: Record<string, unknown>) => void) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/i1') return json(route, { instance: INSTANCE });
    if (path === '/instances/i1/addons' && route.request().method() === 'GET') return json(route, {
      note: 'Writes require a backup.',
      addons: [
        { slug: 'luckperms', name: 'LuckPerms', summary: 'Permissions', kind: 'SOFTWARE', installed: true, installedVersion: '5.4.1', installedAt: '2026-11-05T00:00:00.000Z' },
        { slug: 'worldedit', name: 'WorldEdit', summary: 'World tools', kind: 'SOFTWARE', installed: false, installedVersion: null, installedAt: null },
      ],
      jobs: [{ id: 'j1', addonSlug: 'luckperms', action: 'install', status: 'succeeded', error: null, writes: true }],
    });
    if (path === '/instances/i1/addons/luckperms' && route.request().method() === 'POST') {
      onUpdate(route.request().postDataJSON());
      return json(route, { job: { id: 'j2', status: 'succeeded' } });
    }
    return json(route, {});
  });
}

test('the add-on center separates discovery, installed software and job history, and requests a backed-up update', async ({ page }) => {
  let update: Record<string, unknown> | null = null;
  await stub(page, (body) => { update = body; });
  await page.goto('/app/instances/i1/addons');

  await expect(page.getByText('WorldEdit', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Installed (1)' }).click();
  await expect(page.getByText('Installed version 5.4.1')).toBeVisible();
  await page.getByRole('button', { name: 'Check & update' }).click();
  await expect.poll(() => update).not.toBeNull();
  expect(update).toMatchObject({ action: 'update', confirmBackup: true });

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('install luckperms · succeeded')).toBeVisible();
});
