import { expect, test } from '@playwright/test';
import { ADMIN, json, stubAdmin } from './admin-stub';

const LIST = {
  staff: [
    { userId: 's1', email: 'sam@example.test', name: 'Sam', role: 'staff', title: null, permissions: ['tickets.read'], removable: true },
    { userId: 'a1', email: 'ada@example.test', name: 'Ada', role: 'admin', title: null, permissions: ['tickets.read'], removable: true },
  ],
  available: ['tickets.read'],
  activeAdministrators: 2,
};

test.describe('staff access lifecycle', () => {
  test('adds an existing customer after search and confirmation', async ({ page }) => {
    let granted: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/staff' && method === 'GET') return LIST;
      if (path === '/admin/staff/invitations' && method === 'GET') return { invitations: [] };
      if (path === '/admin/staff/candidates' && method === 'GET') return { candidates: [{ userId: 'c1', email: 'casey@example.test', name: 'Casey Customer', emailVerified: true }] };
      if (path === '/admin/staff/step-up' && method === 'POST') return { stepUpUntil: new Date(Date.now() + 600_000).toISOString() };
      if (path === '/admin/staff/members' && method === 'POST') { granted = body as Record<string, unknown>; return { staff: { userId: 'c1', role: 'staff' } }; }
      return undefined;
    });
    await page.goto('/admin/staff');
    await page.getByRole('link', { name: 'Add member' }).click();
    await expect(page).toHaveURL(/\/admin\/staff\/add$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Add a staff member' })).toBeVisible();
    await page.getByLabel('Find a customer').fill('cas');
    await page.getByRole('button', { name: 'Search accounts' }).click();
    await page.getByRole('radio', { name: /Casey Customer/ }).check();
    await page.getByRole('button', { name: 'Review and add' }).click();
    await page.getByLabel('Current password').fill('CorrectHorseBattery9');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm and add' }).click();
    await expect(page).toHaveURL(/\/admin\/staff$/);
    expect(granted).toEqual({ userId: 'c1', role: 'STAFF' });
  });

  test('invites by email and does not show a token', async ({ page }) => {
    let invited: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/staff' && method === 'GET') return LIST;
      if (path === '/admin/staff/invitations' && method === 'GET') return { invitations: [{ id: 'i1', email: 'new@example.test', role: 'staff', expiresAt: '2026-11-06T12:00:00.000Z' }] };
      if (path === '/admin/staff/step-up' && method === 'POST') return { stepUpUntil: new Date(Date.now() + 600_000).toISOString() };
      if (path === '/admin/staff/invitations' && method === 'POST') { invited = body as Record<string, unknown>; return { invitation: { id: 'i2', email: 'newer@example.test', role: 'staff', expiresAt: '2026-11-06T12:00:00.000Z' } }; }
      return undefined;
    });
    await page.goto('/admin/staff/invite');
    await page.getByLabel('Email address').fill('newer@example.test');
    await page.getByRole('button', { name: 'Review invitation' }).click();
    await page.getByLabel('Current password').fill('CorrectHorseBattery9');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm and send' }).click();
    await expect(page).toHaveURL(/\/admin\/staff$/);
    expect(invited).toEqual({ email: 'newer@example.test', role: 'STAFF' });
    await expect(page.getByText('n***@example.test')).toBeVisible();
    await expect(page.getByText('new@example.test')).toHaveCount(0);
  });

  test('removes access from the dedicated page', async ({ page }) => {
    let removed = false;
    await stubAdmin(page, (path, method) => {
      if (path === '/admin/staff' && method === 'GET') return LIST;
      if (path === '/admin/staff/invitations' && method === 'GET') return { invitations: [] };
      if (path === '/admin/staff/step-up' && method === 'POST') return { stepUpUntil: new Date(Date.now() + 600_000).toISOString() };
      if (path === '/admin/staff/s1/remove' && method === 'POST') { removed = true; return { userId: 's1', role: 'customer' }; }
      return undefined;
    });
    await page.goto('/admin/staff');
    await page.getByRole('link', { name: 'Remove access' }).first().click();
    await expect(page).toHaveURL(/\/admin\/staff\/s1\/remove$/);
    await expect(page.getByText('Nothing the customer owns is deleted.')).toBeVisible();
    await page.getByRole('button', { name: 'Review removal' }).click();
    await page.getByLabel('Current password').fill('CorrectHorseBattery9');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm and remove' }).click();
    await expect(page).toHaveURL(/\/admin\/staff$/);
    expect(removed).toBe(true);
  });

  test('hides removal of the last administrator and hides grant actions from staff', async ({ page }) => {
    await stubAdmin(page, (path, method) => {
      if (path === '/admin/staff' && method === 'GET') {
        return { staff: [{ userId: 'a1', email: 'ada@example.test', name: 'Ada', role: 'admin', title: null, permissions: [], removable: false }], available: [], activeAdministrators: 1 };
      }
      if (path === '/admin/staff/invitations') return { invitations: [] };
      return undefined;
    });
    await page.goto('/admin/staff');
    await expect(page.getByRole('link', { name: 'Remove access' })).toHaveCount(0);
    await page.goto('/admin/staff/a1/permissions/edit');
    await expect(page.getByText('last active administrator')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Remove access' })).toHaveCount(0);

    await page.unroute('**/api/**');
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      if (path === '/auth/session') return json(route, { user: { ...ADMIN, role: 'STAFF' } });
      if (path === '/admin/staff') return json(route, LIST);
      return json(route, {});
    });
    await page.goto('/admin/staff');
    await expect(page.getByRole('link', { name: 'Add member' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Invite' })).toHaveCount(0);
    await page.goto('/admin/staff/add');
    await expect(page.getByText('Only an administrator can do this.')).toBeVisible();
  });

  test('fits the add page at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/staff' ? LIST : path === '/admin/staff/invitations' ? { invitations: [] } : undefined));
    await page.goto('/admin/staff/add');
    await expect(page.getByRole('heading', { name: 'Add a staff member' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
