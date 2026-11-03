import type { Page, Route } from '@playwright/test';

export const ADMIN = { id: 'admin-1', email: 'admin@example.test', firstName: 'Ada', lastName: 'Admin', name: 'Ada Admin', role: 'ADMIN', emailVerified: true, permissions: [] };
export async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); }

/** Stubs the API for an administrator. `handler` answers the calls of the page under test; it returns undefined to fall through. */
export async function stubAdmin(page: Page, handler?: (path: string, method: string, body: unknown, route: Route) => unknown | Promise<unknown>) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: ADMIN });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    let body: unknown;
    try { body = req.postDataJSON(); } catch { body = undefined; }
    const answer = await handler?.(path, req.method(), body, route);
    if (answer !== undefined) return json(route, answer);
    return json(route, {});
  });
}
