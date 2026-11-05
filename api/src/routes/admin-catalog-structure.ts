import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CatalogAddonKind, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { CATALOG_GROUPS, STRUCTURE_NOTE, assertActiveHasVariants, assertAddonShape } from '../services/catalog-structure.js';
import { publishReadyFamilies, regroupPlanFamilies, syncCatalogDrafts } from '../services/catalog-drafts.js';

const slug = z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes.');
const label = z.string().trim().min(2).max(120);
const summary = z.string().trim().min(2).max(500);
const notes = z.string().trim().max(2000);
/** Modrinth project slugs a preset installs with the server. The same shape the order flow accepts. */
const plugins = z.array(z.string().regex(/^[A-Za-z0-9_-]{2,64}$/, 'A plugin is its Modrinth slug: letters, numbers, - and _.')).max(15).transform((list) => [...new Set(list)]);
const sortOrder = z.number().int().min(0).max(10_000);
const ram = z.number().int().min(256).max(65_536).nullable();
const cpu = z.number().min(0.5).max(64).nullable();
const disk = z.number().int().min(1).max(2_000).nullable();
const variantIds = z.array(z.string().min(1).max(80)).max(40);

const familySelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  group: true,
  discovery: true,
  prepared: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CatalogFamilySelect;

function viewVersion(version: {
  id: string;
  version: number;
  summary: string;
  notes: string;
  recommendedRamMb: number | null;
  recommendedCpu: number | null;
  recommendedDiskGb: number | null;
  plugins: string[];
  publishedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: version.id,
    version: version.version,
    summary: version.summary,
    notes: version.notes,
    recommendedRamMb: version.recommendedRamMb,
    recommendedCpu: version.recommendedCpu,
    recommendedDiskGb: version.recommendedDiskGb,
    plugins: version.plugins,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
  };
}

async function loadFamily(id: string) {
  const family = await prisma.catalogFamily.findUnique({
    where: { id },
    select: {
      ...familySelect,
      variants: {
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        select: {
          id: true,
          slug: true,
          label: true,
          sortOrder: true,
          active: true,
          product: { select: { id: true, slug: true, name: true, visible: true, deployable: true, fulfilment: true } },
        },
      },
      presets: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          sortOrder: true,
          variantId: true,
          variant: { select: { id: true, slug: true, label: true } },
          versions: { orderBy: { version: 'desc' } },
        },
      },
      addons: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          summary: true,
          kind: true,
          version: true,
          active: true,
          productOptionId: true,
          productId: true,
          product: { select: { id: true, slug: true, name: true } },
          productOption: { select: { id: true, code: true, name: true, amount: true, currency: true } },
          compatibilities: { select: { variantId: true } },
        },
      },
    },
  });
  if (!family) throw notFound('Catalogue family not found.');
  const mapped = await prisma.catalogVariant.findMany({ select: { productId: true } });
  const taken = mapped.map((row) => row.productId);
  const unmappedProducts = await prisma.product.findMany({
    where: taken.length ? { id: { notIn: taken } } : {},
    select: { id: true, slug: true, name: true },
    orderBy: { name: 'asc' },
  });
  return {
    family: {
      ...family,
      createdAt: family.createdAt.toISOString(),
      updatedAt: family.updatedAt.toISOString(),
      variants: family.variants,
      presets: family.presets.map((preset) => ({
        id: preset.id,
        slug: preset.slug,
        name: preset.name,
        sortOrder: preset.sortOrder,
        variantId: preset.variantId,
        variant: preset.variant,
        versions: preset.versions.map(viewVersion),
      })),
      addons: family.addons.map((addon) => ({
        ...addon,
        variantIds: addon.compatibilities.map((row) => row.variantId),
        compatibilities: undefined,
      })),
    },
    unmappedProducts,
    note: STRUCTURE_NOTE,
  };
}

async function variantsOf(familyId: string, ids: string[]): Promise<void> {
  if (ids.length !== new Set(ids).size) throw badRequest('Name each compatible variant once.');
  if (!ids.length) return;
  const found = await prisma.catalogVariant.findMany({ where: { id: { in: ids }, familyId }, select: { id: true } });
  if (found.length !== ids.length) throw badRequest('Compatible variants must belong to this family.');
}

