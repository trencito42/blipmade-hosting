import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDeadLetter, getDeadLetterByJob, noteJobFailure } from '../src/services/dead-letter.js';
import {
  checkDeadLetters,
  deadLetterMonitorState,
  resetDeadLetterMonitor,
  watchDeadLetterQueue,
} from '../src/services/dead-letter-monitor.js';
import { runtimeStateWarning } from '../src/services/runtime-state.js';
import { PROVISION_QUEUE } from '../src/services/queue.js';
import { createMetricsServer, registry } from '../src/lib/perf-metrics.js';
import { resetDatabase } from './helpers.js';

/**
 * The watch over the queue of the failures.
 *
 * The queue could always be read and could always be put back on the queue,
 * but nothing watched it: a job that failed for good stayed invisible until
 * a customer wrote in to say that the service they paid for never arrived.
 * These tests hold the watch that makes the failure visible.
 */

/** Writes a failure of a job of the queue of the provisioning down. */
async function failJob(jobId: string, instanceId: string, error = 'the panel did not answer'): Promise<void> {
  await noteJobFailure(
    PROVISION_QUEUE,
    { id: jobId, name: 'provision', data: { instanceId }, attemptsMade: 5 },
    new Error(error),
  );
}

/** Collects what the watch writes on the console. */
function collectConsole(method: 'error' | 'warn'): { lines: string[]; spy: ReturnType<typeof vi.spyOn> } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  });
  return { lines, spy };
}

