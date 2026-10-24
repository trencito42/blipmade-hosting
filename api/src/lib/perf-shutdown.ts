import type { FastifyInstance } from 'fastify';

/**
 * The stopping of the process.
 *
 * The container is asked to stop with SIGTERM and then, if the container does
 * not leave in time, with SIGKILL. The process therefore has to leave by
 * itself: it stops taking new connections, gives the requests that are
 * running the time that was promised, closes the database and the cache, and
 * leaves with a status that says what happened.
 *
 * A stop that takes longer than the deadline is not a stop that hangs: the
 * requests that are still running are cut off on purpose and the process
 * leaves all the same.
 */

export interface ShutdownLog {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
}

/** One thing that has to be closed while the process leaves. */
export interface ShutdownStep {
  /** The name of the step, for the journal. */
  name: string;
  /** The work of the step. */
  run: () => Promise<unknown>;
}

export interface ShutdownOptions {
  /** How long the requests that are running may take. */
  deadlineMs: number;
  /** The signal that asked for the stop. */
  signal?: string;
  /** Where the journal is written. */
  log?: ShutdownLog;
  /** The things that are closed, in the order they are closed. */
  steps?: ShutdownStep[];
}

export interface ShutdownStepResult {
  name: string;
  /** Whether the step finished in time. */
  ok: boolean;
  /** How long it took, in milliseconds. */
  ms: number;
}

export interface ShutdownResult {
  /** The status the process leaves with. */
  exitCode: number;
  /** Whether the requests had to be cut off. */
  forced: boolean;
  /** How long the whole stop took, in milliseconds. */
  durationMs: number;
  /** What each step did. */
  steps: ShutdownStepResult[];
}

/** The status the process leaves with when everything went well. */
export const EXIT_OK = 0;

/** The status the process leaves with when the deadline was reached. */
export const EXIT_FORCED = 1;

let stopping = false;

/**
 * Whether the process was asked to stop.
 *
 * The readiness answer says that it is not ready while this is true, so the
 * traffic is taken away before the requests that are running are finished.
 */
export function isShuttingDown(): boolean {
  return stopping;
}

/** Marks the process as stopping. */
export function markShuttingDown(): void {
  stopping = true;
}

/** Brings the process back to its normal state. Only the tests use this. */
export function resetShuttingDown(): void {
  stopping = false;
}

/** A promise that gives up after a time. */
function withTimeout<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`The work did not finish in ${ms} ms.`));
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export async function shutdownGracefully(app: FastifyInstance, options: ShutdownOptions): Promise<ShutdownResult> {
  const log = options.log;
  const started = Date.now();
  const deadline = started + options.deadlineMs;
  let forced = false;
  const steps: ShutdownStepResult[] = [];

  markShuttingDown();
  log?.info({ signal: options.signal, deadlineMs: options.deadlineMs }, 'the process is stopping');

  /**
   * The server stops taking new connections, and the requests that are
   * running are given the time that was promised.
   *
   * `app.close()` waits for the requests that are running, so it is given a
   * deadline of its own. When the deadline is reached the connections that
   * are still open are closed: a request that hangs for ever is worse than a
   * request that is cut off, and the journal says that it happened.
   */
  let timedOut = false;
  /**
   * The connections that are idle are closed while the drain runs.
   *
   * A client that keeps its connection open would otherwise hold the process
   * back until the connection times out, which is longer than the deadline.
   * Only the connections that are idle are closed: a connection that is
   * carrying a request is left alone, so a request that is running is never
   * cut off because of this.
   */
  const releaseIdle = setInterval(() => {
    try {
      app.server.closeIdleConnections();
    } catch {
      // The server is already gone: nothing to release any more.
    }
  }, 100);

  try {
    await withTimeout(
      app.close(),
      Math.max(0, deadline - Date.now()),
      () => {
        timedOut = true;
      },
    );
  } catch (error) {
    forced = true;
    if (timedOut) {
      log?.warn({ deadlineMs: options.deadlineMs }, 'the requests did not finish in time; they are cut off');
    } else {
      log?.error({ err: error }, 'the server could not be closed; the requests are cut off');
    }
    try {
      app.server.closeAllConnections();
    } catch (closeError) {
      log?.error({ err: closeError }, 'the connections could not be closed');
    }
  } finally {
    clearInterval(releaseIdle);
  }

  for (const step of options.steps ?? []) {
    const stepStarted = Date.now();
    const remaining = deadline - stepStarted;
    if (remaining <= 0) {
      steps.push({ name: step.name, ok: false, ms: 0 });
      log?.warn({ step: step.name }, 'the step did not have the time it needed');
      continue;
    }
    try {
      await withTimeout(step.run(), remaining);
      steps.push({ name: step.name, ok: true, ms: Date.now() - stepStarted });
    } catch (error) {
      steps.push({ name: step.name, ok: false, ms: Date.now() - stepStarted });
      log?.error({ err: error, step: step.name }, 'the step did not finish');
    }
  }

  const durationMs = Date.now() - started;
  log?.info({ durationMs, forced, steps }, forced ? 'the process leaves with the requests cut off' : 'the process has stopped');

  return { exitCode: forced ? EXIT_FORCED : EXIT_OK, forced, durationMs, steps };
}
