import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('declare an incident on its own page', () => {
  test('posts the message and returns to operations', async ({ page }) => {
    let sent: unknown;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/ops/incident' && method === 'POST') { sent = body; return {}; }
      return undefined;
    });
    await page.goto('/admin/ops/incident/declare');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const go = page.getByRole('button', { name: 'Declare an incident' });
    await expect(go).toBeDisabled();
    await page.getByLabel('What is happening').fill('Mail server is down');
    await go.click();
    await expect.poll(() => sent).toMatchObject({ message: 'Mail server is down' });
    await expect(page).toHaveURL(/\/admin\/ops$/);
  });
  test('fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page);
    await page.goto('/admin/ops/incident/declare');
    await expect(page.getByLabel('What is happening')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
