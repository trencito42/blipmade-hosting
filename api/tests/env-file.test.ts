import { describe, expect, it } from 'vitest';
import { applyEnv, parseEnv } from '../src/lib/env-file.js';

describe('env file', () => {
  it('reads plain, quoted and commented values', () => {
    const text = '# comment\nA=1\nexport B="two words"\nC=\'x y\'\nD=value # note\n\nE=\n';
    expect(parseEnv(text)).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'two words' },
      { key: 'C', value: 'x y' },
      { key: 'D', value: 'value' },
      { key: 'E', value: '' },
    ]);
  });
  it('keeps comments and blank lines and changes a value in place', () => {
    const out = applyEnv('# keys\nA=1\n\nB=2\n', [{ key: 'A', value: '1' }, { key: 'B', value: '3' }]);
    expect(out).toBe('# keys\nA=1\n\nB=3\n');
  });
  it('removes a variable and adds a new one at the end', () => {
    expect(applyEnv('A=1\nB=2\n', [{ key: 'B', value: '2' }, { key: 'C', value: 'x y' }])).toBe('B=2\nC="x y"\n');
  });
  it('writes a file that did not exist', () => {
    expect(applyEnv('', [{ key: 'TOKEN', value: 'abc' }])).toBe('TOKEN=abc\n');
  });
  it('round-trips a value with quotes and a hash', () => {
    const value = 'a "b" #c';
    expect(parseEnv(applyEnv('', [{ key: 'X', value }]))).toEqual([{ key: 'X', value }]);
  });
});
