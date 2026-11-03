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

test('security, sessions and keys are tabs of their own; each stacks its panels without holes and divides its rows', async ({ page }) => {
  await stub(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const box = (title: string) =>
    page.locator('h2', { hasText: title }).first().evaluate((node) => {
      let el: HTMLElement | null = node as HTMLElement;
      while (el && !(getComputedStyle(el).borderTopWidth !== '0px' && el.tagName !== 'H2' && el.getBoundingClientRect().height > 60)) el = el.parentElement;
      const r = (el ?? (node as HTMLElement)).getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
  await page.goto('/app/settings?tab=security');
  await expect(page.getByRole('link', { name: 'Turn off' })).toBeVisible();
  const [password, twoFactor, passkeys] = [await box('Password'), await box('Two-factor authentication'), await box('Passkeys')];
  expect(Math.abs(password.top - passkeys.top)).toBeLessThan(3);
  expect(passkeys.left).toBeGreaterThan(password.left + 200);
  expect(twoFactor.top - password.bottom).toBeGreaterThanOrEqual(12);
  expect(twoFactor.top - password.bottom).toBeLessThanOrEqual(20);
  await expect(page.locator('h2', { hasText: 'Sessions' })).toHaveCount(0);

  await page.goto('/app/settings?tab=sessions');
  await expect(page.locator('h2', { hasText: 'Sessions' }).first()).toBeVisible();
  const [sessions, activity] = [await box('Sessions'), await box('Security activity')];
  expect(Math.abs(sessions.top - activity.top)).toBeLessThan(3);
  const sessionRows = page.locator('li').filter({ has: page.getByRole('button', { name: /Sign out|Close session/ }) });
  await expect(sessionRows).toHaveCount(3);
  expect(await sessionRows.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).borderTopWidth))).toEqual(['0px', '1px', '1px']);
  expect(new Set(await sessionRows.evaluateAll((nodes) => nodes.map((node) => Math.round(node.querySelector('button')!.getBoundingClientRect().width)))).size).toBe(1);
  await expect(page.getByRole('button', { name: 'Close session' }).first()).toHaveAttribute('data-tip', /End this session/);
  expect(await page.locator('li').filter({ hasText: 'Two-factor authentication was turned on' }).evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).borderTopWidth))).toEqual(['1px']);

  await page.goto('/app/settings?tab=keys');
  await expect(page.locator('h2', { hasText: 'API keys' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'New key' })).toHaveAttribute('href', '/app/settings/api-keys/new');
});

test('the security tab fits at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto('/app/settings?tab=sessions');
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
