import { expect, test, type Page, type Route } from '@playwright/test';
import { ADMIN, json, stubAdmin } from './admin-stub';

/**
 * The context menu of the platform: one component, one hook, the same entries for the right click, the Menu key,
 * Shift+F10 and the three dots of a phone.
 */

const order = (n: number, status: string, total = 900) => ({
  id: `o${n}`, number: `ORD-${n}`, status, total, discount: 0, currency: 'EUR', createdAt: `2026-11-0${n}T10:00:00.000Z`,
  customer: { id: `c${n}`, email: `person${n}@example.test`, name: `Person ${n}` },
  items: [{ id: `it${n}`, name: 'WordPress', quantity: 1, total }],
});
const ORDERS = [order(1, 'paid'), order(2, 'pending'), order(3, 'failed')];

const customer = (n: number) => ({ id: `c${n}`, email: `person${n}@example.test`, name: `Person ${n}`, role: 'CUSTOMER', tags: [], createdAt: '2026-10-01T00:00:00.000Z', verified: true, suspended: false, instanceCount: 1, orderCount: 2, ticketCount: 0, monthlyValue: 900 });

const ticket = (n: number, assignedToId: string | null = null) => ({
  id: `t${n}`, number: 100 + n, subject: ['Cannot log in', 'Invoice question', 'Server slow'][n - 1], category: 'technical', priority: 'normal',
  status: n === 3 ? 'CLOSED' : 'OPEN', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z', messageCount: 2,
  customer: { id: `c${n}`, email: `person${n}@example.test`, name: `Person ${n}` }, instance: n === 1 ? { id: 'i1', name: 'Shop' } : null,
  assignedTo: assignedToId ? 'Ada Admin' : null, assignedToId,
});

const adminOrders = (page: Page, posts: string[] = []) =>
  stubAdmin(page, (path, method) => {
    if (method !== 'GET') posts.push(`${method} ${path}`);
    if (path === '/admin/orders') return { orders: ORDERS, total: 3, pagination: { hasMore: false, nextCursor: null } };
    if (path === '/admin/customers') return { customers: [1, 2].map(customer), total: 2, pagination: { hasMore: false, nextCursor: null } };
    if (path === '/admin/tags') return { tags: [] };
    if (path === '/admin/saved-views') return { views: [] };
    return undefined;
  });

const menu = (page: Page) => page.getByRole('menu');
const item = (page: Page, name: string | RegExp) => menu(page).getByRole('menuitem', typeof name === 'string' ? { name, exact: true } : { name });

