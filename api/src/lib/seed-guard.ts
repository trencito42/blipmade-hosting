/**
 * The guard of the seed.
 *
 * The seed writes the catalog of the platform and the first administrator. It
 * is meant to run against a scratch database: the catalog is written over and
 * over, and a database that holds the accounts, the orders and the services
 * of the customers is not a place for that.
 *
 * On 2026-10-26 the seed of the draft products of the hosted mail was run
 * against the live database of the platform. The schema was rebuilt, the
 * catalog was written into it, and every row of every customer was gone:
 * five services, four accounts, ten orders, a ticket and seven hundred
 * entries of the audit trail. The platform was put back from the backup of
 * the night, and the interruption was paid for by the customers.
 *
 * This guard is here so that the same thing cannot happen twice. The seed
 * only writes into a database whose name says that it is a scratch one. The
 * live database of the platform is named `blipmade`, and it is refused.
 *
 * The way out is `ALLOW_PRODUCTION_SEED=true`. It exists because a refusal
 * that cannot be lifted is a refusal that gets worked around in a worse way.
 * A person who sets it has read this.
 */

/**
 * The names a scratch database may have.
 *
 * The name of the database is the only thing that is known before the first
 * write, so it is the only thing that can be checked. The rule is a suffix
 * and not a list of names, because a name that is not in a list is a name
 * that gets added to the list in a hurry.
 */
const SCRATCH_NAME = /(_test|_drill|_scratch|_check)$/i;

/** What the guard decided about the target of a seed. */
export interface SeedTarget {
  /** The name of the database the seed would write into. */
  database: string;
  /** Whether the seed may write into it. */
  allowed: boolean;
  /** Why it may not, in words that fit in a line of a log. */
  reason: string;
}

/**
 * The name of the database of a url.
 *
 * The url is not parsed as a url, because the password of a database may
 * hold a "/" and a "?" and the name is simply the last part of the path.
 */
export function databaseNameOf(url: string | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0];
  const withoutCredentials = withoutQuery.slice(withoutQuery.lastIndexOf('@') + 1);
  const segments = withoutCredentials.split('/');
  return (segments[segments.length - 1] ?? '').trim();
}

/**
 * Decides whether the seed may write into the database of an url.
 *
 * The decision is a pure function of the two values, so it can be checked
 * without a database and without a running platform.
 */
export function seedTarget(
  databaseUrl: string | undefined,
  allowProduction: string | undefined,
): SeedTarget {
  const database = databaseNameOf(databaseUrl);
  if (!database) {
    return {
      database,
      allowed: false,
      reason: 'the database of the url could not be read',
    };
  }
  if (SCRATCH_NAME.test(database)) {
    return {
      database,
      allowed: true,
      reason: 'the name of the database says that it is a scratch one',
    };
  }
  if (allowProduction === 'true') {
    return {
      database,
      allowed: true,
      reason: 'ALLOW_PRODUCTION_SEED=true was set',
    };
  }
  return {
    database,
    allowed: false,
    reason: 'the name of the database does not say that it is a scratch one',
  };
}

/**
 * Refuses to continue when the seed would write into a live database.
 *
 * The message says what happened, because the person who reads it is at that
 * moment holding a command that would destroy the platform.
 */
export function assertSeedTargetIsSafe(): void {
  const target = seedTarget(process.env.DATABASE_URL, process.env.ALLOW_PRODUCTION_SEED);
  if (target.allowed) return;
  console.error(
    [
      `The seed refuses to write into the database "${target.database}": ${target.reason}.`,
      'The seed is only allowed into a scratch database whose name ends with _test, _drill, _scratch or _check.',
      'The live database of the platform holds the accounts, the orders and the services of the customers.',
      'On 2026-10-26 a seed was run against it, and every one of those rows had to be restored from a backup.',
      'To do it anyway, set ALLOW_PRODUCTION_SEED=true and run the seed again.',
    ].join('\n'),
  );
  process.exit(1);
}
