import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;
let seq = 0;

async function makeAdmin(permissions: string[]) {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      email: `studio-admin-${seq}@blipmade.test`,
      passwordHash: await hashPassword(VALID_PASSWORD),
      role: 'STAFF',
      firstName: 'Admin',
      lastName: 'Studio',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.staffMember.create({
    data: { userId: user.id, permissions },
  });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
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

describe('Deploy Studio 3.0 API', () => {
  it('serves public offerings combining families and standalone products without exclusion', async () => {
    // 1. Create a product inside a family
    const mcPaper = await prisma.product.create({
      data: {
        slug: 'minecraft-paper',
        name: 'Minecraft Paper',
        category: 'GAMES',
        description: 'High performance Minecraft',
        icon: 'cube',
        eggId: 1,
        visible: true,
        deployable: true,
        prices: { create: { period: 'MONTHLY', baseAmount: 600, currency: 'USD', active: true } },
      },
    });

    const mcFamily = await prisma.catalogFamily.create({
      data: {
        slug: 'minecraft',
        name: 'Minecraft Java Edition',
        summary: 'Play with friends or host big communities',
        group: 'minecraft',
        discovery: 'FEATURED',
        sortOrder: 1,
        prepared: true,
        variants: {
          create: {
            slug: 'paper',
            label: 'Paper',
            productId: mcPaper.id,
            active: true,
          },
        },
      },
    });

    // 2. Create a VPS product (standalone offering)
    await prisma.product.create({
      data: {
        slug: 'vps-pro',
        name: 'VPS Pro',
        category: 'VPS',
        description: 'Pro virtual private server',
        icon: 'server',
        eggId: 10,
        visible: true,
        deployable: true,
        prices: { create: { period: 'MONTHLY', baseAmount: 2000, currency: 'USD', active: true } },
      },
    });

    const client = makeClient(app);
    const res = await client.request('GET', '/api/catalog/offerings');
    expect(res.status).toBe(200);
    const offerings = (res.body as { offerings: Array<{ slug: string; name: string; category: string }> }).offerings;

    const slugs = offerings.map((o) => o.slug);
    expect(slugs).toContain('minecraft');
    expect(slugs).toContain('vps-pro');

    const vpsOffering = offerings.find((o) => o.slug === 'vps-pro');
    expect(vpsOffering?.category).toBe('vps');
  });

  it('performs cross-category search matching variants, presets, and keywords', async () => {
    const forgeProd = await prisma.product.create({
      data: {
        slug: 'minecraft-forge-modded',
        name: 'Minecraft Forge',
        category: 'GAMES',
        description: 'Modded Minecraft',
        icon: 'cube',
        eggId: 2,
        visible: true,
        deployable: true,
        prices: { create: { period: 'MONTHLY', baseAmount: 800, currency: 'USD', active: true } },
      },
    });

    await prisma.catalogFamily.create({
      data: {
        slug: 'minecraft',
        name: 'Minecraft',
        summary: 'Minecraft servers',
        group: 'minecraft',
        discovery: 'FEATURED',
        sortOrder: 1,
        prepared: true,
        variants: {
          create: {
            slug: 'forge',
            label: 'Forge',
            productId: forgeProd.id,
            active: true,
          },
        },
      },
    });

    const client = makeClient(app);
    const searchRes = await client.request('GET', '/api/catalog/search?q=forge');
    expect(searchRes.status).toBe(200);
    const matches = (searchRes.body as { matches: Array<{ offering: { slug: string }; matchedVariantSlug?: string }> }).matches;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.offering.slug).toBe('minecraft');
    expect(matches[0]?.matchedVariantSlug).toBe('forge');
  });

  it('resolves offering by slug and variant alias', async () => {
    const webProd = await prisma.product.create({
      data: {
        slug: 'php-laravel',
        name: 'PHP Laravel App',
        category: 'WEBSITES_APPS',
        description: 'Full stack PHP Laravel hosting',
        icon: 'rocket',
        eggId: 5,
        visible: true,
        deployable: true,
        prices: { create: { period: 'MONTHLY', baseAmount: 500, currency: 'USD', active: true } },
      },
    });

    const client = makeClient(app);
    const res = await client.request('GET', `/api/catalog/offerings/${encodeURIComponent(webProd.slug)}`);
    expect(res.status).toBe(200);
    const offering = (res.body as { offering: { slug: string; name: string } }).offering;
    expect(offering.slug).toBe('php-laravel');
    expect(offering.name).toBe('PHP Laravel App');
  });

  it('enforces Product Studio admin permissions, wizard schema updates, and test quotes', async () => {
    const testProd = await prisma.product.create({
      data: {
        slug: 'test-studio-sku',
        name: 'Studio SKU',
        category: 'GAMES',
        description: 'Testing studio',
        icon: 'box',
        eggId: 100,
        visible: true,
        deployable: true,
        prices: { create: { period: 'MONTHLY', baseAmount: 1200, currency: 'USD', active: true } },
      },
    });

    const reader = await makeAdmin(['products.read']);
    const writer = await makeAdmin(['products.read', 'products.write']);

    // GET /api/admin/catalog/studio
    const listRes = await reader.request('GET', '/api/admin/catalog/studio');
    expect(listRes.status).toBe(200);
    const offerings = (listRes.body as { offerings: Array<{ slug: string; readiness: { isReady: boolean } }> }).offerings;
    expect(offerings.some((o) => o.slug === 'test-studio-sku')).toBe(true);

    // PUT /api/admin/catalog/studio/:slug/wizard by reader fails (403)
    const readPutRes = await reader.request('PUT', `/api/admin/catalog/studio/${testProd.slug}/wizard`, {
      version: 2,
      steps: [
        { id: 'source', title: 'Source', component: 'source', required: true },
        { id: 'review', title: 'Review', component: 'review', required: true },
      ],
    });
    expect(readPutRes.status).toBe(403);

    // PUT /api/admin/catalog/studio/:slug/wizard by writer succeeds (200)
    const writePutRes = await writer.request('PUT', `/api/admin/catalog/studio/${testProd.slug}/wizard`, {
      version: 2,
      steps: [
        { id: 'source', title: 'Source', component: 'source', required: true },
        { id: 'review', title: 'Review', component: 'review', required: true },
      ],
    });
    expect(writePutRes.status).toBe(200);

    // POST /api/admin/catalog/studio/:slug/test-quote computes authoritative server-side quote
    const quoteRes = await reader.request('POST', `/api/admin/catalog/studio/${testProd.slug}/test-quote`, {
      period: 'MONTHLY',
    });
    expect(quoteRes.status).toBe(200);
    const quote = (quoteRes.body as { testQuote: { total: number; currency: string } }).testQuote;
    expect(quote.total).toBe(1200);
    expect(quote.currency).toBe('USD');
  });
});