test.describe('admin orders', () => {
  test('the menu belongs to the row that was right-clicked, and a left click or a link still works', async ({ page }) => {
    await adminOrders(page);
    await page.goto('/admin/orders');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);

    await rows.nth(1).click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    // A pending order has no money to give back and nothing to retry.
    await expect(item(page, /Refund/)).toHaveCount(0);
    await expect(item(page, 'Open order')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);

    // Another row, another menu: the paid order can be refunded, only through its editor.
    await rows.nth(0).click({ button: 'right' });
    await expect(item(page, 'Refund part…')).toBeVisible();
    await expect(item(page, 'Refund in full…')).toBeVisible();
    await expect(item(page, 'Retry delivery')).toBeVisible();
    await item(page, 'Open order').click();
    await expect(page).toHaveURL(/\/admin\/orders\/o1$/);

    await page.goBack();
    await rows.nth(2).getByRole('link', { name: 'ORD-3' }).click();
    await expect(page).toHaveURL(/\/admin\/orders\/o3$/);
  });

  test('a refund is never executed from the menu: it opens the editor, and nothing is sent', async ({ page }) => {
    const posts: string[] = [];
    await adminOrders(page, posts);
    await page.goto('/admin/orders');
    await page.locator('tbody tr').first().click({ button: 'right' });
    await item(page, 'Refund in full…').click();
    await expect(page).toHaveURL(/\/admin\/orders\/o1\/refund$/);
    expect(posts).toEqual([]);
  });

  test('the keyboard: Shift+F10 opens it, the arrows walk it, Escape closes it and the focus goes back', async ({ page }) => {
    await adminOrders(page);
    await page.goto('/admin/orders');
    const link = page.locator('tbody tr').nth(0).getByRole('link', { name: 'ORD-1' });
    await link.focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    await expect(item(page, 'Open order')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu(page).getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu(page).getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu(page).getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(link).toBeFocused();

    await link.focus();
    await page.keyboard.press('ContextMenu');
    await expect(menu(page)).toBeVisible();
  });

  test('it closes on an outside click, on a scroll and on a resize, and it stays inside the window', async ({ page }) => {
    await adminOrders(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/admin/orders');
    const row = page.locator('tbody tr').first();
    const box = (await row.boundingBox())!;

    // At the far right edge of the row, so the menu has to flip back inside the window.
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4, { button: 'right' });
    await expect(menu(page)).toBeVisible();
    const inside = await menu(page).evaluate((node) => {
      const r = node.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
    });
    expect(inside).toBe(true);
    await page.mouse.click(5, 5);
    await expect(menu(page)).toHaveCount(0);

    await row.click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect(menu(page)).toHaveCount(0);

    await row.click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await page.setViewportSize({ width: 1100, height: 720 });
    await expect(menu(page)).toHaveCount(0);
  });

  test('the browser keeps its own menu on a text field, and a second menu replaces the first', async ({ page }) => {
    await adminOrders(page);
    await page.goto('/admin/orders');
    await expect(page.locator('tbody tr')).toHaveCount(3);
    const prevented = await page.evaluate(() => {
      const field = document.querySelector('input[type="search"]')!;
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      field.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(menu(page)).toHaveCount(0);

    await page.locator('tbody tr').nth(0).click({ button: 'right', position: { x: 6, y: 6 } });
    await expect(menu(page)).toHaveCount(1);
    // The second right click comes from a row that the first menu covers, so it is sent as the event the browser would send.
    await page.locator('tbody tr').nth(1).dispatchEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 900, clientY: 300 });
    await expect(menu(page)).toHaveCount(1);
    await expect(item(page, 'Retry delivery')).toHaveCount(0);
    await expect(menu(page)).toHaveCount(1);
  });

  test('on a phone the same entries are behind the three dots, and the card has no permanent buttons crowding it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminOrders(page);
    await page.goto('/admin/orders');
    const dots = page.getByRole('button', { name: 'Actions for order ORD-1' });
    await expect(dots).toBeVisible();
    await dots.click();
    await expect(menu(page)).toBeVisible();
    await expect(item(page, 'Copy order number')).toBeVisible();
    await expect(item(page, 'Refund in full…')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(dots).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('a role without orders.write gets no refund and no retry', async ({ page }) => {
    await page.route('**/api/**', async (route: Route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      if (path === '/auth/session') return json(route, { user: { ...ADMIN, role: 'STAFF', permissions: ['orders.read'] } });
      if (path === '/admin/orders') return json(route, { orders: ORDERS, total: 3, pagination: { hasMore: false, nextCursor: null } });
      if (path === '/admin/saved-views') return json(route, { views: [] });
      if (path === '/notifications/stream') return route.abort();
      return json(route, {});
    });
    await page.goto('/admin/orders');
    await page.locator('tbody tr').first().click({ button: 'right' });
    await expect(item(page, 'Open order')).toBeVisible();
    await expect(item(page, /Refund|Retry/)).toHaveCount(0);
    // And no way to a customer page the role cannot read.
    await expect(item(page, 'Open customer')).toHaveCount(0);
  });
});

test.describe('admin customers', () => {
  test('the e-mail is copied only after it was revealed, and the editors open through their own pages', async ({ page }) => {
    await adminOrders(page);
    await page.goto('/admin/customers');
    const row = page.locator('tbody tr').first();
    await row.click({ button: 'right' });
    await expect(item(page, 'Copy e-mail')).toHaveCount(0);
    await expect(item(page, 'Copy customer ID')).toBeVisible();
    await expect(item(page, 'Edit profile')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Show e-mails/ }).click();
    await row.click({ button: 'right' });
    await expect(item(page, 'Copy e-mail')).toBeVisible();
    await item(page, 'Add internal note').click();
    await expect(page).toHaveURL(/\/admin\/customers\/c1\/notes\/new$/);
  });
});

test.describe('admin ticket inbox', () => {
  test('claiming sends one assignment for the exact ticket, once, and the list is read again', async ({ page }) => {
    const assigns: { path: string; body: unknown }[] = [];
    let lists = 0;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/tickets' && method === 'GET') { lists += 1; return { tickets: [ticket(1), ticket(2), ticket(3)], total: 3, pagination: { limit: 25, nextCursor: null, hasMore: false } }; }
      if (path.startsWith('/admin/tickets/') && path.endsWith('/assign')) { assigns.push({ path, body }); return { ticket: { id: 't2', assignedToId: ADMIN.id } }; }
      return undefined;
    });
    await page.goto('/admin/tickets');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    const before = lists;

    await rows.nth(1).click({ button: 'right' });
    await expect(item(page, 'Open conversation')).toBeVisible();
    await expect(item(page, 'Copy ticket number')).toBeVisible();
    await expect(item(page, 'Open linked service')).toHaveCount(0);
    await item(page, 'Claim ticket').click();
    await expect.poll(() => assigns.length).toBe(1);
    expect(assigns[0]).toEqual({ path: '/admin/tickets/t2/assign', body: { userId: ADMIN.id } });
    await expect.poll(() => lists).toBeGreaterThan(before);
    expect(assigns).toHaveLength(1);
  });

  test('a closed ticket offers Reopen, an open one Resolve, and the linked service is a link', async ({ page }) => {
    await stubAdmin(page, (path, method) => {
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/tickets' && method === 'GET') return { tickets: [ticket(1), ticket(2), ticket(3)], total: 3, pagination: { limit: 25, nextCursor: null, hasMore: false } };
      return undefined;
    });
    await page.goto('/admin/tickets');
    const rows = page.locator('tbody tr');
    await rows.nth(2).click({ button: 'right' });
    await expect(item(page, 'Reopen')).toBeVisible();
    await expect(item(page, /Resolve/)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await rows.nth(0).click({ button: 'right' });
    await expect(item(page, 'Resolve and close')).toBeVisible();
    await item(page, /Open service Shop/).click();
    await expect(page).toHaveURL(/\/admin\/services\/i1$/);
  });

  test('the row keys of the inbox still walk the queue with the arrows', async ({ page }) => {
    await stubAdmin(page, (path, method) => {
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/tickets' && method === 'GET') return { tickets: [ticket(1), ticket(2), ticket(3)], total: 3, pagination: { limit: 25, nextCursor: null, hasMore: false } };
      return undefined;
    });
    await page.goto('/admin/tickets');
    const links = page.locator('[data-ticket-row]');
    await links.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(links.nth(1)).toBeFocused();
  });
});

