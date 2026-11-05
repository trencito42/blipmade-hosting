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

const product = (slug: string, name: string) => ({ slug, name, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, orderable: true, availability: 'DEPLOYABLE' });
const FOUR = {
  ...FAMILY,
  variants: [
    { slug: 'paper', label: 'Paper', product: product('minecraft-paper', 'Paper') },
    { slug: 'folia', label: 'Folia', product: product('minecraft-folia', 'Folia') },
    { slug: 'forge', label: 'Forge', product: product('minecraft-forge', 'Forge') },
    { slug: 'bedrock', label: 'Bedrock', product: product('minecraft-bedrock', 'Bedrock') },
  ],
  presets: [],
};
const VERSIONS: Record<string, string[]> = {
  'minecraft-paper': ['26.1.2', '1.21.11'],
  'minecraft-folia': ['1.21.8', '1.20.6'],
  'minecraft-forge': ['1.20.1', '1.19.4'],
};

test('every Minecraft software lists its own versions and reaches checkout', async ({ page }) => {
  await stubAdmin(page, (path, _method, _body, route) => {
    if (path === '/catalog/families/minecraft') return { family: FOUR };
    if (path === '/catalog/minecraft/versions') {
      const slug = new URL(route.request().url()).searchParams.get('product') ?? '';
      return slug === 'minecraft-bedrock' ? { supported: false, versions: [] } : { supported: true, versions: VERSIONS[slug] };
    }
    return undefined;
  });
  for (const [label, slug, first] of [['Paper', 'minecraft-paper', '26.1.2'], ['Folia', 'minecraft-folia', '1.21.8'], ['Forge', 'minecraft-forge', '1.20.1']] as const) {
    await page.goto('/app/deploy/families/minecraft');
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('radio', { name: new RegExp(`^${first}`) })).toBeChecked();
    await expect(page.getByRole('radio')).toHaveCount(VERSIONS[slug].length);
    await page.getByText(VERSIONS[slug][1], { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Review checkout' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/deploy/${slug}\\?`));
    await expect(page).toHaveURL(new RegExp(`mcVersion=${VERSIONS[slug][1].replaceAll('.', '\\.')}`));
  }
  await page.goto('/app/deploy/families/minecraft');
  await page.getByRole('button', { name: /^Bedrock/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Review checkout' }).click();
  await expect(page).toHaveURL(/\/app\/deploy\/minecraft-bedrock\?/);
});

test('a version list that fails to load says so and can be retried', async ({ page }) => {
  await stubAdmin(page, (path) => {
    if (path === '/catalog/families/minecraft') return { family: FAMILY };
    if (path === '/catalog/minecraft/versions') return { supported: true, versions: [] };
    return undefined;
  });
  await page.goto('/app/deploy/families/minecraft');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Versions could not be loaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
});
