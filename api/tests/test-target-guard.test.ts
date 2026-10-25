import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertDisposableDatabase,
  databaseNameFromUrl,
  isDisposableDatabaseName,
} from '../src/lib/test-target.js';

/**
 * The guard of the data.
 *
 * The suite of the platform truncates every table before each test, and the
 * scripts of the platform empty the tables and write orders. A guard that
 * fails open is not a guard, so the refusal is the default and it is proved
 * here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
/** The copy of the guard that the scripts with plain node use. */
const scriptGuard = path.resolve(here, '../../scripts/lib/assert-disposable-db.mjs');

describe('the guard of the data', () => {
  it('refuses a database that carries real data', () => {
    expect(() =>
      assertDisposableDatabase({ url: 'postgresql://blipmade:x@postgres:5432/blipmade', label: 'empty the tables' }),
    ).toThrow(/not a disposable one/i);
  });

  it('refuses a connection string that says nothing about the target', () => {
    expect(() => assertDisposableDatabase({ url: '', label: 'empty the tables' })).toThrow(/not a disposable one/i);
  });

  it('falls back to the environment when no connection string is given', () => {
    // The environment of the tests points at a disposable database, so the
    // fallback is accepted and the name of the target is returned.
    expect(assertDisposableDatabase({ label: 'empty the tables' })).toBe(
      databaseNameFromUrl(process.env.DATABASE_URL),
    );
  });

  it('refuses the name that only looks like a disposable one', () => {
    expect(() => assertDisposableDatabase({ url: 'postgresql://u:p@h:5432/_test', label: 'empty the tables' })).toThrow(
      /not a disposable one/i,
    );
  });

  it('accepts a disposable database', () => {
    expect(
      assertDisposableDatabase({ url: 'postgresql://blipmade:x@postgres:5432/blipmade_release_test', label: 'empty the tables' }),
    ).toBe('blipmade_release_test');
  });

  it('accepts a disposable database even when the name carries a query', () => {
    expect(
      assertDisposableDatabase({ url: 'postgresql://u:p@h:5432/blipmade_test?schema=public', label: 'empty the tables' }),
    ).toBe('blipmade_test');
  });

  it('lets the operator reach the production database out loud, and says so', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => {
      warnings.push(message);
    };
    try {
      expect(
        assertDisposableDatabase({
          url: 'postgresql://blipmade:x@postgres:5432/blipmade',
          label: 'empty the tables',
          allowProduction: true,
        }),
      ).toBe('blipmade');
    } finally {
      console.warn = original;
    }
    expect(warnings.join(' ')).toMatch(/explicit request of the operator/i);
  });

  it('reads the name of the database out of a connection string', () => {
    expect(databaseNameFromUrl('postgresql://u:p@h:5432/blipmade')).toBe('blipmade');
    expect(databaseNameFromUrl('postgresql://u:p@h:5432/blipmade?schema=public')).toBe('blipmade');
    expect(databaseNameFromUrl('')).toBe('');
    expect(databaseNameFromUrl(undefined)).toBe('');
    expect(isDisposableDatabaseName('blipmade_test')).toBe(true);
    expect(isDisposableDatabaseName('blipmade')).toBe(false);
    expect(isDisposableDatabaseName('_test')).toBe(false);
  });
});

describe('the copy of the guard that the scripts use', () => {
  /**
   * The scripts that run with plain node cannot import the module of the
   * platform, so they carry a copy of the rule. The copy is asked the same
   * questions here, so the two cannot drift apart.
   */
  function ask(expression: string): string {
    return execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `import { assertDisposableDatabase, databaseNameFromUrl, isDisposableDatabaseName } from '${scriptGuard}'; ${expression}`],
      { encoding: 'utf-8' },
    ).trim();
  }

  it('refuses the database of the platform, exactly like the module does', () => {
    const output = ask(
      "try { assertDisposableDatabase({ url: 'postgresql://u:p@h:5432/blipmade', label: 'empty the tables' }); console.log('ALLOWED'); } catch (error) { console.log('REFUSED'); }",
    );
    expect(output).toBe('REFUSED');
  });

  it('accepts a disposable database, exactly like the module does', () => {
    const output = ask(
      "console.log(assertDisposableDatabase({ url: 'postgresql://u:p@h:5432/blipmade_test', label: 'empty the tables' }));",
    );
    expect(output).toBe('blipmade_test');
  });

  it('reads the name of the database the same way', () => {
    expect(
      ask("console.log(databaseNameFromUrl('postgresql://u:p@h:5432/blipmade?schema=public'));"),
    ).toBe('blipmade');
    expect(ask("console.log(isDisposableDatabaseName('blipmade_test'));")).toBe('true');
    expect(ask("console.log(isDisposableDatabaseName('_test'));")).toBe('false');
  });
});
