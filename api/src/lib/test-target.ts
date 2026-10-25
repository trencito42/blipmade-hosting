/**
 * The guard of the tests and of the scripts that change data.
 *
 * A test or a script that empties tables, that writes rows or that sends
 * requests that create orders must never reach a database that carries real
 * data. The guard reads the name of the database from the connection string
 * and refuses to go on when that name does not end with "_test".
 *
 * The refusal is the default and not the exception. A script that really has
 * to work against the production database says so out loud, with a flag that
 * is printed in the output, so the intent is never hidden and never assumed.
 *
 * The same rule exists in `scripts/lib/assert-disposable-db.mjs` for the
 * scripts that run with plain node and cannot import a TypeScript module.
 * The test `api/tests/test-target-guard.test.ts` checks that both copies
 * answer the same, so the two cannot drift apart.
 */

/** The suffix every disposable database carries. */
export const DISPOSABLE_DATABASE_SUFFIX = '_test';

/**
 * The name of the database a connection string points at.
 *
 * The name is the last part of the path of the connection string, without the
 * query that carries the options. An empty string means the connection
 * string says nothing about the target, which is treated as a refusal.
 */
export function databaseNameFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  const withoutQuery = url.split('?')[0] ?? '';
  return withoutQuery.split('/').pop() ?? '';
}

/**
 * True when the name is the name of a disposable database.
 *
 * The name has to be more than the suffix itself: "_test" alone is not a
 * name of a database, it is a missing name.
 */
export function isDisposableDatabaseName(name: string): boolean {
  return name.length > DISPOSABLE_DATABASE_SUFFIX.length && name.endsWith(DISPOSABLE_DATABASE_SUFFIX);
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
      `A database this operation changes has to end with "${DISPOSABLE_DATABASE_SUFFIX}". ` +
      'Nothing was read and nothing was changed.',
  );
}
