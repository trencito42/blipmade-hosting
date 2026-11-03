import { expect, test } from '@playwright/test';

/** The public pages in the language of the home page: the bar and the footer of the site, no sideways scroll, the real routes. */
const PAGES: [string, string][] = [['/apps', 'Games, databases and tools, on one price card.'], ['/apps/discord-bot', 'Discord Bot hosting'], ['/login', 'Log in'], ['/register', 'Create your account'], ['/docs', 'Documentation'], ['/status', 'Service status'], ['/abuse', 'Report abuse'], ['/nothing-here', 'This page is not here.']];

async function stubPlans(page: import('@playwright/test').Page) {
  const limits = { maxDomains: 5, maxMailboxes: 10, maxAliases: 20, maxForwarding: 5, totalStorageMb: 10240, mailboxQuotaMb: 2048, sendLimit: 1000, sendInterval: 'DAY' };
  await page.route('**/api/vps/plans', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plans: [{ slug: 'vps-start', name: 'VPS Start', description: 'A server.', ram: 1024, cpu: 1, disk: 20, price: { amount: 249, currency: 'EUR', period: 'MONTHLY' }, dedicatedIp: null }] }) }));
  await page.route('**/api/mail/plans', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plans: [{ id: 'm1', slug: 'starter', name: 'Starter', description: 'Mailboxes.', icon: 'mail', limits, price: { amount: 299, currency: 'EUR', period: 'MONTHLY' }, prices: [], availability: { state: 'DEPLOYABLE', orderable: true, blockers: [] }, onSale: true }] }) }));
}

test.describe('public pages 2026', () => {
  for (const width of [390, 1440]) {
    for (const [path, heading] of PAGES) {
      test(`${path} shows its title and does not scroll sideways at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      });
    }
    for (const [path, heading] of [['/vps', 'A server of your own'], ['/email', 'Your own mail']] as const) {
      test(`${path} shows the plans on coloured tiles and does not scroll sideways at ${width}px`, async ({ page }) => {
        await stubPlans(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
        await expect(page.getByRole('link', { name: /Choose/ }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      });
    }
  }

  test('the status page and the abuse form have the bar and the footer of the site', async ({ page }) => {
    for (const path of ['/status', '/abuse']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
      await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms of service' })).toBeVisible();
    }
  });

  test('the catalogue does not announce anything as coming and has no counters on its tabs', async ({ page }) => {
    await page.goto('/apps');
    await expect(page.getByText(/Coming soon|still coming/)).toHaveCount(0);
    const tabs = page.getByRole('button', { name: /^(All|Games|Databases)$/ });
    expect(await tabs.count()).toBeGreaterThan(1);
  });

  test('the sign-in shows what the visitor chose on the side', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login?app=discord-bot&ram=512&cpu=1&disk=5');
    await expect(page.getByText('Your configuration')).toBeVisible();
    await expect(page.getByText('Go put something online.').first()).toBeVisible();
  });
});

test.describe('servers and mail have their own pages only', () => {
  const product = (slug: string, name: string, category: string) => ({
    slug, name, category, description: `${name} for the test.`, minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, maxRam: 4096, maxCpu: 4, maxDisk: 50,
    pricing: { currency: 'EUR', minimum: { amount: 249 }, recommended: { amount: 349 }, rates: { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 } },
    availability: { state: 'DEPLOYABLE', orderable: true, visible: true, blockers: [] }, visible: true, deployable: true,
  });
  const catalog = { products: [product('discord-bot', 'Discord Bot', 'BOTS'), product('vps-start', 'VPS Start', 'VPS'), product('email-hosting-starter', 'Email Hosting Starter', 'EMAIL_HOSTING')] };

  test('the catalogue does not list them and their old addresses lead to the storefronts', async ({ page }) => {
    await page.route('**/api/catalog/products', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
    await stubPlans(page);
    await page.goto('/apps');
    await expect(page.getByRole('link', { name: /Discord Bot/ }).first()).toBeVisible();
    await expect(page.locator('main').getByText(/VPS Start|Email Hosting Starter/)).toHaveCount(0);
    await page.goto('/apps/vps-start');
    await expect(page).toHaveURL(/\/vps$/);
    await page.goto('/apps/email-hosting-starter');
    await expect(page).toHaveURL(/\/email$/);
  });
});
