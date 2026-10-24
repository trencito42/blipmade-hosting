import { listDeadLetters, pendingDeadLetterCount, type DeadLetterEntry } from './dead-letter.js';
import { registry } from '../lib/perf-metrics.js';

/**
 * The watch over the failures that are waiting for an operator.
 *
 * The dead-letter queue keeps the jobs that failed for good. Nothing looked
 * at that queue: a job that failed for good was written down, it could be
 * put back on the queue by hand, and then it waited in silence until a
 * customer wrote in to say that the server they paid for never arrived.
 *
 * A customer whose service was not provisioned must not have to report that
 * the service is missing. The platform has to say so itself, and it has to
 * say it once and not on every tick, or the log of the worker is a wall that
 * nobody reads.
 *
 * The watch does three things:
 *
 *  - it counts the failures that are open and keeps the highest count it has
 *    seen, so the worst state of the life of the process is known and not
 *    only the state of the moment;
 *  - it names a failure the first time it sees it, and the name of the job
 *    is part of what is remembered, so the same failure is never named
 *    twice;
 *  - it complains about the size of the queue when the queue grows past the
 *    number of failures that are tolerated.
 *
 * The watch never throws. A watch that stops working because the database
 * was busy for a moment is worse than no watch at all: the failure would be
 * invisible again, and the customer would have to report it.
 */

/**
 * The number of open failures above which the size of the queue is
 * complained about.
 *
 * One failure is already named by the watch itself, so the size is only
 * worth a word when there is more than one of them: a queue that holds a
 * single failure is a failure, and a queue that holds many is a problem
 * that nobody is working on.
 */
export const DEFAULT_DEAD_LETTER_ALERT_THRESHOLD = 1;

/** How many open failures are read at one tick. */
const PAGE_SIZE = 100;

/**
 * How many new failures are named at one tick.
 *
 * A worker that starts with a backlog must not drown the log on its first
 * tick: the rest of the backlog is named on the ticks that follow.
 */
const MAX_REPORTS_PER_TICK = 20;

