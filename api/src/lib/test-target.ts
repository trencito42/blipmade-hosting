/**
 * The guard of the data.
 *
 * The suite of the platform truncates every table before each test, and the
 * scripts of the platform empty the tables and write orders. A guard that
 * fails open is not a guard, so the refusal is the default and it is proved
 * in the test of the guard.
 *
 * The rule is written in `api/src/lib/database-target.ts`, and the copy of it
 * for the scripts of plain node is in `scripts/lib/assert-disposable-db.mjs`.
 * The test `api/tests/database-target.test.ts` asks both of them the same
 * questions, so the two cannot drift apart.
 */

import {
  DISPOSABLE_DATABASE_SUFFIXES,
  databaseNameOf,
  isDisposableDatabaseName as isDisposableName,
} from './database-target.js';

/** The suffixes a disposable database may carry. */
export { DISPOSABLE_DATABASE_SUFFIXES };

/**
 * The name of the database a connection string points at.
 *
 * The name is the last part of the path of the connection string, without
 * the query that carries the options. An empty string means the connection
 * string says nothing about the target, which is treated as a refusal.
 */
export function databaseNameFromUrl(url: string | null | undefined): string {
  return databaseNameOf(url);
}

/**
 * True when the name is the name of a disposable database.
 *
 * The name has to be more than the suffix itself: "_test" alone is not a
 * name of a database, it is a missing name.
 */
export function isDisposableDatabaseName(name: string): boolean {
  return isDisposableName(name);
}

export interface DisposableDatabaseOptions {
  /** The connection string. The environment is used when it is not given. */
  url?: string | null;
  /** What the operation does, in words that end up in the refusal. */
  label?: string;
  /**
   * Set only when the operator has said, out loud, that the target is the
   * production database. The override is announced in the output.
   */
  allowProduction?: boolean;
}

/**
 * Refuses to go on when the target is not a disposable database.
 *
 * It returns the name of the database when the target is allowed, so the
 * caller can print it.
 */
export function assertDisposableDatabase(options: DisposableDatabaseOptions = {}): string {
  const url = options.url ?? process.env.DATABASE_URL ?? '';
  const name = databaseNameFromUrl(url);
  const label = options.label ?? 'change the data';

  if (isDisposableDatabaseName(name)) return name;

  if (options.allowProduction) {
    // The operator said so, and the output says so too.
    console.warn(
      `[guard] ${label} is allowed to touch the database "${name || 'an unknown database'}" on the explicit request of the operator.`,
    );
    return name;
  }

  throw new Error(
    `Refusing to ${label}: the database "${name || 'an unknown database'}" is not a disposable one. ` +
      `A database this operation changes has to end with ${DISPOSABLE_DATABASE_SUFFIXES.map((suffix) => `"${suffix}"`).join(', ')}. ` +
      'Nothing was read and nothing was changed.',
  );
}
