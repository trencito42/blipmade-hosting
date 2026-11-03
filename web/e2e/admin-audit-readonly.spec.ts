/**
 * Opt-in READ-ONLY staging audit.
 * Do not use real customer/production accounts. Screenshots contain PII.
 * Requires BM_ADMIN_AUDIT=1, BM_ADMIN_AUDIT_STORAGE_STATE and BM_ADMIN_AUDIT_IDS JSON.
 * Run: npx playwright test e2e/admin-audit-readonly.spec.ts --project=desktop
 */
import { test, expect } from '@playwright/test';

const enabled = process.env.BM_ADMIN_AUDIT === '1';
const storage = process.env.BM_ADMIN_AUDIT_STORAGE_STATE;
let ids: Record<string, string> = {};
try { ids = JSON.parse(process.env.BM_ADMIN_AUDIT_IDS || '{}') as Record<string, string>; } catch { ids = {}; }

const paths = [
  '/admin', '/admin/customers', '/admin/customers/:id', '/admin/orders', '/admin/orders/:id',
  '/admin/services', '/admin/services/:id', '/admin/vps', '/admin/products', '/admin/pricing',
  '/admin/support/analytics', '/admin/support/automations', '/admin/support/bots',
  '/admin/support', '/admin/tickets', '/admin/knowledge', '/admin/tickets/:id',
  '/admin/promotions', '/admin/promotions/:id', '/admin/infrastructure', '/admin/incidents',
  '/admin/reports', '/admin/queues', '/admin/abuse', '/admin/abuse/:id', '/admin/ops',
  '/admin/mail', '/admin/mail/plans', '/admin/audit', '/admin/staff', '/admin/settings',
  '/admin/email-templates', '/admin/content', '/admin/tools', '/admin/notifications',
];
const fixtures: Record<string, string> = {
  '/admin/customers/:id': 'customer',
  '/admin/orders/:id': 'order',
  '/admin/services/:id': 'service',
  '/admin/tickets/:id': 'ticket',
  '/admin/promotions/:id': 'promotion',
  '/admin/abuse/:id': 'abuse',
};
const widths = [320, 390, 768, 1024, 1440, 1920];

test.describe('admin read-only visual audit', () => {
  test.skip(!enabled || !storage, 'Requires BM_ADMIN_AUDIT=1 with staging storage state');
  if (storage) test.use({ storageState: storage });
  test.setTimeout(90_000);

  for (const route of paths) {
    for (const width of widths) {
      test(route + ' @ ' + width + 'px', async ({ page }, testInfo) => {
        const fixture = fixtures[route];
        const id = fixture ? ids[fixture] : undefined;
        test.skip(Boolean(fixture && !id), 'Missing safe fixture ID for ' + fixture);
        const path = id ? route.replace(':id', encodeURIComponent(id)) : route;
        const errors: { path: string; status: number }[] = [];
        page.on('response', (r) => {
          if (r.url().includes('/api/') && r.status() >= 400 && errors.length < 30)
            errors.push({ path: new URL(r.url()).pathname, status: r.status() });
        });
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined);

        const dom = await page.evaluate(() => {
          const root = document.documentElement;
          const inputs = [...document.querySelectorAll('input, select, textarea')];
          const unlabeled = inputs.filter((control) => {
            const id = control.id;
            return !(control.getAttribute('aria-label') ||
                     control.closest('label') ||
                     (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')));
          });
          return {
            title: document.title,
            headings: [...document.querySelectorAll('h1, h2')].map(e => e.textContent?.trim()).filter(Boolean).slice(0, 20),
            bodyScrollHeight: document.body.scrollHeight,
            viewportHeight: innerHeight,
            fullPageScrollRatio: Number((document.body.scrollHeight / Math.max(1, innerHeight)).toFixed(1)),
            horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
            unlabeledInputs: unlabeled.length,
            buttons: document.querySelectorAll('button').length,
          };
        });
        await testInfo.attach('audit.json', {
          body: JSON.stringify({ path, width, finalUrl: page.url(), status: response?.status(), errors, ...dom }, null, 2),
          contentType: 'application/json',
        });
        await page.screenshot({ path: testInfo.outputPath('view.png'), fullPage: true, animations: 'disabled' });

        expect(response?.status() ?? 0).toBeLessThan(400);
        expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(true);
        expect(dom.horizontalOverflowPx, 'Page-wide overflow').toBeLessThanOrEqual(8);
      });
    }
  }
});
