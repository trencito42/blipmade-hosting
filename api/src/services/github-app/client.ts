import { createSign } from 'node:crypto';
import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';

function appPrivateKeyPem(): string {
  const raw = env.GITHUB_APP_PRIVATE_KEY.trim();
  if (!raw) throw badRequest('GitHub App is not configured.');
  if (raw.includes('BEGIN')) return raw.replace(/\\n/g, '\n');
  return Buffer.from(raw, 'base64').toString('utf8');
}

/** JWT for GitHub App authentication (~9 minutes). */
export function githubAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: env.GITHUB_APP_ID })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  sign.end();
  const signature = sign.sign(appPrivateKeyPem()).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export async function mintInstallationToken(installationId: string): Promise<string> {
  const jwt = githubAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Blipmade',
    },
  });
  if (!res.ok) throw badRequest('GitHub App authorization expired. Reconnect GitHub from Settings.');
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw badRequest('GitHub App authorization expired. Reconnect GitHub from Settings.');
  return json.token;
}

export function githubAppInstallUrl(state: string): string {
  const slug = env.GITHUB_APP_SLUG || 'blipmade';
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
}
