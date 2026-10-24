import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'password-reset-honesty-test-session-secret';

const { env } = await import('../src/env.js');
const { prisma } = await import('../src/db.js');
const { mailNotice } = await import('../src/lib/mailer.js');
const { closeApp, createAdmin, getApp, makeClient, resetDatabase } = await import('./helpers.js');

/**
 * The password reset.
 *
 * The customer is told that a message was sent, so the platform has to be
 * able to say it. When the mail cannot leave the system, the answer must not
 * say that it did, and it must never say whether an account exists. What
 * really happened is written down for the operator.
 */

let app: FastifyInstance;
const originalBackupDir = env.BACKUP_DIR;

/** Waits for the row of a message: the row is written without waiting for it. */
async function deliveryRows(kind: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await prisma.mailDelivery.findMany({ where: { kind } });
    if (rows.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

describe('the answer of the password reset', () => {
  beforeAll(async () => {
    app = await getApp();
    // The messages of the test are written in a directory of the test, so the
    // files of the host are never touched.
    const root = await mkdtemp(join(tmpdir(), 'blipmade-reset-'));
    (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = root;
  });

  afterAll(async () => {
    (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = originalBackupDir;
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('does not promise a delivery that the platform cannot keep', () => {
    const original = env.SMTP_URL;
    (env as unknown as { SMTP_URL: string }).SMTP_URL = 'smtps://relay@example.test:465';
    try {
      const message = mailNotice('reset');
      // The message says what the platform did, never that the relay took
      // the message.
      expect(message.toLowerCase()).not.toContain('on its way');
      expect(message.toLowerCase()).not.toMatch(/\bwas sent\b/);
      // The answer still never says whether an account exists.
      expect(message).toContain('If an account exists for that address');
    } finally {
      (env as unknown as { SMTP_URL: string }).SMTP_URL = original;
    }
  });

  it('answers the same way for a known and an unknown address', async () => {
    const client = makeClient(app);
    const known = await client.request('POST', '/api/auth/forgot-password', { email: 'known@example.com' });
    const unknown = await client.request('POST', '/api/auth/forgot-password', { email: 'unknown@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    // The answer never tells whether the address has an account.
    expect(known.body.message).toBe(unknown.body.message);
    expect(known.body.mail).toEqual(unknown.body.mail);
    // And it never says that a message was sent while the transport is a
    // file.
    expect(String(known.body.message).toLowerCase()).not.toContain('on its way');
    expect(String(known.body.message).toLowerCase()).toContain('support');
  });

  it('writes down that the message never left the system, for the operator', async () => {
    const customer = makeClient(app);
    const registered = await customer.request('POST', '/api/auth/register', {
      email: 'customer@example.com',
      password: 'CorrectHorseBattery9',
      firstName: 'Test',
      lastName: 'Customer',
    });
    expect(registered.status).toBe(201);

    const response = await customer.request('POST', '/api/auth/forgot-password', { email: 'customer@example.com' });
    expect(response.status).toBe(200);

    // The message was written to a file: it never left the system.
    const rows = await deliveryRows('reset');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('written-to-file');
    expect(rows[0]?.transport).toBe('file');
    expect(rows[0]?.deliveredAt).toBeNull();

    // The operator reads it in the journal of the platform.
    const entries = await prisma.auditLog.findMany({ where: { action: 'auth.reset_not_delivered' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.meta).toMatchObject({ state: 'written-to-file', transport: 'file' });
  });

  it('shows the operator in the admin area that the message never left the system', async () => {
    const customer = makeClient(app);
    await customer.request('POST', '/api/auth/register', {
      email: 'customer@example.com',
      password: 'CorrectHorseBattery9',
      firstName: 'Test',
      lastName: 'Customer',
    });
    await customer.request('POST', '/api/auth/forgot-password', { email: 'customer@example.com' });
    const rows = await deliveryRows('reset');
    expect(rows).toHaveLength(1);

    const { client: admin } = await createAdmin(app);
    const report = await admin.request('GET', '/api/admin/email/delivery');

    expect(report.status).toBe(200);
    expect(report.body.email.configured).toBe(false);
    expect(report.body.email.counts.writtenToFile).toBeGreaterThan(0);
    // The message of this request is in the report, and it says that it was
    // never delivered.
    const reset = report.body.email.messages.find((message: { key: string }) => message.key === rows[0]?.key);
    expect(reset).toBeTruthy();
    expect(reset.state).toBe('written-to-file');
    expect(reset.deliveredAt).toBeNull();
  });

  it('keeps the limit of the requests of the reset', async () => {
    const client = makeClient(app);
    let limited = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await client.request('POST', '/api/auth/forgot-password', { email: 'flood@example.com' });
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
