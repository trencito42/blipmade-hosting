import { expect, test, type Page, type Route } from '@playwright/test';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  // The icon font is licensed and not part of the project: the screenshots borrow it from the live site.
  await page.route('**/fontawesome/**', async (route) => {
    const live = await fetch(`https://blipmade.com${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: live.status, contentType: live.headers.get('content-type') ?? undefined, body: Buffer.from(await live.arrayBuffer()) });
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { error: 'no' }, 401);
    if (path === '/oauth/providers') {
      return json(route, { providers: [{ id: 'github', label: 'GitHub', enabled: true }, { id: 'google', label: 'Google', enabled: true }, { id: 'discord', label: 'Discord', enabled: true }] });
    }
    return json(route, {});
  });
}

test.describe('social sign-in buttons', () => {
  test('login: passkey and providers share one compact grid with brand icons', async ({ page }) => {
    await stub(page);
    await page.goto('/login');
    const github = page.getByRole('link', { name: 'Continue with GitHub' });
    await expect(github).toBeVisible();
    await expect(github.locator('i.fa-brands.fa-github')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Continue with Google' }).locator('i.fa-google')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Continue with Discord' }).locator('i.fa-discord')).toHaveCount(1);
    const passkey = page.getByRole('button', { name: 'Use a passkey' });
    await expect(passkey).toBeVisible();
    // The passkey has its own row, the three providers share one row.
    const tops = await Promise.all([github, page.getByRole('link', { name: 'Continue with Google' }), page.getByRole('link', { name: 'Continue with Discord' })].map((l) => l.evaluate((el) => Math.round(el.getBoundingClientRect().top))));
    expect(new Set(tops).size).toBe(1);
    const passkeyTop = await passkey.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(passkeyTop).toBeLessThan(tops[0]);
    // The icons really draw: the brand font gives the mark a width.
    expect(await github.locator('i').evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none');
    await page.screenshot({ path: 'test-results/login-social.png', fullPage: true });
  });

  test('register: the providers are there and start the same flow', async ({ page }) => {
    await stub(page);
    await page.goto('/register');
    const github = page.getByRole('link', { name: 'Continue with GitHub' });
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute('href', /\/api\/oauth\/github\/start\?intent=login/);
    await expect(page.getByText('or sign up with')).toBeVisible();
    await expect(github.locator('i')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/register-social.png', fullPage: true });
  });
});
