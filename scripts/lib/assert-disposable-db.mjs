/**
 * The guard of the data, for the scripts that run with plain node.
 *
 * The rule is the one of `api/src/lib/database-target.ts`, and the test
 * `api/tests/database-target.test.ts` asks this copy and the module of the
 * platform the same questions, so the two cannot drift apart.
 */

/** The suffixes a disposable database may carry. */
export const DISPOSABLE_DATABASE_SUFFIXES = ['_test', '_drill', '_scratch', '_check'];

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
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return false;
  return DISPOSABLE_DATABASE_SUFFIXES.some(
    (suffix) => trimmed.length > suffix.length && trimmed.toLowerCase().endsWith(suffix),
  );
}

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
      `A database this operation changes has to end with ${DISPOSABLE_DATABASE_SUFFIXES.map((suffix) => `"${suffix}"`).join(', ')}. ` +
      'Nothing was read and nothing was changed.',
  );
}
