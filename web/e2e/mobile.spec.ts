import { test, expect } from '@playwright/test';

/**
 * The menu of the site on a narrow screen.
 *
 * The menu of a phone is a sheet that covers the page, so it is a dialog: it
 * closes with Escape, it keeps the focus inside itself, and it gives the
 * focus back to the button that opened it.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('the menu of a phone', () => {
  test('opens, shows the sections and closes', async ({ page }) => {
    await page.goto('/');

    const button = page.getByRole('button', { name: 'Open menu' });
    await expect(button).toBeVisible();
    await button.click();

    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Apps' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Docs' })).toBeVisible();

    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(sheet).toBeHidden();
  });

  test('closes with Escape and gives the focus back', async ({ page }) => {
    await page.goto('/');

    const button = page.getByRole('button', { name: 'Open menu' });
    await button.click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  });

  test('opens the catalogue from the sheet', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Apps' }).click();

    await expect(page).toHaveURL(/\/apps/);
  });
});