export async function registerAdminCatalogStructureRoutes(app: FastifyInstance): Promise<void> {
  const limited = { config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } } };

  app.get('/admin/catalog/families', { preHandler: requirePermission('products.read') }, async () => {
    const families = await prisma.catalogFamily.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { ...familySelect, _count: { select: { variants: true, presets: true, addons: true } } },
    });
    return {
      families: families.map((family) => ({
        id: family.id,
        slug: family.slug,
        name: family.name,
        summary: family.summary,
        group: family.group,
        discovery: family.discovery,
        prepared: family.prepared,
        sortOrder: family.sortOrder,
        variantCount: family._count.variants,
        presetCount: family._count.presets,
        addonCount: family._count.addons,
      })),
      note: STRUCTURE_NOTE,
    };
  });

  app.post('/admin/catalog/families/sync-drafts', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const drafts = await syncCatalogDrafts();
    await regroupPlanFamilies();
    const published = await publishReadyFamilies();
    const result = { ...drafts, ...published };
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.drafts_synced', targetType: 'catalog_family', targetId: null, meta: result, ip: request.ip });
    return { ...result, prepared: false, note: STRUCTURE_NOTE };
  });

  app.post('/admin/catalog/families', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const body = z
      .object({
        slug,
        name: label,
        summary,
        group: z.enum(CATALOG_GROUPS),
        discovery: z.enum(['HIDDEN', 'ADVANCED', 'GROUPED', 'FEATURED']).default('HIDDEN'),
        sortOrder: sortOrder.default(0),
        prepared: z.boolean().default(false),
      })
      .strict()
      .parse(request.body);
    if (await prisma.catalogFamily.findUnique({ where: { slug: body.slug } })) throw conflict('A family with this slug already exists.');
    const family = await prisma.catalogFamily.create({ data: body, select: familySelect });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.family.created', targetType: 'catalog_family', targetId: family.id, meta: { slug: family.slug, group: family.group, prepared: family.prepared }, ip: request.ip });
    return reply.code(201).send({ family, note: STRUCTURE_NOTE });
  });

  app.get('/admin/catalog/families/:id', { preHandler: requirePermission('products.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return loadFamily(id);
  });

  app.patch('/admin/catalog/families/:id', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        name: label,
        summary,
        group: z.enum(CATALOG_GROUPS),
        discovery: z.enum(['HIDDEN', 'ADVANCED', 'GROUPED', 'FEATURED']),
        sortOrder,
        prepared: z.boolean(),
      })
      .partial()
      .strict()
      .parse(request.body);
    if (Object.keys(body).length === 0) throw badRequest('Nothing to change.');
    const before = await prisma.catalogFamily.findUnique({ where: { id }, select: familySelect });
    if (!before) throw notFound('Catalogue family not found.');
    const family = await prisma.catalogFamily.update({ where: { id }, data: body, select: familySelect });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'catalog.family.updated',
      targetType: 'catalog_family',
      targetId: id,
      meta: { slug: before.slug, changes: body },
      ip: request.ip,
    });
    return { family, note: STRUCTURE_NOTE };
  });

  app.post('/admin/catalog/families/:id/variants', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ productId: z.string().min(1), slug, label, sortOrder: sortOrder.default(0), active: z.boolean().default(false) }).strict().parse(request.body);
    const family = await prisma.catalogFamily.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!family) throw notFound('Catalogue family not found.');
    const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true, slug: true } });
    if (!product) throw notFound('Product not found.');
    if (await prisma.catalogVariant.findUnique({ where: { productId: product.id } })) throw conflict('This product is already a variant of a family.');
    if (await prisma.catalogVariant.findUnique({ where: { familyId_slug: { familyId: id, slug: body.slug } } })) throw conflict('A variant with this slug already exists in the family.');
    const variant = await prisma.catalogVariant.create({
      data: { familyId: id, productId: product.id, slug: body.slug, label: body.label, sortOrder: body.sortOrder, active: body.active },
      select: { id: true, slug: true, label: true, sortOrder: true, active: true, productId: true },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.variant.created', targetType: 'catalog_variant', targetId: variant.id, meta: { family: family.slug, slug: variant.slug, productId: product.id, productSlug: product.slug }, ip: request.ip });
    return reply.code(201).send({ variant, note: STRUCTURE_NOTE });
  });

  app.patch('/admin/catalog/variants/:variantId', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { variantId } = z.object({ variantId: z.string().min(1) }).parse(request.params);
    const body = z.object({ label, sortOrder, active: z.boolean() }).partial().strict().parse(request.body);
    if (Object.keys(body).length === 0) throw badRequest('Nothing to change.');
    const before = await prisma.catalogVariant.findUnique({ where: { id: variantId }, select: { id: true, slug: true, productId: true } });
    if (!before) throw notFound('Variant not found.');
    const variant = await prisma.catalogVariant.update({ where: { id: variantId }, data: body, select: { id: true, slug: true, label: true, sortOrder: true, active: true, productId: true } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.variant.updated', targetType: 'catalog_variant', targetId: variantId, meta: { slug: before.slug, productId: before.productId, changes: body }, ip: request.ip });
    return { variant, note: STRUCTURE_NOTE };
  });

  app.post('/admin/catalog/families/:id/presets', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        slug,
        name: label,
        variantId: z.string().min(1).nullable().default(null),
        sortOrder: sortOrder.default(0),
        summary,
        notes: notes.default(''),
        recommendedRamMb: ram.nullable().default(null),
        recommendedCpu: cpu.nullable().default(null),
        recommendedDiskGb: disk.nullable().default(null),
        plugins: plugins.default([]),
      })
      .strict()
      .parse(request.body);
    const family = await prisma.catalogFamily.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!family) throw notFound('Catalogue family not found.');
    if (body.variantId) {
      const variant = await prisma.catalogVariant.findFirst({ where: { id: body.variantId, familyId: id }, select: { id: true } });
      if (!variant) throw badRequest('The preset variant must belong to this family.');
    }
    if (await prisma.catalogPreset.findUnique({ where: { familyId_slug: { familyId: id, slug: body.slug } } })) throw conflict('A preset with this slug already exists in the family.');
    const preset = await prisma.catalogPreset.create({
      data: {
        familyId: id,
        variantId: body.variantId,
        slug: body.slug,
        name: body.name,
        sortOrder: body.sortOrder,
        versions: {
          create: {
            version: 1,
            summary: body.summary,
            notes: body.notes,
            recommendedRamMb: body.recommendedRamMb,
            recommendedCpu: body.recommendedCpu,
            recommendedDiskGb: body.recommendedDiskGb,
            plugins: body.plugins,
          },
        },
      },
      select: { id: true, slug: true, name: true, variantId: true, versions: true },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.preset.created', targetType: 'catalog_preset', targetId: preset.id, meta: { family: family.slug, slug: preset.slug, version: 1 }, ip: request.ip });
    return reply.code(201).send({ preset: { ...preset, versions: preset.versions.map(viewVersion) }, note: STRUCTURE_NOTE });
  });

  app.patch('/admin/catalog/preset-versions/:versionId', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { versionId } = z.object({ versionId: z.string().min(1) }).parse(request.params);
    const body = z.object({ summary, notes, recommendedRamMb: ram, recommendedCpu: cpu, recommendedDiskGb: disk, plugins }).partial().strict().parse(request.body);
    if (Object.keys(body).length === 0) throw badRequest('Nothing to change.');
    const before = await prisma.catalogPresetVersion.findUnique({ where: { id: versionId }, select: { id: true, version: true, publishedAt: true, presetId: true } });
    if (!before) throw notFound('Preset version not found.');
    if (before.publishedAt) throw conflict('A published preset version is immutable. Create a new version.');
    const version = await prisma.catalogPresetVersion.update({ where: { id: versionId }, data: body });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.preset.version.updated', targetType: 'catalog_preset_version', targetId: versionId, meta: { presetId: before.presetId, version: before.version }, ip: request.ip });
    return { version: viewVersion(version), note: STRUCTURE_NOTE };
  });

  app.post('/admin/catalog/preset-versions/:versionId/publish', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { versionId } = z.object({ versionId: z.string().min(1) }).parse(request.params);
    const before = await prisma.catalogPresetVersion.findUnique({ where: { id: versionId } });
    if (!before) throw notFound('Preset version not found.');
    if (before.publishedAt) throw conflict('This preset version is already published.');
    const version = await prisma.catalogPresetVersion.update({ where: { id: versionId }, data: { publishedAt: new Date() } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.preset.version.published', targetType: 'catalog_preset_version', targetId: versionId, meta: { presetId: before.presetId, version: before.version }, ip: request.ip });
    return { version: viewVersion(version), note: STRUCTURE_NOTE };
  });

  app.post('/admin/catalog/presets/:presetId/versions', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { presetId } = z.object({ presetId: z.string().min(1) }).parse(request.params);
    const body = z.object({ summary: summary.optional(), notes: notes.optional(), recommendedRamMb: ram.optional(), recommendedCpu: cpu.optional(), recommendedDiskGb: disk.optional(), plugins: plugins.optional() }).strict().parse(request.body ?? {});
    const preset = await prisma.catalogPreset.findUnique({ where: { id: presetId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!preset) throw notFound('Preset not found.');
    const latest = preset.versions[0];
    if (!latest) throw conflict('The preset has no version to copy.');
    if (!latest.publishedAt) throw conflict('Finish the current draft before creating another version.');
    const version = await prisma.catalogPresetVersion.create({
      data: {
        presetId,
        version: latest.version + 1,
        summary: body.summary ?? latest.summary,
        notes: body.notes ?? latest.notes,
        recommendedRamMb: body.recommendedRamMb === undefined ? latest.recommendedRamMb : body.recommendedRamMb,
        recommendedCpu: body.recommendedCpu === undefined ? latest.recommendedCpu : body.recommendedCpu,
        recommendedDiskGb: body.recommendedDiskGb === undefined ? latest.recommendedDiskGb : body.recommendedDiskGb,
        plugins: body.plugins === undefined ? latest.plugins : body.plugins,
      },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.preset.version.created', targetType: 'catalog_preset_version', targetId: version.id, meta: { presetId, version: version.version }, ip: request.ip });
    return reply.code(201).send({ version: viewVersion(version), note: STRUCTURE_NOTE });
  });

  app.post('/admin/catalog/families/:id/addons', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        slug,
        name: label,
        summary,
        kind: z.enum(['SOFTWARE', 'MANAGED_SERVICE', 'PLATFORM_FEATURE']),
        productOptionId: z.string().min(1).nullable().default(null),
        productId: z.string().min(1).nullable().default(null),
        variantIds: variantIds.default([]),
        active: z.boolean().default(false),
      })
      .strict()
      .parse(request.body);
    const family = await prisma.catalogFamily.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!family) throw notFound('Catalogue family not found.');
    assertAddonShape(body.kind as CatalogAddonKind, body.productId, body.productOptionId);
    assertActiveHasVariants(body.active, body.variantIds);
    await variantsOf(id, body.variantIds);
    if (await prisma.catalogAddonDefinition.findUnique({ where: { familyId_slug: { familyId: id, slug: body.slug } } })) throw conflict('An add-on with this slug already exists in the family.');
    if (body.productOptionId) {
      if (!(await prisma.productOption.findUnique({ where: { id: body.productOptionId }, select: { id: true } }))) throw notFound('Priced add-on not found.');
      if (await prisma.catalogAddonDefinition.findUnique({ where: { productOptionId: body.productOptionId } })) throw conflict('That priced add-on is already linked.');
    }
    if (body.productId && !(await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } }))) throw notFound('Product not found.');
    const addon = await prisma.catalogAddonDefinition.create({
      data: {
        familyId: id,
        slug: body.slug,
        name: body.name,
        summary: body.summary,
        kind: body.kind as CatalogAddonKind,
        productOptionId: body.productOptionId,
        productId: body.productId,
        active: body.active,
        compatibilities: { create: body.variantIds.map((variantId) => ({ variantId })) },
      },
      select: { id: true, slug: true, kind: true, version: true, active: true },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.addon.created', targetType: 'catalog_addon', targetId: addon.id, meta: { family: family.slug, slug: addon.slug, kind: addon.kind, version: addon.version }, ip: request.ip });
    return reply.code(201).send({ addon, note: STRUCTURE_NOTE });
  });

  app.patch('/admin/catalog/addons/:addonId', { ...limited, preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { addonId } = z.object({ addonId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        name: label,
        summary,
        active: z.boolean(),
        variantIds,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict()
      .parse(request.body);
    if (body.expectedVersion === undefined) throw badRequest('Send the version you read.');
    const before = await prisma.catalogAddonDefinition.findUnique({ where: { id: addonId }, include: { compatibilities: { select: { variantId: true } } } });
    if (!before) throw notFound('Catalogue add-on not found.');
    if (before.version !== body.expectedVersion) throw conflict('This add-on changed. Reload it and try again.');
    const nextVariants = body.variantIds ?? before.compatibilities.map((row) => row.variantId);
    const nextActive = body.active ?? before.active;
    assertActiveHasVariants(nextActive, nextVariants);
    await variantsOf(before.familyId, nextVariants);
    const data: Prisma.CatalogAddonDefinitionUpdateInput = { version: { increment: 1 } };
    if (body.name !== undefined) data.name = body.name;
    if (body.summary !== undefined) data.summary = body.summary;
    if (body.active !== undefined) data.active = body.active;
    const addon = await prisma.$transaction(async (tx) => {
      const updated = await tx.catalogAddonDefinition.update({ where: { id: addonId }, data, select: { id: true, slug: true, name: true, summary: true, kind: true, version: true, active: true } });
      if (body.variantIds) {
        await tx.catalogAddonCompatibility.deleteMany({ where: { addonId } });
        if (body.variantIds.length) await tx.catalogAddonCompatibility.createMany({ data: body.variantIds.map((variantId) => ({ addonId, variantId })) });
      }
      return updated;
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'catalog.addon.updated', targetType: 'catalog_addon', targetId: addonId, meta: { slug: before.slug, fromVersion: before.version, version: addon.version }, ip: request.ip });
    return { addon, note: STRUCTURE_NOTE };
  });
}
