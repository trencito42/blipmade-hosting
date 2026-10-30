import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { nodeCpuCapacity } from '../src/services/capacity.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

describe('CPU capacity while cancellation is pending deprovisioning', () => {
  it('does not resell CPU still allocated to a cancelled service', async () => {
    const { userId } = await registerAndLogin(app, 'reserved-cpu@example.com');
    const product = await prisma.product.create({
      data: {
        slug: 'reserved-cpu-test',
        name: 'Reserved CPU test',
        category: 'BOTS',
        description: 'An allocation that has not yet been deleted from the node.',
        icon: 'cpu',
        minRam: 512,
        minCpu: 1,
        minDisk: 5,
        deployable: true,
        eggId: 1,
      },
    });
    await prisma.instance.create({
      data: {
        userId,
        productId: product.id,
        name: 'Awaiting paid-period end',
        status: 'CANCELLED',
        ram: 1024,
        cpu: 4,
        disk: 10,
        price: 374,
        currency: 'EUR',
        pterodactylNodeId: 19,
        pterodactylServerId: 400,
      },
    });

    const capacity = await nodeCpuCapacity(19);
    expect(capacity.allocatedVcpu).toBe(4);
    expect(capacity.freeVcpu).toBe(capacity.sellableVcpu - 4);
    expect((await nodeCpuCapacity(20)).allocatedVcpu).toBe(0);
  });
});
