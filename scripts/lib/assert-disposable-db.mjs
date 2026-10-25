/**
 * The guard of the scripts that run with plain node.
 *
 * `scripts/perf-data-load.mjs` and `scripts/ops/seed-browser-account.mjs`
 * run without TypeScript, so they cannot import the module of the platform.
 * The rule is the same as the one in `api/src/lib/test-target.ts`:
 *
 *   a script that changes data only touches a database whose name ends with
 *   "_test", unless the operator said out loud that the target is the
 *   production database.
 *
 * The test `api/tests/test-target-guard.test.ts` checks that this copy and
 * the module of the platform answer the same, so the two cannot drift apart.
 */

/** The suffix every disposable database carries. */
export const DISPOSABLE_DATABASE_SUFFIX = '_test';

/**
 * The name of the database a connection string points at.
 *
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function databaseNameFromUrl(url) {
  if (!url) return '';
  const withoutQuery = String(url).split('?')[0] ?? '';
  return withoutQuery.split('/').pop() ?? '';
}

/**
 * True when the name is the name of a disposable database.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isDisposableDatabaseName(name) {
  return name.length > DISPOSABLE_DATABASE_SUFFIX.length && name.endsWith(DISPOSABLE_DATABASE_SUFFIX);
}

/**
 * Refuses to go on when the target is not a disposable database.
 *
 * @param {{ url?: string | null, label?: string, allowProduction?: boolean }} [options]
 * @returns {string} the name of the database when the target is allowed
 */
export function assertDisposableDatabase(options = {}) {
  const url = options.url ?? process.env.DATABASE_URL ?? '';
  const name = databaseNameFromUrl(url);
  const label = options.label ?? 'change the data';

  if (isDisposableDatabaseName(name)) return name;

  if (options.allowProduction) {
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
