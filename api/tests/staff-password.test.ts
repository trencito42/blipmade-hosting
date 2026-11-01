import { describe, expect, it } from 'vitest';
import { passwordProblems, staffPasswordProblems } from '../src/lib/password.js';

describe('passwords', () => {
  it('refuses the passwords every attack list starts with', () => {
    expect(passwordProblems('Password123').join(' ')).toContain('too common');
    expect(passwordProblems('Tr0ub4dor-Horse-Staple')).toEqual([]);
  });
  it('asks staff for more length', () => {
    expect(staffPasswordProblems('Abcdefgh12345').join(' ')).toContain('Staff passwords need at least 14');
    expect(staffPasswordProblems('Abcdefgh123456')).toEqual([]);
  });
});
