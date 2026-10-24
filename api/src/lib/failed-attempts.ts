/**
 * The counter of the attempts that failed.
 *
 * The limit of an account and the limit of an address protect the platform
 * from a guessing of a password. They count the attempts that FAILED: a
 * sign-in that worked does not count, so a customer who signs in several
 * times in a row — on two devices, or because the session expired — is never
 * locked out of their own account.
 *
 * The counters are kept in the memory of the API and an attempt is forgotten
 * when the window of its limit passes. The table is bounded, so it cannot
 * grow without end: the counters that are past their window are dropped and
 * the oldest ones are dropped when the table is full.
 *
 * The number of the test run is part of the key, so the counters of one test
 * do not count against the next one, exactly as the counters of the rate
 * limit of the plugin.
 */

import { env } from '../env.js';
import { rateLimitRun } from './rate-limit.js';

/** One counter: how many attempts failed and when the counter is forgotten. */
interface Counter {
  count: number;
  expiresAt: number;
}

/** The counters, by key. */
const counters = new Map<string, Counter>();

/** The number of counters the table holds before the oldest ones are dropped. */
const MAX_COUNTERS = 10000;

/** The key of a counter, with the number of the test run. */
function storageKey(key: string): string {
  return env.isTest ? `${key}:${rateLimitRun()}` : key;
}

/** Drops the counters that are past their window. */
function dropExpired(now: number): void {
  for (const [key, counter] of counters) {
    if (counter.expiresAt <= now) counters.delete(key);
  }
}

/**
 * The number of attempts that failed under this key.
 *
 * A counter that is past its window counts as no attempt at all.
 */
export function failedAttempts(key: string): number {
  const storage = storageKey(key);
  const counter = counters.get(storage);
  if (!counter) return 0;
  if (counter.expiresAt <= Date.now()) {
    counters.delete(storage);
    return 0;
  }
  return counter.count;
}

/**
 * Whether the key is blocked.
 *
 * A key is blocked when it reached the number of attempts that are allowed.
 * The window of the limit is the window of the counter: a blocked key stays
 * blocked until its window passes.
 */
export function isBlocked(key: string, max: number): boolean {
  return failedAttempts(key) >= max;
}

/**
 * Records an attempt that failed and returns the number of attempts that
 * failed so far under this key.
 */
export function recordFailedAttempt(key: string, windowMs: number): number {
  const storage = storageKey(key);
  const now = Date.now();
  const counter = counters.get(storage);
  if (!counter || counter.expiresAt <= now) {
    counters.set(storage, { count: 1, expiresAt: now + windowMs });
    if (counters.size > MAX_COUNTERS) {
      dropExpired(now);
      // The oldest counters are dropped first, so the table keeps its bound.
      while (counters.size > MAX_COUNTERS) {
        const oldest = counters.keys().next();
        if (oldest.done) break;
        counters.delete(oldest.value);
      }
    }
    return 1;
  }
  counter.count += 1;
  return counter.count;
}

/**
 * Forgets the attempts that failed under this key.
 *
 * A sign-in that worked forgets the attempts of that account: the customer
 * who mistyped the password and then signed in correctly is not a customer
 * under suspicion.
 */
export function clearFailedAttempts(key: string): void {
  counters.delete(storageKey(key));
}
