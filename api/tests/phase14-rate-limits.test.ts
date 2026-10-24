import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';

/**
 * The counters of the addresses and the counters of the attempts.
 *
 * Two rules are checked here, because both of them decide who is refused and
 * who is let in:
 *
 *  - a limit that is kept per address is never a limit for the whole
 *    platform: two visitors never share a counter, so one visitor can never
 *    lock every other visitor out of a page;
 *  - the limit of the sign-in counts the attempts that failed: a sign-in that
 *    worked does not count, so a customer who signs in several times in a row
 *    is never locked out of their own account.
 *
 * The file is written so it can also be run against the code before the
 * repair: the behaviour it checks is the behaviour of the answers of the
 * API, not the shape of the code.
 */

let app: FastifyInstance;

/** The address of a client behind the proxy. */
const CLIENT = '203.0.113.9';

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('the limit of a page', () => {
  it('is kept per visitor and not for the whole platform', async () => {
    const client = makeClient(app);

    // Six requests for the same visitor: the limit is five requests.
    for (let index = 0; index < 5; index += 1) {
      const response = await client.request(
        'POST',
        '/api/auth/resend-verification',
        { email: `visitor-${index}@example.com` },
        { headers: { 'x-forwarded-for': CLIENT } },
      );
      expect(response.status).toBe(200);
    }

    const refused = await client.request(
      'POST',
      '/api/auth/resend-verification',
      { email: 'visitor-5@example.com' },
      { headers: { 'x-forwarded-for': CLIENT } },
    );
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');

    // Another visitor is not refused by the counter of the first one.
    const other = await client.request(
      'POST',
      '/api/auth/resend-verification',
      { email: 'other@example.com' },
      { headers: { 'x-forwarded-for': '198.51.100.4' } },
    );
    expect(other.status).toBe(200);
  });
});

describe('the limit of the sign-in', () => {
  it('does not count a sign-in that worked', async () => {
    const { client } = await registerAndLogin(app, 'customer@example.com');

    // Twelve sign-ins in a row, every one of them correct. The limit of the
    // sign-in counts the attempts that failed, so none of them is refused.
    for (let index = 0; index < 12; index += 1) {
      const response = await client.request('POST', '/api/auth/login', {
        email: 'customer@example.com',
        password: VALID_PASSWORD,
      });
      expect(response.status).toBe(200);
    }
  });

  it('counts the attempts that failed and refuses the next one', async () => {
    await registerAndLogin(app, 'guessed@example.com');
    const client = makeClient(app);

    // Ten attempts, each one from another address: the limit of the address
    // is never reached.
    for (let index = 0; index < 10; index += 1) {
      const attempt = await client.request(
        'POST',
        '/api/auth/login',
        { email: 'guessed@example.com', password: 'WrongPassword9' },
        { headers: { 'x-forwarded-for': `203.0.113.${index + 1}` } },
      );
      expect(attempt.status).toBe(401);
    }

    // The eleventh attempt is refused, even though its address is new.
    const refused = await client.request(
      'POST',
      '/api/auth/login',
      { email: 'guessed@example.com', password: 'WrongPassword9' },
      { headers: { 'x-forwarded-for': '203.0.113.200' } },
    );
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');

    // Another account is not refused by the counter of the first one.
    const other = await client.request(
      'POST',
      '/api/auth/login',
      { email: 'untouched@example.com', password: 'WrongPassword9' },
      { headers: { 'x-forwarded-for': '203.0.113.201' } },
    );
    expect(other.status).toBe(401);
  });

  it('forgets the attempts that failed when the sign-in works', async () => {
    await registerAndLogin(app, 'typo@example.com');
    const client = makeClient(app);

    for (let index = 0; index < 9; index += 1) {
      const attempt = await client.request('POST', '/api/auth/login', {
        email: 'typo@example.com',
        password: 'WrongPassword9',
      });
      expect(attempt.status).toBe(401);
    }

    const good = await client.request('POST', '/api/auth/login', {
      email: 'typo@example.com',
      password: VALID_PASSWORD,
    });
    expect(good.status).toBe(200);

    // The counter of the account was forgotten by the sign-in that worked, so
    // the account is not locked out by the attempts that came before it.
    const attempt = await client.request('POST', '/api/auth/login', {
      email: 'typo@example.com',
      password: 'WrongPassword9',
    });
    expect(attempt.status).toBe(401);
  });
});
