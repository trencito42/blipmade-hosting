import { createHash, randomBytes } from 'node:crypto';

/**
 * Keys of the API. A key is `bmk_` and 40 characters, made from random bytes. It is shown once,
 * when it is made; only its SHA-256 is stored, so a leak of the database does not leak the keys.
 */
export const KEY_PREFIX = 'bmk_';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const bytes = randomBytes(40);
  const body = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
  const key = `${KEY_PREFIX}${body}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export const hashApiKey = (key: string): string => createHash('sha256').update(key).digest('hex');

export const looksLikeApiKey = (value: string | undefined): value is string => Boolean(value && value.startsWith(KEY_PREFIX) && value.length === KEY_PREFIX.length + 40);
