import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../env.js';

/** Versioned encryption for long-lived credentials. */

const ALGORITHM = 'aes-256-gcm';
const LEGACY_VERSION = 'v1';
const ACTIVE_VERSION = 'v2';

function legacyKey(): Buffer {
  return scryptSync(env.SESSION_SECRET, 'blipmade:secret-box', 32);
}

function separateKey(): Buffer | null {
  if (!env.DATA_ENCRYPTION_SECRET) return null;
  return scryptSync(env.DATA_ENCRYPTION_SECRET, 'blipmade:data-encryption:v2', 32);
}

/** Encrypts with the independent data key when it has been configured. */
export function encryptSecret(plaintext: string): string {
  const modern = separateKey();
  const version = modern ? ACTIVE_VERSION : LEGACY_VERSION;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, modern ?? legacyKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Reads v1 and v2 during migration and fails closed for unknown or unavailable keys. */
export function decryptSecret(payload: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 4) return null;
  const [version, iv, tag, data] = parts;
  if (!iv || !tag || !data) return null;
  const key = version === LEGACY_VERSION ? legacyKey() : version === ACTIVE_VERSION ? separateKey() : null;
  if (!key) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Re-encrypts a readable v1 payload with the configured independent key. */
export function upgradeSecretEncryption(payload: string): string | null {
  if (!separateKey()) throw new Error('DATA_ENCRYPTION_SECRET must be configured before re-encryption.');
  const plaintext = decryptSecret(payload);
  if (plaintext === null) return null;
  if (payload.startsWith(`${ACTIVE_VERSION}.`)) return payload;
  return encryptSecret(plaintext);
}

/** Stable fingerprint under the active encryption key. */
export function secretFingerprint(secret: string): string {
  return createHmac('sha256', separateKey() ?? legacyKey()).update(secret).digest('hex').slice(0, 12);
}
