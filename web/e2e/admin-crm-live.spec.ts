import { expect, test } from '@playwright/test';

/**
 * Live staff login against an isolated API. Skipped unless E2E_STAFF_EMAIL and
 * E2E_STAFF_PASSWORD are set. Never points at production customers.
 */
const email = process.env.E2E_STAFF_EMAIL;
const password = process.env.E2E_STAFF_PASSWORD;

test.describe('admin CRM live staff session', () => {
  test.skip(!email || !password, 'Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD against an isolated bench.');

  test('staff can open CRM after a real login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email!);
    await page.getByLabel('Password', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.goto('/admin/crm');
    await expect(page.getByText('CRM & growth')).toBeVisible();
    await page.getByRole('button', { name: 'Segments' }).click();
    await expect(page.getByText('Nested AND/OR')).toBeVisible();
  });
});
