import { expect, test, type Route } from '@playwright/test';

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

// A dropdown has one arrow: the shared Select draws its own and the style of the page must not add a second one.
test('the shared dropdown draws one arrow, a plain one gets the arrow of the page', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: { id: 'u', email: 'u@example.test', firstName: 'U', lastName: 'S', name: 'U S', role: 'CUSTOMER', emailVerified: true, permissions: [] } });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/tickets/categories') return json(route, { categories: [{ id: 'general', label: 'General' }, { id: 'billing', label: 'Billing' }] });
    if (path === '/instances') return json(route, { instances: [] });
    if (path === '/catalog/products') return json(route, { products: [] });
    if (path === '/announcements') return json(route, { announcements: [] });
    return json(route, {});
  });
  await page.goto('/app/tickets/new');
  const shared = page.locator('select[data-own-arrow]').first();
  await expect(shared).toBeVisible();
  expect(await shared.evaluate((node) => getComputedStyle(node).backgroundImage)).toBe('none');
  const plain = await page.evaluate(() => {
    const select = document.createElement('select');
    document.body.appendChild(select);
    const image = getComputedStyle(select).backgroundImage;
    select.remove();
    return image;
  });
  expect(plain).toContain('data:image/svg+xml');
});
