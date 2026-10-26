import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * A failure of an instance that is gone.
 *
 * The job would fail again for ever: the same record is reopened every time
 * and the platform keeps alerting about it. The failure of an instance that
 * is gone is refused instead.
 */

const { prisma } = await import('../src/db.js');
const { getDeadLetterByJob, noteJobFailure, requeueDeadLetter } = await import(
  '../src/services/dead-letter.js'
);
const { PROVISION_QUEUE } = await import('../src/services/queue.js');
const { resetDatabase } = await import('./helpers.js');

describe('a failure of an instance that is gone', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('cannot be put back on the queue', async () => {
    const jobId = 'provision-of-an-instance-that-is-gone';

    await noteJobFailure(
      PROVISION_QUEUE,
      {
        id: jobId,
        name: 'provision',
        data: { instanceId: 'an-instance-that-is-gone' },
        attemptsMade: 5,
      },
      new Error('the panel did not answer'),
    );
    const entry = await getDeadLetterByJob(PROVISION_QUEUE, jobId);
    expect(entry).not.toBeNull();
    expect(entry?.state).toBe('pending');

    // The instance is not there, so the job cannot be put back: it would
    // fail again for ever, and the platform would keep alerting about it.
    await expect(
      requeueDeadLetter(entry!.id, { requestedBy: 'admin@blipmade.test' }),
    ).rejects.toThrow(/gone/i);
  });
});
