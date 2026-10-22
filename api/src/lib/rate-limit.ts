/**
 * The rate limit counters are kept per key. In production the key is the
 * address of the caller, which is what the limits are meant for.
 *
 * In the test environment the key carries a run number, so every test starts
 * with an empty counter. Without it the limits of one test would count against
 * the next one, which is not what the tests are about.
 */
let run = 0;

/** The number of the current test run. */
export function rateLimitRun(): number {
  return run;
}

/** Starts a new test run, so the rate limit counters start at zero. */
export function rotateRateLimitRun(): void {
  run += 1;
}
