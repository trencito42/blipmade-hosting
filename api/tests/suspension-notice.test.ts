import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The suspension of an account.
 *
 * A suspended customer must understand what happened. The platform used to
 * answer every refused sign-in with "Email or password is incorrect", even
 * when the password was right and the account was suspended, so the customer
 * thought the account was lost and wrote to the support about a wrong
 * password.
 *
 * Two things have to be true at the same time:
 *
 *   * the customer who owns the account is told that it was suspended, and
 *     where to write;
 *   * somebody who guesses the password learns nothing about the account, so
 *     the answer of a wrong password is still the same as the answer of an
 *     address that does not exist.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

/** Suspends a customer, as the back office does. */
async function suspend(adminClient: ReturnType<typeof makeClient>, id: string, reason?: string) {
  return adminClient.request('POST', `/api/admin/customers/${id}/suspend`, {
    suspended: true,
    ...(reason ? { reason } : {}),
  });
}

describe('the suspension of an account', () => {
  it('tells the customer that the account was suspended, and where to write', async () => {
    const { client, userId } = await registerAndLogin(app, 'suspended@example.com');
    const { client: admin } = await createAdmin(app);

    const done = await suspend(admin, userId, 'The payment of the invoice failed.');
    expect(done.status).toBe(200);

    // The customer tries again with the right password.
    const answer = await client.request('POST', '/api/auth/login', {
      email: 'suspended@example.com',
      password: 'CorrectHorseBattery9',
    });

    expect(answer.status).toBe(401);
    expect(answer.body.error.code).toBe('account_suspended');
    expect(answer.body.error.message).toMatch(/suspended/i);
    expect(answer.body.error.message).toMatch(/support/i);
  });

  it('never says that the account is suspended to somebody who does not have the password', async () => {
    const { userId } = await registerAndLogin(app, 'owner@example.com');
    const { client: admin } = await createAdmin(app);
    await suspend(admin, userId);

    // The wrong password answers the same way as an address that does not
    // exist. The caller learns nothing about the account.
    const stranger = makeClient(app);
    const answer = await stranger.request('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'not-the-password',
    });

    expect(answer.status).toBe(401);
    expect(answer.body.error.code).toBe('unauthorized');
    expect(answer.body.error.message).not.toMatch(/suspended/i);
  });

  it('explains the disconnection of a customer whose session is still open', async () => {
    const { client, userId } = await registerAndLogin(app, 'open-session@example.com');
    const { client: admin } = await createAdmin(app);

    // The page is open: the session is still there.
    expect((await client.request('GET', '/api/auth/session')).status).toBe(200);

    await suspend(admin, userId);

    // The next call of the open page says what happened, and it does not say
    // that the session simply ended.
    const answer = await client.request('GET', '/api/auth/session');
    expect(answer.status).toBe(401);
    expect(answer.body.error.code).toBe('account_suspended');
  });

  it('writes the event of the suspension, so the customer is told by mail as well', async () => {
    const { userId } = await registerAndLogin(app, 'notified@example.com');
    const { client: admin } = await createAdmin(app);

    await suspend(admin, userId, 'The invoice was not paid.');

    const events = await prisma.notificationEvent.findMany({ where: { type: 'account.suspended' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    const payload = events[0]?.payload as { reason?: string };
    expect(payload.reason).toBe('The invoice was not paid.');
  });

  it('closes the sessions when the account is put back', async () => {
    const { client, userId } = await registerAndLogin(app, 'reinstated@example.com');
    const { client: admin } = await createAdmin(app);

    await suspend(admin, userId);
    const back = await admin.request('POST', `/api/admin/customers/${userId}/suspend`, {
      suspended: false,
    });
    expect(back.status).toBe(200);

    // The sessions of the suspended account are closed when it is put back,
    // so the customer signs in again.
    expect(await prisma.session.count({ where: { userId } })).toBe(0);

    const answer = await client.request('GET', '/api/auth/session');
    // The session is gone, so the platform answers "nobody is signed in" and
    // not "the account is suspended": the account works again.
    expect(answer.status).toBe(200);
    expect(answer.body.user).toBeNull();
  });
});
