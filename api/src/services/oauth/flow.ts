import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';
import { oauthRedirectUri, pkceChallenge, providerAuthorizeUrl, providerEnabled } from './providers.js';
import { beginOAuthTransaction } from './transactions.js';
import type { OAuthIntent, OAuthProviderId, ProviderProfile } from './types.js';

async function exchangeCode(
  provider: OAuthProviderId,
  code: string,
  codeVerifier: string | null,
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string }> {
  const redirectUri = oauthRedirectUri(provider);
  if (provider === 'github') {
    const body = new URLSearchParams({
      client_id: env.OAUTH_GITHUB_CLIENT_ID,
      client_secret: env.OAUTH_GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    });
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as { access_token?: string; error?: string; refresh_token?: string };
    if (!json.access_token) throw badRequest('GitHub authorization failed. Try again.');
    return { accessToken: json.access_token, refreshToken: json.refresh_token };
  }
  if (provider === 'google') {
    const body = new URLSearchParams({
      client_id: env.OAUTH_GOOGLE_CLIENT_ID,
      client_secret: env.OAUTH_GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    const json = (await res.json()) as { access_token?: string; id_token?: string; refresh_token?: string; error?: string };
    if (!json.access_token) throw badRequest('Google authorization failed. Try again.');
    return { accessToken: json.access_token, refreshToken: json.refresh_token, idToken: json.id_token };
  }
  if (provider === 'discord') {
    const body = new URLSearchParams({
      client_id: env.OAUTH_DISCORD_CLIENT_ID,
      client_secret: env.OAUTH_DISCORD_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    const res = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', body });
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string };
    if (!json.access_token) throw badRequest('Discord authorization failed. Try again.');
    return { accessToken: json.access_token, refreshToken: json.refresh_token };
  }
  throw badRequest('This provider is not available.');
}

export async function fetchProviderProfile(
  provider: OAuthProviderId,
  tokens: { accessToken: string; idToken?: string },
  nonce: string | null,
): Promise<ProviderProfile> {
  if (provider === 'github') {
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Blipmade' } }),
      fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Blipmade' } }),
    ]);
    if (!userRes.ok) throw badRequest('GitHub authorization failed. Try again.');
    const user = (await userRes.json()) as { id: number; login: string; name: string | null; avatar_url: string | null; email: string | null };
    let email = user.email;
    let verified = Boolean(email);
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      if (primary) {
        email = primary.email;
        verified = primary.verified;
      }
    }
    return {
      provider,
      providerUserId: String(user.id),
      displayName: user.name ?? user.login,
      avatarUrl: user.avatar_url,
      email,
      emailVerified: verified,
      givenName: null,
      familyName: null,
    };
  }
  if (provider === 'google') {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) throw badRequest('Google authorization failed. Try again.');
    const user = (await res.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string; given_name?: string; family_name?: string };
    return {
      provider,
      providerUserId: user.sub,
      displayName: user.name ?? null,
      avatarUrl: user.picture ?? null,
      email: user.email ?? null,
      emailVerified: Boolean(user.email_verified),
      givenName: user.given_name ?? null,
      familyName: user.family_name ?? null,
    };
  }
  if (provider === 'discord') {
    const res = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!res.ok) throw badRequest('Discord authorization failed. Try again.');
    const user = (await res.json()) as { id: string; username: string; global_name: string | null; avatar: string | null; email?: string; verified?: boolean };
    const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;
    return {
      provider,
      providerUserId: user.id,
      displayName: user.global_name ?? user.username,
      avatarUrl,
      email: user.email ?? null,
      emailVerified: Boolean(user.verified),
      givenName: null,
      familyName: null,
    };
  }
  if (provider === 'apple' && tokens.idToken) {
    const { verifyAppleIdToken } = await import('./identity.js');
    const claims = await verifyAppleIdToken(tokens.idToken, nonce);
    return {
      provider,
      providerUserId: claims.sub,
      displayName: null,
      avatarUrl: null,
      email: claims.email ?? null,
      emailVerified: Boolean(claims.email_verified),
      givenName: null,
      familyName: null,
    };
  }
  throw badRequest('This provider is not available.');
}

export async function buildAuthorizeRedirect(input: {
  provider: OAuthProviderId;
  intent: OAuthIntent;
  userId?: string | null;
  returnTo?: string | null;
}): Promise<string> {
  if (!providerEnabled(input.provider)) throw badRequest('This sign-in method is not available.');
  const usePkce = input.provider === 'google' || input.provider === 'discord' || input.provider === 'apple';
  const useNonce = input.provider === 'apple' || input.provider === 'google';
  const tx = await beginOAuthTransaction({
    provider: input.provider,
    intent: input.intent,
    userId: input.userId,
    returnTo: input.returnTo,
    withPkce: usePkce,
    withNonce: useNonce,
  });
  const redirectUri = oauthRedirectUri(input.provider);
  const params = new URLSearchParams({
    client_id:
      input.provider === 'github'
        ? env.OAUTH_GITHUB_CLIENT_ID
        : input.provider === 'google'
          ? env.OAUTH_GOOGLE_CLIENT_ID
          : input.provider === 'discord'
            ? env.OAUTH_DISCORD_CLIENT_ID
            : env.OAUTH_APPLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: tx.state,
  });
  if (input.provider === 'github') {
    params.set('scope', 'read:user user:email');
  } else if (input.provider === 'google') {
    params.set('scope', 'openid email profile');
    params.set('access_type', 'online');
    if (tx.codeVerifier) {
      params.set('code_challenge', pkceChallenge(tx.codeVerifier));
      params.set('code_challenge_method', 'S256');
    }
    if (tx.nonce) params.set('nonce', tx.nonce);
  } else if (input.provider === 'discord') {
    params.set('scope', 'identify email');
    params.set('prompt', 'none');
    if (tx.codeVerifier) {
      params.set('code_challenge', pkceChallenge(tx.codeVerifier));
      params.set('code_challenge_method', 'S256');
    }
  } else if (input.provider === 'apple') {
    params.set('scope', 'name email');
    params.set('response_mode', 'form_post');
    if (tx.nonce) params.set('nonce', tx.nonce);
    if (tx.codeVerifier) {
      params.set('code_challenge', pkceChallenge(tx.codeVerifier));
      params.set('code_challenge_method', 'S256');
    }
  }
  return providerAuthorizeUrl(input.provider, params);
}

export async function completeOAuthCallback(input: {
  provider: OAuthProviderId;
  code: string;
  state: string;
  idToken?: string;
}): Promise<{
  intent: OAuthIntent;
  userId: string | null;
  returnTo: string | null;
  profile: ProviderProfile;
  refreshToken?: string;
}> {
  const { consumeOAuthTransaction } = await import('./transactions.js');
  const tx = await consumeOAuthTransaction(input.provider, input.state);
  const tokens = await exchangeCode(input.provider, input.code, tx.codeVerifier);
  const profile = await fetchProviderProfile(input.provider, { accessToken: tokens.accessToken, idToken: input.idToken ?? tokens.idToken }, tx.nonce);
  return {
    intent: tx.intent,
    userId: tx.userId,
    returnTo: tx.returnTo,
    profile,
    refreshToken: tokens.refreshToken,
  };
}
