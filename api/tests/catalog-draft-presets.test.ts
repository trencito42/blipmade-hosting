import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const { prisma } = await import('../src/db.js');
const { ensureDraftPluginPresets } = await import('../src/services/catalog-drafts.js');
const { closeApp, getApp, resetDatabase } = await import('./helpers.js');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

async function seedFamily() {
  const product = await prisma.product.create({ data: { slug: 'minecraft-paper', name: 'Paper', category: 'GAMES', description: 'A game.', icon: 'box', deployable: true, eggId: 5 } });
  const family = await prisma.catalogFamily.create({ data: { slug: 'minecraft', name: 'Minecraft', summary: 'Minecraft.', group: 'games' } });
  await prisma.catalogVariant.create({ data: { familyId: family.id, productId: product.id, slug: 'minecraft-paper', label: 'Paper' } });
  return { product, family };
}

describe('draft plugin presets', () => {
  it('does nothing when the Minecraft family does not exist', async () => {
    expect(await ensureDraftPluginPresets()).toEqual({ created: [], existing: [], missingFamily: true });
  });

  it('only counts in a dry run', async () => {
    await seedFamily();
    const result = await ensureDraftPluginPresets(true);
    expect(result.created).toHaveLength(3);
    expect(await prisma.catalogPreset.count()).toBe(0);
  });

  it('writes unpublished presets once and leaves products and prices alone', async () => {
    const { product, family } = await seedFamily();
    expect((await ensureDraftPluginPresets()).created).toHaveLength(3);
    const again = await ensureDraftPluginPresets();
    expect(again.created).toEqual([]);
    expect(again.existing).toHaveLength(3);
    const versions = await prisma.catalogPresetVersion.findMany({ include: { preset: true } });
    expect(versions).toHaveLength(3);
    expect(versions.every((version) => version.publishedAt === null && version.version === 1)).toBe(true);
    expect(versions.find((version) => version.preset.slug === 'paper-protected')?.plugins).toEqual(['luckperms', 'worldedit', 'worldguard']);
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({ deployable: true, visible: product.visible });
    expect((await prisma.catalogFamily.findUnique({ where: { id: family.id } }))?.prepared).toBe(false);
    expect(await prisma.productPrice.count()).toBe(0);
  });
});
