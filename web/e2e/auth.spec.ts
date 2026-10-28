import { test, expect, type Page } from '@playwright/test';

/**
 * The account screens.
 *
 * The answers of the API are stubbed in these tests: the screens of the
 * account are checked with the words the server sends, and no account is
 * created in the database of the platform while the tests run.
 */

/** The answer of a session that is not there. */
const NO_SESSION = { status: 401, body: { error: { code: 'unauthorized', message: 'No session.' } } };

/** The account of a customer, as the API sends it. */
const CUSTOMER = {
  id: 'usr_e2e_customer',
  email: 'ana@example.test',
  firstName: 'Ana',
  lastName: 'Ionescu',
  name: 'Ana Ionescu',
  role: 'CUSTOMER',
  emailVerified: true,
  permissions: [],
};

/** Stubs the answers of the account, so no account is created in the live database. */
async function stubAccount(page: Page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({ status: NO_SESSION.status, contentType: 'application/json', body: JSON.stringify(NO_SESSION.body) });
  });
}

test.describe('the login screen', () => {
  test('refuses an address that is not an address, before it asks the server', async ({ page }) => {
    await stubAccount(page);
    await page.goto('/login');

    await page.getByLabel('Email address').fill('not-an-address');
    await page.getByLabel('Password').fill('whatever');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });

  test('shows the words of the server when the account is refused', async ({ page }) => {
    await stubAccount(page);
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'invalid_credentials', message: 'The email address or the password is wrong.' } }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    // The words come from the server, and they are not reworded.
    await expect(page.getByRole('alert')).toContainText('The email address or the password is wrong.');
  });

  test('shows the reason when the account is suspended', async ({ page }) => {
    await stubAccount(page);
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'account_suspended', message: 'This account is suspended. Write to support to know more.' } }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByLabel('Password').fill('a-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert')).toContainText('This account is suspended. Write to support to know more.');
  });

  test('lands on the dashboard when the answer carries a session', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: CUSTOMER }),
      });
    });
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: CUSTOMER }) });
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByLabel('Password').fill('a-good-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/app/);
  });
});

test.describe('the register screen', () => {
  test('counts the rules of the password while it is typed', async ({ page }) => {
    await stubAccount(page);
    await page.goto('/register');

    const rules = page.getByRole('list', { name: 'Password rules' });
    await expect(rules).toBeVisible();
    await expect(rules.getByText('10 characters or more')).toHaveClass(/text-ink3/);

    await page.getByLabel('Password').fill('Str0ngPassword');
    await expect(rules.getByText('10 characters or more')).toHaveClass(/text-acc-h/);
    await expect(rules.getByText('a lowercase letter')).toHaveClass(/text-acc-h/);
    await expect(rules.getByText('an uppercase letter')).toHaveClass(/text-acc-h/);
    await expect(rules.getByText('a number')).toHaveClass(/text-acc-h/);
  });

  test('does not send a password that misses a rule', async ({ page }) => {
    await stubAccount(page);
    let called = false;
    await page.route('**/api/auth/register', async (route) => {
      called = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: CUSTOMER }) });
    });

    await page.goto('/register');
    await page.getByLabel('First name').fill('Ana');
    await page.getByLabel('Last name').fill('Ionescu');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText(/Choose a password with at least 10 characters/)).toBeVisible();
    expect(called).toBe(false);
  });

  test('asks for the address of the account when it was created', async ({ page }) => {
    await stubAccount(page);
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ user: { ...CUSTOMER, emailVerified: false }, mail: { state: 'sent', message: 'We sent a confirmation link to ana@example.test.' } }),
      });
    });

    await page.goto('/register');
    await page.getByLabel('First name').fill('Ana');
    await page.getByLabel('Last name').fill('Ionescu');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByLabel('Password').fill('Str0ngPassword');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText('We sent a confirmation link to ana@example.test.')).toBeVisible();
  });
});
