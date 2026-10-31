import { describe, expect, it } from 'vitest';
import { hashApiKey, KEY_PREFIX, looksLikeApiKey, newApiKey } from '../src/lib/api-keys.js';

describe('the keys of the API', () => {
  it('makes a key of the right shape, whose hash is stored and not the key', () => {
    const made = newApiKey();
    expect(made.key.startsWith(KEY_PREFIX)).toBe(true);
    expect(made.key).toHaveLength(KEY_PREFIX.length + 40);
    expect(looksLikeApiKey(made.key)).toBe(true);
    expect(made.hash).toBe(hashApiKey(made.key));
    expect(made.hash).not.toContain(made.key);
    expect(made.prefix).toBe(made.key.slice(0, 12));
  });

  it('never makes the same key twice', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newApiKey().key));
    expect(keys.size).toBe(50);
  });

  it('refuses a value that is not a key', () => {
    expect(looksLikeApiKey(undefined)).toBe(false);
    expect(looksLikeApiKey('bmk_short')).toBe(false);
    expect(looksLikeApiKey('Bearer something')).toBe(false);
  });
});
