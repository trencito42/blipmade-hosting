import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../env.js';
import type { OAuthProviderId, ProviderPublicStatus } from './types.js';

const LABELS: Record<OAuthProviderId, string> = {
  github: 'GitHub',
  google: 'Google',
  discord: 'Discord',
  apple: 'Apple',
};

export function oauthApiOrigin(): string {
  const base = env.publicWebUrl.replace(/\/+$/, '');
  return `${base}/api`;
}

export function providerEnabled(id: OAuthProviderId): boolean {
  switch (id) {
    case 'github':
      return env.oauthGithubEnabled;
    case 'google':
      return env.oauthGoogleEnabled;
    case 'discord':
      return env.oauthDiscordEnabled;
    case 'apple':
      return env.oauthAppleEnabled;
    default:
      return false;
  }
}

export function listLoginProviders(): ProviderPublicStatus[] {
  const ids: OAuthProviderId[] = ['github', 'google', 'discord', 'apple'];
  return ids.map((id) => ({
    id,
    label: LABELS[id],
    enabled: providerEnabled(id),
    login: true,
  }));
}

export function hashOAuthState(state: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`oauth:state:${state}`).digest('hex');
}

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function generatePkceVerifier(): string {
  return randomBytes(48).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function oauthRedirectUri(provider: OAuthProviderId): string {
  return `${oauthApiOrigin()}/oauth/${provider}/callback`;
}

export function providerAuthorizeUrl(provider: OAuthProviderId, params: URLSearchParams): string {
  const base =
    provider === 'github'
      ? 'https://github.com/login/oauth/authorize'
      : provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : provider === 'discord'
          ? 'https://discord.com/api/oauth2/authorize'
          : 'https://appleid.apple.com/auth/authorize';
  return `${base}?${params.toString()}`;
}

export function redactToken(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
