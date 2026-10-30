import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashToken } from '../src/lib/tokens.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

describe('single-use email verification tokens', () => {
  it('confirms exactly once when two requests use the same link concurrently', async () => {
    const { userId } = await registerAndLogin(app, 'verify-race@example.com');
    const token = 'unique-email-verification-race-token';
    await prisma.verificationToken.create({
      data: {
        tokenHash: hashToken(token),
        type: 'EMAIL_VERIFY',
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const [a, b] = await Promise.all([
      makeClient(app).request('POST', '/api/auth/verify-email', { token }),
      makeClient(app).request('POST', '/api/auth/verify-email', { token }),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 400]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).not.toBeNull();
    expect((await prisma.verificationToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).usedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'auth.email_verified', actorId: userId } })).toBe(1);
  });
});
