import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const FAMILY = {
  slug: 'minecraft',
  name: 'Minecraft',
  summary: 'One family for the Minecraft runtimes.',
  group: 'games',
  variants: [{ slug: 'paper', label: 'Paper', product: { slug: 'minecraft-paper', name: 'Paper', defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, orderable: true, availability: 'DEPLOYABLE' } }],
  presets: [{ slug: 'survival', name: 'Survival', variantSlug: 'paper', version: 1, summary: 'A quiet world.', recommendedRamMb: 4096, recommendedCpu: 2, recommendedDiskGb: 20 }],
  addons: [],
};

test('a prepared family continues into the existing product checkout', async ({ page }) => {
  await stubAdmin(page, (path) => {
    if (path === '/catalog/families/minecraft') return { family: FAMILY };
    if (path === '/catalog/minecraft/versions') return { supported: true, versions: ['1.21.1', '1.20.4'] };
    if (path === '/catalog/products/minecraft-paper') return { product: { slug: 'minecraft-paper', name: 'Paper', category: 'GAMES', description: 'Paper', icon: 'box', options: [], price: { currency: 'EUR', period: 'MONTHLY', baseAmount: 500, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 }, minRam: 512, maxRam: 8192, minCpu: 1, maxCpu: 4, minDisk: 5, maxDisk: 50, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, deployable: true, visible: true, availability: { orderable: true, state: 'DEPLOYABLE', blockers: [] } } };
    return undefined;
  });
  await page.goto('/app/deploy/families/minecraft');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Survival/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Review checkout' }).click();
  await expect(page).toHaveURL(/\/app\/deploy\/minecraft-paper\?/);
  await expect(page).toHaveURL(/family=minecraft/);
  await expect(page).toHaveURL(/variant=paper/);
  await expect(page).toHaveURL(/preset=survival/);
});
