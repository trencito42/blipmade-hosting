import type { ProductFulfilment } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { deploymentAvailability } from './availability.js';
import { env } from '../env.js';

const slug = z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/);

export const catalogSelectionSchema = z
  .object({
    familySlug: slug,
    variantSlug: slug,
    presetSlug: slug.optional(),
    presetVersion: z.number().int().positive().optional(),
    addonSlugs: z.array(slug).max(20).default([]),
    install: z
      .object({
        gameVersion: z.string().regex(/^\d+\.\d+(\.\d+)?$/).optional(),
        plugins: z.array(z.object({ slug: slug, version: z.string().max(24) })).max(15).optional(),
        modpack: z.object({ slug: slug, version: z.string().max(24) }).optional(),
      })
      .optional(),
  })
  .strict();

export type CatalogSelectionInput = z.infer<typeof catalogSelectionSchema>;

export interface StoredCatalogSelection {
  familySlug: string;
  variantSlug: string;
  preset: { slug: string; version: number } | null;
  addons: { slug: string; kind: string; version: number }[];
  install?: { gameVersion?: string; plugins?: { slug: string; version: string }[]; modpack?: { slug: string; version: string } };
}

const publicVariantSelect = {
  id: true,
  slug: true,
  label: true,
  sortOrder: true,
  product: {
    select: {
      slug: true,
      name: true,
      icon: true,
      category: true,
      fulfilment: true,
      description: true,
      visible: true,
      deployable: true,
      eggId: true,
      eggName: true,
      defaultRam: true,
      defaultCpu: true,
      defaultDisk: true,
    },
  },
} as const;

/**
 * Prepared families the customer may browse. A family with no active, visible
 * variant is omitted. Products that are not in a family stay on /catalog/products.
 */
export async function publicFamilies() {
  const families = await prisma.catalogFamily.findMany({
    where: { prepared: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      variants: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: publicVariantSelect },
      presets: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 } },
      },
      addons: {
        where: { active: true },
        orderBy: { name: 'asc' },
        include: {
          productOption: { select: { code: true, name: true, amount: true, currency: true, active: true } },
          product: { select: { slug: true, name: true, visible: true } },
          compatibilities: { select: { variantId: true } },
        },
      },
    },
  });
  return families.map(presentFamily).filter((family) => family.variants.length > 0);
}

export async function publicFamily(slugValue: string) {
  const families = await publicFamilies();
  const family = families.find((entry) => entry.slug === slugValue);
  if (!family) throw notFound('This catalogue family is not available.');
  return family;
}

function presentFamily(family: {
  slug: string;
  name: string;
  summary: string;
  group: string;
  discovery: string;
  variants: { id: string; slug: string; label: string; product: { slug: string; name: string; icon: string; category: string; fulfilment: ProductFulfilment; description: string; visible: boolean; deployable: boolean; eggId: number | null; eggName: string | null; defaultRam: number; defaultCpu: number; defaultDisk: number } }[];
  presets: { slug: string; name: string; variantId: string | null; versions: { version: number; summary: string; notes: string; recommendedRamMb: number | null; recommendedCpu: number | null; recommendedDiskGb: number | null; plugins: string[] }[] }[];
  addons: { slug: string; name: string; summary: string; kind: string; version: number; compatibilities: { variantId: string }[]; productOption: { code: string; name: string; amount: number; currency: string; active: boolean } | null; product: { slug: string; name: string; visible: boolean } | null }[];
}) {
  const variants = family.variants
    .filter((variant) => variant.product.visible)
    .map((variant) => {
      const availability = deploymentAvailability(variant.product, { emailSalesEnabled: env.MAIL_SALES_ENABLED });
      return {
        slug: variant.slug,
        label: variant.label,
        product: {
          slug: variant.product.slug,
          name: variant.product.name,
          icon: variant.product.icon,
          category: variant.product.category,
          fulfilment: variant.product.fulfilment,
          defaultRam: variant.product.defaultRam,
          defaultCpu: variant.product.defaultCpu,
          defaultDisk: variant.product.defaultDisk,
          orderable: availability.orderable,
          availability: availability.state,
        },
      };
    });
  const variantIds = new Set(family.variants.filter((variant) => variant.product.visible).map((variant) => variant.id));
  return {
    slug: family.slug,
    name: family.name,
    summary: family.summary,
    group: family.group,
    discovery: family.discovery,
    variants,
    presets: family.presets
      .filter((preset) => preset.versions[0] && (!preset.variantId || variantIds.has(preset.variantId)))
      .map((preset) => ({
        slug: preset.slug,
        name: preset.name,
        variantSlug: family.variants.find((variant) => variant.id === preset.variantId)?.slug ?? null,
        version: preset.versions[0]!.version,
        summary: preset.versions[0]!.summary,
        notes: preset.versions[0]!.notes,
        recommendedRamMb: preset.versions[0]!.recommendedRamMb,
        recommendedCpu: preset.versions[0]!.recommendedCpu,
        recommendedDiskGb: preset.versions[0]!.recommendedDiskGb,
        plugins: preset.versions[0]!.plugins,
      })),
    addons: family.addons
      .map((addon) => ({
        slug: addon.slug,
        name: addon.name,
        summary: addon.summary,
        kind: addon.kind,
        version: addon.version,
        variantSlugs: addon.compatibilities
          .map((row) => family.variants.find((variant) => variant.id === row.variantId && variant.product.visible)?.slug)
          .filter((value): value is string => Boolean(value)),
        optionCode: addon.kind === 'PLATFORM_FEATURE' && addon.productOption?.active ? addon.productOption.code : null,
        optionAmount: addon.kind === 'PLATFORM_FEATURE' && addon.productOption?.active ? addon.productOption.amount : null,
        optionCurrency: addon.kind === 'PLATFORM_FEATURE' && addon.productOption?.active ? addon.productOption.currency : null,
        serviceSlug: addon.kind === 'MANAGED_SERVICE' && addon.product?.visible ? addon.product.slug : null,
        serviceName: addon.kind === 'MANAGED_SERVICE' && addon.product?.visible ? addon.product.name : null,
      }))
      .filter((addon) => addon.kind !== 'MANAGED_SERVICE' || addon.serviceSlug),
  };
}

