import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const RULE = { id: 'r1', name: 'Escalate', enabled: false, priority: 100, trigger: 'conversation_created', afterMinutes: null, conditions: {}, actions: [{ type: 'set_priority', priority: 'HIGH' }], actorId: null, runs: 0 };

test.describe('automation rules on their own pages', () => {
  test('the list links to a rule and a new rule saves', async ({ page }) => {
    let saved: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/support/automations' && method === 'GET') return { automations: [RULE] };
      if (path === '/admin/support/automations' && method === 'POST') { saved = body as Record<string, unknown>; return { automation: RULE }; }
      if (path === '/admin/support/departments') return { departments: [] };
      if (path === '/admin/support/hours') return { hours: { timezone: 'UTC', days: {}, holidays: [] } };
      return undefined;
    });
    await page.goto('/admin/support/automations');
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/admin\/support\/automations\/r1\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByLabel('Name')).toHaveValue('Escalate');
    await page.goto('/admin/support/automations/new');
    await page.getByLabel('Name').fill('Night rule');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/admin\/support\/automations$/);
    expect(saved).toMatchObject({ name: 'Night rule', trigger: 'conversation_created' });
  });
  test('a missing rule says so and the page fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/support/automations' ? { automations: [RULE] } : path === '/admin/support/departments' ? { departments: [] } : undefined));
    await page.goto('/admin/support/automations/nope/edit');
    await expect(page.getByText('Rule not found')).toBeVisible();
    await page.goto('/admin/support/automations/r1/edit');
    await expect(page.getByLabel('Name')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
