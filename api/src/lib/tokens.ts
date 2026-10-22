import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token. 32 bytes of entropy, base64url encoded. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored hashed so a database leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Human-facing order/ticket reference. */
export function reference(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

export function randomDigits(length = 6): string {
  const max = 10 ** length;
  return String(randomBytes(4).readUInt32BE(0) % max).padStart(length, '0');
}
