import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'email-delivery-report-test-session-secret';

const { prisma } = await import('../src/db.js');
const { createEmailWorker, emailDeliveryReport, emailJobId, getEmailQueue } = await import('../src/services/queue.js');
const { resetDatabase } = await import('./helpers.js');

/**
 * The report of the deliveries must not let the queue hide a failure.
 *
 * The worker writes the truth in the table of the deliveries, but the queue
 * keeps the job of a message that has already been dealt with. A message
 * whose file was removed by the retention of the file transport is `failed`
 * in the database and `written-to-file` in the queue. A report that takes the
 * queue for the truth says that the message was written, so the operator
 * never sees the failure and the count of the failures stays empty.
 */

const PRUNED = 'report-pruned-12345678';
const ONLY_QUEUE = 'report-queue-12345678';
const WAITING = 'report-waiting-12345678';

/** Waits for the state of a job of the queue. */
async function waitForState(jobId: string, wanted: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  let state = '';
  while (Date.now() < deadline) {
    const job = await getEmailQueue().getJob(jobId);
    if (!job) return 'gone';
    state = await job.getState();
    if (state === wanted) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return state;
}

/** Empties the table of the deliveries, so the files do not see each other. */
async function clearDeliveries(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "MailDelivery" CASCADE;');
}

/** Removes the jobs of the queue that these tests put there. */
async function clearJobs(): Promise<void> {
  for (const key of [PRUNED, ONLY_QUEUE, WAITING]) {
    const jobId = emailJobId(key);
    await getEmailQueue().remove(jobId).catch(() => undefined);
  }
}

describe('the report of the deliveries', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await clearDeliveries();
    await clearJobs();
  });

  afterAll(async () => {
    await resetDatabase();
    await getEmailQueue().obliterate({ force: true }).catch(() => undefined);
  });

  it('says that a message was failed when the database says so and the queue says it was written', async () => {
    const jobId = emailJobId(PRUNED);
    const worker = createEmailWorker(async () => ({ state: 'written-to-file' }));
    try {
      await getEmailQueue().add(
        'send',
        { key: PRUNED, kind: 'reset', to: 'customer@example.test' },
        { jobId, attempts: 1 },
      );
      expect(await waitForState(jobId, 'completed')).toBe('completed');

      // The retention of the file transport removes the file of the message.
      // The row of the database now says that the message was not delivered.
      await prisma.mailDelivery.upsert({
        where: { key: PRUNED },
        create: {
          key: PRUNED,
          kind: 'reset',
          to: 'customer@example.test',
          state: 'failed',
          transport: 'file',
          attempts: 1,
          lastErrorClass: 'MailFilePruned',
          lastError: 'The file of the message was removed by the retention of the file transport.',
        },
        update: {
          state: 'failed',
          lastErrorClass: 'MailFilePruned',
          lastError: 'The file of the message was removed by the retention of the file transport.',
          deliveredAt: null,
        },
      });

      const report = await emailDeliveryReport();
      const message = report.messages.find((entry) => entry.key === PRUNED);
      expect(message?.state).toBe('failed');
      expect(message?.lastErrorClass).toBe('MailFilePruned');
      expect(report.counts.failed).toBe(1);
      expect(report.counts.writtenToFile).toBe(0);
    } finally {
      await worker.close();
    }
  });

  it('still reports a message that only the queue knows', async () => {
    const jobId = emailJobId(ONLY_QUEUE);
    const worker = createEmailWorker(async () => ({ state: 'written-to-file' }));
    try {
      await getEmailQueue().add(
        'send',
        { key: ONLY_QUEUE, kind: 'reset', to: 'customer@example.test' },
        { jobId, attempts: 1 },
      );
      expect(await waitForState(jobId, 'completed')).toBe('completed');

      const report = await emailDeliveryReport();
      const message = report.messages.find((entry) => entry.key === ONLY_QUEUE);
      expect(message?.state).toBe('written-to-file');
      expect(report.counts.writtenToFile).toBe(1);
      expect(report.counts.failed).toBe(0);
    } finally {
      await worker.close();
    }
  });

  it('says that a message is waiting when it is still in the queue', async () => {
    const jobId = emailJobId(WAITING);
    await getEmailQueue().add(
      'send',
      { key: WAITING, kind: 'reset', to: 'customer@example.test' },
      { jobId, attempts: 1 },
    );
    expect(await waitForState(jobId, 'waiting')).toBe('waiting');

    await prisma.mailDelivery.upsert({
      where: { key: WAITING },
      create: {
        key: WAITING,
        kind: 'reset',
        to: 'customer@example.test',
        state: 'queued',
        transport: 'file',
        attempts: 0,
      },
      update: { state: 'queued' },
    });

    const report = await emailDeliveryReport();
    const message = report.messages.find((entry) => entry.key === WAITING);
    expect(message?.state).toBe('queued');
    expect(report.counts.queued).toBe(1);
  });
});
