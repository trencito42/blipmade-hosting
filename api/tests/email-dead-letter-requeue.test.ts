import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'email-dead-letter-test-session-secret';

const { prisma } = await import('../src/db.js');
const { getDeadLetterByJob, noteJobFailure, requeueDeadLetter } = await import('../src/services/dead-letter.js');
const { EMAIL_QUEUE, createEmailWorker, emailJobId, getEmailQueue } = await import('../src/services/queue.js');
const { resetDatabase } = await import('./helpers.js');

/**
 * A message that failed goes back on the queue.
 *
 * The queue of the provisioning could always be put back on the queue. The
 * queue of the mail could not: a message that failed was lost for good, and
 * the operator had no way of sending it again. These tests hold the path
 * that puts a message back on the queue.
 */

const MESSAGE = {
  key: 'reset-12345678',
  kind: 'reset',
  to: 'customer@example.test',
  subject: 'Reset your password',
  text: 'A link to choose a new password.',
  html: '<p>A link to choose a new password.</p>',
};

/**
 * The table of the dead letters is emptied here, so the files do not see the
 * failures of the others.
 */
async function clearDeadLetters(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "DeadLetterJob" CASCADE;');
}

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

describe('putting a message that failed back on the queue', () => {
  beforeAll(async () => {
    await resetDatabase();
    await clearDeadLetters();
  });

  afterAll(async () => {
    await resetDatabase();
    await clearDeadLetters();
    await getEmailQueue().obliterate({ force: true }).catch(() => undefined);
  });

  it('puts the message back on the queue of the mail', async () => {
    const jobId = emailJobId(MESSAGE.key);

    // The worker refuses the message, so the job fails.
    const worker = createEmailWorker(async () => {
      throw new Error('the relay refused the message');
    });
    try {
      await getEmailQueue().add('send', MESSAGE, { jobId, attempts: 1 });
      expect(await waitForState(jobId, 'failed')).toBe('failed');
    } finally {
      await worker.close();
    }

    // The worker writes the failure down, so it survives the end of the job.
    await noteJobFailure(
      EMAIL_QUEUE,
      { id: jobId, name: 'send', data: MESSAGE, attemptsMade: 1 },
      new Error('the relay refused the message'),
    );
    const entry = await getDeadLetterByJob(EMAIL_QUEUE, jobId);
    expect(entry).not.toBeNull();
    expect(entry?.state).toBe('pending');
    // The body of the message is not in the table of the failures.
    expect(entry?.payload as { text?: string }).toEqual({ key: MESSAGE.key, kind: MESSAGE.kind });

    const outcome = await requeueDeadLetter(entry!.id, { requestedBy: 'admin@blipmade.test' });
    expect(outcome.status).toBe('requeued');

    // The message is on the queue again, with the same content.
    const job = await getEmailQueue().getJob(jobId);
    expect(job).not.toBeNull();
    expect(job?.data.to).toBe(MESSAGE.to);
    expect(job?.data.subject).toBe(MESSAGE.subject);
    expect(job?.data.text).toBe(MESSAGE.text);
    expect(job?.data.key).toBe(MESSAGE.key);
    expect(await job?.getState()).toBe('waiting');
  });

  it('keeps the bookkeeping of the failure consistent when the message goes back on the queue', async () => {
    const jobId = emailJobId(MESSAGE.key);
    const entry = await getDeadLetterByJob(EMAIL_QUEUE, jobId);
    expect(entry).not.toBeNull();

    // The failure is not closed: it stands open, and the number of attempts is
    // the one of the run that starts.
    expect(entry?.state).toBe('requeued');
    expect(entry?.attempts).toBe(0);
    expect(entry?.requeueCount).toBe(1);
    expect(entry?.requeuedBy).toBe('admin@blipmade.test');
    expect(entry?.requeuedAt).not.toBeNull();

    // The path is safe to run twice: the second run does not put the message
    // on the queue a second time.
    const second = await requeueDeadLetter(entry!.id, { requestedBy: 'admin@blipmade.test' });
    expect(second.status).toBe('already-handled');
    expect((await getDeadLetterByJob(EMAIL_QUEUE, jobId))?.requeueCount).toBe(1);
  });

  it('does not lose the failure when the message cannot go back on the queue', async () => {
    const jobId = emailJobId('reset-does-not-exist');
    await noteJobFailure(
      EMAIL_QUEUE,
      { id: jobId, name: 'send', data: { key: 'reset-does-not-exist', kind: 'reset' }, attemptsMade: 4 },
      new Error('the relay refused the message'),
    );
    const entry = await getDeadLetterByJob(EMAIL_QUEUE, jobId);
    expect(entry).not.toBeNull();

    // The job of the message is not in the queue any more, so the message
    // cannot be sent again.
    await expect(requeueDeadLetter(entry!.id)).rejects.toThrow();

    // The failure is open again, with the attempts of the run that failed, so
    // it can be tried once more.
    const open = await getDeadLetterByJob(EMAIL_QUEUE, jobId);
    expect(open?.state).toBe('pending');
    expect(open?.attempts).toBe(4);
    expect(open?.requeueCount).toBe(0);
  });
});
