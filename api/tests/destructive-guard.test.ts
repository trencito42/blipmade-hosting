import { describe, expect, it } from 'vitest';
import {
  ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE,
  assertDestructiveTargetIsSafe,
  destructiveTarget,
} from '../src/lib/destructive-guard.js';

/**
 * The guard of the destructive commands.
 *
 * The seed of the platform refused the live database, but it refused it after
 * the schema had already been rebuilt: `prisma migrate reset` drops the schema
 * first and runs the seed afterwards. The guard that stands in front of the
 * destructive commands is the one that has to refuse, and it is proved here.
 */

describe('the guard of the destructive commands', () => {
  it('refuses the live database of the platform', () => {
    const target = destructiveTarget('postgresql://blipmade:x@postgres:5432/blipmade', undefined);
    expect(target.allowed).toBe(false);
    expect(target.database).toBe('blipmade');
  });

  it('refuses a connection string that says nothing about the target', () => {
    expect(destructiveTarget('', undefined).allowed).toBe(false);
    expect(destructiveTarget(undefined, undefined).allowed).toBe(false);
  });

  it('accepts a database whose name says that it may be thrown away', () => {
    for (const name of ['blipmade_test', 'blipmade_drill', 'blipmade_scratch', 'blipmade_check']) {
      expect(destructiveTarget(`postgresql://u:p@h:5432/${name}`, undefined).allowed).toBe(true);
    }
  });

  it('refuses a name that only looks like a disposable one', () => {
    expect(destructiveTarget('postgresql://u:p@h:5432/_test', undefined).allowed).toBe(false);
    expect(destructiveTarget('postgresql://u:p@h:5432/blipmade_testy', undefined).allowed).toBe(false);
  });

  it('lets the operator through out loud, and says so', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => {
      warnings.push(message);
    };
    try {
      expect(
        assertDestructiveTargetIsSafe({
          url: 'postgresql://blipmade:x@postgres:5432/blipmade',
          label: 'reset the database',
          allowProduction: 'true',
        }),
      ).toBe('blipmade');
    } finally {
      console.warn = original;
    }
    expect(warnings.join(' ')).toMatch(/explicit request of the operator/i);
    expect(warnings.join(' ')).toContain(ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE);
  });

  it('says what the command would have destroyed', () => {
    expect(() =>
      assertDestructiveTargetIsSafe({
        url: 'postgresql://blipmade:x@postgres:5432/blipmade',
        label: 'reset the database',
      }),
    ).toThrow(/Refusing to reset the database\./i);
    expect(() =>
      assertDestructiveTargetIsSafe({
        url: 'postgresql://blipmade:x@postgres:5432/blipmade',
        label: 'reset the database',
      }),
    ).toThrow(/The database "blipmade" is not one that may be thrown away/i);
    expect(() =>
      assertDestructiveTargetIsSafe({
        url: 'postgresql://blipmade:x@postgres:5432/blipmade',
        label: 'reset the database',
      }),
    ).toThrow(/2026-10-26/);
  });

  it('refuses by default, even when the environment says otherwise', () => {
    const original = process.env[ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE];
    process.env[ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE] = 'true';
    try {
      // The variable of the environment is only read when the caller does not
      // say anything, and the caller of the guard always says something.
      const target = destructiveTarget('postgresql://u:p@h:5432/blipmade', undefined);
      expect(target.allowed).toBe(false);
    } finally {
      if (original === undefined) delete process.env[ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE];
      else process.env[ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE] = original;
    }
  });
});
