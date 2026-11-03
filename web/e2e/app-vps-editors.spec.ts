import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Vps', lastName: 'Owner', name: 'Vps Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const SERVER = { id: 'v1', name: 'web-1', status: 'active', power: 'running', plan: { slug: 'vps-s', name: 'VPS S' }, ram: 2048, cpu: 2, disk: 40, publicIp: '203.0.113.9', sshPort: 22, dedicatedIp: false, image: { slug: 'debian-13', label: 'Debian 13' }, contract: null, sshCommand: 'ssh root@203.0.113.9', lastError: null, createdAt: '2026-10-01T00:00:00.000Z' };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Calls { patch: unknown[]; key: unknown[]; iso: unknown[]; reinstall: unknown[]; snapshot: unknown[]; restore: string[] }
const fresh = (): Calls => ({ patch: [], key: [], iso: [], reinstall: [], snapshot: [], restore: [] });

async function stub(page: Page, calls: Calls, snapshots = [{ name: 'before-upgrade', description: '', createdAt: '2026-10-20T10:00:00.000Z' }]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/vps/v1' && method === 'GET') return json(route, { server: SERVER });
    if (path === '/vps/v1' && method === 'PATCH') { calls.patch.push(req.postDataJSON()); return json(route, { server: SERVER }); }
    if (path === '/vps/v1/ssh-key' && method === 'PUT') { calls.key.push(req.postDataJSON()); return json(route, {}); }
    if (path === '/vps/v1/iso' && method === 'GET') return json(route, { isos: [{ file: 'AlmaLinux-9.8-x86_64-minimal.iso', size: 2147483648 }], mounted: null });
    if (path === '/vps/v1/iso' && method === 'PUT') { calls.iso.push(req.postDataJSON()); return json(route, {}); }
    if (path === '/vps/images') return json(route, { images: [{ slug: 'debian-13', label: 'Debian 13' }, { slug: 'ubuntu-24', label: 'Ubuntu 24.04' }] });
    if (path === '/vps/v1/reinstall' && method === 'POST') { calls.reinstall.push(req.postDataJSON()); return json(route, {}); }
    if (path === '/vps/v1/snapshots' && method === 'GET') return json(route, { max: 3, snapshots });
    if (path === '/vps/v1/snapshots' && method === 'POST') { calls.snapshot.push(req.postDataJSON()); return json(route, {}); }
    if (path === '/vps/v1/snapshots/before-upgrade/restore' && method === 'POST') { calls.restore.push('before-upgrade'); return json(route, {}); }
    return json(route, {});
  });
}

