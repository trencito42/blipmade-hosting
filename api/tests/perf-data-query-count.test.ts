import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { countedCalls, startCounting, stopCounting, totalCalls } from '../src/lib/perf-data-query-count.js';
import { reconcileInterruptedInstances } from '../src/services/provisioning.js';
import { resetDatabase } from './helpers.js';

/**
 * The number of the calls of the database that the worker makes.
 *
 * A job of the worker that is read once per row makes the cost of the run
 * grow with the number of the rows, and the worker runs every minute. The
 * counters below hold that the number of the calls does not grow.
 */

/** A product of the test, so the services have something to point at. */
async function seedProduct() {
  return prisma.product.create({
    data: {
      slug: 'query-count-product',
      name: 'Query count product',
      category: 'WEB_CMS',
      description: 'A product of the query count test.',
      icon: 'server',
    },
  });
}

describe('the calls of the database of the worker', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('writes the journal of the interrupted services in one statement, not one per service', async () => {
    const product = await seedProduct();
    const customer = await prisma.user.create({
      data: {
        email: 'query-count@perf.test',
        passwordHash: 'not-a-real-hash',
        firstName: 'Query',
        lastName: 'Count',
        role: 'CUSTOMER',
      },
    });

    // Twenty services that were left in the middle of a run.
    for (let index = 0; index < 20; index += 1) {
      await prisma.instance.create({
        data: {
          userId: customer.id,
          productId: product.id,
          name: `stuck-${index}`,
          status: 'PROVISIONING',
          ram: 1024,
          cpu: 100,
          disk: 10240,
          price: 1000,
          currency: 'EUR',
          provisionLockAt: new Date(Date.now() - 3_600_000),
        },
      });
    }

    startCounting();
    const count = await reconcileInterruptedInstances();
    stopCounting();

    expect(count).toBe(20);
    // The rows of the journal are there.
    expect(await prisma.instanceEvent.count({ where: { type: 'reconcile' } })).toBe(20);

    // The number of the calls does not grow with the number of the services:
    // one read and one write, whatever the number of the services is.
    const calls = countedCalls();
    expect(totalCalls()).toBe(2);
    expect(calls['instance.findMany']).toBe(1);
    expect(calls['instanceEvent.createMany']).toBe(1);
    expect(calls['instanceEvent.create']).toBeUndefined();
  });
});
