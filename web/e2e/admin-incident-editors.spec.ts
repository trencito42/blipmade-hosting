import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const INCIDENT = { id: 'i1', title: 'Slow deploys', status: 'investigating', impact: 'minor', components: [], automatic: false, startedAt: '2026-11-01T10:00:00Z', resolvedAt: null, updates: [] };

test.describe('incident and announcement editors', () => {
  test('list links, incident, update and announcement save on their pages', async ({ page }) => {
    const posts: Record<string, unknown> = {};
    await stubAdmin(page, (path, method, body) => {
      if (method === 'POST') { posts[path] = body; return {}; }
      if (path === '/admin/incidents') return { incidents: [INCIDENT] };
      if (path === '/admin/announcements') return { announcements: [] };
      return undefined;
    });
    await page.goto('/admin/incidents');
    await expect(page.getByLabel('Title')).toHaveCount(0);
    await page.getByRole('link', { name: 'New incident' }).click();
    await page.getByLabel('Title').fill('Database slow');
    await page.getByLabel('What we know').fill('We are looking');
    await page.getByRole('button', { name: 'Publish incident' }).click();
    await expect(page).toHaveURL(/\/admin\/incidents$/);
    expect(posts['/admin/incidents']).toEqual({ title: 'Database slow', impact: 'minor', message: 'We are looking' });
    await page.getByRole('link', { name: 'Post an update' }).click();
    await expect(page).toHaveURL(/\/admin\/incidents\/i1\/updates\/new$/);
    await page.getByLabel('Status').selectOption('resolved');
    await page.getByLabel('Update').fill('All good now');
    await page.getByRole('button', { name: 'Publish update' }).click();
    await expect(page).toHaveURL(/\/admin\/incidents$/);
    expect(posts['/admin/incidents/i1/updates']).toEqual({ status: 'resolved', message: 'All good now' });
    await page.getByRole('link', { name: 'New announcement' }).click();
    await page.getByLabel('Title').fill('Maintenance');
    await page.getByLabel('Message').fill('Tonight at 02:00');
    await page.getByRole('button', { name: 'Publish announcement' }).click();
    await expect(page).toHaveURL(/\/admin\/incidents$/);
    expect(posts['/admin/announcements']).toMatchObject({ title: 'Maintenance', body: 'Tonight at 02:00', severity: 'maintenance' });
  });
  test('the pages fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/incidents' ? { incidents: [INCIDENT] } : undefined));
    for (const url of ['/admin/incidents/new', '/admin/incidents/i1/updates/new', '/admin/announcements/new']) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    }
  });
});
