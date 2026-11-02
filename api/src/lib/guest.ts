import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { unauthorized } from './errors.js';
import { resolveCookieSecure } from '../plugins/auth.js';

/**
 * The credential of a guest of the public chat.
 *
 * A guest is a visitor who has not signed in. The credential is a random token in a cookie that only the chat routes read:
 * it is not a session, so it opens nothing else of the platform, and the sessions of the platform are never accepted by the
 * chat as a guest. Only the hash of the token is stored. It is valid for a day from the last use and for a week at most.
 * The token cannot be guessed (32 random bytes), and it is bound to one guest: a guest reads only the conversations of
 * their own account.
 */

export const GUEST_COOKIE = 'bm_guest';
export const GUEST_EMAIL_DOMAIN = 'guest.invalid';
const DAY_MS = 24 * 3_600_000;
const WEEK_MS = 7 * DAY_MS;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export const isGuestEmail = (email: string) => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);

/** What the staff reads in place of an address that does not exist. */
export const displayEmail = (email: string) => (isGuestEmail(email) ? 'Guest (not signed in)' : email);

export async function issueGuestToken(request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  await prisma.supportGuestToken.create({ data: { userId, tokenHash: hash(token), expiresAt: new Date(now + DAY_MS) } });
  reply.setCookie(GUEST_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: resolveCookieSecure(request), path: '/api/support/guest', expires: new Date(now + DAY_MS) });
}

export function clearGuestCookie(reply: FastifyReply): void {
  reply.clearCookie(GUEST_COOKIE, { path: '/api/support/guest' });
}

/** The guest of a request, or an error. The use of the token renews it, up to a week from its creation. */
export async function requireGuest(request: FastifyRequest): Promise<{ userId: string; tokenId: string }> {
  const token = request.cookies?.[GUEST_COOKIE];
  if (!token) throw unauthorized('Start the chat first.');
  const row = await prisma.supportGuestToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: { select: { isGuest: true } } } });
  const now = Date.now();
  if (!row || !row.user.isGuest || row.expiresAt.getTime() < now || row.createdAt.getTime() + WEEK_MS < now) throw unauthorized('The chat expired. Start it again.');
  const renewed = Math.min(now + DAY_MS, row.createdAt.getTime() + WEEK_MS);
  await prisma.supportGuestToken.update({ where: { id: row.id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(renewed) } });
  return { userId: row.userId, tokenId: row.id };
}

export async function readOptionalGuest(request: FastifyRequest): Promise<{ userId: string } | null> {
  try {
    return await requireGuest(request);
  } catch {
    return null;
  }
}
