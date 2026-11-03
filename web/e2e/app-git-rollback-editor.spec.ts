import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Git', lastName: 'Owner', name: 'Git Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const RELEASE_OLD = '20261101120000-abcdef12';
const RELEASE_NOW = '20261102120000-12345678';

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, onRollback?: (body: unknown) => void) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/instance-1/git' && req.method() === 'GET') {
      return json(route, { supported: true, configured: true, branch: 'main', autoDeploy: true, status: { state: 'idle' }, releases: [RELEASE_OLD, RELEASE_NOW], current: RELEASE_NOW });
    }
    if (path === '/instances/instance-1/git/deployments' && req.method() === 'GET') {
      return json(route, { deployments: [
        { id: 'dep-new', state: 'succeeded', action: 'build', by: 'a@example.test', release: RELEASE_NOW, commit: '1234567', message: '', at: '2026-11-02T12:00:00.000Z' },
        { id: 'dep-old', state: 'succeeded', action: 'build', by: 'a@example.test', release: RELEASE_OLD, commit: 'abcdef1', message: '', at: '2026-11-01T12:00:00.000Z' },
      ] });
    }
    if (path === '/instances/instance-1/git/rollback' && req.method() === 'POST') {
      onRollback?.(req.postDataJSON());
      return json(route, { queued: true, deployId: 'x' });
    }
    return json(route, {});
  });
}

test.describe('dedicated Git rollback page', () => {
  test('needs the acknowledgement and posts the exact release', async ({ page }) => {
    let payload: unknown;
    await stub(page, (body) => { payload = body; });
    await page.goto('/app/instances/instance-1/git/deployments/dep-old/rollback');
    const confirm = page.getByRole('button', { name: 'Go back to this release' });
    await expect(confirm).toBeDisabled();
    await page.getByRole('checkbox').check();
    await confirm.click();
    await page.waitForURL('**/app/instances/instance-1/git');
    expect(payload).toEqual({ release: RELEASE_OLD });
  });

  test('refuses the release that already runs and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page);
    await page.goto('/app/instances/instance-1/git/deployments/dep-new/rollback');
    await expect(page.getByText('This release cannot be restored')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go back to this release' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
