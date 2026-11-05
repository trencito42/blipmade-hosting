import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Res', lastName: 'Owner', name: 'Res Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'Shop', status: 'running', ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', product: { slug: 'wordpress', name: 'WordPress', icon: 'box' } };
const PRODUCT = { slug: 'wordpress', name: 'WordPress', minRam: 512, maxRam: 4096, minCpu: 1, maxCpu: 4, minDisk: 10, maxDisk: 100, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10 };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, saved: unknown[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/instances/i1' && req.method() === 'GET') return json(route, { instance: INSTANCE });
    if (path === '/catalog/products/wordpress') return json(route, { product: PRODUCT });
    if (path === '/instances/i1/resources/quote') {
      const ram = Number(url.searchParams.get('ram'));
      const delta = Math.round(((ram - 1024) / 256) * 100);
      return json(route, { quote: { priceDelta: delta, newPrice: 900 + delta, currency: 'EUR', requiresPayment: delta > 0 } });
    }
    if (path === '/instances/i1/resources' && req.method() === 'PUT') {
      const body = req.postDataJSON() as { ram: number };
      saved.push(body);
      return body.ram > 1024
        ? json(route, { status: 'requires_payment', priceDelta: 100, price: 1000, currency: 'EUR', checkoutUrl: 'https://pay.example.test/session/abc', order: { number: 'BM-100' } })
        : json(route, { status: 'applied', instance: { ...INSTANCE, ...body }, priceDelta: -100, price: 800, currency: 'EUR' });
    }
    return json(route, {});
  });
}

test.describe('dedicated resources page', () => {
  test('a cheaper change shows the quoted price and is applied with the exact limits', async ({ page }) => {
    const saved: unknown[] = [];
    await stub(page, saved);
    await page.goto('/app/instances/i1/resources/edit');
    await expect(page.locator('h1:visible')).toHaveText('Change resources');
    const save = page.getByRole('button', { name: 'Save resources' });
    await expect(save).toBeDisabled();
    await page.getByRole('button', { name: 'Decrease Memory' }).click();
    await expect(page.getByRole('complementary', { name: 'Price' })).toContainText('8');
    await expect(save).toBeEnabled();
    await save.click();
    await page.waitForURL('**/app/instances/i1/resources');
    expect(saved).toEqual([{ ram: 768, cpu: 1, disk: 10 }]);
  });

  test('a dearer change goes to payment and the page does not leave by itself', async ({ page }) => {
    const saved: unknown[] = [];
    await stub(page, saved);
    await page.goto('/app/instances/i1/resources/edit');
    await page.getByRole('button', { name: 'Increase Memory' }).click();
    await expect(page.getByText('Only the days left in this period are charged now. The new price renews afterwards.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    const pay = page.getByRole('link', { name: 'Pay and apply the change' });
    await expect(pay).toHaveAttribute('href', 'https://pay.example.test/session/abc');
    await expect(page.getByText(/Order BM-100 covers the price difference/)).toBeVisible();
    expect(saved).toEqual([{ ram: 1280, cpu: 1, disk: 10 }]);
    await expect(page).toHaveURL(/resources\/edit$/);
  });

  test('guards a draft and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, []);
    await page.goto('/app/instances/i1/resources/edit');
    await page.getByRole('button', { name: 'Increase vCPU' }).click();
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Back to resources' }).click();
    await expect(page).toHaveURL(/resources\/edit$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('a saved profile opens the page with its size typed in, and the change is the one the profile says', async ({ page }) => {
    const saved: unknown[] = [];
    await stub(page, saved);
    await page.goto('/app/instances/i1/resources/edit?ram=768&cpu=1&disk=10');
    const save = page.getByRole('button', { name: 'Save resources' });
    await expect(save).toBeEnabled();
    await save.click();
    await page.waitForURL('**/app/instances/i1/resources');
    expect(saved).toEqual([{ ram: 768, cpu: 1, disk: 10 }]);
  });

  test('a size in the address that is not whole numbers is ignored', async ({ page }) => {
    const saved: unknown[] = [];
    await stub(page, saved);
    await page.goto('/app/instances/i1/resources/edit?ram=abc&cpu=0.5&disk=-3');
    await expect(page.getByRole('button', { name: 'Save resources' })).toBeDisabled();
  });
});
