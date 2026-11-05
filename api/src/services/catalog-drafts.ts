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

/** Products that are sizes or engines of one offer. Everything else stays its own card. */
const PLAN_FAMILIES: DraftFamily[] = [
  {
    slug: 'email-hosting',
    name: 'Email hosting',
    group: 'websites-apps',
    summary: 'Starter, Plus and Business. The mailbox limits change. The mail product does not.',
    variants: [
      { slug: 'email-hosting-starter', label: 'Starter' },
      { slug: 'email-hosting-plus', label: 'Plus' },
      { slug: 'email-hosting-business', label: 'Business' },
    ],
  },
  {
    slug: 'vps',
    name: 'VPS',
    group: 'tools-automation',
    summary: 'Start, Plus, Pro and Max. Pick a size, then the same VPS checkout.',
    variants: [
      { slug: 'vps-start', label: 'Start' },
      { slug: 'vps-plus', label: 'Plus' },
      { slug: 'vps-pro', label: 'Pro' },
      { slug: 'vps-max', label: 'Max' },
    ],
  },
  {
    slug: 'databases',
    name: 'Databases',
    group: 'databases-caches',
    summary: 'MariaDB, PostgreSQL, MongoDB and Redis. Each one is still its own product.',
    variants: [
      { slug: 'mariadb', label: 'MariaDB' },
      { slug: 'postgresql', label: 'PostgreSQL' },
      { slug: 'mongodb', label: 'MongoDB' },
      { slug: 'redis', label: 'Redis' },
    ],
  },
  {
    slug: 'monitoring',
    name: 'Monitoring',
    group: 'tools-automation',
    summary: 'Grafana, Loki, Prometheus and Uptime Kuma.',
    variants: [
      { slug: 'grafana', label: 'Grafana' },
      { slug: 'loki', label: 'Loki' },
      { slug: 'prometheus', label: 'Prometheus' },
      { slug: 'uptime-kuma', label: 'Uptime Kuma' },
    ],
  },
  {
    slug: 'git',
    name: 'Git',
    group: 'tools-automation',
    summary: 'Forgejo and Gitea.',
    variants: [
      { slug: 'forgejo', label: 'Forgejo' },
      { slug: 'gitea', label: 'Gitea' },
    ],
  },
  {
    slug: 'custom-runtime',
    name: 'Custom runtime',
    group: 'custom-runtime',
    summary: 'Node.js, Python, PHP, Go and the other language runtimes.',
    variants: [
      { slug: 'nodejs', label: 'Node.js' },
      { slug: 'python', label: 'Python' },
      { slug: 'php', label: 'PHP' },
      { slug: 'golang', label: 'Go' },
      { slug: 'java', label: 'Java' },
      { slug: 'rust-runtime', label: 'Rust' },
      { slug: 'deno', label: 'Deno' },
      { slug: 'dotnet', label: '.NET' },
      { slug: 'dart', label: 'Dart' },
      { slug: 'elixir', label: 'Elixir' },
      { slug: 'lua', label: 'Lua' },
    ],
  },
];

const PLANNED_SLUGS = new Set(PLAN_FAMILIES.flatMap((family) => family.variants.map((variant) => variant.slug)));

function groupFor(category: string, slug: string): CatalogGroup {
  if (category === 'GAMES') return 'games';
  if (slug === 'discord-bot') return 'discord-bots';
  if (slug === 'teamspeak-6' || slug === 'lavalink') return 'voice';
  if (category === 'WEB_CMS') return 'websites-apps';
  if (category === 'DATABASES') return 'databases-caches';
  if (category === 'DEVELOPER_TOOLS' && ['dotnet', 'dart', 'deno', 'elixir', 'golang', 'java', 'lua', 'nodejs', 'python', 'php', 'rust-runtime'].includes(slug)) return 'custom-runtime';
  return 'tools-automation';
}

