import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const FAMILY = {
  id: 'fam-1',
  slug: 'minecraft',
  name: 'Minecraft',
  summary: 'One family for the Minecraft runtimes.',
  group: 'games',
  discovery: 'HIDDEN',
  prepared: false,
  sortOrder: 0,
  variantCount: 0,
  presetCount: 0,
  addonCount: 0,
};

test.describe('catalogue families', () => {
  test('the list opens a dedicated editor and saves a draft family', async ({ page }) => {
    let payload: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/catalog/families' && method === 'GET') return { families: [FAMILY], note: 'Prepared families stay off the public catalogue.' };
      if (path === '/admin/catalog/families' && method === 'POST') {
        payload = body as Record<string, unknown>;
        return { family: { ...FAMILY, id: 'fam-2', slug: 'cs2', name: 'Counter-Strike' } };
      }
      return undefined;
    });
    await page.goto('/admin/catalog/families');
    await expect(page.getByRole('link', { name: 'Minecraft' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'New family' }).click();
    await expect(page).toHaveURL(/\/admin\/catalog\/families\/new$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Create family' })).toBeDisabled();
    await page.getByLabel('Slug').fill('cs2');
    await page.getByLabel('Name').fill('Counter-Strike');
    await page.getByLabel('Summary').fill('One family for the Counter-Strike runtimes.');
    await page.getByRole('button', { name: 'Create family' }).click();
    await expect(page).toHaveURL(/\/admin\/catalog\/families$/);
    expect(payload).toMatchObject({ slug: 'cs2', name: 'Counter-Strike', group: 'games', prepared: false });
  });

  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path, method) => (path === '/admin/catalog/families' && method === 'GET' ? { families: [FAMILY], note: 'Off the public catalogue.' } : undefined));
    await page.goto('/admin/catalog/families/new');
    await expect(page.getByLabel('Slug')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
