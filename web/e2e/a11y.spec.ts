import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The access of the pages of the public site.
 *
 * The rules are the ones of WCAG 2.1, level A and AA, the rules a reader with
 * a keyboard and a reader of a screen needs. The pages are checked at the
 * width of a desktop, which is the width the design was drawn for.
 */

const PAGES = [
  { path: '/', name: 'the home page' },
  { path: '/apps', name: 'the catalog of the apps' },
  { path: '/apps/code-server', name: 'the page of a product' },
  { path: '/docs', name: 'the index of the documentation' },
  { path: '/docs/upgrade', name: 'a page of the documentation' },
  { path: '/login', name: 'the log in' },
  { path: '/register', name: 'the account' },
  { path: '/terms', name: 'a legal page' },
];

for (const target of PAGES) {
  test.describe(target.name, () => {
    test('has no rule broken', async ({ page }) => {
      await page.goto(target.path);
      // The page is drawn by the browser as well: the page that is written to
      // the disk and the page the browser draws are the same.
      await expect(page.locator('h1').first()).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const broken = results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      }));
      expect(broken).toEqual([]);
    });
  });
}
