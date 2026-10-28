import { test, expect } from '@playwright/test';

/**
 * The public site.
 *
 * The prices of the plans and of the catalogue are read from the API of the
 * platform, so these tests check the pages against the catalogue that is
 * really there and not against a list that was written into the test.
 */

test.describe('the home page', () => {
  test('opens with the name of the platform and the call to the catalogue', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse the catalogue|Apps/i }).first()).toBeVisible();
  });

  test('switches the plans between the groups of the catalogue', async ({ page }) => {
    await page.goto('/');

    const tabs = page.getByRole('tablist', { name: 'What are you hosting' });
    await expect(tabs).toBeVisible();

    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();

    // The first tab is the one that is chosen, and it is marked as chosen.
    await expect(tabs.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');

    // The panel follows the tab that was pressed.
    const before = await panel.innerText();
    await tabs.getByRole('tab', { name: 'Apps' }).click();
    await expect(tabs.getByRole('tab', { name: 'Apps' })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'false');
    await expect.poll(async () => panel.innerText()).not.toBe(before);

    // The price of a plan is the one of the API, written with the currency.
    await expect(panel.getByText(/€\d+\.\d{2}/).first()).toBeVisible();
  });

  test('moves between the tabs with the keyboard', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('tablist', { name: 'What are you hosting' });
    await tabs.getByRole('tab', { name: 'Games' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Bots' })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('the catalogue', () => {
  test('filters the products by the name', async ({ page }) => {
    await page.goto('/apps');

    const search = page.getByLabel('Search the catalog');
    await expect(search).toBeVisible();

    const cards = page.locator('ul > li article');
    const all = await cards.count();
    expect(all).toBeGreaterThan(0);

    await search.fill('wordpress');
    await expect.poll(async () => cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toContainText(/WordPress/i);

    await search.fill('a name that matches nothing at all');
    await expect(page.getByText('No product matches your search.')).toBeVisible();
  });

  test('filters the products by their category', async ({ page }) => {
    await page.goto('/apps');

    const group = page.getByRole('group', { name: 'Category' });
    await expect(group).toBeVisible();

    const games = group.getByRole('button', { name: 'Games' });
    await games.click();
    await expect(games).toHaveAttribute('aria-pressed', 'true');

    const cards = page.locator('ul > li article');
    await expect.poll(async () => cards.count()).toBeGreaterThan(0);
    await expect(page.locator('ul > li article p.font-mono').first()).toContainText(/Game/i);
  });

  test('opens the page of a product', async ({ page }) => {
    await page.goto('/apps');
    const first = page.locator('ul > li article h2 a').first();
    const name = await first.innerText();
    await first.click();
    await expect(page).toHaveURL(/\/apps\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  });
});

test.describe('the documentation', () => {
  test('opens with the index of the sections', async ({ page }) => {
    await page.goto('/docs');

    await expect(page.getByRole('heading', { level: 1, name: 'Documentation' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  });

  test('opens a page of it and walks the sections', async ({ page }) => {
    await page.goto('/docs');

    const card = page.locator('main ul > li a').first();
    await card.click();

    await expect(page).toHaveURL(/\/docs\?p=/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The page names the sections it holds, and the first one is there.
    const headings = page.locator('article h2');
    await expect(headings.first()).toBeVisible();

    // The list on the right sends to a section of the page.
    const onThisPage = page.getByRole('navigation', { name: 'On this page' });
    if (await onThisPage.count()) {
      const first = onThisPage.getByRole('link').first();
      const href = await first.getAttribute('href');
      if (href) {
        await first.click();
        await expect(page).toHaveURL(new RegExp(href.replace('#', '\\#')));
      }
    }
  });

  test('searches inside the documentation', async ({ page }) => {
    await page.goto('/docs');

    const search = page.getByLabel('Search the documentation');
    await expect(search).toBeVisible();
    await search.fill('password');
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
  });
});

test.describe('the pages of the site', () => {
  test('the page that does not exist says so', async ({ page }) => {
    await page.goto('/a-page-that-does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the homepage' })).toBeVisible();
  });

  test('the legal pages are the six of the footer', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Legal' }).getByRole('link')).toHaveCount(6);
  });
});
