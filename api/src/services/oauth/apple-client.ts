import { createPrivateKey, sign as signBytes } from 'node:crypto';
import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';
import { oauthRedirectUri } from './providers.js';

function applePrivateKeyPem(): string {
  const raw = env.OAUTH_APPLE_PRIVATE_KEY.trim();
  if (!raw) throw new Error('Apple Sign In is not configured.');
  if (raw.includes('BEGIN')) return raw.replace(/\\n/g, '\n');
  return Buffer.from(raw, 'base64').toString('utf8');
}

/** Client secret JWT for Apple token endpoint. */
export function appleClientSecretJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: env.OAUTH_APPLE_KEY_ID })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: env.OAUTH_APPLE_TEAM_ID,
      iat: now,
      exp: now + 60 * 60 * 24 * 180,
      aud: 'https://appleid.apple.com',
      sub: env.OAUTH_APPLE_CLIENT_ID,
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = signBytes('sha256', Buffer.from(data), {
    key: createPrivateKey(applePrivateKeyPem()),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${data}.${signature}`;
}

export async function exchangeAppleAuthorizationCode(code: string): Promise<{ accessToken: string; idToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    client_id: env.OAUTH_APPLE_CLIENT_ID,
    client_secret: appleClientSecretJwt(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: oauthRedirectUri('apple'),
  });
  const res = await fetch('https://appleid.apple.com/auth/token', { method: 'POST', body });
  const json = (await res.json()) as { access_token?: string; id_token?: string; refresh_token?: string; error?: string };
  if (!json.access_token || !json.id_token) throw badRequest('Apple authorization failed. Try again.');
  return { accessToken: json.access_token, idToken: json.id_token, refreshToken: json.refresh_token };
}
