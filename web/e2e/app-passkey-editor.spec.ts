import { expect, test, type Page, type Route } from '@playwright/test';

const USER = { id: 'owner', email: 'owner@example.test', firstName: 'Key', lastName: 'Owner', name: 'Key Owner', role: 'CUSTOMER', emailVerified: true, permissions: [] };

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stub(page: Page, saved: unknown[]) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/session') return json(route, { user: USER });
    if (path === '/announcements') return json(route, { announcements: [] });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications/stream') return route.abort();
    if (path === '/support/availability') return json(route, { available: false });
    if (path === '/support/chat/current' || path === '/support/bot/current') return json(route, { conversation: null });
    if (path === '/settings/passkeys/options') {
      return json(route, { options: { challenge: 'AAAAAAAAAAAAAAAAAAAAAA', rp: { name: 'Blipmade', id: 'localhost' }, user: { id: 'dXNlcjE', name: 'owner@example.test', displayName: 'Key Owner' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 60000, attestation: 'none' } });
    }
    if (path === '/settings/passkeys' && req.method() === 'POST') { saved.push(req.postDataJSON()); return json(route, { passkey: { id: 'p1', name: 'My laptop' } }); }
    if (path === '/settings/security') return json(route, { twoFactor: { enabled: false, enabledAt: null, backupCodesLeft: 0 }, passkeys: [{ id: 'p1', name: 'My laptop', createdAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null, deviceType: 'singleDevice', backedUp: false }] });
    if (path === '/settings') return json(route, { profile: { firstName: 'Key', lastName: 'Owner', email: 'owner@example.test', emailVerified: true, role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' }, billingAddress: null, pendingEmail: null, pendingEmailExpiresAt: null, sessions: [], account: { deletionRequestedAt: null, services: 0, subscriptions: 0 } });
    if (path === '/settings/api-keys') return json(route, { keys: [] });
    return json(route, {});
  });
}

// The device is replaced by a function that answers like an authenticator: the ceremony of the browser needs a person.
const FAKE_DEVICE = `
  const bytes = (...values) => new Uint8Array(values).buffer;
  navigator.credentials.create = async () => ({
    id: 'AQID', rawId: bytes(1, 2, 3), type: 'public-key', authenticatorAttachment: 'platform',
    response: { attestationObject: bytes(4), clientDataJSON: bytes(5), getTransports: () => ['internal'] },
    getClientExtensionResults: () => ({}),
  });
`;

test.describe('dedicated passkey page', () => {
  test('adds a passkey after the device answers, with the name as typed', async ({ page }) => {
    const saved: unknown[] = [];
    await page.addInitScript(FAKE_DEVICE);
    await stub(page, saved);
    await page.goto('/app/settings/security/passkeys/new');
    await expect(page.locator('h1:visible')).toHaveText('Add a passkey');
    await page.getByLabel('Name of the new passkey (optional)').fill('My laptop');
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await page.waitForURL('**/app/settings?tab=security');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'My laptop', response: { id: 'AQID', type: 'public-key' } });
  });

  test('says in words that the prompt was closed and adds nothing', async ({ page }) => {
    const saved: unknown[] = [];
    await page.addInitScript(`navigator.credentials.create = async () => { const e = new Error('closed'); e.name = 'NotAllowedError'; throw e; };`);
    await stub(page, saved);
    await page.goto('/app/settings/security/passkeys/new');
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await expect(page.getByText('The passkey prompt was closed or timed out.')).toBeVisible();
    expect(saved).toHaveLength(0);
    await expect(page).toHaveURL(/passkeys\/new$/);
  });

  test('guards a draft name, links from the list and fits at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stub(page, []);
    await page.goto('/app/settings/security/passkeys/new');
    await page.getByLabel('Name of the new passkey (optional)').fill('draft');
    page.once('dialog', async (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Back to security' }).click();
    await expect(page).toHaveURL(/passkeys\/new$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.goto('/app/settings?tab=security');
    await expect(page.getByRole('link', { name: 'Add passkey' })).toHaveAttribute('href', '/app/settings/security/passkeys/new');
  });
});
