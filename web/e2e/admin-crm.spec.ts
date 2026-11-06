import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('admin CRM desk', () => {
  test('builds a nested segment, queues without sending, and hides risk without risk.read', async ({ page }) => {
    await stubAdmin(page, (path, method) => {
      if (path === '/admin/crm/overview') return { customers: 250, campaigns: 1, segments: 1, openTasks: 1, automations: 1, delivery: false };
      if (path === '/admin/crm/segments' && method === 'GET') return { segments: [{ id: 'seg1', name: 'Active', kind: 'dynamic' }], delivery: false };
      if (path === '/admin/crm/segments' && method === 'POST') return { segment: { id: 'seg1', name: 'Active' } };
      if (path === '/admin/crm/segments/seg1/preview') return { count: 220, sample: [] };
      if (path === '/admin/crm/campaigns' && method === 'GET') {
        return { campaigns: [{ id: 'c1', name: 'Spring', status: 'approved', objective: 'retain' }], delivery: false };
      }
      if (path === '/admin/crm/campaigns/c1/queue') return { planned: 40, skipped: 40, delivery: false, note: 'Rows were planned. No message was sent.' };
      if (path === '/admin/crm/community-announce') return { delivered: false, planned: true, adapter: 'off' };
      if (path === '/admin/crm/automations') return { automations: [{ id: 'a1', name: 'Welcome', trigger: 'registration', status: 'draft', paused: false }], triggers: ['registration'] };
      if (path === '/admin/crm/templates') return { templates: [] };
      if (path === '/admin/crm/tasks') return { tasks: [{ id: 't1', title: 'Call back', status: 'open', userId: 'u1' }] };
      if (path === '/admin/crm/opportunities') return { opportunities: [] };
      if (path === '/admin/crm/analytics') {
        return {
          snapshotAt: '2026-11-06T00:00:00.000Z',
          period: { acquisition: 12, verified: 10, firstPaid: 3, paidOrders: 3, collectedCents: 1400, refundedCents: 200, taxCents: 50, churnedSubscriptions: 0, promotionRedemptions: 0 },
          snapshot: { mrrCents: 600, marketingOptIn: 40, marketingOptOut: 40 },
        };
      }
      if (path === '/admin/crm/risk') return { evaluations: [], autoReject: false };
      return undefined;
    });
    await page.goto('/admin/crm');
    await expect(page.getByText('Live delivery: off')).toBeVisible();
    await page.getByRole('button', { name: 'Segments' }).click();
    await page.getByRole('button', { name: 'Count audience' }).click();
    await expect(page.getByText('Audience: 220')).toBeVisible();
    await page.getByRole('button', { name: 'Campaigns' }).click();
    await expect(page.getByText('Delivery enabled: no')).toBeVisible();
    await page.getByRole('button', { name: 'Queue (no live send)' }).click();
    await page.getByLabel('Community announcement (never posts live)').fill('Hello community');
    await page.getByRole('button', { name: 'Record announcement (no Discord post)' }).click();
    await expect(page.getByText('Announcement recorded. Production Discord was not posted to.')).toBeVisible();
    await page.getByRole('button', { name: 'Analytics' }).click();
    await expect(page.getByText('MRR cents (snapshot)')).toBeVisible();
    await expect(page.getByText('1400')).toBeVisible();
    await page.getByRole('button', { name: 'Risk review' }).click();
    await expect(page.getByText('Shadow mode')).toBeVisible();
  });
});
