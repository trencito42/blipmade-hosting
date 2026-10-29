import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashToken } from '../src/lib/tokens.js';
import { verifyPassword } from '../src/lib/password.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';

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

describe('single-use password reset tokens', () => {
  it('allows exactly one of two simultaneous reset attempts', async () => {
    const { userId, client: signedIn } = await registerAndLogin(app, 'reset-race@example.com');
    const token = 'unique-reset-token-for-concurrency-test';
    await prisma.verificationToken.create({
      data: {
        tokenHash: hashToken(token),
        type: 'PASSWORD_RESET',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const firstPassword = 'FirstValidPassword123';
    const secondPassword = 'SecondValidPassword456';
    const [first, second] = await Promise.all([
      makeClient(app).request('POST', '/api/auth/reset-password', { token, password: firstPassword }),
      makeClient(app).request('POST', '/api/auth/reset-password', { token, password: secondPassword }),
    ]);

    expect([first.status, second.status].sort()).toEqual([204, 400]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const firstWins = await verifyPassword(firstPassword, user.passwordHash);
    const secondWins = await verifyPassword(secondPassword, user.passwordHash);
    expect(Number(firstWins) + Number(secondWins)).toBe(1);

    const stored = await prisma.verificationToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(stored.usedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect((await signedIn.request('GET', '/api/auth/session')).body.user).toBeNull();
  });

  it('rejects replay after a successful reset without changing the password again', async () => {
    const { userId } = await registerAndLogin(app, 'reset-replay@example.com');
    const token = 'unique-reset-token-for-replay-test';
    await prisma.verificationToken.create({
      data: {
        tokenHash: hashToken(token),
        type: 'PASSWORD_RESET',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const first = await makeClient(app).request('POST', '/api/auth/reset-password', {
      token, password: 'FirstValidPassword123',
    });
    const second = await makeClient(app).request('POST', '/api/auth/reset-password', {
      token, password: 'SecondValidPassword456',
    });
    expect(first.status).toBe(204);
    expect(second.status).toBe(400);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword('FirstValidPassword123', user.passwordHash)).toBe(true);
  });
});
