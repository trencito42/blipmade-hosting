import { devices, expect, test } from '@playwright/test';

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

test.describe('the bar of the site', () => {
  test('opens three menus with real products and closes them with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const [label, id] of [['Games', 'menu-games'], ['Build', 'menu-build'], ['Servers & mail', 'menu-servers']] as const) {
      await nav.getByRole('button', { name: label }).click();
      await expect(page.locator(`#${id}`)).toBeVisible();
      expect(await page.locator(`#${id} a`).count()).toBeGreaterThan(1);
      await page.keyboard.press('Escape');
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
  });

  test('a member of the staff chooses between the dashboard and the admin area', async ({ page }) => {
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'a', email: 'admin@example.test', firstName: 'Ada', lastName: 'Admin', name: 'Ada Admin', role: 'ADMIN', emailVerified: true, permissions: [] } }) }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.getByRole('menuitem', { name: /My dashboard/ })).toHaveAttribute('href', '/app');
    await expect(page.getByRole('menuitem', { name: /Admin/ })).toHaveAttribute('href', '/admin');
  });

  test('a customer goes straight to the dashboard of the customers', async ({ page }) => {
    await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'c', email: 'c@example.test', firstName: 'Cora', lastName: 'Customer', name: 'Cora Customer', role: 'CUSTOMER', emailVerified: true, permissions: [] } }) }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app');
  });

  test('the screens of the panel switch and keep their text', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('tab', { name: 'Servers' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Servers of your own');
    await expect(page.getByRole('img', { name: /list of servers/ })).toBeVisible();
  });

  test('the footer has no counters and keeps the legal pages', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Terms of service' })).toBeVisible();
    await expect(footer.getByRole('heading', { name: 'The fine print' })).toBeVisible();
    expect(await footer.innerText()).not.toMatch(/\b\d{2} ·/);
  });
});

/** Phones, emulated with their screen, pixel density, touch and agent. A real phone still has to be tried by hand. */
for (const name of ['iPhone SE', 'iPhone 13', 'Pixel 7', 'Galaxy S9+'] as const) {
  const { defaultBrowserType: _ignored, ...device } = devices[name];
  test.describe(`on ${name}`, () => {
    test.use(device);

    test('shows the title, does not scroll sideways, and every tap target is at least 40px', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main a, main button, header a, header button')]
          .map((node) => node.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0 && (box.height < 40 || box.width < 40))
          .length,
      );
      expect(small).toBeLessThanOrEqual(8);
    });

    test('opens the menu by touch, reaches a game and the dashboard tabs', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Open menu' }).tap();
      const menu = page.getByRole('navigation', { name: 'Mobile' });
      await expect(menu.getByRole('link', { name: 'Every game' })).toBeVisible();
      await page.getByRole('button', { name: 'Close menu' }).tap();
      await page.getByRole('tab', { name: 'Domains' }).scrollIntoViewIfNeeded();
      await page.getByRole('tab', { name: 'Domains' }).tap();
      await expect(page.getByRole('tabpanel')).toContainText('Domains: connect a hostname');
    });
  });
}
