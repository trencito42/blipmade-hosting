import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The public catalog is what the homepage shows. It may only offer products
 * that are listed and that carry an active price, it has to say whether a
 * product can be deployed, and every amount it returns is an integer number
 * of cents.
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
  name?: string;
  visible?: boolean;
  deployable?: boolean;
  /** The egg of the panel. Without it the panel cannot build the product. */
  eggId?: number | null;
  /** The monthly price in cents. `null` creates the product without a price. */
  amount?: number | null;
  /** A price can exist and still be inactive. */
  active?: boolean;
}

async function seedProduct(input: SeedInput) {
  const { slug, name, visible, deployable, eggId, amount, active } = input;
  return prisma.product.create({
    data: {
      slug,
      name: name ?? slug,
      category: 'BOTS',
      description: 'A product used by the catalog test.',
      icon: 'bot',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 512,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      visible: visible ?? true,
      deployable: deployable ?? true,
      eggId: eggId === undefined ? 1 : eggId,
      ...(amount === null
        ? {}
        : {
            prices: {
              create: {
                period: 'MONTHLY',
                baseAmount: amount ?? 749,
                currency: 'EUR',
                active: active ?? true,
              },
            },
          }),
    } as never,
  });
}

const slugs = (body: { products: { slug: string }[] }) => body.products.map((product) => product.slug);

describe('public catalog', () => {
  it('leaves out a product that is not visible', async () => {
    await seedProduct({ slug: 'discord-bot', amount: 749 });
    await seedProduct({ slug: 'secret-bot', amount: 749, visible: false });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    expect(slugs(response.body)).toEqual(['discord-bot']);
  });

  it('leaves out a product without an active price', async () => {
    await seedProduct({ slug: 'discord-bot', amount: 749 });
    await seedProduct({ slug: 'unpriced-bot', amount: null });
    await seedProduct({ slug: 'inactive-price-bot', amount: 999, active: false });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    expect(slugs(response.body)).toEqual(['discord-bot']);
    for (const product of response.body.products) {
      expect(product.price).not.toBeNull();
    }
  });

  it('reports whether a product can be deployed', async () => {
    await seedProduct({ slug: 'discord-bot', deployable: true, eggId: 4, amount: 749 });
    await seedProduct({ slug: 'wordpress', deployable: false, eggId: 4, amount: 149 });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    const bySlug = Object.fromEntries(response.body.products.map((product: { slug: string }) => [product.slug, product]));
    expect(bySlug['discord-bot'].deployable).toBe(true);
    expect(bySlug['wordpress'].deployable).toBe(false);
    // The availability is the answer that counts, and it is derived from the
    // product: a product the panel cannot build is not orderable.
    expect(bySlug['discord-bot'].availability.orderable).toBe(true);
    expect(bySlug['wordpress'].availability.orderable).toBe(false);
  });

  it('is not orderable when the panel cannot build the product', async () => {
    // The flag says yes, but there is no egg mapping, so the deployment would
    // fail at the step "server_created".
    await seedProduct({ slug: 'wordpress', deployable: true, eggId: null, amount: 149 });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    const product = response.body.products[0];
    expect(product.deployable).toBe(true);
    expect(product.availability.orderable).toBe(false);
    expect(product.availability.installable).toBe(false);
    expect(product.availability.blockers.length).toBeGreaterThan(0);
  });

  it('returns every amount as an integer number of cents', async () => {
    await seedProduct({ slug: 'discord-bot', amount: 749 });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products');

    expect(response.status).toBe(200);
    const product = response.body.products[0];
    expect(product.price.amount).toBe(749);
    expect(product.price.currency).toBe('EUR');
    expect(product.price.period).toBe('MONTHLY');
    expect(Number.isInteger(product.price.amount)).toBe(true);
  });

  it('serves the same list to a signed in customer as to a visitor', async () => {
    await seedProduct({ slug: 'discord-bot', amount: 749 });
    await seedProduct({ slug: 'wordpress', deployable: false, amount: 149 });

    const visitor = makeClient(app);
    const anonymous = await visitor.request('GET', '/api/catalog/products');

    const { client: customer } = await registerAndLogin(app, 'catalog@example.com');
    const signedIn = await customer.request('GET', '/api/catalog/products');

    expect(anonymous.status).toBe(200);
    expect(signedIn.status).toBe(200);
    expect(slugs(signedIn.body)).toEqual(slugs(anonymous.body));
  });
});

describe('staff catalog', () => {
  it('shows a product without a price as a null price', async () => {
    await seedProduct({ slug: 'discord-bot', amount: 749 });
    await seedProduct({ slug: 'draft-bot', amount: null, visible: false });

    const { client } = await createAdmin(app);
    const response = await client.request('GET', '/api/catalog/products?includeHidden=true');

    expect(response.status).toBe(200);
    const draft = response.body.products.find((product: { slug: string }) => product.slug === 'draft-bot');
    expect(draft).toBeDefined();
    expect(draft.price).toBeNull();
  });
});

describe('a single product', () => {
  it('does not expose a hidden product to the public', async () => {
    await seedProduct({ slug: 'secret-bot', amount: 749, visible: false });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/secret-bot');

    expect(response.status).toBe(404);
  });

  it('returns a listed product with its price', async () => {
    await seedProduct({ slug: 'discord-bot', amount: 749 });

    const client = makeClient(app);
    const response = await client.request('GET', '/api/catalog/products/discord-bot');

    expect(response.status).toBe(200);
    expect(response.body.product.slug).toBe('discord-bot');
    expect(response.body.product.price.amount).toBe(749);
    expect(Number.isInteger(response.body.product.price.amount)).toBe(true);
  });
});
