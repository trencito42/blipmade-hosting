import { describe, expect, it } from 'vitest';
import { hashOAuthState, generateOAuthState, pkceChallenge, generatePkceVerifier } from '../src/services/oauth/providers.js';
import { userHasPassword } from '../src/services/account-auth-methods.js';

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
