import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import {
  closeDeadLetter,
  getDeadLetter,
  getDeadLetterByJob,
  listDeadLetters,
  noteJobCompleted,
  noteJobFailure,
  pendingDeadLetterCount,
  requeueDeadLetter,
} from '../src/services/dead-letter.js';
import {
  EMAIL_QUEUE,
  FAILED_JOB_RETENTION_MS,
  PROVISION_QUEUE,
  createProvisionWorker,
  getQueue,
  pruneQueueJobs,
} from '../src/services/queue.js';
import { resetDatabase } from './helpers.js';
import { hashPassword } from '../src/lib/password.js';

/**
 * The dead letter of a job that was given up on.
 *
 * The queue used to forget a failed job a few minutes after it failed, so the
 * failure left nothing behind: nothing to read and nothing to put back on the
 * queue. These tests hold the path that keeps the failure and that puts the
 * job back on the queue.
 */

/**
 * The table of the dead letters is not one of the tables that the suite
 * empties between the files, because it was added after the suite was
 * written. It is emptied here, so the files do not see the failures of the
 * others.
 */
async function clearDeadLetters(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "DeadLetterJob" CASCADE;');
}

/** The number of the rows of the table of the dead letters. */
async function deadLetterRows(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    'SELECT COUNT(*) AS "count" FROM "DeadLetterJob"',
  );
  return Number(rows[0]?.count ?? 0);
}

