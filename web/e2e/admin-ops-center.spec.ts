import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

test.describe('operations center evidence', () => {
  test('missing receipts are not healthy and panel probe failure is not an empty success', async ({ page }) => {
    await stubAdmin(page, (path) => {
      if (path === '/ops/health') {
        return {
          overall: 'unknown',
          checkedAt: '2026-11-06T08:00:00.000Z',
          summary: { total: 12, ok: 9, warning: 0, critical: 0, unknown: 3 },
          checks: [
            { id: 'backup', title: 'Backup', state: 'unknown', summary: 'No backup receipt. A missing receipt is not a successful backup.', detail: '', checkedAt: '2026-11-06T08:00:00.000Z', durationMs: 1, since: null, alerts: 0 },
          ],
        };
      }
      if (path === '/ops/alerts') return { alerts: [], states: [] };
      if (path === '/ops/channels') return { channels: [] };
      if (path === '/admin/backups/health') {
        return {
          offsite: 'stale',
          destination: { reachable: false, totalBytes: null, usedBytes: null, fileCount: 0, error: 'Last probe is 20 hours old.', at: '2026-11-05T12:00:00.000Z', inventory: 'Local database has 2 verified row(s) but the destination listing is empty.', encrypted: true },
          coverage: [{ id: 'postgres', name: 'Blipmade PostgreSQL', host: 'vm103', method: 'pg_dump', frequency: 'daily', lastLocalAt: null, lastOffsiteAt: null, lastVerifiedAt: null, lastRestoreAt: null, state: 'not_protected', reason: 'No off-site receipt matches this workload. A missing receipt is not a successful backup.' }],
          kinds: [],
          lastVerifiedAt: null,
          lastRestoreAt: null,
          gaps: [],
          vpsGaps: [],
          offsiteFailures: [],
          nodesError: 'panel refused the key',
          nodes: [],
          failures: [],
          payments: { mode: 'live', paymentsEnabled: false, checkoutAvailable: false },
        };
      }
      return undefined;
    });
    await page.goto('/admin/ops');
    await expect(page.getByText('Missing evidence is not healthy')).toBeVisible();
    await expect(page.getByText('Not protected')).toBeVisible();
    await expect(page.getByText('Panel node probe failed')).toBeVisible();
    await expect(page.getByText('panel refused the key')).toBeVisible();
  });

  test('errors page does not invent GlitchTip issues when the API is unavailable', async ({ page }) => {
    await stubAdmin(page, (path) => {
      if (path === '/admin/ops/errors') {
        return {
          glitchtip: {
            origin: 'https://errors.blipmade.com',
            dsnConfigured: true,
            dsnHost: 'errors.blipmade.com',
            environment: 'production',
            apiTokenConfigured: false,
            reachable: null,
            limitation: 'No GLITCHTIP_AUTH_TOKEN.',
            issues: [],
            openCount: null,
          },
          sdk: { api: true, worker: true, browser: 'unknown_until_build', environment: 'production', release: null, host: 'errors.blipmade.com' },
        };
      }
      return undefined;
    });
    await page.goto('/admin/ops/errors');
    await expect(page.getByRole('heading', { name: 'Application errors (GlitchTip)' })).toBeVisible();
    await expect(page.getByText('No GLITCHTIP_AUTH_TOKEN')).toBeVisible();
    await expect(page.getByText('A configured DSN is not proof')).toBeVisible();
  });
});
