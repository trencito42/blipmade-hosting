import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const ART = { id: 'a1', title: 'Reset a password', body: 'Step one', tags: ['account'], assistant: false };

test.describe('knowledge articles on their own pages', () => {
  test('new, edit and delete save the whole list', async ({ page }) => {
    const puts: Array<{ articles: { id: string; title: string }[] }> = [];
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/support/knowledge' && method === 'PUT') { puts.push(body as never); return {}; }
      if (path === '/admin/support/knowledge') return { articles: [ART] };
      return undefined;
    });
    await page.goto('/admin/knowledge');
    await expect(page.getByLabel('Text')).toHaveCount(0);
    await page.getByRole('link', { name: 'New article' }).click();
    await expect(page).toHaveURL(/\/admin\/knowledge\/new$/);
    await expect(page.getByRole('button', { name: 'Save article' })).toBeDisabled();
    await page.getByLabel('Title').fill('Refund steps');
    await page.getByLabel('Text').fill('Ask for the order number');
    await page.getByRole('button', { name: 'Save article' }).click();
    await expect(page).toHaveURL(/\/admin\/knowledge$/);
    expect(puts[0]!.articles.map((a) => a.title).sort()).toEqual(['Refund steps', 'Reset a password']);
    await page.goto('/admin/knowledge/a1/edit');
    await expect(page.getByLabel('Title')).toHaveValue('Reset a password');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/admin\/knowledge$/);
    expect(puts[1]!.articles).toEqual([]);
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/support/knowledge' ? { articles: [ART] } : undefined));
    await page.goto('/admin/knowledge/a1/edit');
    await expect(page.getByLabel('Text')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
