/**
 * The guard of the destructive commands.
 *
 * The guard of the seed refuses a database that holds the rows of the
 * customers, but it runs *after* the schema has been rebuilt: `prisma migrate
 * reset` drops the schema, applies the migrations again and only then runs
 * the seed. On 2026-10-26 that command was run with a connection string that
 * pointed at the live database of the platform, and every row of every
 * customer was gone before the seed had the chance to refuse anything.
 *
 * This guard is the one that stands *before* the change: the commands that
 * destroy a schema ask it first, and it refuses a database whose name does
 * not say that it may be thrown away.
 *
 * The way out is `ALLOW_PRODUCTION_DESTRUCTIVE=true`. It is a different
 * variable than the one of the seed, because the two commands do different
 * things: the seed writes the catalog over and over, and the reset drops the
 * schema. A person who sets it has read this.
 */

import { databaseTarget, type DatabaseTarget } from './database-target.js';

/** The variable that lets a destructive command touch a live database. */
export const ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE = 'ALLOW_PRODUCTION_DESTRUCTIVE';

/** What the guard decided about the target of a destructive command. */
export interface DestructiveTarget extends DatabaseTarget {
  /** Whether the command may go on. */
  allowed: boolean;
  /** Why it may, or why it may not, in words that fit in a line of a log. */
  reason: string;
}

/**
 * Decides whether a destructive command may touch the database of an url.
 *
 * The decision is a pure function of the two values, so it can be checked
 * without a database and without a running platform.
 */
export function destructiveTarget(
  databaseUrl: string | undefined,
  allowProduction: string | undefined,
): DestructiveTarget {
  const target = databaseTarget(databaseUrl);
  if (!target.database) {
    return { ...target, allowed: false, reason: 'the database of the url could not be read' };
  }
  if (target.disposable) {
    return {
      ...target,
      allowed: true,
      reason: `the name of the database says that it may be thrown away (${target.suffixes.join(', ')})`,
    };
  }
  if (allowProduction === 'true') {
    return {
      ...target,
      allowed: true,
      reason: `${ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE}=true was set`,
    };
  }
  return {
    ...target,
    allowed: false,
    reason: 'the name of the database does not say that it may be thrown away',
  };
}

/**
 * The words of a refusal.
 *
 * The person who reads them is holding a command that would destroy the
 * platform, so the words say what the command does and what happened the
 * last time it was run.
 */
export function destructiveRefusal(target: DestructiveTarget, label: string): string {
  return [
    `Refusing to ${label}.`,
    `The database "${target.database || 'an unknown database'}" is not one that may be thrown away: ${target.reason}.`,
    `A database this command destroys has to end with ${target.suffixes.map((suffix) => `"${suffix}"`).join(', ')}.`,
    'The live database of the platform is named "blipmade", and it holds the accounts, the orders and the services of the customers.',
    'On 2026-10-26 such a command was run against it, and every one of those rows had to be restored from a backup.',
    `To do it anyway, set ${ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE}=true and run the command again.`,
  ].join('\n');
}

/**
 * Refuses to go on when the target of a destructive command is not disposable.
 *
 * The function throws, so a script that runs it stops before it destroys
 * anything. The command that has to run is part of the message, so the person
 * who reads it knows what was refused.
 */
export function assertDestructiveTargetIsSafe(options: {
  url?: string | undefined;
  label?: string;
  allowProduction?: string | undefined;
} = {}): string {
  const url = options.url ?? process.env.DATABASE_URL ?? '';
  const allowProduction =
    options.allowProduction ?? process.env[ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE] ?? undefined;
  const target = destructiveTarget(url, allowProduction);
  const label = options.label ?? 'destroy';

  if (!target.allowed) {
    throw new Error(destructiveRefusal(target, label));
  }
  if (allowProduction === 'true') {
    console.warn(
      `[guard] ${label} the database "${target.database}" is allowed on the explicit request of the operator (${ALLOW_PRODUCTION_DESTRUCTIVE_VARIABLE}=true).`,
    );
  }
  return target.database;
}
