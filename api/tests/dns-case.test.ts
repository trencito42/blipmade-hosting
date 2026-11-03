import { describe, expect, it } from 'vitest';
import { matchesToken } from '../src/services/dns.js';

describe('the proof of ownership of a domain', () => {
  const token = '0gwok_5SiQg_lXBEaCjZZhRzamOx5sHX';

  it('accepts the token as it was given', () => {
    expect(matchesToken([token], token)).toBe(true);
  });

  it('accepts the token written in lower case by a registrar', () => {
    expect(matchesToken([token.toLowerCase()], token)).toBe(true);
  });

  it('accepts the token among other values and with quotes or spaces around it', () => {
    expect(matchesToken(['v=spf1 mx -all', ` "${token.toLowerCase()}" `], token)).toBe(true);
  });

  it('refuses another token, a longer one and an empty one', () => {
    expect(matchesToken([token.replace('0', '1')], token)).toBe(false);
    expect(matchesToken([`${token}x`], token)).toBe(false);
    expect(matchesToken([''], token)).toBe(false);
    expect(matchesToken([token], '')).toBe(false);
  });
});
