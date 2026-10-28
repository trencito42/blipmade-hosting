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

test.describe('the log in screen', () => {
  test('refuses an address that is not an address, before it asks the server', async ({ page }) => {
    await stubAccount(page);
    await page.goto('/login');

    await page.getByLabel('Email address').fill('not-an-address');
    await page.getByLabel('Password', { exact: true }).fill('whatever');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });

  test('answers a refused sign-in with one sentence, so the answer never says whether an account exists', async ({ page }) => {
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
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    // The answer is the same for a wrong password and for an address that
    // does not exist, so the page never says that an account is missing.
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
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
    await page.getByLabel('Password', { exact: true }).fill('a-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    // The words come from the server, and they are not reworded.
    await expect(page.getByRole('alert')).toHaveText('This account is suspended. Write to support to know more.');
  });

  test('lands on the dashboard when the answer carries a session', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: CUSTOMER }) });
    });
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: CUSTOMER }) });
    });

    await page.goto('/login');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a-good-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await page.waitForURL((url) => url.pathname.startsWith('/app'));
  });

  test('the password can be shown and hidden', async ({ page }) => {
    await stubAccount(page);
    await page.goto('/login');

    const field = page.getByLabel('Password', { exact: true });
    await field.fill('a-good-password');
    await expect(field).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(field).toHaveAttribute('type', 'password');
  });
});

test.describe('the account screen', () => {
  test('counts the rules of the password while it is typed', async ({ page }) => {
    await stubAccount(page);
    await page.goto('/register');

    const rules = page.getByRole('list', { name: 'Password rules' });
    await expect(rules).toBeVisible();
    await expect(rules.getByText('10 characters or more')).toHaveClass(/text-ink-3/);

    await page.getByLabel('Password', { exact: true }).fill('Str0ngPassword');
    await expect(rules.getByText('10 characters or more')).toHaveClass(/text-green/);
    await expect(rules.getByText('a lowercase letter')).toHaveClass(/text-green/);
    await expect(rules.getByText('an uppercase letter')).toHaveClass(/text-green/);
    await expect(rules.getByText('a number')).toHaveClass(/text-green/);
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
    await page.getByLabel('Password', { exact: true }).fill('short');
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
    await page.getByLabel('Password', { exact: true }).fill('Str0ngPassword');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible();
    await expect(page.getByText(/We sent a confirmation link to ana@example.test./)).toBeVisible();
  });
});

test.describe('the screen of a lost password', () => {
  test('asks for the address and does not say whether an account exists', async ({ page }) => {
    await stubAccount(page);
    await page.route('**/api/auth/forgot-password', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'If that address has an account, a reset link is on its way.' }),
      });
    });

    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill('ana@example.test');
    await page.getByRole('button', { name: 'Send the link' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible();
    await expect(page.getByText('If that address has an account, a reset link is on its way.')).toBeVisible();
  });

  test('a link that is not valid says so, and offers a new one', async ({ page }) => {
    await stubAccount(page);
    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { name: 'Link not valid.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });
});

test.describe('the screen of the confirmation of the address', () => {
  test('says that the address is confirmed', async ({ page }) => {
    await stubAccount(page);
    await page.route('**/api/auth/verify-email', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto('/verify-email?token=good-token');
    await expect(page.getByRole('heading', { name: 'Email verified.' })).toBeVisible();
  });

  test('says that the link is not valid, and offers another one', async ({ page }) => {
    await stubAccount(page);
    await page.route('**/api/auth/verify-email', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'invalid_token', message: 'This link is not valid.' } }),
      });
    });

    await page.goto('/verify-email?token=bad-token');
    await expect(page.getByRole('heading', { name: 'We could not confirm your email.' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('invalid or has already been used');
  });
});
