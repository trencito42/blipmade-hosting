import { describe, expect, it } from 'vitest';
import { hashOAuthState, generateOAuthState, pkceChallenge, generatePkceVerifier } from '../src/services/oauth/providers.js';
import { userHasPassword } from '../src/services/account-auth-methods.js';
import { mergeManagedDiscordRoles, computeManagedRoleDelta } from '../src/services/discord/community.js';
import { readOAuth2faCookie, resolveSecondStepToken } from '../src/services/oauth/oauth-2fa-cookie.js';

describe('oauth providers helpers', () => {
  it('hashes state deterministically', () => {
    const state = 'test-state-value';
    expect(hashOAuthState(state)).toEqual(hashOAuthState(state));
    expect(hashOAuthState(state)).not.toEqual(hashOAuthState('other'));
  });

  it('generates PKCE challenge from verifier', () => {
    const verifier = generatePkceVerifier();
    expect(pkceChallenge(verifier).length).toBeGreaterThan(20);
  });

  it('generates unique oauth states', () => {
    expect(generateOAuthState()).not.toEqual(generateOAuthState());
  });
});

describe('account auth methods', () => {
  it('treats null password as no password login', () => {
    expect(userHasPassword(null)).toBe(false);
    expect(userHasPassword('')).toBe(false);
    expect(userHasPassword('scrypt$abc')).toBe(true);
  });
});

describe('discord role merge (mocked member roles)', () => {
  it('preserves unrelated roles while applying mapped grants', () => {
    const managed = ['role-a', 'role-b'];
    const member = ['everyone', 'role-a', 'custom-mod', 'role-b'];
    const grant = ['role-b'];
    expect(mergeManagedDiscordRoles(member, managed, grant)).toEqual(['everyone', 'custom-mod', 'role-b']);
  });

  it('computes add/remove without patching unrelated roles', () => {
    expect(computeManagedRoleDelta(['everyone', 'role-a'], ['role-a', 'role-b'], ['role-b'])).toEqual({ add: ['role-b'], remove: ['role-a'] });
  });
});

describe('oauth 2fa cookie resolution', () => {
  it('prefers body token when present', () => {
    const request = { cookies: { bm_oauth_2fa: 'cookie-token-1234567890' } } as unknown as Parameters<typeof readOAuth2faCookie>[0];
    expect(resolveSecondStepToken(request, 'body-token-1234567890')).toBe('body-token-1234567890');
    expect(readOAuth2faCookie(request)).toBe('cookie-token-1234567890');
  });

  it('falls back to cookie when body omitted', () => {
    const request = { cookies: { bm_oauth_2fa: 'cookie-token-1234567890' } } as unknown as Parameters<typeof readOAuth2faCookie>[0];
    expect(resolveSecondStepToken(request, undefined)).toBe('cookie-token-1234567890');
  });
});
