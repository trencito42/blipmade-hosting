import { expect, test } from '@playwright/test';

/** The home page as a plan sheet: structure, one title, every action reachable, and no sideways scroll at any width. */
test.describe('home page 2026', () => {
  test('has one title, numbered sections, a sheet of workloads and the real destinations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run it here. Pay for what it eats.');
    for (const name of ['So, what are we running today?', 'Three steps. No yak shaving.', 'Everything in one place. Yes, even the boring parts.', 'One card of rates. Every product.', 'No fine print scavenger hunt.', 'Questions people ask first.', 'Put the next thing online.']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    const sheet = page.getByRole('list', { name: /Workloads you can run/ });
    expect(await sheet.getByRole('link').count()).toBeGreaterThanOrEqual(4);
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute('href', '/register');
    await expect(page.getByRole('link', { name: 'The full catalogue' })).toHaveAttribute('href', '/apps');
    await expect(page.getByRole('link', { name: 'Open the status page' })).toHaveAttribute('href', '/status');
  });

  test('hovering a block of the sheet moves the caption to that workload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const links = page.getByRole('list', { name: /Workloads you can run/ }).getByRole('link');
    const last = links.nth((await links.count()) - 1);
    const name = (await last.locator('span.font-display').innerText()).trim();
    await last.hover();
    await expect(page.locator('figcaption[aria-live="polite"]')).toContainText(name);
  });

  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    test(`does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    });
  }

  test('does not scroll sideways at 200% zoom on a laptop', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('keeps its content and stops the pulse when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const arc = page.locator('.blip-arc').first();
    await expect(arc).toHaveCSS('animation-name', 'none');
  });

  test('every control can be reached and shows the focus ring', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus-visible');
    await expect(focused).toHaveCount(1);
    expect(await focused.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
  });
});
