import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../env.js';

/**
 * Encryption for credentials that the platform has to keep but must never
 * store in the clear, such as the Pterodactyl panel password of a customer
 * account.
 *
 * The key is derived from the session secret, so rotating the secret makes
 * existing values unreadable and they have to be reset.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function deriveKey(): Buffer {
  return scryptSync(env.SESSION_SECRET, 'blipmade:secret-box', 32);
}

/** Encrypts a secret with AES-256-GCM. The output is safe to store as text. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

/**
 * Decrypts a value produced by `encryptSecret`. Returns null when the value
 * was written with another key, which happens after the secret was rotated.
 */
export function decryptSecret(payload: string): string | null {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Stable fingerprint of a secret, safe to show in the admin interface. */
export function secretFingerprint(secret: string): string {
  return createHmac('sha256', deriveKey()).update(secret).digest('hex').slice(0, 12);
}
