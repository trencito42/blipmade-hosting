import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Shell', lastName: 'Owner', name: 'Shell Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const SHOTS = '/tmp/claude-0/-root/aae46db4-fcaf-4b45-85b9-bd3609e50f02/scratchpad';

const ROUTES = [
  '/app/settings/email/change',
  '/app/settings/password',
  '/app/settings/billing-address',
  '/app/domains/new',
  '/app/tickets/new',
  '/app/instances/i1/backups/new',
  '/app/instances/i1/startup/edit',
  '/app/billing/subscriptions/s1/cancel',
  '/app/mail/domains/new',
];

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings') return json(route, { profile: { firstName: 'Shell', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    if (path === '/tickets/categories') return json(route, { categories: [] });
    if (path === '/mail/services') return json(route, { services: [] });
    if (path === '/vps') return json(route, { vps: [] });
    if (path === '/instances/i1/startup') return json(route, { image: 'node:22', images: [], variables: [], startup: '' });
    if (path === '/catalog/products') return json(route, { products: [] });
    if (path === '/platform/settings') return json(route, {});
    if (path === '/instances') return json(route, { instances: [] });
    if (path === '/domains') return json(route, { domains: [] });
    if (path === '/billing/subscriptions') return json(route, { subscriptions: [{ id: 's1', instanceId: 'i1', instanceName: 'Shop', status: 'active', amount: 900, currency: 'EUR', currentPeriodEnd: '2026-12-01T00:00:00.000Z', cancelAtPeriodEnd: false }] });
    return json(route, {});
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`editor shell at ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const route of ROUTES) {
      test(`${route}: one title, one way back, footer and actions in place`, async ({ page }) => {
        await stub(page);
        await page.goto(route);
        await expect(page.locator('h1:visible')).toHaveCount(1);
        await expect(page.locator('h1:visible')).not.toHaveText('Something went wrong');
        await expect(page.locator('main')).toHaveCount(1);
        const back = page.locator('header a', { hasText: /^\s*Back/ });
        await expect(back).toHaveCount(1);
        expect(await page.title()).toMatch(/ · Blipmade$/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        await expect(page.locator('footer')).toHaveCount(1);
        if (viewport.width < 1024) await expect(page.locator('[data-bottom-nav]')).toBeHidden();

        const layout = await page.evaluate(() => {
          const footer = document.querySelector('footer')!.getBoundingClientRect();
          const root = document.documentElement;
          return { footerBottom: footer.bottom + window.scrollY, scrollHeight: root.scrollHeight, inner: window.innerHeight };
        });
        // A short page keeps the legal links at the bottom of the screen, not under the first field.
        if (layout.scrollHeight <= layout.inner + 1) expect(layout.footerBottom).toBeGreaterThanOrEqual(layout.inner - 48);

        // No fixed layer sits over the content at the bottom except the chat button.
        const fixedBars = await page.evaluate(() =>
          Array.from(document.querySelectorAll('body *')).filter((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.position === 'fixed' && rect.width > window.innerWidth * 0.6 && rect.bottom > window.innerHeight - 4 && style.display !== 'none';
          }).length,
        );
        expect(fixedBars).toBe(0);
        if (route === '/app/settings/email/change' || route === '/app/instances/i1/startup/edit') {
          await page.screenshot({ path: `${SHOTS}/editor-${route.split('/').slice(-2).join('-')}-${viewport.width}.png` });
        }
      });
    }
  });
}
