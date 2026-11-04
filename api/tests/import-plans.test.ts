import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * Smart Deploy must price a stored Git import without asking for GIT_ADDRESS again,
 * even when the product row in the database still marks it required.
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

async function seedImportProducts() {
  const node = await prisma.product.create({
    data: {
      slug: 'nodejs',
      name: 'Node.js',
      category: 'DEVELOPER_TOOLS',
      description: 'Node for import test.',
      icon: 'code',
      minRam: 512,
      defaultRam: 1024,
      minCpu: 1,
      defaultCpu: 1,
      minDisk: 5,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 50,
      visible: true,
      deployable: true,
      eggId: 1,
      customerVariables: {
        GIT_ADDRESS: { required: true, label: 'Repository of the service', type: 'text' },
        BRANCH: { label: 'Branch', type: 'text' },
      } as never,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR', active: true } },
    },
  });
  await prisma.product.create({
    data: {
      slug: 'mariadb',
      name: 'MariaDB',
      category: 'DATABASES',
      description: 'MariaDB for import test.',
      icon: 'db',
      minRam: 1024,
      defaultRam: 2048,
      minCpu: 1,
      defaultCpu: 1,
      minDisk: 10,
      defaultDisk: 20,
      maxRam: 16384,
      maxCpu: 4,
      maxDisk: 200,
      visible: true,
      deployable: true,
      eggId: 2,
      prices: { create: { period: 'MONTHLY', baseAmount: 449, currency: 'EUR', active: true } },
    },
  });
  return node;
}

describe('POST /catalog/import/plans', () => {
  it('prices daily81 without GIT_ADDRESS and detects MySQL, not PostgreSQL', async () => {
    await seedImportProducts();
    const { client } = await registerAndLogin(app, 'daily81-import@test.com');

    const inspect = await client.request('POST', '/api/catalog/import/inspect', {
      url: 'https://github.com/trencito42/daily81',
    });
    expect(inspect.status).toBe(200);
    const proposal = inspect.body.proposal as {
      productSlug: string;
      build: string | null;
      start: string | null;
      files: string[];
      services: { slug: string }[];
    };
    expect(proposal.productSlug).toBe('nodejs');
    expect(proposal.files).toContain('prisma/schema.prisma');
    expect(proposal.services.map((service) => service.slug)).toEqual(['attached_mysql']);
    expect(proposal.build).toContain('npm run build');
    expect(proposal.start).toContain('$SERVER_PORT');
    expect(proposal.start).not.toContain('3007');

    const plan = await client.request('POST', '/api/catalog/import/plans', {
      url: 'https://github.com/trencito42/daily81',
    });
    expect(plan.status).toBe(200);
    expect(plan.body.plan.confirmed).toEqual(['attached_mysql']);
    expect(plan.body.plan.companions).toEqual([]);
    expect(plan.body.plan.continueTo).toMatch(/^\/app\/deploy\/nodejs\?import=/);
    expect(plan.body.plan.total).toBeGreaterThan(0);
  }, 60_000);
});
