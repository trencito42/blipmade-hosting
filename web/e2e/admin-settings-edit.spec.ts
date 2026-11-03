import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const SETTINGS = {
  settings: { 'billing.company_name': 'Acme SRL', 'billing.tax_rate': '21', 'feature.flag': true },
  definitions: [{ key: 'contact.email', group: 'Public contacts', label: 'Contact email', placeholder: '', hint: '', public: true }],
  controlMap: [{ key: 'feature.flag', domain: 'platform', read: 'admin', write: 'admin', general: true, managedBy: null, effect: '' }],
};

test.describe('platform settings on their own pages', () => {
  test('the list shows values and links, company saves on its page', async ({ page }) => {
    let saved: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/settings' && method === 'PUT') { saved = body as Record<string, unknown>; return { settings: {} }; }
      if (path === '/admin/settings') return SETTINGS;
      return undefined;
    });
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Company & tax' }).click();
    await expect(page.getByText('Acme SRL')).toBeVisible();
    await expect(page.getByLabel('Company name')).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/admin\/settings\/company\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.getByLabel('Company name').fill('Acme Hosting SRL');
    await page.getByRole('button', { name: 'Save the company details' }).click();
    await expect.poll(() => saved?.['billing.company_name']).toBe('Acme Hosting SRL');
  });
  test('the advanced page edits the free keys and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/settings' ? SETTINGS : undefined));
    await page.goto('/admin/settings/advanced/edit');
    await expect(page.getByLabel('Key').first()).toHaveValue('feature.flag');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
