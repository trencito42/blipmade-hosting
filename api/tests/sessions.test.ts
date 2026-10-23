import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { describeAgent } from '../src/routes/settings.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { FastifyInstance } from 'fastify';

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

describe('the list of the sessions', () => {
  it('does not show a session that has expired', async () => {
    const { client, userId } = await registerAndLogin(app, 'expired@example.com');

    await prisma.session.create({
      data: {
        tokenHash: 'expired-session-hash',
        userId,
        expiresAt: new Date(Date.now() - 60_000),
        ip: '203.0.113.5',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
      },
    });

    const list = await client.request('GET', '/api/settings/sessions');
    expect(list.status).toBe(200);
    expect(list.body.sessions.length).toBe(1);

    // The page of the settings reads the same list.
    const settings = await client.request('GET', '/api/settings');
    expect(settings.body.sessions.length).toBe(1);
  });

  it('carries the moment of the last use of every session', async () => {
    const { client } = await registerAndLogin(app, 'last-seen@example.com');

    const list = await client.request('GET', '/api/settings/sessions');
    expect(list.status).toBe(200);
    expect(list.body.sessions[0].lastSeenAt).toBeTruthy();
    expect(typeof list.body.sessions[0].lastSeenAt).toBe('string');
  });

  it('writes the moment of the last use once every five minutes', async () => {
    const { client, userId } = await registerAndLogin(app, 'amortised@example.com');

    await client.request('GET', '/api/auth/session');
    const first = await prisma.session.findFirst({ where: { userId } });
    expect(first?.lastSeenAt).not.toBeNull();
    const stamp = first?.lastSeenAt?.getTime() ?? 0;

    // A second request inside the interval does not write the column again.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await client.request('GET', '/api/auth/session');
    const second = await prisma.session.findFirst({ where: { userId } });
    expect(second?.lastSeenAt?.getTime()).toBe(stamp);
  });
});

describe('a sign-in of an account that is already signed in', () => {
  it('rotates the session instead of opening a second one', async () => {
    const { client, userId } = await registerAndLogin(app, 'rotate@example.com');

    const before = await prisma.session.findMany({ where: { userId } });
    expect(before.length).toBe(1);
    const hash = before[0]?.tokenHash ?? '';
    const expiresAt = before[0]?.expiresAt.getTime() ?? 0;

    // The same browser signs in again.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const response = await client.request('POST', '/api/auth/login', {
      email: 'rotate@example.com',
      password: VALID_PASSWORD,
    });
    expect(response.status).toBe(200);

    const after = await prisma.session.findMany({ where: { userId } });
    expect(after.length).toBe(1);
    // The token is a new one, so the old token is of no use any more.
    expect(after[0]?.tokenHash).not.toBe(hash);
    // The term of the session is extended.
    expect(after[0]?.expiresAt.getTime()).toBeGreaterThan(expiresAt);
  });

  it('opens a new session when the cookie belongs to another account', async () => {
    const mine = await registerAndLogin(app, 'mine@example.com');
    const other = await registerAndLogin(app, 'other@example.com');

    const response = await mine.client.request('POST', '/api/auth/login', {
      email: 'other@example.com',
      password: VALID_PASSWORD,
    });
    expect(response.status).toBe(200);

    const sessions = await prisma.session.findMany({ where: { userId: other.userId } });
    expect(sessions.length).toBe(2);
  });
});

