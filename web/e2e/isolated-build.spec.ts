import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const OFFERING = {
  slug: 'nodejs', name: 'Node.js', summary: 'Node runtime', category: 'DEVELOPER_TOOLS', group: 'apps', icon: 'code',
  kind: 'product', discovery: 'GROUPED', sortOrder: 1, startingPrice: { amount: 500, currency: 'EUR', period: 'MONTHLY' },
  orderable: true, availability: 'DEPLOYABLE', presets: [], addons: [], defaultVariantSlug: 'nodejs', searchTags: [],
  variants: [{
    slug: 'nodejs', label: 'Node.js', productSlug: 'nodejs', name: 'Node.js', description: 'Node runtime', icon: 'code',
    category: 'DEVELOPER_TOOLS', fulfilment: 'CONTAINER', minRam: 512, maxRam: 8192, minCpu: 1, maxCpu: 4,
    minDisk: 5, maxDisk: 50, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, orderable: true,
    availability: 'DEPLOYABLE', price: { amount: 500, currency: 'EUR', period: 'MONTHLY' }, yearlyPrice: null, customerVariables: {},
  }],
};

test('customer runs a safe build and sees the verified artifact and log', async ({ page }) => {
  let jobs: unknown[] = [];
  await stubAdmin(page, (path, method) => {
    if (path === '/catalog/offerings/nodejs') return { offering: OFFERING };
    if (path === '/catalog/import/plans/import-1') return { plan: { companions: [] } };
    if (path === '/catalog/import/import-1/builds') return { jobs, executes: false };
    if (path === '/catalog/import/import-1/build' && method === 'POST') {
      const job = {
        id: 'build-1', status: 'succeeded', runtime: 'node', log: 'npm run build\nbuild complete', lastError: null,
        artifactSha256: 'a'.repeat(64), artifactBytesLength: 2048, attempts: 1,
        createdAt: '2026-11-07T12:00:00.000Z', finishedAt: '2026-11-07T12:00:02.000Z',
      };
      jobs = [job];
      return { job: { ...job, status: 'queued' }, plan: { status: 'queued' } };
    }
    if (path === '/mail/plans') return { plans: [] };
    if (path === '/catalog/quote') return { total: 500, subtotal: 500, discount: 0, currency: 'EUR', items: [], period: 'MONTHLY', tax: { amount: 0 } };
    return undefined;
  });

  await page.goto('/app/deploy/nodejs?import=import-1');
  await expect(page.getByRole('heading', { name: 'Safe build preflight' })).toBeVisible();
  await expect(page.getByText('Not run yet')).toBeVisible();
  await page.getByRole('button', { name: 'Run safe build' }).click();
  await expect(page.getByText('Build verified')).toBeVisible();
  await expect(page.getByText('build complete')).toBeVisible();
  await expect(page.getByText(/SHA-256 a{64}/)).toBeVisible();
});
