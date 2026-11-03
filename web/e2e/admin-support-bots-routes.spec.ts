import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const FLOW = { start: 'menu', nodes: { menu: { type: 'message', text: 'Hello', next: 'end' }, end: { type: 'end', text: 'Bye' } } };
const BOT = { id: 'b1', name: 'Front desk', enabled: false };

test.describe('support bots on their own pages', () => {
  test('the list only links, a new bot opens its editor', async ({ page }) => {
    let created: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/support/bots' && method === 'GET') return { bots: [{ ...BOT, publishedVersion: null, conversations: 0 }] };
      if (path === '/admin/support/bots' && method === 'POST') { created = body as Record<string, unknown>; return { bot: { id: 'b1' } }; }
      if (path === '/admin/support/bots/b1') return { bot: BOT, draft: FLOW, validation: { errors: [], warnings: [] }, versions: [] };
      if (path === '/admin/support/departments') return { departments: [] };
      if (path === '/admin/support/bots/simulate') return { ok: true, turns: [], effects: [] };
      return undefined;
    });
    await page.goto('/admin/support/bots');
    await expect(page.getByLabel('Name')).toHaveCount(0);
    await page.getByRole('link', { name: 'New bot' }).click();
    await expect(page).toHaveURL(/\/admin\/support\/bots\/new$/);
    await expect(page.getByRole('button', { name: 'From the template' })).toBeDisabled();
    await page.getByLabel('Name').fill('Front desk');
    await page.getByRole('button', { name: 'From the template' }).click();
    await expect(page).toHaveURL(/\/admin\/support\/bots\/b1\/edit$/);
    expect(created).toEqual({ name: 'Front desk', template: true });
    await expect(page.getByRole('heading', { level: 1, name: 'Front desk' })).toBeVisible();
  });
  test('the editor page opens from a link and has one title', async ({ page }) => {
    await stubAdmin(page, (path) => {
      if (path === '/admin/support/bots/b1') return { bot: BOT, draft: FLOW, validation: { errors: [], warnings: [] }, versions: [] };
      if (path === '/admin/support/departments') return { departments: [] };
      if (path === '/admin/support/bots/simulate') return { ok: true, turns: [], effects: [] };
      return undefined;
    });
    await page.goto('/admin/support/bots/b1/edit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  });
});
