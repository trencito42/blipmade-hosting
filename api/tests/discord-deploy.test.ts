import { crc32 } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

let app: FastifyInstance;

async function sellable(slug: string) {
  return prisma.product.create({
    data: {
      slug,
      name: slug,
      category: 'DEVELOPER_TOOLS',
      description: 'A runtime used by the deploy test.',
      icon: 'bot',
      eggId: 1,
      visible: true,
      deployable: true,
      minRam: 512,
      maxRam: 8192,
      defaultRam: 1024,
      minCpu: 1,
      maxCpu: 4,
      defaultCpu: 1,
      minDisk: 5,
      maxDisk: 50,
      defaultDisk: 10,
      prices: { create: { period: 'MONTHLY', baseAmount: 100, ramPerGb: 50, cpuPerUnit: 50, diskPerGb: 10, currency: 'EUR', active: true } },
    },
  });
}

async function discordFamily(productId: string) {
  const family = await prisma.catalogFamily.create({
    data: { slug: 'discord-bot', name: 'Discord Bot', summary: 'Bots', group: 'discord-bots', prepared: true },
  });
  const variant = await prisma.catalogVariant.create({
    data: { familyId: family.id, productId, slug: 'discord-bot', label: 'Discord Bot', active: true },
  });
  for (const slug of ['blank', 'git', 'zip'] as const) {
    const preset = await prisma.catalogPreset.create({
      data: { familyId: family.id, variantId: variant.id, slug, name: slug },
    });
    await prisma.catalogPresetVersion.create({
      data: { presetId: preset.id, version: 1, summary: slug, publishedAt: new Date() },
    });
  }
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

function storedZip(name: string, text: string): string {
  const data = Buffer.from(text);
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30 + nameBuf.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc >>> 0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(local, 30);
  data.copy(local, 30 + nameBuf.length);
  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc >>> 0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  nameBuf.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]).toString('base64');
}

describe('a Discord bot ordered from its family', () => {
  it('stores a blank preset and refuses Git until a matching repository is attached', async () => {
    const product = await sellable('discord-bot');
    await sellable('nodejs');
    await discordFamily(product.id);
    const { client, userId } = await registerAndLogin(app, 'bot@blipmade.test');
    const catalog = { familySlug: 'discord-bot', variantSlug: 'discord-bot', addonSlugs: [] as string[] };
    const resources = { ram: 1024, cpu: 1, disk: 10, optionCodes: [] as string[] };

    const blank = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'discord-bot', name: 'blank-bot', ...resources, catalog: { ...catalog, presetSlug: 'blank', presetVersion: 1 } }],
    });
    expect(blank.status).toBe(201);
    const blankConfig = blank.body.order.items[0].config as { catalog: { preset: { slug: string } }; importSourceId?: string };
    expect(blankConfig.catalog.preset.slug).toBe('blank');
    expect(blankConfig.importSourceId).toBeUndefined();

    const missing = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'discord-bot', name: 'git-bot', ...resources, catalog: { ...catalog, presetSlug: 'git', presetVersion: 1 } }],
    });
    expect(missing.status).toBe(400);

    const source = await prisma.importSource.create({
      data: { userId, productSlug: 'discord-bot', kind: 'git', repoUrl: 'https://github.com/example/bot', buildCommand: 'npm install', startCommand: 'node index.js' },
    });
    const zip = await prisma.importSource.create({
      data: { userId, productSlug: 'discord-bot', kind: 'zip', buildCommand: 'npm install', startCommand: 'node index.js' },
    });
    const wrongKind = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'discord-bot', name: 'zip-as-git', ...resources, importSourceId: zip.id, catalog: { ...catalog, presetSlug: 'git', presetVersion: 1 } }],
    });
    expect(wrongKind.status).toBe(400);

    const git = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'discord-bot', name: 'git-bot', ...resources, importSourceId: source.id, catalog: { ...catalog, presetSlug: 'git', presetVersion: 1 } }],
    });
    expect(git.status).toBe(201);
    const gitConfig = git.body.order.items[0].config as { catalog: { preset: { slug: string } }; importSourceId: string };
    expect(gitConfig.catalog.preset.slug).toBe('git');
    expect(gitConfig.importSourceId).toBe(source.id);

    const node = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'nodejs', name: 'plain-node', ...resources }],
    });
    expect(node.status).toBe(201);
    expect((node.body.order.items[0].config as { catalog?: unknown }).catalog).toBeUndefined();
  });

  it('keeps a Node.js archive on Discord Bot when that product was chosen, and does not move an existing order', async () => {
    const bot = await sellable('discord-bot');
    await sellable('nodejs');
    await discordFamily(bot.id);
    const { client } = await registerAndLogin(app, 'archive@blipmade.test');
    const zipBase64 = storedZip('package.json', JSON.stringify({ scripts: { start: 'node index.js' } }));
    const resources = { ram: 1024, cpu: 1, disk: 10, optionCodes: [] as string[] };
    const catalog = { familySlug: 'discord-bot', variantSlug: 'discord-bot', presetSlug: 'zip', presetVersion: 1, addonSlugs: [] as string[] };

    const chosen = await client.request('POST', '/api/catalog/import/plans', { zipBase64, productSlug: 'discord-bot' });
    expect(chosen.status).toBe(200);
    expect(chosen.body.plan.productSlug).toBe('discord-bot');

    const detected = await client.request('POST', '/api/catalog/import/plans', { zipBase64 });
    expect(detected.status).toBe(200);
    expect(detected.body.plan.productSlug).toBe('nodejs');

    const python = await client.request('POST', '/api/catalog/import/plans', { zipBase64, productSlug: 'python' });
    expect(python.status).toBe(400);
    expect(String(python.body.error?.message)).toMatch(/cannot be deployed as Python/);

    const stolen = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'discord-bot', name: 'stolen', ...resources, importSourceId: detected.body.plan.id as string, catalog }],
    });
    expect(stolen.status).toBe(400);
    expect(String(stolen.body.error?.message)).toMatch(/prepared for nodejs/);
    expect(await prisma.order.count()).toBe(0);

    const ordered = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'discord-bot', name: 'chosen', ...resources, importSourceId: chosen.body.plan.id as string, catalog }],
    });
    expect(ordered.status).toBe(201);
    expect(ordered.body.order.items[0].productSlug).toBe('discord-bot');
    expect((ordered.body.order.items[0].config as { importSourceId: string }).importSourceId).toBe(chosen.body.plan.id);
  });
});
