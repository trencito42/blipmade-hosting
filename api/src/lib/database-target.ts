/**
 * The target of a database operation.
 *
 * The rule that decides whether an operation may touch a database is written
 * in this file and nowhere else. It used to live in four places: the guard of
 * the suite, the copy of that guard for the scripts of plain node, the guard
 * of the seed and the script that resets a test database. The four did not
 * agree on what a disposable database is, so an operation that one of them
 * refused was allowed by another one.
 *
 * The rule is the name of the database and nothing else. The name is the only
 * thing that is known before the first write, and the live database of the
 * platform is named `blipmade`: it carries no suffix, so it is refused by
 * every copy of the rule.
 */

/**
 * The suffixes a disposable database may carry.
 *
 * The suffix is a suffix and not a list of names, because a name that is not
 * in a list is a name that gets added to the list in a hurry.
 *
 * - `_test`   the database of the suite of the platform;
 * - `_drill`  the database of a drill of the backups;
 * - `_scratch` a database that is written and thrown away;
 * - `_check`  a database that is compared with another one.
 */
export const DISPOSABLE_DATABASE_SUFFIXES = ['_test', '_drill', '_scratch', '_check'] as const;

/**
 * The name of the database a connection string points at.
 *
 * The url is not parsed as a url, because the password of a database may
 * hold a "/" and a "?" and the name is simply the last part of the path.
 */
export function databaseNameOf(url: string | null | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0];
  const withoutCredentials = withoutQuery.slice(withoutQuery.lastIndexOf('@') + 1);
  const segments = withoutCredentials.split('/');
  return (segments[segments.length - 1] ?? '').trim();
}

/**
 * True when the name is the name of a disposable database.
 *
 * The name has to be more than the suffix itself: `_test` alone is not a
 * name of a database, it is a missing name.
 */
export function isDisposableDatabaseName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return DISPOSABLE_DATABASE_SUFFIXES.some(
    (suffix) => trimmed.length > suffix.length && trimmed.toLowerCase().endsWith(suffix),
  );
}

/** What the platform knows about the target of an operation. */
export interface DatabaseTarget {
  /** The name of the database the operation would touch. */
  database: string;
  /** Whether the database is a disposable one. */
  disposable: boolean;
  /** The suffixes a disposable database may carry. */
  suffixes: readonly string[];
}

/**
 * Says what the platform knows about the target of an operation.
 *
 * The decision is a pure function of the connection string, so it can be
 * checked without a database and without a running platform.
 */
export function databaseTarget(url: string | null | undefined): DatabaseTarget {
  const database = databaseNameOf(url);
  return {
    database,
    disposable: isDisposableDatabaseName(database),
    suffixes: DISPOSABLE_DATABASE_SUFFIXES,
  };
}