/**
 * Checks a catalogue choice against the prepared family and returns the
 * versioned record stored on the order. It does not change the price.
 */
export async function resolveCatalogSelection(productSlug: string, optionCodes: string[], input: CatalogSelectionInput): Promise<StoredCatalogSelection> {
  const family = await prisma.catalogFamily.findUnique({
    where: { slug: input.familySlug },
    include: {
      variants: { where: { slug: input.variantSlug }, include: { product: { select: { slug: true, visible: true } } } },
      presets: { include: { versions: true, variant: { select: { slug: true } } } },
      addons: {
        where: { slug: { in: input.addonSlugs.length ? input.addonSlugs : ['__none__'] } },
        include: { productOption: true, compatibilities: { include: { variant: { select: { slug: true } } } } },
      },
    },
  });
  if (!family?.prepared) throw badRequest('That catalogue family is not prepared.');
  const variant = family.variants[0];
  if (!variant?.active || !variant.product.visible || variant.product.slug !== productSlug) {
    throw badRequest('The variant does not match this product.');
  }
  let preset: StoredCatalogSelection['preset'] = null;
  let presetPlugins: string[] = [];
  if (input.presetSlug) {
    const row = family.presets.find((entry) => entry.slug === input.presetSlug);
    if (!row) throw badRequest('That preset is not part of this family.');
    if (row.variantId && row.variant?.slug !== variant.slug) throw badRequest('That preset is for a different variant.');
    const version = row.versions.find((entry) => entry.version === input.presetVersion && entry.publishedAt);
    if (!version) throw badRequest('Choose a published preset version.');
    preset = { slug: row.slug, version: version.version };
    presetPlugins = version.plugins;
  }
  if (input.addonSlugs.length !== family.addons.length) throw badRequest('An add-on in this choice is not active.');
  const addons = input.addonSlugs.map((addonSlug) => {
    const addon = family.addons.find((entry) => entry.slug === addonSlug);
    if (!addon?.active) throw badRequest('An add-on in this choice is not active.');
    const compatible = addon.compatibilities.some((row) => row.variant.slug === variant.slug);
    if (!compatible) throw badRequest('An add-on is not compatible with this variant.');
    if (addon.kind === 'MANAGED_SERVICE') throw badRequest('A managed service is ordered as its own product.');
    if (addon.kind === 'PLATFORM_FEATURE') {
      const code = addon.productOption?.active ? addon.productOption.code : null;
      if (!code || !optionCodes.includes(code)) throw badRequest('The priced add-on must be included in the order.');
    }
    return { slug: addon.slug, kind: addon.kind, version: addon.version };
  });
  // What the preset installs is decided here, from the version that was published, and not by the browser: the plugins of
  // the version join the ones the customer picked, each for the game version that was chosen.
  let install = input.install;
  if (presetPlugins.length && input.install?.gameVersion) {
    const chosen = input.install.plugins ?? [];
    const merged = [...chosen, ...presetPlugins.filter((slug) => !chosen.some((entry) => entry.slug === slug)).map((slug) => ({ slug, version: input.install!.gameVersion! }))];
    install = { ...input.install, plugins: merged.slice(0, 15) };
  }
  return { familySlug: family.slug, variantSlug: variant.slug, preset, addons, ...(install ? { install } : {}) };
}