describe('the dead letter of a failed job', () => {
  beforeAll(async () => {
    await resetDatabase();
    await clearDeadLetters();
  });

  afterAll(async () => {
    await resetDatabase();
    await clearDeadLetters();
  });

  it('writes the failure down, so it survives the end of the job in the queue', async () => {
    await noteJobFailure(
      PROVISION_QUEUE,
      { id: 'provision-instance-1', name: 'provision', data: { instanceId: 'instance-1' }, attemptsMade: 5 },
      new Error('the panel did not answer'),
    );

    const entry = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-instance-1');
    expect(entry).not.toBeNull();
    expect(entry?.queue).toBe(PROVISION_QUEUE);
    expect(entry?.jobId).toBe('provision-instance-1');
    expect(entry?.error).toBe('the panel did not answer');
    expect(entry?.errorClass).toBe('Error');
    expect(entry?.attempts).toBe(5);
    expect(entry?.state).toBe('pending');
    // The failure is open, so it is counted as one that nobody has looked at.
    expect(await pendingDeadLetterCount()).toBe(1);
  });

  it('writes the same failure down only once', async () => {
    await clearDeadLetters();
    const job = { id: 'provision-instance-2', name: 'provision', data: { instanceId: 'instance-2' }, attemptsMade: 3 };

    await noteJobFailure(PROVISION_QUEUE, job, new Error('first'));
    await noteJobFailure(PROVISION_QUEUE, job, new Error('second'));

    expect(await deadLetterRows()).toBe(1);
    const entry = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-instance-2');
    expect(entry?.error).toBe('second');
  });

  it('never writes the body of a message into the table of the failures', async () => {
    await clearDeadLetters();
    await noteJobFailure(
      EMAIL_QUEUE,
      {
        id: 'email-abc',
        name: 'send',
        data: { key: 'invoice-paid:INV-1', kind: 'invoice-paid', to: 'customer@example.test', text: 'a secret body' },
        attemptsMade: 4,
      },
      new Error('the relay refused the message'),
    );

    const entry = await getDeadLetterByJob(EMAIL_QUEUE, 'email-abc');
    const payload = entry?.payload as { key?: string; kind?: string; to?: string; text?: string } | undefined;
    expect(payload?.key).toBe('invoice-paid:INV-1');
    expect(payload?.kind).toBe('invoice-paid');
    // The body of the message and the address of the customer stay out of the
    // table of the failures.
    expect(payload?.text).toBeUndefined();
    expect(payload?.to).toBeUndefined();
  });

  it('closes the failure of a job that worked on a later attempt', async () => {
    await clearDeadLetters();
    const job = { id: 'provision-instance-3', name: 'provision', data: { instanceId: 'instance-3' }, attemptsMade: 1 };

    await noteJobFailure(PROVISION_QUEUE, job, new Error('the panel was busy'));
    expect((await getDeadLetterByJob(PROVISION_QUEUE, 'provision-instance-3'))?.state).toBe('pending');

    await noteJobCompleted(PROVISION_QUEUE, job);
    expect((await getDeadLetterByJob(PROVISION_QUEUE, 'provision-instance-3'))?.state).toBe('resolved');
    expect(await pendingDeadLetterCount()).toBe(0);
  });

  it('closes a failure by hand and keeps the row readable', async () => {
    await clearDeadLetters();
    await noteJobFailure(
      PROVISION_QUEUE,
      { id: 'provision-instance-4', name: 'provision', data: { instanceId: 'instance-4' }, attemptsMade: 5 },
      new Error('the service was given up on'),
    );
    const entry = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-instance-4');
    expect(entry).not.toBeNull();

    const closed = await closeDeadLetter(entry!.id, { requestedBy: 'admin@blipmade.test' });
    expect(closed.state).toBe('resolved');
    // The row is kept, so the moment and the reason of the failure stay
    // readable.
    expect(closed.error).toBe('the service was given up on');
  });

  it('reads only the failures that are open', async () => {
    await clearDeadLetters();
    await noteJobFailure(
      PROVISION_QUEUE,
      { id: 'provision-open', name: 'provision', data: { instanceId: 'instance-open' }, attemptsMade: 5 },
      new Error('still broken'),
    );
    const open = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-open');
    await noteJobFailure(
      PROVISION_QUEUE,
      { id: 'provision-closed', name: 'provision', data: { instanceId: 'instance-closed' }, attemptsMade: 5 },
      new Error('solved'),
    );
    const closed = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-closed');
    await closeDeadLetter(closed!.id);

    const pending = await listDeadLetters({ state: 'pending', limit: 50, cursor: null });
    expect(pending.entries.map((entry) => entry.jobId)).toEqual(['provision-open']);

    const resolved = await listDeadLetters({ state: 'resolved', limit: 50, cursor: null });
    expect(resolved.entries.map((entry) => entry.jobId)).toEqual(['provision-closed']);

    const all = await listDeadLetters({ state: 'all', limit: 50, cursor: null });
    expect(all.entries).toHaveLength(2);
  });

  it('reads the failures in pages', async () => {
    await clearDeadLetters();
    for (let index = 0; index < 7; index += 1) {
      await noteJobFailure(
        PROVISION_QUEUE,
        { id: `provision-page-${index}`, name: 'provision', data: { instanceId: `instance-${index}` }, attemptsMade: 5 },
        new Error(`failure ${index}`),
      );
    }

    const first = await listDeadLetters({ limit: 3, cursor: null });
    expect(first.entries).toHaveLength(3);
    expect(first.total).toBe(7);
    expect(first.nextCursor).not.toBeNull();

    const second = await listDeadLetters({ limit: 3, cursor: first.nextCursor });
    expect(second.entries).toHaveLength(3);

    const third = await listDeadLetters({ limit: 3, cursor: second.nextCursor });
    expect(third.entries).toHaveLength(1);
    expect(third.nextCursor).toBeNull();

    // No row is shown twice and none is skipped.
    const ids = [...first.entries, ...second.entries, ...third.entries].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(7);
  });
});

/**
 * An instance that exists.
 *
 * A failure of an instance that is gone cannot be put back on the queue: the
 * run would fail again for ever, and the platform would keep talking about
 * a failure it cannot fix. So the test needs an instance that is there.
 */
async function seedInstance(): Promise<string> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const user = await prisma.user.create({
    data: {
      email: `dead-letter-${stamp}@example.com`,
      passwordHash: await hashPassword('CorrectHorseBattery9'),
      firstName: 'Test',
      lastName: 'Customer',
      emailVerifiedAt: new Date(),
    },
  });
  const product = await prisma.product.create({
    data: {
      slug: `dead-letter-product-${stamp}`,
      name: 'Service',
      category: 'WEB_CMS',
      description: 'A service.',
      icon: 'globe',
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 1000, currency: 'EUR' } },
    },
  });
  const instance = await prisma.instance.create({
    data: {
      userId: user.id,
      productId: product.id,
      name: 'dead letter instance',
      status: 'FAILED',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 1000,
      currency: 'EUR',
    },
  });
  return instance.id;
}