/** Every manifest egg, grouped for the admin draft. Nothing here is prepared or visible. */
export function draftFamilies(products: { slug: string; name: string; category: string }[]): DraftFamily[] {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const families: DraftFamily[] = [];
  const minecraft = MINECRAFT.filter((variant) => bySlug.has(variant.slug));
  if (minecraft.length) {
    families.push({
      slug: 'minecraft',
      name: 'Minecraft',
      group: 'games',
      summary: 'Paper, Folia, Forge and Bedrock. Pick one, then deploy the same product as before.',
      variants: minecraft,
    });
  }
  for (const plan of PLAN_FAMILIES) {
    const variants = plan.variants.filter((variant) => bySlug.has(variant.slug));
    if (variants.length) families.push({ ...plan, variants });
  }
  for (const product of products) {
    if (MINECRAFT.some((variant) => variant.slug === product.slug) || PLANNED_SLUGS.has(product.slug)) continue;
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
 * Moves plan variants onto their shared family.
 * A product that already has a variant is relinked. The product row is not written.
 */
export async function regroupPlanFamilies(): Promise<{ moved: number; families: number }> {
  const products = await prisma.product.findMany({ select: { id: true, slug: true } });
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  let moved = 0;
  let families = 0;
  for (const plan of PLAN_FAMILIES) {
    const present = plan.variants.filter((variant) => bySlug.has(variant.slug));
    if (present.length < 2) continue;
    const existing = await prisma.catalogFamily.findUnique({ where: { slug: plan.slug }, select: { id: true } });
    const family = existing ?? await prisma.catalogFamily.create({
      data: { slug: plan.slug, name: plan.name, summary: plan.summary, group: plan.group, discovery: 'HIDDEN', prepared: false },
      select: { id: true },
    });
    if (!existing) families += 1;
    else await prisma.catalogFamily.update({ where: { id: family.id }, data: { name: plan.name, summary: plan.summary, group: plan.group } });
    for (const [index, variant] of present.entries()) {
      const product = bySlug.get(variant.slug);
      if (!product) continue;
      const linked = await prisma.catalogVariant.findUnique({ where: { productId: product.id }, select: { id: true, familyId: true } });
      if (!linked) {
        await prisma.catalogVariant.create({
          data: { familyId: family.id, productId: product.id, slug: variant.slug, label: variant.label, sortOrder: index, active: false },
        });
        moved += 1;
        continue;
      }
      if (linked.familyId !== family.id) {
        await prisma.catalogVariant.update({
          where: { id: linked.id },
          data: { familyId: family.id, slug: variant.slug, label: variant.label, sortOrder: index },
        });
        moved += 1;
      }
    }
  }
  const emptied = await prisma.catalogFamily.findMany({
    where: { variants: { none: {} }, slug: { in: [...PLANNED_SLUGS] } },
    select: { id: true },
  });
  if (emptied.length) {
    await prisma.catalogFamily.updateMany({
      where: { id: { in: emptied.map((family) => family.id) } },
      data: { prepared: false, discovery: 'HIDDEN' },
    });
  }
  return { moved, families };
}

/** Published presets customers can pick. Existing presets are left alone. */
export async function ensureStarterPresets(): Promise<{ created: number }> {
  const presets = [
    { family: 'minecraft', variant: 'minecraft-paper', slug: 'paper-survival', name: 'Paper survival', summary: 'Sets a survival world in server.properties after the server exists.' },
    { family: 'minecraft', variant: 'minecraft-forge', slug: 'forge-modded', name: 'Forge modded', summary: 'Marks the mods folder. Modpacks still install from the server page after a backup.' },
    { family: 'discord-bot', variant: 'discord-bot', slug: 'moderation', name: 'Moderation', summary: 'Writes the moderation bot and starts it with npm install.' },
    { family: 'discord-bot', variant: 'discord-bot', slug: 'welcome', name: 'Welcome', summary: 'Writes the welcome bot and starts it with npm install.' },
    { family: 'discord-bot', variant: 'discord-bot', slug: 'tickets', name: 'Tickets', summary: 'Writes the private ticket bot and starts it with npm install.' },
    { family: 'counter-strike-2', variant: 'counter-strike-2', slug: 'casual', name: 'Casual', summary: 'Starts on Dust II in casual mode.' },
    { family: 'counter-strike-2', variant: 'counter-strike-2', slug: 'competitive', name: 'Competitive', summary: 'Starts on Mirage in competitive mode.' },
    { family: 'counter-strike-1-6', variant: 'counter-strike-1-6', slug: 'dust2', name: 'Dust II', summary: 'Starts on de_dust2.' },
    { family: 'rust', variant: 'rust', slug: 'procedural', name: 'Procedural', summary: 'A procedural map with a 3000 world size.' },
    { family: 'fivem', variant: 'fivem', slug: 'freeroam', name: 'Freeroam', summary: 'Adds the blipmade-freeroam resource and ensures it from server.cfg.' },
    { family: 'valheim', variant: 'valheim', slug: 'dedicated', name: 'Dedicated world', summary: 'Uses the Dedicated world name.' },
  ];
  let created = 0;
  for (const preset of presets) {
    const family = await prisma.catalogFamily.findUnique({ where: { slug: preset.family }, select: { id: true } });
    const variant = await prisma.catalogVariant.findFirst({ where: { slug: preset.variant, family: { slug: preset.family } }, select: { id: true } });
    if (!family || !variant) continue;
    const existing = await prisma.catalogPreset.findUnique({ where: { familyId_slug: { familyId: family.id, slug: preset.slug } }, select: { id: true } });
    if (existing) continue;
    await prisma.catalogPreset.create({
      data: {
        familyId: family.id,
        variantId: variant.id,
        slug: preset.slug,
        name: preset.name,
        versions: { create: { version: 1, summary: preset.summary, publishedAt: new Date() } },
      },
    });
    created += 1;
  }
  return { created };
}

/**
 * Minecraft presets with plugins. They are written as DRAFTS (version 1, not published), so a staff member reads them
 * and publishes them from the back office. Slugs are Modrinth project slugs; a plugin without a build for the version
 * the customer picks is skipped at install time. Existing presets are left alone, and `dryRun` only counts.
 */
export const DRAFT_PLUGIN_PRESETS = [
  { slug: 'paper-starter', name: 'Paper starter', summary: 'Permissions and a world editor from the first start.', notes: 'LuckPerms and WorldEdit. Restart the server once after the first install.', plugins: ['luckperms', 'worldedit'], ramMb: 4096, cpu: 2, diskGb: 15 },
  { slug: 'paper-protected', name: 'Paper protected', summary: 'Claims and region protection for a public server.', notes: 'LuckPerms, WorldEdit and WorldGuard. Staff set the regions in game.', plugins: ['luckperms', 'worldedit', 'worldguard'], ramMb: 6144, cpu: 2, diskGb: 20 },
  { slug: 'paper-skyblock', name: 'Paper skyblock', summary: 'Island gamemodes with BentoBox.', notes: 'BentoBox and LuckPerms. The island gamemode addons are chosen after the first start.', plugins: ['bentobox', 'luckperms'], ramMb: 6144, cpu: 2, diskGb: 20 },
] as const;

export async function ensureDraftPluginPresets(dryRun = false): Promise<{ created: string[]; existing: string[]; missingFamily: boolean }> {
  const family = await prisma.catalogFamily.findUnique({ where: { slug: 'minecraft' }, select: { id: true } });
  const variant = family ? await prisma.catalogVariant.findFirst({ where: { slug: 'minecraft-paper', familyId: family.id }, select: { id: true } }) : null;
  if (!family || !variant) return { created: [], existing: [], missingFamily: true };
  const created: string[] = [];
  const existing: string[] = [];
  for (const preset of DRAFT_PLUGIN_PRESETS) {
    if (await prisma.catalogPreset.findUnique({ where: { familyId_slug: { familyId: family.id, slug: preset.slug } }, select: { id: true } })) {
      existing.push(preset.slug);
      continue;
    }
    if (!dryRun) {
      await prisma.catalogPreset.create({
        data: {
          familyId: family.id,
          variantId: variant.id,
          slug: preset.slug,
          name: preset.name,
          sortOrder: 50,
          versions: { create: { version: 1, summary: preset.summary, notes: preset.notes, plugins: [...preset.plugins], recommendedRamMb: preset.ramMb, recommendedCpu: preset.cpu, recommendedDiskGb: preset.diskGb, publishedAt: null } },
        },
      });
    }
    created.push(preset.slug);
  }
  return { created, existing, missingFamily: false };
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
    // A family with one orderable product is still a family. Hiding it made that product look missing.
    const ready = readyCount >= 1;
    const discovery = ready ? 'GROUPED' as const : family.discovery;
    if (family.prepared !== ready || family.discovery !== discovery) {
      await prisma.catalogFamily.update({ where: { id: family.id }, data: { prepared: ready, discovery } });
    }
    if (ready) prepared += 1;
  }
  return { prepared, active };
}
