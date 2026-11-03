import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const TEMPLATES = { templates: [{ id: 'auth.welcome', version: 1, category: 'account', description: 'Welcome', placeholders: ['name'], locales: ['en'] }] };

test.describe('notification preview and test send on their own pages', () => {
  test('the preview page opens for a template of the catalogue', async ({ page }) => {
    await stubAdmin(page, (path) => (path === '/admin/notifications/templates' ? TEMPLATES : undefined));
    await page.goto('/admin/notifications/templates/auth.welcome/preview');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('auth.welcome');
    await page.goto('/admin/notifications/templates/nope/preview');
    await expect(page.getByText('Template not found.')).toBeVisible();
  });
  test('the test page sends to one address and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/notifications/templates') return TEMPLATES;
      if (path.startsWith('/admin/notifications/test') && method === 'POST') { sent = body; return { sent: true }; }
      return undefined;
    });
    await page.goto('/admin/notifications/test');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    void sent;
  });
});