describe('the watch over the dead-letter queue', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetDeadLetterMonitor();
  });

  afterAll(async () => {
    await resetDatabase();
    resetDeadLetterMonitor();
  });

  it('says a word when a failure appears', async () => {
    await failJob('provision-watch-1', 'instance-watch-1');

    const { lines, spy } = collectConsole('error');
    try {
      const observed = await checkDeadLetters();
      expect(observed.pending).toBe(1);
      expect(observed.warnings).toHaveLength(1);
      expect(observed.warnings[0]?.kind).toBe('new-dead-letter');
      expect(observed.warnings[0]?.jobId).toBe('provision-watch-1');

      // The word is written on the console, so an operator that reads the
      // log of the worker sees the failure without asking anybody.
      expect(lines.join('\n')).toContain('provision-watch-1');
      expect(lines.join('\n')).toContain('the panel did not answer');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not say the same thing twice', async () => {
    await failJob('provision-watch-2', 'instance-watch-2');
    await checkDeadLetters();

    const { lines, spy } = collectConsole('error');
    try {
      const before = deadLetterMonitorState().warnings.length;
      const observed = await checkDeadLetters();

      // The same failure is not named again on the next tick: the name of
      // the job is part of what the watch remembers.
      expect(observed.warnings).toHaveLength(before);
      expect(lines).toHaveLength(0);
      expect(observed.reported).toContain(`${PROVISION_QUEUE}:provision-watch-2`);
    } finally {
      spy.mockRestore();
    }
  });

  it('complains when the queue grows past the threshold', async () => {
    await failJob('provision-watch-3', 'instance-watch-3');
    await failJob('provision-watch-4', 'instance-watch-4');
    await failJob('provision-watch-5', 'instance-watch-5');

    const { lines, spy } = collectConsole('warn');
    try {
      const observed = await checkDeadLetters({ threshold: 2 });
      const complaints = observed.warnings.filter((warning) => warning.kind === 'above-threshold');
      expect(complaints).toHaveLength(1);
      expect(complaints[0]?.count).toBe(3);
      expect(lines.join('\n')).toContain('above the threshold');

      // The next tick says nothing about the size: the queue did not grow.
      const second = await checkDeadLetters({ threshold: 2 });
      expect(second.warnings.filter((warning) => warning.kind === 'above-threshold')).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('says nothing about the size while the queue is under the threshold', async () => {
    await failJob('provision-watch-6', 'instance-watch-6');

    const observed = await checkDeadLetters({ threshold: 2 });
    expect(observed.warnings.filter((warning) => warning.kind === 'above-threshold')).toHaveLength(0);
  });

  it('keeps the highest number of failures it has seen', async () => {
    await failJob('provision-watch-7', 'instance-watch-7');
    await checkDeadLetters();
    await failJob('provision-watch-8', 'instance-watch-8');
    await checkDeadLetters();

    expect(deadLetterMonitorState().pending).toBe(2);
    expect(deadLetterMonitorState().peakPending).toBe(2);

    // The queue is emptied by hand, and the highest count is still known.
    const entry = await getDeadLetterByJob(PROVISION_QUEUE, 'provision-watch-7');
    await closeDeadLetter(entry!.id);
    const observed = await checkDeadLetters();
    expect(observed.pending).toBe(1);
    expect(observed.peakPending).toBe(2);
  });

  it('gives the number of the queue to the measures', async () => {
    await failJob('provision-watch-9', 'instance-watch-9');
    await failJob('provision-watch-10', 'instance-watch-10');
    await checkDeadLetters();

    // The number of the queue is in the measures of the process.
    expect(registry.deadLetterPendingJobs).toBe(2);

    const server = createMetricsServer({ enabled: true, host: '127.0.0.1', port: 0, token: 'the-key' });
    try {
      await server.ready;
      const response = await fetch(server.url, { headers: { authorization: 'Bearer the-key' } });
      expect(response.status).toBe(200);

      const body = await response.text();
      expect(body).toContain('# TYPE bm_dead_letter_pending_jobs gauge');
      expect(body).toContain('bm_dead_letter_pending_jobs 2');
      // The highest number is the one of the whole life of the process, so
      // it is at least the number of the queue.
      expect(body).toMatch(/^bm_dead_letter_pending_jobs_max [2-9][0-9]*$/m);
    } finally {
      await server.close();
    }
  });

  it('keeps the worker going when the observation fails', async () => {
    await failJob('provision-watch-11', 'instance-watch-11');
    await checkDeadLetters();

    const { lines, spy } = collectConsole('error');
    try {
      const observed = await checkDeadLetters({
        observe: async () => {
          throw new Error('the database is not there');
        },
      });

      // The watch does not throw: a watch that breaks is a watch that is
      // silent, and a silent watch is the same as no watch at all.
      expect(observed.lastError).toContain('the database is not there');
      expect(lines.join('\n')).toContain('could not be read');

      // The number it had is kept, so a moment of trouble does not publish
      // a zero that says that no customer is waiting for an operator.
      expect(observed.pending).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the worker going whatever the state of the running services is', async () => {
    // The module that reads the real state of the running services is loaded
    // while the watch runs. Whatever it answers, the watch goes on: the
    // failures are still read and the timer of the worker is not interrupted.
    const { lines, spy } = collectConsole('error');
    try {
      const observed = await watchDeadLetterQueue();
      expect(observed.lastCheckedAt).not.toBeNull();
      expect(observed.pending).toBeGreaterThanOrEqual(0);

      // The watch did not report a failure of the watch itself.
      expect(lines.join('\n')).not.toContain('the watch could not be read');
    } finally {
      spy.mockRestore();
    }
  });

  it('names the services that are not in the state the platform believes', () => {
    expect(runtimeStateWarning({ observed: 10, notRunning: 2, unreachable: 0 })).toMatch(
      /2 service\(s\) were not in the state/,
    );
  });

  it('names the services it could not ask about', () => {
    expect(runtimeStateWarning({ observed: 10, notRunning: 0, unreachable: 3 })).toMatch(/could not be asked about/);
  });

  it('says nothing when every service is in the state the platform believes', () => {
    expect(runtimeStateWarning({ observed: 10, notRunning: 0, unreachable: 0 })).toBeNull();
    expect(runtimeStateWarning(null)).toBeNull();
  });

  it('names the services that are alive but that the node does not confirm', () => {
    expect(runtimeStateWarning({ observed: 10, notRunning: 0, unconfirmed: 4, unreachable: 0 })).toMatch(
      /4 service\(s\) are alive, but the node does not confirm/,
    );
  });
});