test.describe('admin services and servers', () => {
  test('a service menu follows its state: retry is only for a service that needs it', async ({ page }) => {
    const service = (n: number, status: string) => ({ id: `s${n}`, name: `shop-${n}`, status, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', createdAt: '2026-10-01T00:00:00.000Z', pterodactylServerId: n, customer: { id: `c${n}`, email: `person${n}@example.test` }, product: { name: 'WordPress', slug: 'wordpress' } });
    await stubAdmin(page, (path) => {
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/services') return { services: [service(1, 'online'), service(2, 'failed')], total: 2 };
      return undefined;
    });
    await page.goto('/admin/services');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).click({ button: 'right' });
    await expect(item(page, /^Retry provisioning/)).toBeDisabled();
    await page.keyboard.press('Escape');
    await rows.nth(1).click({ button: 'right' });
    await expect(item(page, /^Retry provisioning/)).toBeEnabled();
    await expect(item(page, 'Copy instance ID')).toBeVisible();
  });

  test('a server menu starts a stopped machine with the endpoint of its button, and Delete asks first', async ({ page }) => {
    const posts: string[] = [];
    const vps = (n: number, power: string) => ({ id: `v${n}`, name: `vps-${n}`, status: 'active', power, plan: { slug: 'start', name: 'Start' }, ram: 2048, cpu: 1, disk: 20, publicIp: `203.0.113.${n}`, sshPort: 22, dedicatedIp: false, lastError: null, createdAt: '2026-10-01T00:00:00.000Z', owner: { id: `c${n}`, email: `person${n}@example.test` }, slot: n, vmid: 100 + n, privateIp: `10.0.0.${n}` });
    await stubAdmin(page, (path, method) => {
      if (method === 'POST') posts.push(path);
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/vps/allocations') return { report: { orphans: [], foreignInRange: [], missing: [], unledgered: [], poolUnavailable: null, quarantined: [], capacity: { used: 2, max: 50 } }, ledger: [] };
      if (path === '/admin/vps-billing-check') return { mismatches: [] };
      if (path === '/admin/vps') return { servers: [vps(1, 'stopped'), vps(2, 'running')] };
      return undefined;
    });
    await page.goto('/admin/vps');
    const cards = page.locator('ul > li').filter({ hasText: /vps-/ });
    await cards.nth(0).click({ button: 'right' });
    await expect(item(page, /^Restart/)).toBeDisabled();
    await item(page, 'Start').click();
    await expect.poll(() => posts).toContain('/admin/vps/v1/power');
    expect(posts.filter((path) => path === '/admin/vps/v1/power')).toHaveLength(1);

    await cards.nth(1).click({ button: 'right' });
    await item(page, 'Delete the machine…').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(posts.some((path) => path.endsWith('/destroy') || path === '/admin/vps/v2')).toBe(false);
  });
});

test.describe('the customer app', () => {
  const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Own', lastName: 'Er', name: 'Own Er', role: 'CUSTOMER', emailVerified: true, permissions: [] };
  const instance = (n: number, status: string, access?: string) => ({ id: `i${n}`, name: `site-${n}`, status, access, runtime: { state: status, condition: 'serving', checkedAt: '2026-11-03T00:00:00.000Z', stale: false }, product: { slug: 'wordpress', name: 'WordPress', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: `https://site${n}.apps.blipmade.com`, createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false });

  async function appStub(page: Page, calls: string[] = []) {
    await page.route('**/api/**', async (route: Route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace(/^\/api/, '');
      if (req.method() !== 'GET') calls.push(`${req.method()} ${path}`);
      if (path === '/auth/session') return json(route, { user: USER });
      if (path === '/notifications/stream') return route.abort();
      if (path === '/instances') return json(route, { instances: [instance(1, 'online'), instance(2, 'stopped'), instance(3, 'online', 'viewer')] });
      if (path === '/tickets') return json(route, { tickets: [{ id: 't1', number: 101, subject: 'Help', status: 'open', priority: 'normal', category: 'general', instanceId: 'i1', instanceName: 'site-1', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', lastReplyAt: null, assignedTo: null }] });
      if (path === '/tickets/categories') return json(route, { categories: [] });
      if (path === '/catalog/products') return json(route, { products: [] });
      if (path === '/announcements') return json(route, { announcements: [] });
      if (path === '/notifications/unread-count') return json(route, { count: 0 });
      return json(route, {});
    });
  }

  test('a service menu only offers what its state and the access role allow, and restart is sent once', async ({ page }) => {
    const calls: string[] = [];
    await appStub(page, calls);
    await page.goto('/app/instances');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);

    await rows.nth(0).click({ button: 'right' });
    await expect(item(page, /^Start/)).toBeDisabled();
    await expect(item(page, 'Open files')).toBeVisible();
    await expect(item(page, 'Open settings')).toBeVisible();
    await item(page, 'Restart').click();
    await expect.poll(() => calls).toContain('POST /instances/i1/power');
    expect(calls.filter((call) => call === 'POST /instances/i1/power')).toHaveLength(1);

    // A viewer of a shared service: no files, no backups, no power buttons.
    await rows.nth(2).click({ button: 'right' });
    await expect(item(page, 'Open console')).toBeVisible();
    await expect(item(page, /Open files|View backups|Open settings|Restart|Start/)).toHaveCount(0);
  });

  test('a left click on the row and the link of the address keep working', async ({ page }) => {
    await appStub(page);
    await page.goto('/app/instances');
    const link = page.locator('tbody tr').first().getByRole('link', { name: /site1\.apps/ });
    await expect(link).toHaveAttribute('target', '_blank');
    // The address is a link to another site: the browser keeps its own menu there.
    const prevented = await link.evaluate((node) => { const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); node.dispatchEvent(event); return event.defaultPrevented; });
    expect(prevented).toBe(false);
    await page.locator('tbody tr').first().getByText('site-1').first().click();
    await expect(page).toHaveURL(/\/app\/instances\/i1$/);
  });

  test('a ticket of the customer: close opens the confirmation, nothing is sent before it', async ({ page }) => {
    const calls: string[] = [];
    await appStub(page, calls);
    await page.goto('/app/tickets');
    await page.locator('tbody tr').first().click({ button: 'right' });
    await expect(item(page, 'Open service site-1')).toBeVisible();
    await item(page, 'Close ticket…').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Nothing that changes a ticket was sent: the dialog is what asks first.
    expect(calls.filter((call) => call.includes('/tickets'))).toEqual([]);
  });

  test('a customer never sees an admin entry', async ({ page }) => {
    await appStub(page);
    await page.goto('/app/instances');
    await page.locator('tbody tr').first().click({ button: 'right' });
    await expect(item(page, /Suspend|Refund|Impersonate|Open customer/)).toHaveCount(0);
  });
});

test.describe('the File Manager keeps the same menu', () => {
  test('right click on a file opens the menu of that file, Escape closes it', async ({ page }) => {
    const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Own', lastName: 'Er', name: 'Own Er', role: 'CUSTOMER', emailVerified: true, permissions: [] };
    const file = (name: string, directory = false) => ({ name, mode: 'rw-r--r--', size: 10, modified_at: '2026-11-01T10:00:00.000Z', created_at: '2026-11-01T10:00:00.000Z', is_file: !directory, is_directory: directory, is_symlink: false, mime_type: 'text/plain' });
    await page.route('**/api/**', async (route: Route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      if (path === '/auth/session') return json(route, { user: USER });
      if (path === '/notifications/stream') return route.abort();
      if (path === '/instances/i1') return json(route, { instance: { id: 'i1', name: 'Shop', status: 'online', runtime: { state: 'running', condition: 'serving', checkedAt: '2026-11-03T00:00:00.000Z', stale: false }, product: { slug: 'wordpress', name: 'WordPress', icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', url: 'https://shop.apps.blipmade.com', createdAt: '2026-10-01T00:00:00.000Z', node: { name: 'n1' }, hasPassword: false, access: 'owner' } });
      if (path === '/catalog/products') return json(route, { products: [] });
      if (path === '/announcements') return json(route, { announcements: [] });
      if (path === '/instances/i1/files') return json(route, { files: [file('index.php'), file('wp-content', true)], path: '/' });
      return json(route, {});
    });
    await page.goto('/app/instances/i1/files');
    const row = page.getByRole('option', { name: /index\.php/ });
    await row.click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    // The entries that show a key (Ctrl C, F2, Del) carry it in their name.
    for (const name of [/^Open/, /^Copy/, /^Rename/, /^Download/, /^Delete/]) await expect(item(page, name)).toBeVisible();
    await expect(item(page, /^Delete/)).toHaveClass(/text-bad/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
  });
});
