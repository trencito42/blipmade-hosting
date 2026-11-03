import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const JOB = { id: '9', queue: 'email', queueLabel: 'Outgoing email', name: 'send', state: 'failed', attempts: 3, maxAttempts: 3, createdAt: '2026-11-01T10:00:00Z', startedAt: null, finishedAt: '2026-11-01T10:05:00Z', reason: 'Connection refused', trace: ['Error: Connection refused\n  at x'], dataFields: ['to', 'template'] };
const NODE = { node: { id: 'n1', pterodactylId: 7, name: 'node-7', fqdn: 'n7.example.test', memory: 8192, disk: 100000, memoryAllocated: 2048, diskAllocated: 10000, maintenance: false, syncedAt: '2026-11-02T00:00:00Z' }, instances: [{ id: 's1', name: 'Survival', status: 'ONLINE', ram: 2048, cpu: 2, disk: 10000, owner: { id: 'u1', email: 'cora@example.test' } }] };
const ABUSE = { report: { id: 'r1', category: 'spam', target: 'spam.example', details: 'x', evidenceUrl: null, reporterName: 'R', reporterEmail: 'r@example.test', status: 'resolved', statusLabel: 'Resolved', resolution: 'Removed', instanceId: null, createdAt: '2026-11-01T00:00:00Z', resolvedAt: '2026-11-02T00:00:00Z', reopenedAt: null, enforcement: null, enforcementLabel: 'None', enforcementAt: null, enforcedBy: null, service: null, allowedActions: ['reopen'] }, service: null, notes: [], activity: [], related: [] };

test.describe('queue job, node and abuse reopen pages', () => {
  test('a failed job shows no data, only the field names, and can be retried', async ({ page }) => {
    let retried = false;
    await stubAdmin(page, (path, method) => {
      if (path === '/admin/queues/email/jobs/9/retry' && method === 'POST') { retried = true; return { ok: true }; }
      if (path === '/admin/queues/email/jobs/9') return { job: JOB };
      return undefined;
    });
    await page.goto('/admin/queues/email/jobs/9');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('Connection refused').first()).toBeVisible();
    await expect(page.getByText('to, template')).toBeVisible();
    await page.getByRole('button', { name: 'Retry the job' }).click();
    await expect.poll(() => retried).toBe(true);
  });
  test('the node page lists the services on it', async ({ page }) => {
    await stubAdmin(page, (path) => (path === '/admin/infrastructure/nodes/n1' ? NODE : undefined));
    await page.goto('/admin/infrastructure/nodes/n1');
    await expect(page.getByRole('heading', { level: 1, name: 'node-7' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Survival' })).toHaveAttribute('href', '/admin/services/s1');
  });
  test('reopening needs a reason; all three fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/abuse/r1/action' && method === 'POST') { sent = body; return {}; }
      if (path === '/admin/abuse/r1') return ABUSE;
      if (path === '/admin/infrastructure/nodes/n1') return NODE;
      if (path === '/admin/queues/email/jobs/9') return { job: JOB };
      return undefined;
    });
    for (const url of ['/admin/queues/email/jobs/9', '/admin/infrastructure/nodes/n1', '/admin/abuse/r1/reopen']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    }
    const go = page.getByRole('button', { name: 'Reopen the investigation' });
    await expect(go).toBeDisabled();
    await page.getByLabel('Why?').fill('New evidence arrived');
    await go.click();
    await expect.poll(() => sent).toEqual({ action: 'reopen', reason: 'New evidence arrived' });
  });
});