describe('the cap of the sessions of an account', () => {
  it('closes the oldest sessions and never the one of the request', async () => {
    const { client, userId } = await registerAndLogin(app, 'cap@example.com');

    // More live sessions than the cap allows. They are all older than the
    // session of the request.
    for (let index = 0; index < 25; index += 1) {
      await prisma.session.create({
        data: {
          tokenHash: `extra-session-${index}`,
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          ip: '203.0.113.5',
          userAgent: 'test',
          createdAt: new Date(Date.now() - (25 - index) * 1000),
        },
      });
    }

    const response = await client.request('POST', '/api/auth/login', {
      email: 'cap@example.com',
      password: VALID_PASSWORD,
    });
    expect(response.status).toBe(200);

    const live = await prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    expect(live.length).toBeLessThanOrEqual(20);

    // The session of the request is still open and is still the current one.
    const list = await client.request('GET', '/api/settings/sessions');
    expect(list.body.sessions.filter((session: { current: boolean }) => session.current).length).toBe(1);

    // Every session that was closed is written to the journal.
    const journal = await prisma.auditLog.findMany({ where: { action: 'settings.session_revoked' } });
    expect(journal.length).toBeGreaterThan(0);
    expect((journal[0]?.meta as { reason?: string } | null)?.reason).toBe('session_cap');
  });

  it('does not count the sessions that have expired', async () => {
    const { client, userId } = await registerAndLogin(app, 'dead@example.com');

    for (let index = 0; index < 25; index += 1) {
      await prisma.session.create({
        data: {
          tokenHash: `dead-session-${index}`,
          userId,
          expiresAt: new Date(Date.now() - 60_000),
          ip: '203.0.113.5',
          userAgent: 'test',
          createdAt: new Date(Date.now() - (25 - index) * 1000),
        },
      });
    }

    const response = await client.request('POST', '/api/auth/login', {
      email: 'dead@example.com',
      password: VALID_PASSWORD,
    });
    expect(response.status).toBe(200);

    // The sessions that are already dead are not closed again and the live
    // ones are not touched by them.
    const live = await prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    expect(live.length).toBe(1);
  });
});

describe('the limit of the attempts on one account', () => {
  it('counts the attempts of an account and not only the addresses', async () => {
    await registerAndLogin(app, 'guessed@example.com');
    const client = makeClient(app);

    // Ten attempts, each one from another address: the limit of the address
    // is never reached.
    for (let index = 0; index < 10; index += 1) {
      const attempt = await client.request('POST', '/api/auth/login', {
        email: 'guessed@example.com',
        password: 'WrongPassword9',
      }, { headers: { 'x-forwarded-for': `203.0.113.${index + 1}` } });
      expect(attempt.status).toBe(401);
    }

    // The eleventh attempt is refused, even though its address is new.
    const refused = await client.request('POST', '/api/auth/login', {
      email: 'guessed@example.com',
      password: 'WrongPassword9',
    }, { headers: { 'x-forwarded-for': '203.0.113.200' } });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');

    // Another account is not refused by the counter of the first one.
    const other = await client.request('POST', '/api/auth/login', {
      email: 'untouched@example.com',
      password: 'WrongPassword9',
    }, { headers: { 'x-forwarded-for': '203.0.113.201' } });
    expect(other.status).toBe(401);
  });
});

describe('the name of a device', () => {
  it('names the browser of iOS and not the engine', () => {
    expect(
      describeAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS 18.7 (iPhone)');

    expect(
      describeAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Chrome on iOS 18.7 (iPhone)');

    expect(
      describeAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/128.0 Mobile/15E148 Safari/605.1.15',
      ),
    ).toBe('Firefox on iOS 17.5 (iPhone)');

    expect(
      describeAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/127.0.0.0 Mobile/15E148 Safari/605.1.15',
      ),
    ).toBe('Edge on iOS 17.5 (iPhone)');

    expect(
      describeAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/107.0.0.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Opera on iOS 17.5 (iPhone)');
  });

  it('names the browser of a desktop', () => {
    expect(
      describeAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows 10');

    expect(
      describeAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/116.0.0.0',
      ),
    ).toBe('Opera on Windows 10');

    expect(
      describeAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15',
      ),
    ).toBe('Safari on macOS 10.15.7');

    expect(
      describeAgent(
        'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android 14 (SM-G991B)');
  });

  it('says nothing that the user agent does not carry', () => {
    expect(describeAgent(null)).toBe('Unknown device');
    expect(describeAgent('')).toBe('Unknown device');
    // A user agent without a system is only the name of the browser.
    expect(describeAgent('Mozilla/5.0 Chrome/130.0.0.0')).toBe('Chrome');
  });
});
