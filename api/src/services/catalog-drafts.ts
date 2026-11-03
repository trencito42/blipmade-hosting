import { prisma } from '../db.js';
import type { CatalogGroup } from './catalog-structure.js';

interface DraftVariant { slug: string; label: string }
interface DraftFamily { slug: string; name: string; group: CatalogGroup; summary: string; variants: DraftVariant[] }

const MINECRAFT: DraftVariant[] = [
  { slug: 'minecraft-paper', label: 'Paper' },
  { slug: 'minecraft-folia', label: 'Folia' },
  { slug: 'minecraft-forge', label: 'Forge' },
  { slug: 'minecraft-bedrock', label: 'Bedrock' },
];

function groupFor(category: string, slug: string): CatalogGroup {
  if (category === 'GAMES') return 'games';
  if (slug === 'discord-bot') return 'discord-bots';
  if (slug === 'teamspeak-6' || slug === 'lavalink') return 'voice';
  if (category === 'WEB_CMS') return 'websites-apps';
  if (category === 'DATABASES') return 'databases-caches';
  if (category === 'DEVELOPER_TOOLS' && ['dotnet', 'dart', 'deno', 'elixir', 'golang', 'java', 'lua', 'nodejs', 'python', 'rust-runtime'].includes(slug)) return 'custom-runtime';
  return 'tools-automation';
}

/** The 68 eggs, grouped for the admin draft. Nothing here is prepared or visible. */
export function draftFamilies(products: { slug: string; name: string; category: string }[]): DraftFamily[] {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const families: DraftFamily[] = [];
  const minecraft = MINECRAFT.filter((variant) => bySlug.has(variant.slug));
  if (minecraft.length) {
    families.push({
      slug: 'minecraft',
      name: 'Minecraft',
      group: 'games',
      summary: 'Paper, Folia, Forge and Bedrock share one Minecraft family. The live product is unchanged.',
      variants: minecraft,
    });
  }
  for (const product of products) {
    if (MINECRAFT.some((variant) => variant.slug === product.slug)) continue;
    families.push({
      slug: product.slug,
      name: product.name,
      group: groupFor(product.category, product.slug),
      summary: `${product.name} stays its own product. This family is only a draft.`,
      variants: [{ slug: product.slug, label: product.name }],
    });
  }
  return families;
}

/**
 * Creates missing unprepared families and inactive variants.
 * It never changes a product, a price, or a family that was already prepared.
 */
export async function syncCatalogDrafts(): Promise<{ families: number; variants: number; skipped: number }> {
  const products = await prisma.product.findMany({ select: { id: true, slug: true, name: true, category: true } });
  let families = 0;
  let variants = 0;
  let skipped = 0;
  for (const draft of draftFamilies(products)) {
    const existing = await prisma.catalogFamily.findUnique({ where: { slug: draft.slug }, select: { id: true, prepared: true } });
    const family = existing ?? await prisma.catalogFamily.create({
      data: { slug: draft.slug, name: draft.name, summary: draft.summary, group: draft.group, discovery: 'HIDDEN', prepared: false },
      select: { id: true, prepared: true },
    });
    if (!existing) families += 1;
    for (const [index, variant] of draft.variants.entries()) {
      const product = products.find((entry) => entry.slug === variant.slug);
      if (!product) {
        skipped += 1;
        continue;
      }
      const linked = await prisma.catalogVariant.findUnique({ where: { productId: product.id }, select: { id: true } });
      if (linked) {
        skipped += 1;
        continue;
      }
      await prisma.catalogVariant.create({
        data: { familyId: family.id, productId: product.id, slug: variant.slug, label: variant.label, sortOrder: index, active: false },
      });
      variants += 1;
    }
  }
  return { families, variants, skipped };
}

/**
 * Opens a draft to customers only when its product can already be ordered.
 * Products, prices and eggs stay as they are.
 */
export async function publishReadyFamilies(): Promise<{ prepared: number; active: number }> {
  const [products, prices, families] = await Promise.all([
    prisma.product.findMany({ select: { id: true, visible: true, deployable: true } }),
    prisma.productPrice.findMany({ where: { active: true }, select: { productId: true } }),
    prisma.catalogFamily.findMany({ select: { id: true, prepared: true, discovery: true, variants: { select: { id: true, productId: true, active: true } } } }),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const priced = new Set(prices.map((price) => price.productId));
  let prepared = 0;
  let active = 0;
  for (const family of families) {
    let readyCount = 0;
    for (const variant of family.variants) {
      const product = productById.get(variant.productId);
      const on = Boolean(product?.visible && product.deployable && priced.has(product.id));
      if (variant.active !== on) await prisma.catalogVariant.update({ where: { id: variant.id }, data: { active: on } });
      if (on) {
        readyCount += 1;
        active += 1;
      }
    }
    // One product is already a card in the catalog. A family is shown only when it groups several.
    const ready = readyCount > 1;
    const discovery = ready ? 'GROUPED' as const : family.discovery;
    if (family.prepared !== ready || family.discovery !== discovery) {
      await prisma.catalogFamily.update({ where: { id: family.id }, data: { prepared: ready, discovery } });
    }
    if (ready) prepared += 1;
  }
  return { prepared, active };
}
