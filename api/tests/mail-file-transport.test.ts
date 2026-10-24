import { mkdtemp, readdir, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'mail-file-transport-test-session-secret';

const { env } = await import('../src/env.js');
const { prisma } = await import('../src/db.js');
const {
  DEFAULT_MAIL_FILE_MAX_AGE_HOURS,
  DEFAULT_MAIL_FILE_MAX_FILES,
  mailFileRetention,
  pruneMailFiles,
  sendMail,
} = await import('../src/lib/mailer.js');
const { resetDatabase } = await import('./helpers.js');

/**
 * The file transport.
 *
 * The transport stands in for a relay that is not there: it writes the
 * message on the disk instead of delivering it. It has to stay bounded, it
 * has to stay private, and the operator has to be able to see in the table of
 * the deliveries that the message never left the system.
 */

const originalBackupDir = env.BACKUP_DIR;
const originalMaxFiles = process.env.MAIL_FILE_MAX_FILES;
const originalMaxAge = process.env.MAIL_FILE_MAX_AGE_HOURS;

/** A directory of the test, where the messages are written. */
async function mailDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'blipmade-mail-files-'));
  (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = root;
  return root;
}

/** Waits for the row of a message: the row is written without waiting for it. */
async function deliveryRow(key: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const row = await prisma.mailDelivery.findUnique({ where: { key } });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

/** Writes a message and returns the name of the file it was written to. */
async function writeMessage(key: string): Promise<string> {
  const result = await sendMail({
    to: 'ada@example.com',
    subject: 'Your confirmation',
    text: 'A link to your account.',
    kind: 'verification',
    idempotencyKey: key,
  });
  return result.id;
}

/** Waits a little, so two files never carry the same moment. */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('the file transport of the mail', () => {
  beforeEach(async () => {
    await resetDatabase();
    delete process.env.MAIL_FILE_MAX_FILES;
    delete process.env.MAIL_FILE_MAX_AGE_HOURS;
  });

  afterAll(() => {
    (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = originalBackupDir;
    process.env.MAIL_FILE_MAX_FILES = originalMaxFiles;
    process.env.MAIL_FILE_MAX_AGE_HOURS = originalMaxAge;
  });

  it('writes the file for the owner of the service only', async () => {
    const root = await mailDirectory();

    const name = await writeMessage('private-1');

    const file = await stat(join(root, 'mail', name));
    expect(file.mode & 0o777).toBe(0o600);
    // The directory holds the messages of the customers: it is closed to
    // everybody else.
    const dir = await stat(join(root, 'mail'));
    expect(dir.mode & 0o777).toBe(0o700);
  });

  it('keeps the number of the files of the transport bounded', async () => {
    process.env.MAIL_FILE_MAX_FILES = '3';
    const root = await mailDirectory();

    const written: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      written.push(await writeMessage(`bounded-${index}`));
      await pause();
    }
    expect(await readdir(join(root, 'mail'))).toHaveLength(5);

    const report = await pruneMailFiles();

    expect(report.scanned).toBe(5);
    expect(report.removed).toHaveLength(2);
    // The newest files are the ones that are kept.
    const left = await readdir(join(root, 'mail'));
    expect(left).toHaveLength(3);
    expect(left.sort()).toEqual(written.slice(2).sort());
  });

  it('removes the files that are older than the bound', async () => {
    process.env.MAIL_FILE_MAX_AGE_HOURS = '1';
    const root = await mailDirectory();

    const name = await writeMessage('old-1');
    const path = join(root, 'mail', name);
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await utimes(path, past, past);

    const report = await pruneMailFiles();

    expect(report.removed).toContain(name);
    expect(await readdir(join(root, 'mail'))).toHaveLength(0);
  });

  it('never removes a file that the queue still has to deliver', async () => {
    process.env.MAIL_FILE_MAX_FILES = '1';
    const root = await mailDirectory();

    const first = await writeMessage('waiting-1');
    await pause();
    const second = await writeMessage('waiting-2');
    await pause();
    const third = await writeMessage('waiting-3');

    // The second message is on the queue again: the worker still has to
    // deliver it, so its file is not free to be forgotten.
    await deliveryRow('waiting-2');
    await prisma.mailDelivery.update({ where: { key: 'waiting-2' }, data: { state: 'queued' } });

    const report = await pruneMailFiles();

    expect(report.protectedCount).toBe(1);
    const left = await readdir(join(root, 'mail'));
    // The file of the message that waits on the queue is kept, and the file
    // that nobody waits for is removed.
    expect(left).toContain(second);
    expect(left).not.toContain(first);
    // The newest file is kept by the bound of the number of the files.
    expect(left).toContain(third);
  });

  it('says in the table of the deliveries that a removed message was not delivered', async () => {
    process.env.MAIL_FILE_MAX_AGE_HOURS = '1';
    const root = await mailDirectory();

    const name = await writeMessage('pruned-1');
    const path = join(root, 'mail', name);
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await utimes(path, past, past);
    expect((await deliveryRow('pruned-1'))?.state).toBe('written-to-file');

    await pruneMailFiles();

    const row = await prisma.mailDelivery.findUnique({ where: { key: 'pruned-1' } });
    // The row does not say that the message was written to a file any more:
    // the file is gone and the message was never delivered.
    expect(row?.state).toBe('failed');
    expect(row?.lastErrorClass).toBe('MailFilePruned');
    expect(row?.deliveredAt).toBeNull();
  });

  it('reports what the transport did through the table of the deliveries', async () => {
    await mailDirectory();

    await writeMessage('reported-1');

    const row = await deliveryRow('reported-1');
    expect(row?.state).toBe('written-to-file');
    expect(row?.transport).toBe('file');
    expect(row?.deliveredAt).toBeNull();
    expect(row?.attempts).toBe(1);
  });

  it('does not prune by itself while the suite runs, so a deployment that shares the host keeps its files', async () => {
    process.env.MAIL_FILE_MAX_FILES = '1';
    const root = await mailDirectory();

    await writeMessage('kept-1');
    await pause();
    await writeMessage('kept-2');

    expect(await readdir(join(root, 'mail'))).toHaveLength(2);
  });

  it('reads the bounds of the transport from the environment', () => {
    process.env.MAIL_FILE_MAX_FILES = '7';
    process.env.MAIL_FILE_MAX_AGE_HOURS = '2';
    expect(mailFileRetention().maxFiles).toBe(7);
    expect(mailFileRetention().maxAgeMs).toBe(2 * 60 * 60 * 1000);

    // A value that is not a number is not used: the default stays in force.
    process.env.MAIL_FILE_MAX_FILES = 'many';
    process.env.MAIL_FILE_MAX_AGE_HOURS = '-1';
    expect(mailFileRetention().maxFiles).toBe(DEFAULT_MAIL_FILE_MAX_FILES);
    expect(mailFileRetention().maxAgeMs).toBe(DEFAULT_MAIL_FILE_MAX_AGE_HOURS * 60 * 60 * 1000);
  });
});
