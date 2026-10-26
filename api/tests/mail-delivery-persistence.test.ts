import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * The record of a delivery.
 *
 * The platform says that a message went out, and the table of the deliveries
 * has to say the same thing at the same moment. The record used to be written
 * without waiting for the write to finish, so the caller could be told that
 * the message went out while the table still knew nothing about it.
 */

const ROOT = resolve(process.cwd(), '..');
const SRC = join(ROOT, 'api', 'src');

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'mail-delivery-persistence-test-session-secret';

const { prisma } = await import('../src/db.js');
const { sendMail } = await import('../src/lib/mailer.js');
const { resetDatabase } = await import('./helpers.js');

describe('the record of a delivery', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('is written before the sender is told that the message went out', async () => {
    const key = `persistence-${Date.now()}`;

    const result = await sendMail({
      to: 'ada@example.com',
      subject: 'Your confirmation',
      text: 'A link to your account.',
      kind: 'verification',
      idempotencyKey: key,
    });

    // The row is read right after the message, without waiting for it: the
    // platform that says "delivered" and the table that says nothing would
    // be two different truths.
    const row = await prisma.mailDelivery.findUnique({ where: { key } });
    expect(row).not.toBeNull();
    expect(row?.state).toBe(result.state);
    expect(row?.to).toBe('ada@example.com');
  });

  it('is not left to a promise that nobody waits for', async () => {
    const source = await readFile(join(SRC, 'lib', 'mailer.ts'), 'utf-8');
    expect(source).not.toContain('void persistRecord(');
    expect(source).toContain('await persistRecord(');
  });
});
