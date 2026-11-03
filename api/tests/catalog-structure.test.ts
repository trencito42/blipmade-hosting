import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;
let seq = 0;

async function reader() {
  seq += 1;
  const user = await prisma.user.create({
    data: { email: `cat${seq}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'C', lastName: 'A', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions: ['products.read'] } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
}

async function writer() {
  seq += 1;
  const user = await prisma.user.create({
    data: { email: `catw${seq}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'C', lastName: 'W', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions: ['products.read', 'products.write'] } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
}

async function product(slug: string, extra: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      slug,
      name: slug,
      category: 'GAMES',
      description: 'A catalogue product used by the structure tests.',
      icon: 'box',
      eggId: 56,
      visible: true,
      deployable: true,
      prices: { create: { period: 'MONTHLY', baseAmount: 500, currency: 'EUR' } },
      ...extra,
    } as never,
  });
}

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
});

describe('catalogue families', () => {
  it('publishes a prepared family beside the existing product catalogue', async () => {
    const paper = await product('minecraft-paper');
    const client = await writer();
    const created = await client.request('POST', '/api/admin/catalog/families', {
      slug: 'minecraft',
      name: 'Minecraft',
      summary: 'One family for the Minecraft runtimes.',
      group: 'games',
    });
    const familyId = created.body.family.id as string;
    expect((await client.request('GET', '/api/catalog/families')).body.families).toEqual([]);
    await client.request('POST', `/api/admin/catalog/families/${familyId}/variants`, { productId: paper.id, slug: 'paper', label: 'Paper', active: true });
    await client.request('PATCH', `/api/admin/catalog/families/${familyId}`, { prepared: true });
    const listed = await client.request('GET', '/api/catalog/families');
    expect(listed.status).toBe(200);
    expect(listed.body.families).toHaveLength(1);
    expect(listed.body.families[0].variants[0].product.slug).toBe('minecraft-paper');
    const products = await client.request('GET', '/api/catalog/products');
    expect(products.body.families).toBeUndefined();
    expect(products.body.products.map((row: { slug: string }) => row.slug)).toContain('minecraft-paper');
    expect(await prisma.product.findUniqueOrThrow({ where: { id: paper.id } })).toMatchObject({ visible: true, deployable: true });
  });

  it('refuses a writer without products.write and leaves the public catalogue unchanged', async () => {
    const paper = await product('minecraft-paper');
    const read = await reader();
    const denied = await read.request('POST', '/api/admin/catalog/families', {
      slug: 'minecraft',
      name: 'Minecraft',
      summary: 'One family for the Minecraft runtimes.',
      group: 'games',
    });
    expect(denied.status).toBe(403);
    const client = await writer();
    const created = await client.request('POST', '/api/admin/catalog/families', {
      slug: 'minecraft',
      name: 'Minecraft',
      summary: 'One family for the Minecraft runtimes.',
      group: 'games',
      prepared: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.note).toMatch(/public catalogue/i);
    const variant = await client.request('POST', `/api/admin/catalog/families/${created.body.family.id}/variants`, {
      productId: paper.id,
      slug: 'paper',
      label: 'Paper',
    });
    expect(variant.status).toBe(201);
    const again = await client.request('POST', `/api/admin/catalog/families/${created.body.family.id}/variants`, {
      productId: paper.id,
      slug: 'paper-again',
      label: 'Paper again',
    });
    expect(again.status).toBe(409);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: paper.id } });
    expect(stored).toMatchObject({ visible: true, deployable: true, slug: 'minecraft-paper' });
    const publicCatalog = await client.request('GET', '/api/catalog/products');
    expect(publicCatalog.status).toBe(200);
    expect(publicCatalog.body.families).toBeUndefined();
    expect(publicCatalog.body.products.map((row: { slug: string }) => row.slug)).toContain('minecraft-paper');
    expect(JSON.stringify(publicCatalog.body)).not.toContain('CatalogFamily');
  });

  it('keeps published preset text immutable and separates the three add-on kinds', async () => {
    const client = await writer();
    const paper = await product('minecraft-paper');
    const postgres = await product('postgresql', { category: 'DATABASES' });
    const option = await prisma.productOption.create({ data: { code: 'dedicated-ip', name: 'Dedicated IP', amount: 300, currency: 'EUR' } });
    const family = await client.request('POST', '/api/admin/catalog/families', {
      slug: 'minecraft',
      name: 'Minecraft',
      summary: 'One family for the Minecraft runtimes.',
      group: 'games',
    });
    const familyId = family.body.family.id as string;
    const variant = await client.request('POST', `/api/admin/catalog/families/${familyId}/variants`, { productId: paper.id, slug: 'paper', label: 'Paper', active: true });
    const preset = await client.request('POST', `/api/admin/catalog/families/${familyId}/presets`, {
      slug: 'survival',
      name: 'Survival',
      variantId: variant.body.variant.id,
      summary: 'A quiet survival world.',
      notes: 'Paper only.',
      recommendedRamMb: 4096,
    });
    expect(preset.status).toBe(201);
    const versionId = preset.body.preset.versions[0].id as string;
    const published = await client.request('POST', `/api/admin/catalog/preset-versions/${versionId}/publish`, {});
    expect(published.status).toBe(200);
    const edited = await client.request('PATCH', `/api/admin/catalog/preset-versions/${versionId}`, { summary: 'Changed after publish.' });
    expect(edited.status).toBe(409);
    const next = await client.request('POST', `/api/admin/catalog/presets/${preset.body.preset.id}/versions`, { summary: 'A newer survival world.' });
    expect(next.status).toBe(201);
    expect(next.body.version.version).toBe(2);
    expect(next.body.version.publishedAt).toBeNull();

    const software = await client.request('POST', `/api/admin/catalog/families/${familyId}/addons`, {
      slug: 'spark',
      name: 'Spark',
      summary: 'A profiler plugin.',
      kind: 'SOFTWARE',
      productId: postgres.id,
      variantIds: [variant.body.variant.id],
    });
    expect(software.status).toBe(400);
    const feature = await client.request('POST', `/api/admin/catalog/families/${familyId}/addons`, {
      slug: 'dedicated-ip',
      name: 'Dedicated IP',
      summary: 'The priced platform address.',
      kind: 'PLATFORM_FEATURE',
      productOptionId: option.id,
      variantIds: [variant.body.variant.id],
    });
    expect(feature.status).toBe(201);
    expect(await prisma.productOption.findUniqueOrThrow({ where: { id: option.id } })).toMatchObject({ amount: 300 });
    const managed = await client.request('POST', `/api/admin/catalog/families/${familyId}/addons`, {
      slug: 'postgres',
      name: 'PostgreSQL',
      summary: 'A dedicated database beside the server.',
      kind: 'MANAGED_SERVICE',
      productId: postgres.id,
      variantIds: [variant.body.variant.id],
      active: true,
    });
    expect(managed.status).toBe(201);
    const foreign = await prisma.catalogFamily.create({ data: { slug: 'other', name: 'Other', summary: 'Another family.', group: 'games' } });
    const foreignVariant = await prisma.catalogVariant.create({ data: { familyId: foreign.id, productId: postgres.id, slug: 'postgres', label: 'PostgreSQL' } });
    const moved = await client.request('PATCH', `/api/admin/catalog/addons/${managed.body.addon.id}`, {
      expectedVersion: 1,
      variantIds: [foreignVariant.id],
    });
    expect(moved.status).toBe(400);
    const bumped = await client.request('PATCH', `/api/admin/catalog/addons/${feature.body.addon.id}`, { expectedVersion: 1, name: 'Dedicated IPv4' });
    expect(bumped.status).toBe(200);
    expect(bumped.body.addon.version).toBe(2);
  });
});
