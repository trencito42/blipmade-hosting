import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/env.js';
import { decryptSecret, encryptSecret, upgradeSecretEncryption } from '../src/lib/secrets.js';

const editable = env as unknown as { SESSION_SECRET: string; DATA_ENCRYPTION_SECRET: string };
const initialSession = editable.SESSION_SECRET;
const initialData = editable.DATA_ENCRYPTION_SECRET;

afterEach(() => {
  editable.SESSION_SECRET = initialSession;
  editable.DATA_ENCRYPTION_SECRET = initialData;
});

describe('long-lived credential encryption keys', () => {
  it('keeps v1 decryptable for migration and v2 readable after session rotation', () => {
    editable.DATA_ENCRYPTION_SECRET = '';
    editable.SESSION_SECRET = 'test-session-secret-before-rotation';
    const legacy = encryptSecret('customer-credential');
    expect(legacy.startsWith('v1.')).toBe(true);

    editable.DATA_ENCRYPTION_SECRET = 'independent-data-encryption-secret-over-32-characters';
    expect(decryptSecret(legacy)).toBe('customer-credential');
    const modern = upgradeSecretEncryption(legacy);
    expect(modern?.startsWith('v2.')).toBe(true);
    expect(decryptSecret(modern!)).toBe('customer-credential');

    editable.SESSION_SECRET = 'rotated-session-secret-after-deploy';
    expect(decryptSecret(modern!)).toBe('customer-credential');
    expect(decryptSecret(legacy)).toBeNull();
    expect(upgradeSecretEncryption(modern!)).toBe(modern);
  });

  it('fails closed on a missing or incorrect independent key', () => {
    editable.DATA_ENCRYPTION_SECRET = 'correct-independent-key-over-thirty-two-chars';
    const modern = encryptSecret('sensitive-value');
    expect(modern.startsWith('v2.')).toBe(true);
    editable.DATA_ENCRYPTION_SECRET = '';
    expect(decryptSecret(modern)).toBeNull();
    editable.DATA_ENCRYPTION_SECRET = 'wrong-independent-key-but-still-long-enough';
    expect(decryptSecret(modern)).toBeNull();
  });

  it('does not silently re-encrypt unreadable legacy credentials', () => {
    editable.DATA_ENCRYPTION_SECRET = 'independent-data-encryption-secret-over-32-characters';
    expect(upgradeSecretEncryption('v1.invalid.invalid.invalid')).toBeNull();
    expect(decryptSecret('v3.invalid.invalid.invalid')).toBeNull();
  });
});
