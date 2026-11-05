import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Conn', lastName: 'Owner', name: 'Conn Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const INSTANCE = { id: 'i1', name: 'Survival', status: 'online', access: 'owner', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-05T10:00:00.000Z', stale: false }, product: { slug: 'minecraft-paper', name: 'Paper', icon: 'box' }, ram: 2048, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: null, createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false };
const PROFILE = { id: 'minecraft-java', label: 'Minecraft Java Edition', supportedClients: 'Java Edition. The server list and Direct Connect both read the SRV record.', limitations: ['Bedrock Edition does not read SRV records. Players on Bedrock use the address and the port.'], experimental: true };
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function stub(page: Page, connect: unknown, posts: string[] = []) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (req.method() !== 'GET') posts.push(`${req.method()} ${path}`);
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/instances/i1') return json(route, { instance: INSTANCE });
    if (path === '/instances/i1/connect') return json(route, connect);
    if (path === '/catalog/products') return json(route, { products: [] });
    if (path === '/catalog/families') return json(route, { families: [] });
    if (path === '/announcements') return json(route, { announcements: [] });
    return json(route, {});
  });
}

test.describe('the clean address of a game server', () => {
  test('shows the address once the DNS answers, keeps the address and the port, and does not call DNS a join', async ({ page }) => {
    await stub(page, { enabled: true, supported: true, profile: PROFILE, state: 'DNS_VERIFIED', address: 'survival-ab12.play.blipmade.com', fallback: '203.0.113.87:30123', note: null });
    await page.goto('/app/instances/i1');
    await expect(page.getByTestId('connect-address')).toHaveText('survival-ab12.play.blipmade.com');
    await expect(page.getByText('DNS ready')).toBeVisible();
    await expect(page.getByText(/not the same as a player joining/)).toBeVisible();
    await expect(page.getByText('Experimental: no player was seen joining with this name yet.')).toBeVisible();
    await page.getByText('Address and port, and what reads the name').click();
    await expect(page.getByTestId('connect-fallback')).toHaveText('203.0.113.87:30123');
    await expect(page.getByText(/Bedrock Edition does not read SRV records/)).toBeVisible();
  });

  test('while the DNS is not ready it offers the address and the port, and checks again on request', async ({ page }) => {
    const posts: string[] = [];
    await stub(page, { enabled: true, supported: true, profile: PROFILE, state: 'PENDING_DNS', address: null, fallback: '203.0.113.87:30123', note: null }, posts);
    await page.goto('/app/instances/i1');
    await expect(page.getByTestId('connect-address')).toHaveCount(0);
    await expect(page.getByText('Waiting for DNS')).toBeVisible();
    await page.getByText('Address and port, and what reads the name').click();
    await expect(page.getByTestId('connect-fallback')).toHaveText('203.0.113.87:30123');
    await page.getByRole('button', { name: 'Check the DNS again' }).click();
    await expect.poll(() => posts).toContain('POST /instances/i1/connect/sync');
  });

  test('shows nothing where the feature is off or the game has no clean address', async ({ page }) => {
    await stub(page, { enabled: false, supported: true, profile: PROFILE, state: 'PENDING_DNS', address: null, fallback: null, note: null });
    await page.goto('/app/instances/i1');
    await expect(page.getByRole('heading', { name: 'Overview' }).or(page.getByText('Survival').first())).toBeVisible();
    await expect(page.getByText('The address to give your players')).toHaveCount(0);
    await page.unroute('**/api/**');
    await stub(page, { enabled: true, supported: false, profile: null, state: 'UNSUPPORTED', address: null, fallback: null, note: 'This game uses the address and the port.' });
    await page.goto('/app/instances/i1');
    await expect(page.getByText('The address to give your players')).toHaveCount(0);
  });
});
