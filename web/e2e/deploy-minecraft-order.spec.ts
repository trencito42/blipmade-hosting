import { expect, test, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Own', lastName: 'Er', name: 'Own Er', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const PRODUCT = { slug: 'minecraft-paper', name: 'Minecraft Paper', category: 'GAMES', description: 'Paper', icon: 'box', options: [], price: { currency: 'EUR', period: 'MONTHLY', baseAmount: 500, ramPerGb: 100, cpuPerUnit: 100, diskPerGb: 10 }, minRam: 512, maxRam: 16384, minCpu: 1, maxCpu: 4, minDisk: 5, maxDisk: 100, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, deployable: true, visible: true, availability: { orderable: true, state: 'DEPLOYABLE', blockers: [] } };

// The wizard hands the Minecraft version to the checkout in the address. The checkout must not turn it into a product
// variable: the API refuses a variable the product does not declare ("does not ask for a variable named MINECRAFT_VERSION").
test('a version chosen in the wizard reaches the order as the install version, never as a variable', async ({ page }) => {
  const orders: { items: { variables?: Record<string, string>; catalog?: { install?: { gameVersion?: string } } }[] }[] = [];
  await page.route('**/api/**', async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/catalog/products/minecraft-paper') return json(route, { product: PRODUCT });
    if (path === '/catalog/quote') return json(route, { currency: 'EUR', period: 'MONTHLY', subtotal: 1000, discount: 0, total: 1000, items: [{ productSlug: 'minecraft-paper', name: 'Minecraft Paper', fulfilment: 'SERVER', quantity: 1, unitAmount: 1000, total: 1000, ram: 4096, cpu: 1, disk: 30 }], lines: [], tax: { rate: 0, amount: 0, applies: false, note: null, total: 1000 } });
    if (path === '/orders' && req.method() === 'POST') { orders.push(req.postDataJSON()); return json(route, { order: { id: 'o1', number: 'BM-1', status: 'PENDING', total: 1000, currency: 'EUR', createdAt: '2026-11-05T10:00:00.000Z' } }); }
    if (path === '/orders/o1/checkout') return json(route, { url: null, message: 'Payment is not set up here.' });
    if (path === '/mail/plans') return json(route, { plans: [] });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/catalog/products') return json(route, { products: [PRODUCT] });
    return json(route, {});
  });
  await page.goto('/app/deploy/minecraft-paper?ram=4096&cpu=1&disk=30&family=minecraft&variant=paper&preset=survival&presetVersion=1&mcVersion=26.3&step=3');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Pay and deploy/ }).click();
  await expect.poll(() => orders.length).toBe(1);
  const line = orders[0]!.items[0]!;
  expect(line.variables ?? {}).not.toHaveProperty('MINECRAFT_VERSION');
  expect(line.variables ?? {}).not.toHaveProperty('MC_VERSION');
  expect(line.catalog?.install?.gameVersion).toBe('26.3');
});
