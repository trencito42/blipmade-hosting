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
  await page.getByRole('button', { name: 'Go to checkout' }).click();
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
    await page.getByRole('button', { name: 'Go to checkout' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/deploy/${slug}\\?`));
    await expect(page).toHaveURL(new RegExp(`mcVersion=${VERSIONS[slug][1].replaceAll('.', '\\.')}`));
  }
  await page.goto('/app/deploy/families/minecraft');
  await page.getByRole('button', { name: /^Bedrock/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Go to checkout' }).click();
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

test('an added plugin can be taken out again', async ({ page }) => {
  await stubAdmin(page, (path) => {
    if (path === '/catalog/families/minecraft') return { family: FAMILY };
    if (path === '/catalog/minecraft/versions') return { supported: true, versions: ['1.21.1'] };
    if (path === '/catalog/minecraft/plugins/search') return { results: [{ slug: 'essentials', title: 'Essentials', description: 'Basics' }] };
    return undefined;
  });
  await page.goto('/app/deploy/families/minecraft');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Search Modrinth').fill('ess');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: 'Remove Essentials' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Essentials' }).click();
  await expect(page.getByRole('button', { name: 'Remove Essentials' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
});

test('a preset shows the plugins it installs, in the list and in the summary', async ({ page }) => {
  await stubAdmin(page, (path) => {
    if (path === '/catalog/families/minecraft') return { family: { ...FAMILY, presets: [{ ...FAMILY.presets[0], plugins: ['essentialsx', 'luckperms'] }] } };
    if (path === '/catalog/minecraft/versions') return { supported: true, versions: ['1.21.1'] };
    return undefined;
  });
  await page.goto('/app/deploy/families/minecraft');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Installs: essentialsx, luckperms')).toBeVisible();
  await page.getByRole('radio', { name: /Survival/ }).check();
  await expect(page.getByText('with essentialsx, luckperms')).toBeVisible();
});

test('a search for a variant or a preset opens its family with that choice already made', async ({ page }) => {
  const variant = (slug: string, label: string) => ({ slug, label, product: { slug: `minecraft-${slug}`, name: `Minecraft ${label}`, category: 'GAMES', orderable: true, availability: 'DEPLOYABLE', defaultRam: 2048, defaultCpu: 1, defaultDisk: 10 } });
  const family = {
    ...FAMILY,
    variants: [variant('paper', 'Paper'), variant('folia', 'Folia'), variant('forge', 'Forge'), variant('bedrock', 'Bedrock')],
    presets: [
      { slug: 'survival', name: 'Survival SMP', variantSlug: 'paper', version: 1, summary: 'A quiet world.', recommendedRamMb: 4096, recommendedCpu: 2, recommendedDiskGb: 20, plugins: [] },
      { slug: 'modpack', name: 'Modpack', variantSlug: 'forge', version: 1, summary: 'Mods.', recommendedRamMb: 6144, recommendedCpu: 2, recommendedDiskGb: 30, plugins: [] },
    ],
  };
  await stubAdmin(page, (path) => {
    if (path === '/catalog/families') return { families: [family] };
    if (path === '/catalog/families/minecraft') return { family };
    // One more game, so the catalogue has a games section that the family sits in.
    if (path === '/catalog/products') return { products: [{ slug: 'rust', name: 'Rust', category: 'GAMES', description: 'Rust server', icon: 'box', options: [], price: { currency: 'EUR', period: 'MONTHLY', baseAmount: 500, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 }, minRam: 512, maxRam: 8192, minCpu: 1, maxCpu: 4, minDisk: 5, maxDisk: 50, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, deployable: true, visible: true, availability: { orderable: true, state: 'DEPLOYABLE', blockers: [] } }] };
    if (path === '/catalog/minecraft/versions') return { supported: true, versions: ['1.20.1'] };
    return undefined;
  });
  await page.goto('/app/deploy');
  const search = page.getByRole('searchbox').first();
  await search.fill('forge');
  const link = page.getByRole('link', { name: /Minecraft/ }).first();
  await expect(link).toHaveAttribute('href', '/app/deploy/families/minecraft?variant=forge');
  await link.click();
  await expect(page).toHaveURL(/variant=forge/);
  await expect(page.getByRole('button', { name: /^Forge/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Paper/ })).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/app/deploy');
  await page.getByRole('searchbox').first().fill('survival');
  await expect(page.getByRole('link', { name: /Minecraft/ }).first()).toHaveAttribute('href', '/app/deploy/families/minecraft?variant=paper&preset=survival');
  await page.goto('/app/deploy/families/minecraft?variant=paper&preset=survival');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('radio', { name: /Survival/ })).toBeChecked();
});

test('a Git preset stays on the family until the repository matches the product', async ({ page }) => {
  const family = {
    slug: 'discord-bot',
    name: 'Discord Bot',
    summary: 'Bots',
    group: 'discord-bots',
    variants: [{ slug: 'discord-bot', label: 'Discord Bot', product: { slug: 'discord-bot', name: 'Discord Bot', description: 'A bot', defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, orderable: true, availability: 'DEPLOYABLE' } }],
    presets: [
      { slug: 'blank', name: 'Blank', variantSlug: 'discord-bot', version: 1, summary: 'Starts a Node bot.', recommendedRamMb: null, recommendedCpu: null, recommendedDiskGb: null },
      { slug: 'git', name: 'Git repository', variantSlug: 'discord-bot', version: 1, summary: 'Deploys a repository.', recommendedRamMb: null, recommendedCpu: null, recommendedDiskGb: null },
    ],
    addons: [],
  };
  await stubAdmin(page, (path) => {
    if (path === '/catalog/families/discord-bot') return { family };
    if (path === '/catalog/import/plans') return { plan: { id: 'imp-1', productSlug: 'discord-bot' } };
    if (path === '/catalog/products/discord-bot') return { product: { slug: 'discord-bot', name: 'Discord Bot', category: 'DEVELOPER_TOOLS', description: 'A bot', icon: 'bot', options: [], price: { currency: 'EUR', period: 'MONTHLY', baseAmount: 100, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0 }, minRam: 512, maxRam: 4096, minCpu: 1, maxCpu: 2, minDisk: 5, maxDisk: 20, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, deployable: true, visible: true, availability: { orderable: true, state: 'DEPLOYABLE', blockers: [] }, customerVariables: [] } };
    return undefined;
  });
  await page.goto('/app/deploy/families/discord-bot');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Git repository/ }).check();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByLabel('Repository URL').fill('https://github.com/example/bot');
  await page.getByRole('button', { name: 'Check repository' }).click();
  await expect(page.getByText('will be deployed after payment')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await expect(page).toHaveURL(/preset=git/);
  await expect(page).toHaveURL(/import=imp-1/);
});
