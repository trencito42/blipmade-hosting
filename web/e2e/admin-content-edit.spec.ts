import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const BLOCKS = { blocks: [{ key: 'home.hero', label: 'Home hero', description: '', hasDraft: false, draftBy: null, published: null }], placeholders: ['price'] };
const DETAIL = { block: { key: 'home.hero', label: 'Home hero', description: 'The top of the home page', example: { title: 'Hello', lead: 'World' } }, draft: null, published: null, history: [] };

test.describe('site content block on its own page', () => {
  test('the list links and the draft is saved', async ({ page }) => {
    let draft: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/content/home.hero/draft' && method === 'PUT') { draft = body; return {}; }
      if (path === '/admin/content/home.hero') return DETAIL;
      if (path === '/admin/content') return BLOCKS;
      return undefined;
    });
    await page.goto('/admin/content');
    await expect(page.getByLabel('Content of the block, as JSON')).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/admin\/content\/home\.hero\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const box = page.getByLabel('Content of the block, as JSON');
    await box.fill('{ "title": "Hi", "lead": "There" }');
    await page.getByRole('button', { name: 'Save the draft' }).click();
    await expect.poll(() => draft).toEqual({ data: { title: 'Hi', lead: 'There' } });
  });
  test('invalid JSON blocks saving and the page fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/content/home.hero' ? DETAIL : path === '/admin/content' ? BLOCKS : undefined));
    await page.goto('/admin/content/home.hero/edit');
    await page.getByLabel('Content of the block, as JSON').fill('{ nope');
    await expect(page.getByRole('alert')).toContainText('not valid JSON');
    await expect(page.getByRole('button', { name: 'Save the draft' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
