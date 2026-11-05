import { expect, test } from '@playwright/test';
import { stubAdmin } from './admin-stub';

const version = (n: number, published: boolean, plugins: string[]) => ({ id: `pv-${n}`, version: n, summary: 'A quiet survival world.', notes: '', recommendedRamMb: 4096, recommendedCpu: 2, recommendedDiskGb: 20, plugins, publishedAt: published ? '2026-11-01T10:00:00.000Z' : null });
const family = (versions: ReturnType<typeof version>[]) => ({
  family: {
    id: 'fam-1', slug: 'minecraft', name: 'Minecraft', summary: 'One family for the Minecraft runtimes.', group: 'games', discovery: 'HIDDEN', prepared: true, sortOrder: 0,
    variants: [{ id: 'var-1', slug: 'paper', label: 'Paper', active: true, product: { id: 'p1', slug: 'minecraft-paper', name: 'Paper' } }],
    presets: [{ id: 'pre-1', slug: 'survival', name: 'Survival SMP', sortOrder: 0, variantId: 'var-1', variant: { id: 'var-1', slug: 'paper', label: 'Paper' }, versions }],
    addons: [],
  },
  note: 'Nothing here writes the live catalogue.',
});

test.describe('catalogue presets', () => {
  test('a draft preset is saved with its plugins and its size, and a bad slug blocks the save', async ({ page }) => {
    let sent: { path: string; body: Record<string, unknown> } | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/catalog/families/fam-1') return family([version(1, false, ['essentialsx'])]);
      if (path === '/admin/saved-views') return { views: [] };
      if (path === '/admin/catalog/preset-versions/pv-1' && method === 'PATCH') { sent = { path, body: body as Record<string, unknown> }; return { version: version(1, false, ['essentialsx', 'luckperms']) }; }
      return undefined;
    });
    await page.goto('/admin/catalog/families/fam-1/presets/pre-1/edit');
    const plugins = page.getByLabel('Plugins installed with the server');
    await expect(plugins).toHaveValue('essentialsx');
    await expect(page.getByLabel('Recommended RAM (MB)')).toHaveValue('4096');

    await plugins.fill('essentialsx\nnot a slug!');
    await expect(page.getByText(/Each plugin is a Modrinth slug/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled();

    await plugins.fill('essentialsx\nluckperms\nessentialsx');
    await page.getByLabel('Recommended RAM (MB)').fill('6144');
    await page.getByRole('button', { name: /^Save/ }).click();
    await expect.poll(() => sent).toBeTruthy();
    expect(sent!.body).toMatchObject({ plugins: ['essentialsx', 'luckperms'], recommendedRamMb: 6144, recommendedCpu: 2, recommendedDiskGb: 20 });
  });

  test('a published preset starts a new draft that keeps the plugins of the last version', async ({ page }) => {
    let sent: { path: string; body: Record<string, unknown> } | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/catalog/families/fam-1') return family([version(1, true, ['essentialsx'])]);
      if (path === '/admin/catalog/presets/pre-1/versions' && method === 'POST') { sent = { path, body: body as Record<string, unknown> }; return { version: version(2, false, ['essentialsx', 'spark']) }; }
      return undefined;
    });
    await page.goto('/admin/catalog/families/fam-1/presets/pre-1/edit');
    const plugins = page.getByLabel('Plugins installed with the server');
    await expect(plugins).toHaveValue('essentialsx');
    await plugins.fill('essentialsx\nspark');
    await page.getByRole('button', { name: /Save|Create|version/ }).last().click();
    await expect.poll(() => sent).toBeTruthy();
    expect(sent!.body).toMatchObject({ plugins: ['essentialsx', 'spark'] });
  });

  test('a new preset sends the plugins, and the family page lists what it installs', async ({ page }) => {
    let sent: Record<string, unknown> | undefined;
    await stubAdmin(page, (path, method, body) => {
      if (path === '/admin/catalog/families/fam-1' && method === 'GET') return family([version(1, true, ['essentialsx', 'luckperms'])]);
      if (path === '/admin/catalog/families/fam-1/presets' && method === 'POST') { sent = body as Record<string, unknown>; return { preset: { id: 'pre-2' } }; }
      return undefined;
    });
    await page.goto('/admin/catalog/families/fam-1');
    await expect(page.getByText('essentialsx, luckperms')).toBeVisible();
    await page.goto('/admin/catalog/families/fam-1/presets/new');
    await page.getByLabel('Slug').fill('skyblock');
    await page.getByLabel('Name').fill('SkyBlock');
    await page.getByLabel('Summary').fill('Islands in the sky.');
    await page.getByLabel('Plugins installed with the server').fill('essentialsx, worldedit');
    await page.getByRole('button', { name: /Create preset|Create/ }).click();
    await expect.poll(() => sent).toBeTruthy();
    expect(sent).toMatchObject({ slug: 'skyblock', plugins: ['essentialsx', 'worldedit'] });
  });
});