test.describe('dedicated VPS pages', () => {
  test('rename posts the exact name and returns to the settings tab', async ({ page }) => {
    const calls = fresh();
    await stub(page, calls);
    await page.goto('/app/vps/v1/settings/edit');
    await expect(page.locator('h1:visible')).toHaveText('Rename server');
    const save = page.getByRole('button', { name: 'Save name' });
    await expect(save).toBeDisabled();
    await page.getByLabel('Name').fill('web-2');
    await save.click();
    await page.waitForURL('**/app/vps/v1?tab=settings');
    expect(calls.patch).toEqual([{ name: 'web-2' }]);
  });

  test('the SSH key is sent trimmed and the page says the server restarts', async ({ page }) => {
    const calls = fresh();
    await stub(page, calls);
    await page.goto('/app/vps/v1/ssh-key');
    await expect(page.getByText(/restarts once to read the new key/)).toBeVisible();
    await page.getByLabel('SSH public key').fill('  ssh-ed25519 AAAAC3Nza me@laptop  ');
    await page.getByRole('button', { name: 'Change the key' }).click();
    await page.waitForURL('**/app/vps/v1?tab=settings');
    expect(calls.key).toEqual([{ sshPublicKey: 'ssh-ed25519 AAAAC3Nza me@laptop' }]);
  });

  test('mounting an image needs a choice and posts the file', async ({ page }) => {
    const calls = fresh();
    await stub(page, calls);
    await page.goto('/app/vps/v1/iso');
    const mount = page.getByRole('button', { name: 'Mount the image' });
    await expect(mount).toBeDisabled();
    await page.getByLabel('Image').selectOption('AlmaLinux-9.8-x86_64-minimal.iso');
    await mount.click();
    await page.waitForURL('**/app/vps/v1?tab=boot');
    expect(calls.iso).toEqual([{ file: 'AlmaLinux-9.8-x86_64-minimal.iso' }]);
  });

  test('reinstall needs the server name and the acknowledgement, then posts the system', async ({ page }) => {
    const calls = fresh();
    await stub(page, calls);
    await page.goto('/app/vps/v1/reinstall');
    await expect(page.getByText('Everything on the disk of web-1 is deleted')).toBeVisible();
    const go = page.getByRole('button', { name: 'Reinstall the server' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Operating system').selectOption('ubuntu-24');
    await page.getByLabel(/Type “web-1”/).fill('web-1');
    await expect(go).toBeDisabled();
    await page.getByRole('checkbox').check();
    await go.click();
    await page.waitForURL('**/app/vps/v1');
    expect(calls.reinstall).toEqual([{ confirm: true, image: 'ubuntu-24' }]);
  });

  test('a snapshot needs a valid new name; a full server is refused', async ({ page }) => {
    const calls = fresh();
    await stub(page, calls);
    await page.goto('/app/vps/v1/snapshots/new');
    await page.getByLabel('Name').fill('Bad Name');
    await page.getByRole('button', { name: 'Take the snapshot' }).click();
    await expect(page.getByText(/Use lowercase letters, numbers and dashes, starting/)).toBeVisible();
    expect(calls.snapshot).toEqual([]);
    await page.getByLabel('Name').fill('before-upgrade');
    await page.getByRole('button', { name: 'Take the snapshot' }).click();
    await expect(page.getByText('A snapshot with this name already exists.')).toBeVisible();
    await page.getByLabel('Name').fill('after-upgrade');
    await page.getByRole('button', { name: 'Take the snapshot' }).click();
    await page.waitForURL('**/app/vps/v1?tab=snapshots');
    expect(calls.snapshot).toEqual([{ name: 'after-upgrade' }]);

    const full = fresh();
    const second = await page.context().newPage();
    await stub(second, full, [1, 2, 3].map((n) => ({ name: `s${n}`, description: '', createdAt: null })));
    await second.goto('/app/vps/v1/snapshots/new');
    await expect(second.getByText('This server keeps no more snapshots')).toBeVisible();
    await expect(second.getByRole('button', { name: 'Take the snapshot' })).toBeDisabled();
  });

  test('restore needs the snapshot name and the acknowledgement', async ({ page }) => {
    const calls = fresh();
    await stub(page, calls);
    await page.goto('/app/vps/v1/snapshots/before-upgrade/restore');
    const go = page.getByRole('button', { name: 'Restore the snapshot' });
    await expect(go).toBeDisabled();
    await page.getByLabel(/Type “before-upgrade”/).fill('before-upgrade');
    await page.getByRole('checkbox').check();
    await go.click();
    await page.waitForURL('**/app/vps/v1?tab=snapshots');
    expect(calls.restore).toEqual(['before-upgrade']);
  });

  test('the server page links to the pages, opens the tab it is told to, and the pages fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, fresh());
    await page.goto('/app/vps/v1?tab=snapshots');
    await expect(page.getByRole('link', { name: 'Restore' })).toHaveAttribute('href', '/app/vps/v1/snapshots/before-upgrade/restore');
    await expect(page.getByRole('link', { name: 'Take a snapshot' })).toHaveAttribute('href', '/app/vps/v1/snapshots/new');
    await page.goto('/app/vps/v1?tab=settings');
    await expect(page.getByRole('link', { name: 'Rename' })).toHaveAttribute('href', '/app/vps/v1/settings/edit');
    for (const route of ['/app/vps/v1/settings/edit', '/app/vps/v1/ssh-key', '/app/vps/v1/iso', '/app/vps/v1/reinstall', '/app/vps/v1/snapshots/new', '/app/vps/v1/snapshots/before-upgrade/restore']) {
      await page.goto(route);
      await expect(page.locator('h1:visible')).toHaveCount(1);
      await expect(page.locator('h1:visible')).not.toHaveText('Something went wrong');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    }
  });
});
