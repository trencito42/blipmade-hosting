import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hashBackupCode, looksLikeBackupCode, newBackupCodes, newSecret, totpAt, verifyTotp, currentStep } from '../src/lib/two-factor.js';

describe('codes of an authenticator app', () => {
  it('matches the test vector of RFC 6238 (SHA-1, 8 digits cut to 6)', () => {
    // The RFC secret "12345678901234567890" at T=59 gives 94287082, so the 6 digits are 287082.
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
  });

  it('round-trips base32', () => {
    const secret = newSecret();
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('accepts the current step and the one before it, refuses a replay and a stranger', () => {
    const secret = newSecret();
    const now = Date.now();
    const step = currentStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step - 5), null, now)).toBeNull();
    expect(verifyTotp(secret, '12ab56', null, now)).toBeNull();
  });
});

describe('backup codes', () => {
  it('makes ten distinct codes and hashes them the same way however they are typed', () => {
    const codes = newBackupCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(looksLikeBackupCode(code)).toBe(true);
      expect(hashBackupCode(code.toUpperCase())).toBe(hashBackupCode(code.replace('-', ' ')));
    }
  });
});
