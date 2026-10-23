import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The availability of a product.
 *
 * A row in the catalog does not make a product orderable. The panel has to be
 * able to build the product, which needs its egg mapping, otherwise the
 * deployment fails at the step "server_created" and the customer paid for
 * nothing.
 *
 * The same answer has to come from the catalog, from the quote and from the
 * order, and it has to be enforced on the server.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

interface SeedInput {
  slug: string;
  deployable?: boolean;
  eggId?: number | null;
  visible?: boolean;
  amount?: number;
  minRam?: number;
  defaultRam?: number;
  minDisk?: number;
  defaultDisk?: number;
}

async function seedProduct(input: SeedInput) {
  return prisma.product.create({
    data: {
      slug: input.slug,
      name: input.slug,
      category: 'BOTS',
      description: 'A product used by the availability test.',
      icon: 'bot',
      minRam: input.minRam ?? 512,
      minCpu: 1,
      minDisk: input.minDisk ?? 5,
      defaultRam: input.defaultRam ?? 512,
      defaultCpu: 1,
      defaultDisk: input.defaultDisk ?? 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      visible: input.visible ?? true,
      deployable: input.deployable ?? true,
      eggId: input.eggId === undefined ? 1 : input.eggId,
      prices: {
        create: { period: 'MONTHLY', baseAmount: input.amount ?? 149, currency: 'EUR', active: true },
      },
    } as never,
  });
}

describe('the availability of a product', () => {
  it('has one state, the same everywhere', async () => {
    await seedProduct({ slug: 'discord-bot', deployable: true, eggId: 7 });
    await seedProduct({ slug: 'wordpress', deployable: true, eggId: null });
    await seedProduct({ slug: 'uptime-kuma', deployable: false, eggId: 7 });
    await seedProduct({ slug: 'postgresql', deployable: false, eggId: null, visible: false });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');
    const bySlug = Object.fromEntries(
      response.body.products.map(
        (product: { slug: string; availability: { state: string; orderable: boolean } }) => [
          product.slug,
          product.availability,
        ],
      ),
    );

    // Published and deployable.
    expect(bySlug['discord-bot'].state).toBe('DEPLOYABLE');
    expect(bySlug['discord-bot'].orderable).toBe(true);
    // Published and meant to be sold, but the panel cannot build it.
    expect(bySlug['wordpress'].state).toBe('TEMPORARILY_UNAVAILABLE');
    expect(bySlug['wordpress'].orderable).toBe(false);
    // Published, but the operator has not validated it yet.
    expect(bySlug['uptime-kuma'].state).toBe('COMING_SOON');
    expect(bySlug['uptime-kuma'].orderable).toBe(false);
    // A hidden product is not in the public list at all.
    expect(bySlug['postgresql']).toBeUndefined();

    // The staff sees it, with the state that says it is not published.
    const admin = await createAdmin(app);
    const staffView = await admin.client.request('GET', '/api/catalog/products?includeHidden=true');
    const staffBySlug = Object.fromEntries(
      staffView.body.products.map(
        (product: { slug: string; availability: { state: string; orderable: boolean } }) => [
          product.slug,
          product.availability,
        ],
      ),
    );
    expect(staffBySlug['postgresql'].state).toBe('UNPUBLISHED');
    expect(staffBySlug['postgresql'].orderable).toBe(false);
  });

  it('is orderable when the operator allows it and the panel can build it', async () => {
    await seedProduct({ slug: 'discord-bot', deployable: true, eggId: 7 });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    const product = response.body.products[0];
    expect(product.availability.orderable).toBe(true);
    expect(product.availability.state).toBe('DEPLOYABLE');
    expect(product.availability.enabled).toBe(true);
    expect(product.availability.installable).toBe(true);
    expect(product.availability.visible).toBe(true);
    expect(product.availability.blockers).toEqual([]);
  });

  it('is not orderable when the panel cannot build the product', async () => {
    // The flag of the catalog says yes, but there is no egg mapping, so the
    // deployment would fail at the step "server_created".
    await seedProduct({ slug: 'wordpress', deployable: true, eggId: null });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    const product = response.body.products[0];
    expect(product.availability.orderable).toBe(false);
    expect(product.availability.state).toBe('TEMPORARILY_UNAVAILABLE');
    expect(product.availability.enabled).toBe(true);
    expect(product.availability.installable).toBe(false);
    expect(product.availability.blockers.join(' ')).toContain('not installed');
  });

  it('is not orderable when the operator has not allowed it', async () => {
    await seedProduct({ slug: 'uptime-kuma', deployable: false, eggId: 7 });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    const product = response.body.products[0];
    expect(product.availability.orderable).toBe(false);
    expect(product.availability.state).toBe('COMING_SOON');
    expect(product.availability.blockers.join(' ')).toContain('validated');
  });

  it('refuses to price a product the panel cannot build', async () => {
    await seedProduct({ slug: 'wordpress', deployable: true, eggId: null });

    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5, optionCodes: [] }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('not available to order');
  });

  it('refuses to create an order for a product the panel cannot build', async () => {
    await seedProduct({ slug: 'wordpress', deployable: true, eggId: null });

    const { client } = await registerAndLogin(app, 'buyer@example.com');
    const response = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', name: 'wordpress', ram: 512, cpu: 1, disk: 5, optionCodes: [] }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('not available to order');
    expect(await prisma.order.count()).toBe(0);
  });

  it('prices a product the panel can build', async () => {
    await seedProduct({ slug: 'discord-bot', deployable: true, eggId: 7, amount: 149 });

    const client = makeClient(app);
    const response = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5, optionCodes: [] }],
    });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(149);
  });
});

describe('the staff area', () => {
  it('shows why a product cannot be ordered', async () => {
    await seedProduct({ slug: 'wordpress', deployable: true, eggId: null });

    const { client } = await createAdmin(app);
    const response = await client.request('GET', '/api/admin/products');

    expect(response.status).toBe(200);
    const product = response.body.products[0];
    expect(product.availability.orderable).toBe(false);
    expect(product.availability.blockers.length).toBeGreaterThan(0);
  });

  it('refuses to open a product for ordering that the panel cannot build', async () => {
    const product = await seedProduct({ slug: 'wordpress', deployable: false, eggId: null });

    const { client } = await createAdmin(app);
    const response = await client.request('PATCH', `/api/admin/products/${product.id}`, { deployable: true });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('egg');

    const stored = await prisma.product.findUnique({ where: { id: product.id } });
    expect(stored?.deployable).toBe(false);
  });

  it('opens a product for ordering when the panel can build it', async () => {
    const product = await seedProduct({ slug: 'discord-bot', deployable: false, eggId: 7 });

    const { client } = await createAdmin(app);
    const response = await client.request('PATCH', `/api/admin/products/${product.id}`, { deployable: true });

    expect(response.status).toBe(200);

    const stored = await prisma.product.findUnique({ where: { id: product.id } });
    expect(stored?.deployable).toBe(true);
  });
});
