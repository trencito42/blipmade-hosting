import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const SERVER = { id: 'v1', name: 'web-1', status: 'active', power: 'running', plan: { slug: 'vps-s', name: 'VPS S' }, ram: 2048, cpu: 2, disk: 40, publicIp: '203.0.113.5', sshPort: 22, dedicatedIp: false, lastError: null, createdAt: '2026-10-01T00:00:00Z', owner: { id: 'u1', email: 'cust@example.test' }, slot: 1, vmid: 101, privateIp: '10.0.0.5' };
const PLANS = { plans: [{ slug: 'vps-s', name: 'VPS S', cpu: 2, ram: 2048, disk: 40 }, { slug: 'vps-m', name: 'VPS M', cpu: 4, ram: 4096, disk: 80 }] };
const QUOTE = { quote: { currency: 'EUR', from: { name: 'VPS S', amount: 500, ram: 2048, cpu: 2, disk: 40 }, to: { name: 'VPS M', amount: 900, ram: 4096, cpu: 4, disk: 80 }, delta: 400, billedNow: null, blocked: null, takesEffect: 'renewal' } };

test.describe('admin server editors on their own pages', () => {
  test('the plan change reads a quote first and posts the expected amount', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/vps/v1/plan' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/vps/v1/plan-quote') return QUOTE;
      if (path === '/admin/vps') return { servers: [SERVER] };
      if (path === '/vps/plans') return PLANS;
      return undefined;
    });
    await page.goto('/admin/vps/v1/plan/change');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Change plan and price' })).toBeDisabled();
    await page.getByLabel('New plan').selectOption('vps-m');
    await expect(page.getByRole('status')).toContainText('9.00 EUR');
    await page.getByRole('button', { name: 'Change plan and price' }).click();
    await expect(page).toHaveURL(/\/admin\/vps$/);
    expect(sent).toEqual({ slug: 'vps-m', expectedAmount: 900 });
  });
  test('the free adjustment needs reason and acknowledgement; fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/vps/v1/resources' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/vps') return { servers: [SERVER] };
      return undefined;
    });
    await page.goto('/admin/vps/v1/resources/edit');
    const go = page.getByRole('button', { name: 'Apply the adjustment' });
    await page.getByLabel('Memory in MB').fill('4096');
    await page.getByLabel(/^Reason/).fill('Goodwill for downtime');
    await expect(go).toBeDisabled();
    await page.getByText('I understand this is free').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await go.click();
    await expect(page).toHaveURL(/\/admin\/vps$/);
    expect(sent).toEqual({ ram: 4096, cpu: 2, disk: 40, reason: 'Goodwill for downtime', freeOverride: true });
  });
});