describe('putting a failed job back on the queue', () => {
  beforeAll(async () => {
    await resetDatabase();
    await clearDeadLetters();
  });

  afterAll(async () => {
    await resetDatabase();
    await clearDeadLetters();
    await getQueue().obliterate({ force: true }).catch(() => undefined);
  });

  it('puts the job back on the queue and is safe to run twice', async () => {
    const instanceId = await seedInstance();
    await noteJobFailure(
      PROVISION_QUEUE,
      { id: `provision-${instanceId}`, name: 'provision', data: { instanceId }, attemptsMade: 5 },
      new Error('the panel did not answer'),
    );
    const entry = await getDeadLetterByJob(PROVISION_QUEUE, `provision-${instanceId}`);
    expect(entry).not.toBeNull();

    const first = await requeueDeadLetter(entry!.id, { requestedBy: 'admin@blipmade.test' });
    expect(first.status).toBe('requeued');

    // The job is on the queue under the name it had.
    const job = await getQueue().getJob(`provision-${instanceId}`);
    expect(job).not.toBeNull();
    expect(job?.data.instanceId).toBe(instanceId);

    // The second run does not put the job on the queue a second time. The
    // queue is shared, so the jobs of this instance are counted and not the
    // jobs of the queue.
    const second = await requeueDeadLetter(entry!.id, { requestedBy: 'admin@blipmade.test' });
    expect(second.status).toBe('already-handled');

    const jobs = await getQueue().getJobs(['waiting', 'active', 'delayed'], 0, 200, true);
    const ofThisInstance = jobs.filter((candidate) => candidate.data?.instanceId === instanceId);
    expect(ofThisInstance).toHaveLength(1);
  });

  it('does not lose the failure when the job cannot be put back on the queue', async () => {
    await clearDeadLetters();
    // A failure whose payload names no instance cannot be put back on the
    // queue of the provisioning.
    await noteJobFailure(
      PROVISION_QUEUE,
      { id: 'provision-without-instance', name: 'provision', data: {}, attemptsMade: 5 },
      new Error('the panel did not answer'),
    );
    const entry = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-without-instance');
    expect(entry).not.toBeNull();

    await expect(requeueDeadLetter(entry!.id)).rejects.toThrow();
    // The failure is open again, so it can be tried once more.
    expect((await getDeadLetterByJob(PROVISION_QUEUE, 'provision-without-instance'))?.state).toBe('pending');
  });
});

describe('the failed jobs of the queue', () => {
  afterAll(async () => {
    await getQueue().obliterate({ force: true }).catch(() => undefined);
  });

  it('keeps a failed job long enough to be read', async () => {
    const queue = getQueue();
    // The queue keeps a failed job for a week, so the failure can be read and
    // the job can be put back on the queue.
    expect(queue.opts.defaultJobOptions?.removeOnFail).toEqual({ age: FAILED_JOB_RETENTION_MS });

    // A job that fails for good: the worker tries it once and it fails.
    const worker = createProvisionWorker(async () => {
      throw new Error('the panel did not answer');
    });
    try {
      await queue.add('provision', { instanceId: 'instance-purge' }, { jobId: 'provision-instance-purge', attempts: 1 });
      const job = await queue.getJob('provision-instance-purge');
      expect(job).not.toBeNull();

      // The job is picked up by the worker and fails.
      const deadline = Date.now() + 20_000;
      let state = '';
      while (Date.now() < deadline) {
        state = await job!.getState();
        if (state === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(state).toBe('failed');

      // The purge of the worker does not throw the failure away.
      await pruneQueueJobs();
      expect(await getQueue().getJob('provision-instance-purge')).not.toBeNull();
    } finally {
      await worker.close();
    }
  });
});
