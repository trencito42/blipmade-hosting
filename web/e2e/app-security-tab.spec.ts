import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Sec', lastName: 'Owner', name: 'Sec Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };
const SESSIONS = [
  { id: 's1', device: 'Safari on iOS', ip: '203.0.113.1', current: true, createdAt: '2026-11-03T05:24:00.000Z', lastSeenAt: '2026-11-03T05:30:00.000Z' },
  { id: 's2', device: 'Chrome on Windows', ip: '203.0.113.2', current: false, createdAt: '2026-10-31T05:52:00.000Z', lastSeenAt: '2026-11-03T05:00:00.000Z' },
  { id: 's3', device: 'Safari on macOS', ip: '203.0.113.3', current: false, createdAt: '2026-10-31T01:24:00.000Z', lastSeenAt: '2026-11-02T10:00:00.000Z' },
];
const ACTIVITY = [1, 2, 3, 4].map((n) => ({ id: `a${n}`, text: ['Signed in', 'Signed out', 'Two-factor authentication was turned on', 'A session was closed'][n - 1], detail: 'Safari on iOS', ip: '203.0.113.1', byStaff: false, createdAt: `2026-11-0${n}T10:00:00.000Z` }));

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
    if (path === '/settings') return json(route, { profile: { firstName: 'Sec', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: SESSIONS, account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    if (path === '/settings/security') return json(route, { twoFactor: { enabled: true, enabledAt: '2026-10-01T00:00:00.000Z', backupCodesLeft: 6 }, passkeys: [{ id: 'p1', name: 'My laptop', createdAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null, deviceType: 'singleDevice', backedUp: false }] });
    if (path === '/settings/security/activity') return json(route, { activity: ACTIVITY, pagination: { hasMore: true, nextCursor: 'c1' } });
    if (path === '/settings/api-keys') return json(route, { keys: [] });
    return json(route, {});
  });
}

test('the security tab stacks its panels in two columns without holes and divides the rows', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app/settings?tab=security');
  const panels = page.locator('main section, main [data-panel]').filter({ has: page.getByRole('heading', { level: 2 }) });
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  const titles = ['Password', 'Two-factor authentication', 'Passkeys', 'API keys', 'Sessions', 'Security activity'];
  const boxes: Record<string, { left: number; top: number; bottom: number }> = {};
  for (const title of titles) {
    const box = await page.getByRole('heading', { name: title, exact: true }).first().evaluate((node) => {
      let el: HTMLElement | null = node as HTMLElement;
      while (el && !(getComputedStyle(el).borderTopWidth !== '0px' && el.tagName !== 'H2' && el.getBoundingClientRect().height > 80)) el = el.parentElement;
      const r = (el ?? (node as HTMLElement)).getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    boxes[title] = box;
  }
  void panels;
  // Two columns: the password panel and the sessions panel start at the same height, one left of the other.
  expect(Math.abs(boxes['Password'].top - boxes['Sessions'].top)).toBeLessThan(3);
  expect(boxes['Sessions'].left).toBeGreaterThan(boxes['Password'].left + 200);
  // Each column stacks with the same gap: no hole beside a tall panel.
  const gap = (upper: string, lower: string) => boxes[lower].top - boxes[upper].bottom;
  for (const [upper, lower] of [['Password', 'Two-factor authentication'], ['Two-factor authentication', 'Passkeys'], ['Passkeys', 'API keys'], ['Sessions', 'Security activity']]) {
    expect(gap(upper, lower), `${upper} to ${lower}`).toBeGreaterThanOrEqual(12);
    expect(gap(upper, lower), `${upper} to ${lower}`).toBeLessThanOrEqual(20);
  }
  // The session rows are divided and their buttons have one width.
  const sessionRows = page.locator('li').filter({ has: page.getByRole('button', { name: /Sign out|Close session/ }) });
  await expect(sessionRows).toHaveCount(3);
  const tops = await sessionRows.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).borderTopWidth));
  expect(tops).toEqual(['0px', '1px', '1px']);
  const widths = await sessionRows.evaluateAll((nodes) => nodes.map((node) => Math.round(node.querySelector('button')!.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  await expect(page.getByRole('button', { name: 'Close session' }).first()).toHaveAttribute('title', /End this session/);
  await page.screenshot({ path: '/tmp/claude-0/-root/aae46db4-fcaf-4b45-85b9-bd3609e50f02/scratchpad/security-tab.png' });
  const activityTops = await page.locator('li').filter({ hasText: 'Two-factor authentication was turned on' }).evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).borderTopWidth));
  expect(activityTops).toEqual(['1px']);
});

test('the security tab fits at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app/settings?tab=security');
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
