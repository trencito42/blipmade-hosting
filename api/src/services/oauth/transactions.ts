import { prisma } from '../../db.js';
import { badRequest } from '../../lib/errors.js';
import { generateOAuthState, generatePkceVerifier, hashOAuthState } from './providers.js';
import type { OAuthIntent, OAuthProviderId } from './types.js';

const TTL_MS = 10 * 60 * 1000;

export async function beginOAuthTransaction(input: {
  provider: OAuthProviderId;
  intent: OAuthIntent;
  userId?: string | null;
  returnTo?: string | null;
  withPkce?: boolean;
  withNonce?: boolean;
}): Promise<{ state: string; codeVerifier: string | null; nonce: string | null; transactionId: string }> {
  const state = generateOAuthState();
  const codeVerifier = input.withPkce !== false ? generatePkceVerifier() : null;
  const nonce = input.withNonce ? generateOAuthState() : null;
  const row = await prisma.oAuthTransaction.create({
    data: {
      provider: input.provider,
      intent: input.intent,
      stateHash: hashOAuthState(state),
      codeVerifier,
      nonce,
      userId: input.userId ?? null,
      returnTo: sanitizeReturnTo(input.returnTo),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return { state, codeVerifier, nonce, transactionId: row.id };
}

function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('\n')) return null;
  return trimmed.slice(0, 500);
}

export async function consumeOAuthTransaction(provider: OAuthProviderId, state: string): Promise<{
  id: string;
  intent: OAuthIntent;
  codeVerifier: string | null;
  nonce: string | null;
  userId: string | null;
  returnTo: string | null;
}> {
  const stateHash = hashOAuthState(state);
  const row = await prisma.oAuthTransaction.findUnique({ where: { stateHash } });
  if (!row || row.provider !== provider) throw badRequest('This sign-in link expired or is not valid. Start again.');
  if (row.consumedAt) throw badRequest('This sign-in link was already used. Start again.');
  if (row.expiresAt.getTime() < Date.now()) throw badRequest('This sign-in link expired. Start again.');
  await prisma.oAuthTransaction.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return {
    id: row.id,
    intent: row.intent as OAuthIntent,
    codeVerifier: row.codeVerifier,
    nonce: row.nonce,
    userId: row.userId,
    returnTo: row.returnTo,
  };
}

export async function purgeExpiredOAuthTransactions(): Promise<void> {
  await prisma.oAuthTransaction.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
}
