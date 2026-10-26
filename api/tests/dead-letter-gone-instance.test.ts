import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The failures of the instances that are gone.
 *
 * A failure of an instance that was deleted is not a failure any more: there
 * is nothing an operator could do about it, and it cannot be put back on the
 * queue either. The row is closed, so the queue of the operator holds only
 * the failures somebody can do something about.
 */
const { prisma } = await import('../src/db.js');
const { closeApp, getApp, resetDatabase } = await import('./helpers.js');
const { listDeadLetters, resolveDeadLettersOfGoneInstances } = await import('../src/services/dead-letter.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

/** A failure of the queue of the provisioning, of an instance that may be there. */
async function seedDeadLetter(instanceId: string, jobId: string): Promise<void> {
  await prisma.deadLetterJob.create({
    data: {
      id: `letter-${jobId}`,
      queue: 'blipmade.provision',
      jobId,
      name: 'provision',
      payload: { instanceId },
      error: 'the panel did not answer',
      errorClass: 'Error',
      attempts: 5,
    },
  });
}

describe('the failures of the instances that are gone', () => {
  it('closes the failure of an instance that is not there any more', async () => {
    await seedDeadLetter('instance-that-is-gone', 'provision-gone');

    const closed = await resolveDeadLettersOfGoneInstances();

    expect(closed).toBe(1);
    const { entries } = await listDeadLetters({ state: 'pending', limit: 10, cursor: null });
    expect(entries).toHaveLength(0);
    const all = await listDeadLetters({ state: 'all', limit: 10, cursor: null });
    expect(all.entries[0]?.state).toBe('resolved');
  });

  it('keeps the failure of an instance that is still there', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'dead-letter@blipmade.test',
        passwordHash: 'x',
        firstName: 'Test',
        lastName: 'Customer',
      },
    });
    const product = await prisma.product.create({
      data: {
        slug: 'dead-letter-product',
        name: 'Service',
        category: 'WEB_CMS',
        description: 'A service.',
        icon: 'globe',
      },
    });
    const instance = await prisma.instance.create({
      data: {
        userId: user.id,
        productId: product.id,
        name: 'wordpress',
        status: 'PROVISIONING',
        ram: 1024,
        cpu: 1,
        disk: 10,
        price: 149,
        currency: 'EUR',
      },
    });
    await seedDeadLetter(instance.id, 'provision-alive');

    const closed = await resolveDeadLettersOfGoneInstances();

    expect(closed).toBe(0);
    const { entries } = await listDeadLetters({ state: 'pending', limit: 10, cursor: null });
    expect(entries).toHaveLength(1);
  });
});
