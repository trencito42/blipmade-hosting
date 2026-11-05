import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { buildQuote } from '../src/services/pricing.js';
import { resetDatabase } from './helpers.js';

describe('order import source persistence', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('carries importSourceId and managedImport through buildQuote', async () => {
    await prisma.product.create({
      data: {
        slug: 'nodejs',
        name: 'Node.js',
        category: 'DEVELOPER_TOOLS',
        description: 'A runtime used by the import quote test.',
        icon: 'cpu',
        minRam: 512,
        minCpu: 1,
        minDisk: 5,
        deployable: true,
        eggId: 1,
        prices: { create: { period: 'MONTHLY', baseAmount: 100, ramPerGb: 50, cpuPerUnit: 50, diskPerGb: 10, currency: 'EUR' } },
      },
    });
    const quote = await buildQuote([
      {
        productSlug: 'nodejs',
        ram: 2048,
        cpu: 1,
        disk: 10,
        importSourceId: 'cmw1test0001import0001',
        managedImport: true,
      },
    ]);
    expect(quote.items[0]?.importSourceId).toBe('cmw1test0001import0001');
    expect(quote.items[0]?.managedImport).toBe(true);
  });
});
