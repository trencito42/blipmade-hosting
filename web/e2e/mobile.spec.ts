import { test, expect } from '@playwright/test';

/**
 * The pages of the public site on a phone and on a desktop.
 *
 * Two things are checked: the page never scrolls sideways, and the menu of the
 * phone opens and closes.
 */

const PAGES = ['/', '/apps', '/apps/code-server', '/docs', '/docs/upgrade', '/login', '/register', '/terms'];

/** How much the page scrolls sideways. Zero is the answer we want. */
async function overflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return Math.max(root.scrollWidth - root.clientWidth, document.body.scrollWidth - document.body.clientWidth);
  });
}

test.describe('the pages of the public site', () => {
  test('do not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await overflow(page), `${path} scrolls sideways on a phone`).toBeLessThanOrEqual(0);
    }
  });

  test('do not scroll sideways on a desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await overflow(page), `${path} scrolls sideways on a desktop`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('the menu of the phone', () => {
  test('opens and closes, and the pages are in it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const button = page.getByRole('button', { name: 'Open menu' });
    await expect(button).toBeVisible();
    await button.click();

    const menu = page.getByRole('navigation', { name: 'Mobile' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Docs' })).toBeVisible();

    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(menu).toBeHidden();
  });

  test('the menu of the desktop is always there', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Docs' })).toBeVisible();
  });
});

test.describe('the bar of the site', () => {
  test('holds the name of the platform and the two actions', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Blipmade' })).toBeVisible();
    // On a phone the two actions are in the menu, not in the bar.
    const menu = page.getByRole('navigation', { name: 'Mobile' });
    if (await menu.isVisible()) {
      await expect(menu.getByRole('link', { name: 'Log in' })).toBeVisible();
      await expect(menu.getByRole('link', { name: 'Get started' })).toBeVisible();
      return;
    }
    await expect(header.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Get started' })).toBeVisible();
  });

  test('the name of the platform is the logo of the platform', async ({ page }) => {
    await page.goto('/');
    const logo = page.getByRole('banner').getByRole('link', { name: 'Blipmade' });
    await expect(logo.locator('img')).toHaveAttribute('src', '/favicon.svg');
  });
});
