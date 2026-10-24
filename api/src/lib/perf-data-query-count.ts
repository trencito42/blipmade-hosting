import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * The number of the calls of the database that a request makes.
 *
 * A request that reads the database once per row of a list is slow in a way
 * that no index can repair: the cost of the request grows with the number of
 * the rows of the list, and the list grows with the number of the customers
 * of the platform. The counters below count the calls of Prisma, so a request
 * like that is seen instead of guessed at.
 *
 * The counters are wrapped around the delegates of the client, so nothing of
 * the application has to be changed to count them.
 */

type Counts = Map<string, number>;

let counting = false;
let counts: Counts = new Map();

/**
 * The methods of the delegate of a model.
 *
 * The delegate is a proxy, so its prototype is the one of a plain object and
 * the names of the methods are not on it. The names of the methods are the
 * own names of the delegate itself.
 */
function delegateMethods(delegate: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const holder = delegate as Record<string, unknown>;
  for (const key of Object.keys(holder)) {
    if (typeof holder[key] === 'function') names.add(key);
  }
  return [...names];
}

/** Wraps the methods of a delegate, so every call is counted. */
function wrapDelegate(model: string): void {
  const delegate = (prisma as unknown as Record<string, unknown>)[model] as Record<string, unknown> | undefined;
  if (!delegate) return;
  for (const key of delegateMethods(delegate)) {
    const original = delegate[key];
    if (typeof original !== 'function') continue;
    delegate[key] = function patched(...args: unknown[]) {
      if (counting) {
        const label = `${model}.${key}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

/** Wraps the plain SQL of the client, so it is counted as well. */
function wrapRaw(): void {
  for (const key of ['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$transaction']) {
    const original = (prisma as unknown as Record<string, unknown>)[key];
    if (typeof original !== 'function') continue;
    (prisma as unknown as Record<string, unknown>)[key] = function patched(...args: unknown[]) {
      if (counting) {
        const label = `raw.${key.replace(/^\$/, '')}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

let instrumented = false;

/** Starts the counting. It is safe to call it twice. */
export function instrumentPrisma(): void {
  if (instrumented) return;
  instrumented = true;
  for (const model of Prisma.dmmf.datamodel.models.map((entry) => entry.name)) {
    // The client names the delegate of a model with a small first letter, the
    // way the model is written: the model "AuditLog" is "auditLog" on the
    // client.
    const name = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
    wrapDelegate(name);
  }
  wrapRaw();
}

/** The counters start again from zero, and every call is counted. */
export function startCounting(): void {
  instrumentPrisma();
  counts = new Map();
  counting = true;
}

/** The counting stops. */
export function stopCounting(): void {
  counting = false;
}

/** The calls that were counted, with the number of times each one was made. */
export function countedCalls(): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

/** How many calls were counted in all. */
export function totalCalls(): number {
  return [...counts.values()].reduce((sum, value) => sum + value, 0);
}
