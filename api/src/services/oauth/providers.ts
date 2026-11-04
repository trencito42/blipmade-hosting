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

/** Every browser origin allowed for CORS (comma-separated in APP_ORIGIN). */
export function appOrigins(): string[] {
  return env.APP_ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function originOf(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

/** Canonical customer-facing site URL for redirects (PUBLIC_WEB_URL). */
export function primaryAppOrigin(): string {
  return env.publicWebUrl.replace(/\/+$/, '');
}

/** Builds a safe post-OAuth browser URL from a path or a full URL on an allowed origin. */
export function resolveWebAppUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  const base = primaryAppOrigin();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const target = new URL(trimmed);
      const allowed = appOrigins().some((o) => originOf(o) === target.origin);
      if (allowed) return `${base}${target.pathname}${target.search}`;
    } catch {
      /* fall through */
    }
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

/** Store a path-only return target; redirects always use PUBLIC_WEB_URL. */
export function webReturnToFromRequest(_originHeader: string | undefined, path: string): string {
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  return pathNorm.slice(0, 500);
}

export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.includes('\n')) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed.slice(0, 500);
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const target = new URL(trimmed);
      if (appOrigins().some((o) => originOf(o) === target.origin)) {
        return `${target.pathname}${target.search}`.slice(0, 500);
      }
    } catch {
      return null;
    }
  }
  return null;
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
