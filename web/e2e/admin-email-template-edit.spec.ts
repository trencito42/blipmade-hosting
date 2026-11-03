import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const TEMPLATES = { templates: [{ id: 'auth.welcome', category: 'account', defaults: { subject: 'Welcome', heading: 'Hello', preheader: 'Start here', note: '', placeholders: ['name'] }, override: null }] };

const EXTRA = (path: string) => (path === '/admin/email-templates/coverage' ? { events: [], missing: [], orphans: [] } : path.endsWith('/versions') ? { versions: [] } : undefined);

test.describe('email wording on its own page', () => {
  test('the list links and only the changed part is saved', async ({ page }) => {
    let saved: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/email-templates/auth.welcome' && method === 'PUT') { saved = body; return {}; }
      if (path === '/admin/email-templates') return TEMPLATES;
      return EXTRA(path);
    });
    await page.goto('/admin/email-templates');
    await expect(page.getByLabel('Subject')).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/admin\/email-templates\/auth\.welcome\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Save the wording' })).toBeDisabled();
    await page.getByLabel('Subject').fill('Welcome to Blipmade');
    await page.getByRole('button', { name: 'Save the wording' }).click();
    await expect.poll(() => saved).toEqual({ subject: 'Welcome to Blipmade' });
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/email-templates' ? TEMPLATES : EXTRA(path)));
    await page.goto('/admin/email-templates/auth.welcome/edit');
    await expect(page.getByLabel('Subject')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
