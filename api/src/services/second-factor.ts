import { prisma } from '../db.js';
import { env } from '../env.js';
import { redis } from '../redis.js';
import { hashToken, randomToken } from '../lib/tokens.js';

/**
 * The state between the password and the second step of a sign-in, and the challenges of
 * WebAuthn. All of it lives in Redis for a few minutes: nothing here is a session, and nothing
 * here survives a restart of the cache, which only means that the person signs in again.
 */
const LOGIN_TTL_SECONDS = 5 * 60;
const MAX_TRIES = 5;

export const rpID = (): string => new URL(env.publicWebUrl).hostname;
export const rpOrigin = (): string => new URL(env.publicWebUrl).origin;

/** Does this account ask for a second step after the password? */
export async function twoFactorEnabled(userId: string): Promise<boolean> {
  const row = await prisma.userTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true } });
  return Boolean(row?.enabledAt);
}

/** Opens the second step. The token is given to the browser; only its hash is the key. */
export async function startSecondStep(userId: string): Promise<{ token: string; methods: string[] }> {
  const token = randomToken(32);
  await redis.set(`2fa:login:${hashToken(token)}`, JSON.stringify({ userId, tries: 0 }), 'EX', LOGIN_TTL_SECONDS);
  const passkeys = await prisma.passkey.count({ where: { userId } });
  return { token, methods: ['totp', 'backup', ...(passkeys > 0 ? ['passkey'] : [])] };
}

/** The account of a second step that is open, counting this try. Null when it ended or was tried too often. */
export async function takeTry(token: string): Promise<string | null> {
  const key = `2fa:login:${hashToken(token)}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  const state = JSON.parse(raw) as { userId: string; tries: number };
  if (state.tries >= MAX_TRIES) {
    await redis.del(key);
    return null;
  }
  const ttl = await redis.ttl(key);
  await redis.set(key, JSON.stringify({ ...state, tries: state.tries + 1 }), 'EX', Math.max(ttl, 1));
  return state.userId;
}

export const endSecondStep = (token: string) => redis.del(`2fa:login:${hashToken(token)}`);

export async function saveChallenge(key: string, value: { challenge: string; userId?: string }, ttlSeconds = LOGIN_TTL_SECONDS): Promise<void> {
  await redis.set(`webauthn:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
}

/** A challenge is good for one answer: it is read and removed. */
export async function takeChallenge(key: string): Promise<{ challenge: string; userId?: string } | null> {
  const raw = await redis.getdel(`webauthn:${key}`);
  return raw ? (JSON.parse(raw) as { challenge: string; userId?: string }) : null;
}
