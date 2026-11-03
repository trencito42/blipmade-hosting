import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const LIMITS = { maxDomains: 5, maxMailboxes: 10, maxAliases: 20, maxForwarding: 5, totalStorageMb: 10240, mailboxQuotaMb: 2048, sendLimit: 1000 };
const PLAN = { id: 'mp1', slug: 'mail-s', name: 'Mail S', description: 'Small', icon: 'mail', visible: true, deployable: true, limits: LIMITS, writtenLimits: LIMITS, prices: [{ id: 'pp1', period: 'MONTHLY', currency: 'EUR', amount: 500, active: true }], customers: 2, services: 3 };

test.describe('mail plans on their own pages', () => {
  test('the list links to the editor and the new page opens the form', async ({ page }) => {
    await stubAdmin(page, (path) => (path === '/admin/mail/plans' ? { plans: [PLAN] } : undefined));
    await page.goto('/admin/mail/plans');
    await page.getByRole('link', { name: 'Edit' }).first().click();
    await expect(page).toHaveURL(/\/admin\/mail\/plans\/mp1\/edit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByLabel(/^Name/).first()).toHaveValue('Mail S');
    await page.goto('/admin/mail/plans/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New plan' })).toBeVisible();
  });
  test('a missing plan says so and the form fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAdmin(page, (path) => (path === '/admin/mail/plans' ? { plans: [PLAN] } : undefined));
    await page.goto('/admin/mail/plans/nope/edit');
    await expect(page.getByText('Plan not found.')).toBeVisible();
    await page.goto('/admin/mail/plans/mp1/edit');
    await expect(page.getByLabel(/^Name/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
