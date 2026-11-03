import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const DETAIL = {
  report: { id: 'r1', category: 'spam', target: 'spam.example', details: 'Spam', evidenceUrl: null, reporterName: 'R', reporterEmail: 'r@example.test', status: 'investigating', statusLabel: 'Investigating', resolution: null, instanceId: 's1', createdAt: '2026-11-01T00:00:00Z', resolvedAt: null, reopenedAt: null, enforcement: null, enforcementLabel: 'None', enforcementAt: null, enforcedBy: null, service: { id: 's1', name: 'spam-server' }, allowedActions: ['resolve', 'dismiss', 'suspend'] },
  service: { id: 's1', name: 'spam-server' }, notes: [], activity: [], related: [],
};

test.describe('abuse enforcement on its own page', () => {
  test('suspend needs a reason and the typed service name', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/abuse/r1/action' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/abuse/r1') return DETAIL;
      return undefined;
    });
    await page.goto('/admin/abuse/r1/enforcement');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Suspend the service' });
    await page.getByLabel('Why is the service suspended?').fill('Sending spam');
    await expect(go).toBeDisabled();
    await page.getByLabel('Type spam-server to confirm').fill('spam-server');
    await go.click();
    await expect(page).toHaveURL(/\/admin\/abuse\/r1$/);
    expect(sent).toEqual({ action: 'suspend', reason: 'Sending spam', confirmService: 'spam-server' });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/abuse/r1' ? DETAIL : undefined));
    await page.goto('/admin/abuse/r1/enforcement');
    await expect(page.getByLabel('Type spam-server to confirm')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
