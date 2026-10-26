import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DISPOSABLE_DATABASE_SUFFIXES,
  databaseNameOf,
  isDisposableDatabaseName,
} from '../src/lib/database-target.js';
import { isDisposableDatabaseName as guardOfTheSuite } from '../src/lib/test-target.js';
import { seedTarget } from '../src/lib/seed-guard.js';

/**
 * One rule, one place.
 *
 * The rule that decides whether an operation may touch a database was written
 * in four places, and the four did not agree: the guard of the suite and the
 * copy of it for the scripts of plain node knew only about `_test`, while the
 * guard of the seed and the script that resets a test database knew about
 * four suffixes. An operation that one copy refused was allowed by another
 * one.
 *
 * The rule is now in `api/src/lib/database-target.ts`, and the copies are
 * asked the same questions here, so they cannot drift apart again.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
/** The copy of the guard that the scripts with plain node use. */
const scriptGuard = path.resolve(repo, 'scripts/lib/assert-disposable-db.mjs');
/** The script that resets a database. */
const resetScript = path.resolve(repo, 'scripts/reset-test-db.sh');

/** The names every copy of the rule is asked about. */
const NAMES = [
  'blipmade',
  'blipmade_test',
  'blipmade_drill',
  'blipmade_scratch',
  'blipmade_check',
  'blipmade_testy',
  '_test',
  '',
];

describe('the rule of the disposable databases', () => {
  it('knows the four suffixes a disposable database may carry', () => {
    expect([...DISPOSABLE_DATABASE_SUFFIXES]).toEqual(['_test', '_drill', '_scratch', '_check']);
  });

  it('reads the name of the database out of a connection string', () => {
    expect(databaseNameOf('postgresql://u:p@h:5432/blipmade')).toBe('blipmade');
    expect(databaseNameOf('postgresql://u:p@h:5432/blipmade?schema=public')).toBe('blipmade');
    expect(databaseNameOf('postgresql://u:p@h:5432/')).toBe('');
    expect(databaseNameOf(undefined)).toBe('');
  });

  it('is the rule of the suite', () => {
    for (const name of NAMES) {
      expect(guardOfTheSuite(name)).toBe(isDisposableDatabaseName(name));
    }
  });

  it('is the rule of the seed', () => {
    for (const name of NAMES) {
      const target = seedTarget(`postgresql://u:p@h:5432/${name}`, undefined);
      expect(target.allowed).toBe(isDisposableDatabaseName(name));
    }
  });

  it('is the rule of the scripts of plain node', () => {
    for (const name of NAMES) {
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { isDisposableDatabaseName } from '${scriptGuard}'; console.log(isDisposableDatabaseName('${name}'));`,
        ],
        { encoding: 'utf-8' },
      ).trim();
      expect(output).toBe(String(isDisposableDatabaseName(name)));
    }
  });

  it('is the rule of the script that resets a database', async () => {
    const source = await readFile(resetScript, 'utf-8');
    for (const suffix of DISPOSABLE_DATABASE_SUFFIXES) {
      expect(source).toContain(suffix);
    }
  });

  it('refuses, before anything is touched, a database of the platform', () => {
    // The script is asked to reset a database whose name does not say that it
    // may be thrown away. The refusal happens before the script connects to
    // anything, so nothing can be changed by this test.
    let output = '';
    let status = 0;
    try {
      output = execFileSync('bash', [resetScript, 'blipmade'], { encoding: 'utf-8', stdio: 'pipe' });
    } catch (error) {
      status = (error as { status?: number }).status ?? 1;
      output = `${(error as { stdout?: string }).stdout ?? ''}${(error as { stderr?: string }).stderr ?? ''}`;
    }
    expect(status).not.toBe(0);
    expect(output).toMatch(/refus/i);
  });
});