/** Where the words of the watch go. */
export interface DeadLetterMonitorLogger {
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * The log of the watch.
 *
 * The console is called when the warning happens and not when this module is
 * loaded, so a warning that is written is a warning that is seen.
 */
const consoleLogger: DeadLetterMonitorLogger = {
  warn: (message: string) => console.warn(message),
  error: (message: string) => console.error(message),
};

/** What the watch saw at one tick. */
export interface DeadLetterObservation {
  /** The number of failures that are open. */
  pending: number;
  /** The open failures, newest first. */
  entries: DeadLetterEntry[];
}

/**
 * How the queue is looked at.
 *
 * The way the queue is read is a parameter of the watch, so a test can make
 * the observation fail and see that the watch keeps its head.
 */
export type DeadLetterObserver = () => Promise<DeadLetterObservation>;

/** The kinds of word the watch says. */
export type DeadLetterWarningKind = 'new-dead-letter' | 'above-threshold';

/** One word the watch said. */
export interface DeadLetterWarning {
  kind: DeadLetterWarningKind;
  at: Date;
  message: string;
  /** The queue the failure was on. */
  queue?: string;
  /** The name the job had on its queue. */
  jobId?: string;
  /** The number of failures that were open. */
  count?: number;
}

/** What the watch keeps. */
export interface DeadLetterMonitorState {
  /** The number of failures that were open at the last look. */
  pending: number;
  /** The highest number of failures that were open since the process started. */
  peakPending: number;
  /** The failures that were already named, so they are not named twice. */
  reported: string[];
  /** Every word the watch said. */
  warnings: DeadLetterWarning[];
  /** When the queue was looked at for the last time. */
  lastCheckedAt: Date | null;
  /** The reason the last look failed, if it failed. */
  lastError: string | null;
}

/** What the watch is told to do. */
export interface DeadLetterMonitorOptions {
  /** The number of open failures above which the size of the queue is complained about. */
  threshold?: number;
  /** How the queue is looked at. */
  observe?: DeadLetterObserver;
  /** Where the words of the watch go. */
  log?: DeadLetterMonitorLogger;
}

/** What the watch keeps, behind the copy it gives away. */
interface InternalState {
  pending: number;
  peakPending: number;
  reported: Set<string>;
  warnings: DeadLetterWarning[];
  lastCheckedAt: Date | null;
  lastError: string | null;
  /** Whether the last look was above the threshold. */
  aboveThreshold: boolean;
  /** The number of failures the last complaint about the size was about. */
  thresholdWarnedCount: number;
}

const state: InternalState = {
  pending: 0,
  peakPending: 0,
  reported: new Set<string>(),
  warnings: [],
  lastCheckedAt: null,
  lastError: null,
  aboveThreshold: false,
  thresholdWarnedCount: 0,
};

/**
 * The name that says which failure it is.
 *
 * The queue and the name of the job are the identity of a failure: the same
 * job on the same queue is the same failure, whatever moment it failed at.
 * The name of the job carries the run it belongs to, so a failure that is
 * named again is a failure that is named again for a reason.
 */
function keyOf(entry: DeadLetterEntry): string {
  return `${entry.queue}:${entry.jobId}`;
}

/** The state the watch keeps, as a copy, so nobody can change it from the outside. */
export function deadLetterMonitorState(): DeadLetterMonitorState {
  return {
    pending: state.pending,
    peakPending: state.peakPending,
    reported: [...state.reported],
    warnings: [...state.warnings],
    lastCheckedAt: state.lastCheckedAt,
    lastError: state.lastError,
  };
}

/**
 * Forgets everything the watch keeps.
 *
 * The watch is a part of the life of the process, so nothing but the tests
 * may reset it.
 */
export function resetDeadLetterMonitor(): void {
  state.pending = 0;
  state.peakPending = 0;
  state.reported = new Set<string>();
  state.warnings = [];
  state.lastCheckedAt = null;
  state.lastError = null;
  state.aboveThreshold = false;
  state.thresholdWarnedCount = 0;
}

/**
 * Reads the open failures of the queue.
 *
 * Only the newest failures are read, because the watch names what is new.
 * The number of the open failures is counted apart, so the gauge of the
 * queue knows the whole queue and not only the page that was read.
 */
async function observeDeadLetters(): Promise<DeadLetterObservation> {
  const pending = await pendingDeadLetterCount();
  const { entries } = await listDeadLetters({ state: 'pending', limit: PAGE_SIZE, cursor: null });
  return { pending, entries };
}

/**
 * Looks at the queue and says what is wrong.
 *
 * The function never throws: a watch that breaks is a watch that is silent,
 * and a silent watch is the same as no watch at all. A failure of the
 * observation is written down in the state and in the log, and the next tick
 * tries again.
 */
export async function checkDeadLetters(options: DeadLetterMonitorOptions = {}): Promise<DeadLetterMonitorState> {
  const log = options.log ?? consoleLogger;
  const threshold = Math.max(0, options.threshold ?? DEFAULT_DEAD_LETTER_ALERT_THRESHOLD);
  const observe = options.observe ?? observeDeadLetters;

  try {
    const observation = await observe();
    state.pending = observation.pending;
    if (observation.pending > state.peakPending) state.peakPending = observation.pending;
    state.lastError = null;

    // The size of the queue is given to the measures of the process, so a
    // collector sees it without asking anybody.
    registry.setDeadLetterPending(observation.pending);

    // The failures that were not named before are named now. The name of the
    // job is part of what is remembered, so the same failure is named once
    // and the log does not shout the same thing on every tick.
    let named = 0;
    for (const entry of observation.entries) {
      if (named >= MAX_REPORTS_PER_TICK) break;
      const key = keyOf(entry);
      if (state.reported.has(key)) continue;
      state.reported.add(key);
      named += 1;
      const message =
        '[dead-letter] a job failed for good and is waiting for an operator: ' +
        `queue="${entry.queue}" job="${entry.jobId}" name="${entry.name}" ` +
        `attempts=${entry.attempts} error="${entry.error}"`;
      state.warnings.push({
        kind: 'new-dead-letter',
        at: new Date(),
        message,
        queue: entry.queue,
        jobId: entry.jobId,
        count: observation.pending,
      });
      log.error(message);
    }

    // The size of the queue is complained about when it passes the number of
    // failures that are tolerated. A queue that stays above the line does
    // not have to say so on every tick, but a queue that grows is said
    // again, because a growing queue is worse than a steady one.
    const above = observation.pending > threshold;
    if (above && (!state.aboveThreshold || observation.pending > state.thresholdWarnedCount)) {
      const message =
        `[dead-letter] the dead-letter queue is above the threshold: ${observation.pending} failure(s) ` +
        `are waiting for an operator, the threshold is ${threshold}`;
      state.warnings.push({ kind: 'above-threshold', at: new Date(), message, count: observation.pending });
      log.warn(message);
      state.thresholdWarnedCount = observation.pending;
    }
    state.aboveThreshold = above;
    if (!above) state.thresholdWarnedCount = 0;
  } catch (error) {
    // The queue could not be read. The gauge keeps the number it had, so a
    // moment of trouble does not publish a zero that says that no customer
    // is waiting for an operator.
    state.lastError = (error as Error).message;
    log.error(`[dead-letter] the dead-letter queue could not be read: ${(error as Error).message}`);
  } finally {
    state.lastCheckedAt = new Date();
  }

  return deadLetterMonitorState();
}

/**
 * The module that reads the real state of the running containers.
 *
 * The module is written by another agent and this branch does not have it
 * yet, so it is loaded when it is needed and not when this module is
 * loaded. The path is kept in a constant: a path that is written in the
 * import itself is checked by the type checker, and the type checker of
 * this branch would refuse to build the worker because the file is not
 * there yet.
 */
const RUNTIME_STATE_MODULE: string = '../services/runtime-state.js';

/** The part of the module of the running services that the watch uses. */
interface RuntimeStateModule {
  reconcileRuntimeState?: (options?: { limit?: number }) => Promise<unknown> | unknown;
}

/**
 * Reads the real state of the running containers.
 *
 * The module is loaded here and not at the top of the file, because it is
 * not part of this branch: a static import of a file that is not there stops
 * the worker from starting at all. A module that is missing, a function that
 * is not there and a failure of the module are all written down, and none of
 * them stops the worker.
 */
async function reconcileRunningServices(log: DeadLetterMonitorLogger): Promise<void> {
  try {
    const module = (await import(RUNTIME_STATE_MODULE)) as RuntimeStateModule;
    if (typeof module.reconcileRuntimeState !== 'function') {
      log.error('[running-state] the module of the running services does not offer reconcileRuntimeState');
      return;
    }
    const result = await module.reconcileRuntimeState({ limit: 100 });
    const changed = (result as { changed?: unknown } | null | undefined)?.changed;
    if (typeof changed === 'number' && changed > 0) {
      log.warn(`[running-state] ${changed} service(s) were not in the state the platform believes`);
    }
  } catch (error) {
    log.error(`[running-state] the state of the running services could not be read: ${(error as Error).message}`);
  }
}

/**
 * Looks at the failures that wait for an operator and at the state of the
 * running services.
 *
 * This is what the timer of the worker calls. Neither of the two may stop
 * the worker: a module that is missing is written down in the log and the
 * timer goes on to the next tick.
 */
export async function watchDeadLetterQueue(options: DeadLetterMonitorOptions = {}): Promise<DeadLetterMonitorState> {
  const log = options.log ?? consoleLogger;
  const observed = await checkDeadLetters({ ...options, log });
  await reconcileRunningServices(log);
  return observed;
}
