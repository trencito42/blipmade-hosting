import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

/**
 * The accessibility of the pages of the site.
 *
 * The rules of axe are checked on the pages a visitor lands on. A page with a
 * violation is a page that keeps a visitor out, so the count has to be zero.
 */

/** The pages that are checked. */
const PAGES = ['/', '/apps', '/docs', '/login', '/register'];

/** The violations of a page, written in one line each. */
async function violationsOf(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
}

test.describe('the pages of the site', () => {
  for (const path of PAGES) {
    test(`${path} has no violation`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const problems = await violationsOf(page);
      expect(problems, `violations on ${path}:\n${problems.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('the theme of the site', () => {
  test('the pages hold up in the theme of the system too', async ({ page }) => {
    // The site has one theme and it is dark, and it says so to the browser.
    // The check is here to prove that the reading does not depend on the
    // theme of the system of the visitor.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const problems = await violationsOf(page);
    expect(problems, `violations on / in light:\n${problems.join('\n')}`).toEqual([]);
  });
});
