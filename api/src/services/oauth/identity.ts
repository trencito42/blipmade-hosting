import { createPublicKey, createVerify } from 'node:crypto';
import { prisma } from '../../db.js';
import { badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { emailIdentity, isDisposableEmail } from '../../lib/email-identity.js';
import { fullName } from '../../lib/people.js';
import { encryptSecret } from '../../lib/secrets.js';
import { assertCanUnlink } from '../account-auth-methods.js';
import type { OAuthProviderId, ProviderProfile } from './types.js';

export function splitName(profile: ProviderProfile): { firstName: string; lastName: string } {
  if (profile.givenName) {
    return {
      firstName: profile.givenName.slice(0, 80),
      lastName: (profile.familyName ?? '').slice(0, 80) || '—',
    };
  }
  const parts = (profile.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { firstName: parts[0]!.slice(0, 80), lastName: parts.slice(1).join(' ').slice(0, 80) };
  }
  if (parts.length === 1) return { firstName: parts[0]!.slice(0, 80), lastName: '—' };
  return { firstName: 'Member', lastName: '—' };
}

export async function findIdentity(provider: OAuthProviderId, providerUserId: string) {
  return prisma.connectedIdentity.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: { include: { staff: true } } },
  });
}

export async function linkIdentityToUser(
  userId: string,
  profile: ProviderProfile,
  refreshToken?: string | null,
): Promise<void> {
  const existing = await findIdentity(profile.provider, profile.providerUserId);
  if (existing && existing.userId !== userId) {
    throw conflict('This provider account is already linked to another Blipmade account.');
  }
  await prisma.connectedIdentity.upsert({
    where: { provider_providerUserId: { provider: profile.provider, providerUserId: profile.providerUserId } },
    create: {
      userId,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      emailSnapshot: profile.email,
      refreshTokenSealed: refreshToken ? encryptSecret(refreshToken) : null,
      lastUsedAt: new Date(),
    },
    update: {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      emailSnapshot: profile.email,
      ...(refreshToken ? { refreshTokenSealed: encryptSecret(refreshToken) } : {}),
      lastUsedAt: new Date(),
    },
  });
}

export async function createUserFromOAuth(profile: ProviderProfile, refreshToken?: string | null) {
  if (!profile.email || !profile.emailVerified) {
    throw badRequest('This provider did not share a verified email address. Use email sign-up or another provider.');
  }
  if (isDisposableEmail(profile.email, process.env.DISPOSABLE_EMAIL_DOMAINS ?? '')) {
    throw badRequest('Use a permanent email address.');
  }
  const identity = emailIdentity(profile.email);
  const collision = await prisma.user.findFirst({
    where: { OR: [{ email: profile.email }, { emailIdentity: identity }] },
    select: { id: true },
  });
  if (collision) {
    throw conflict('An account already uses this email address. Sign in and link this provider from Settings → Connections.');
  }
  const { firstName, lastName } = splitName(profile);
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      emailIdentity: identity,
      passwordHash: null,
      firstName,
      lastName,
      role: 'CUSTOMER',
      emailVerifiedAt: new Date(),
    },
  });
  await linkIdentityToUser(user.id, profile, refreshToken);
  return user;
}

export async function unlinkProvider(userId: string, provider: OAuthProviderId): Promise<void> {
  await assertCanUnlink(userId);
  const row = await prisma.connectedIdentity.findFirst({ where: { userId, provider } });
  if (!row) throw badRequest('This provider is not connected.');
  await prisma.connectedIdentity.delete({ where: { id: row.id } });
  if (provider === 'discord') {
    const { handleDiscordIdentityUnlinked } = await import('../discord/community.js');
    await handleDiscordIdentityUnlinked(userId);
  }
}

export async function listConnections(userId: string) {
  const rows = await prisma.connectedIdentity.findMany({
    where: { userId },
    orderBy: { provider: 'asc' },
  });
  return rows.map((row) => ({
    provider: row.provider,
    providerUserId: row.providerUserId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    emailSnapshot: row.emailSnapshot,
    connectedAt: row.connectedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

/** Minimal Apple ID token validation (issuer, audience, expiry, nonce). */
export async function verifyAppleIdToken(idToken: string, nonce: string | null): Promise<{ sub: string; email?: string; email_verified?: boolean }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw unauthorized('Apple sign-in failed.');
  const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as { alg: string; kid: string };
  const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
    iss: string;
    aud: string;
    exp: number;
    sub: string;
    nonce?: string;
    email?: string;
    email_verified?: string | boolean;
  };
  if (payload.iss !== 'https://appleid.apple.com') throw unauthorized('Apple sign-in failed.');
  if (payload.aud !== process.env.OAUTH_APPLE_CLIENT_ID) throw unauthorized('Apple sign-in failed.');
  if (payload.exp * 1000 < Date.now()) throw unauthorized('Apple sign-in failed.');
  if (nonce && payload.nonce !== nonce) throw unauthorized('Apple sign-in failed.');
  const keysRes = await fetch('https://appleid.apple.com/auth/keys');
  if (!keysRes.ok) throw unauthorized('Apple sign-in failed.');
  const keys = (await keysRes.json()) as { keys: { kid: string; n: string; e: string; kty: string; alg: string }[] };
  const jwk = keys.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw unauthorized('Apple sign-in failed.');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const verify = createVerify('RSA-SHA256');
  verify.update(`${parts[0]}.${parts[1]}`);
  verify.end();
  if (!verify.verify(key, Buffer.from(parts[2]!, 'base64url'))) throw unauthorized('Apple sign-in failed.');
  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true || payload.email_verified === 'true',
  };
}

export function publicUserFromRecord(user: { id: string; email: string; firstName: string; lastName: string; role: string; emailVerifiedAt: Date | null; suspendedAt: Date | null }, permissions: string[] = []) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    suspended: Boolean(user.suspendedAt),
    permissions,
  };
}

export { fullName };
