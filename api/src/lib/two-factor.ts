import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Codes of an authenticator app (RFC 6238: SHA-1, 30 seconds, 6 digits) and the backup codes.
 *
 * The secret is 20 random bytes written in base32, which is the form every authenticator app
 * reads. A code is accepted in the step it was made for and in the steps next to it, so a clock
 * that is a little off still works, and a step is accepted once only.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Not base32.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary =
    ((digest[offset]! & 127) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()): number => Math.floor(now / 1000 / STEP_SECONDS);

/** The code for a step, for the tests. */
export const totpAt = (secret: string, step: number): string => codeAt(secret, step);

/**
 * Checks a code. Returns the step it belongs to, or null. A step that is not after
 * `lastUsedStep` is refused, so a code seen once cannot be replayed.
 */
export function verifyTotp(secret: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const center = currentStep(now);
  for (const step of [center, center - 1, center + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(codeAt(secret, step));
    const given = Buffer.from(clean);
    if (expected.length === given.length && timingSafeEqual(expected, given)) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = 'Blipmade'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// --- backup codes -------------------------------------------------------------

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Ten codes of the form xxxxx-xxxxx. The plain codes are shown once; only hashes are stored. */
export function newBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export const normalizeBackupCode = (code: string): string => code.toLowerCase().replace(/[^a-z0-9]/g, '');

export const hashBackupCode = (code: string): string => createHash('sha256').update(normalizeBackupCode(code)).digest('hex');

export const looksLikeBackupCode = (code: string): boolean => normalizeBackupCode(code).length === 10;
