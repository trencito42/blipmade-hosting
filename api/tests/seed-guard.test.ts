import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { databaseNameOf, seedTarget } from '../src/lib/seed-guard.js';

/**
 * The guard of the seed.
 *
 * On 2026-10-26 the seed of the platform was run against the live database.
 * The schema was rebuilt, the catalog was written into it, and every row of
 * every customer was gone: five services, four accounts, ten orders, a ticket
 * and seven hundred entries of the audit trail. The platform was put back
 * from the backup of the night.
 *
 * The guard is the thing that keeps that from happening a second time, so it
 * is checked twice here: first that it decides correctly, and then that the
 * seed really asks it before it writes anything.
 */

const ROOT = resolve(process.cwd(), '..');
const SEED = join(ROOT, 'api', 'prisma', 'seed.ts');

/** The urls of the databases the platform uses. */
const LIVE = 'postgresql://blipmade:secret@postgres:5432/blipmade';
const SCRATCH = 'postgresql://blipmade:secret@postgres:5432/blipmade_test';
const DRILL = 'postgresql://blipmade:secret@postgres:5432/blipmade_offsite_drill';
const WITH_QUERY = 'postgresql://blipmade:secret@postgres:5432/blipmade_test?schema=public';
const WITH_AT_SIGN = 'postgresql://user:p@ss@postgres:5432/blipmade_test';

describe('the name of the database of an url', () => {
  it('is the last part of the path', () => {
    expect(databaseNameOf(LIVE)).toBe('blipmade');
    expect(databaseNameOf(SCRATCH)).toBe('blipmade_test');
  });

  it('ignores the query of the url', () => {
    expect(databaseNameOf(WITH_QUERY)).toBe('blipmade_test');
  });

  it('keeps a password that holds an at sign or a slash', () => {
    expect(databaseNameOf(WITH_AT_SIGN)).toBe('blipmade_test');
    expect(databaseNameOf('postgresql://u:p/w@postgres:5432/blipmade_test')).toBe('blipmade_test');
  });

  it('is empty when there is nothing to read', () => {
    expect(databaseNameOf(undefined)).toBe('');
    expect(databaseNameOf('')).toBe('');
  });
});

describe('the decision of the guard', () => {
  it('refuses the live database of the platform', () => {
    const target = seedTarget(LIVE, undefined);
    expect(target.allowed).toBe(false);
    expect(target.database).toBe('blipmade');
    expect(target.reason.length).toBeGreaterThan(10);
  });

  it('refuses the live database even when the allowance is something else', () => {
    expect(seedTarget(LIVE, 'false').allowed).toBe(false);
    expect(seedTarget(LIVE, '1').allowed).toBe(false);
    expect(seedTarget(LIVE, 'TRUE').allowed).toBe(false);
    expect(seedTarget(LIVE, 'yes').allowed).toBe(false);
  });

  it('allows a scratch database', () => {
    expect(seedTarget(SCRATCH, undefined).allowed).toBe(true);
    expect(seedTarget(DRILL, undefined).allowed).toBe(true);
    expect(seedTarget(WITH_QUERY, undefined).allowed).toBe(true);
  });

  it('allows the live database when the operator says so', () => {
    const target = seedTarget(LIVE, 'true');
    expect(target.allowed).toBe(true);
    expect(target.reason).toContain('ALLOW_PRODUCTION_SEED');
  });

  it('refuses when the url cannot be read', () => {
    expect(seedTarget(undefined, undefined).allowed).toBe(false);
    expect(seedTarget('', undefined).allowed).toBe(false);
  });

  it('does not let a name that only looks like a scratch one through', () => {
    expect(seedTarget('postgresql://u:p@postgres:5432/blipmade_test_backup', undefined).allowed).toBe(false);
    expect(seedTarget('postgresql://u:p@postgres:5432/testblipmade', undefined).allowed).toBe(false);
    expect(seedTarget('postgresql://u:p@postgres:5432/blipmade_production', undefined).allowed).toBe(false);
  });
});

describe('the seed of the platform', () => {
  it('asks the guard before it writes anything', async () => {
    const source = await readFile(SEED, 'utf-8');

    const guard = source.indexOf('assertSeedTargetIsSafe();');
    const firstWrite = source.indexOf('await prisma.');

    expect(guard, 'the seed does not call the guard').toBeGreaterThan(-1);
    expect(firstWrite, 'the seed does not write anything').toBeGreaterThan(-1);
    expect(guard, 'the seed writes before the guard is asked').toBeLessThan(firstWrite);
  });

  it('imports the guard', async () => {
    const source = await readFile(SEED, 'utf-8');
    expect(source).toContain("from '../src/lib/seed-guard.js'");
  });
});
