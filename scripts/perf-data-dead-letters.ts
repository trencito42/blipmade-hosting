#!/usr/bin/env tsx
/**
 * The failures of the jobs that were given up on.
 *
 *   scripts/perf-data-dead-letters.ts --list
 *   scripts/perf-data-dead-letters.ts --requeue <id>
 *   scripts/perf-data-dead-letters.ts --requeue-all [--limit 50]
 *
 * The script reads the table of the dead letters and puts the jobs back on
 * their queue. Every run is safe to repeat: a failure is claimed with a single
 * statement, so a job is never put on the queue twice, and a failure that was
 * already handled is only reported.
 */
import { closeQueue } from '../api/src/services/queue.js';
import { redis } from '../api/src/redis.js';
import {
  getDeadLetter,
  listDeadLetters,
  pendingDeadLetterCount,
  requeueDeadLetter,
} from '../api/src/services/dead-letter.js';
import { prisma } from '../api/src/db.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const databaseName = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '(none)';
  console.log(`database: ${databaseName}`);

  if (flag('--list') || (!flag('--requeue') && !flag('--requeue-all'))) {
    const { entries, total } = await listDeadLetters({ state: 'pending', limit: 50, cursor: null });
    console.log(`open failures: ${await pendingDeadLetterCount()} (total rows: ${total})`);
    for (const entry of entries) {
      console.log(
        `  ${entry.id}  ${entry.queue}/${entry.jobId}  attempts=${entry.attempts}  ${entry.failedAt.toISOString()}  ${entry.error}`,
      );
    }
  }

  const one = argument('--requeue');
  if (one) {
    const entry = await getDeadLetter(one);
    if (!entry) {
      console.error(`no failure with the id ${one}`);
      process.exitCode = 1;
      return;
    }
    const outcome = await requeueDeadLetter(one, { requestedBy: 'script' });
    console.log(`${outcome.status}: ${entry.queue}/${entry.jobId}`);
  }

  if (flag('--requeue-all')) {
    const limit = Number(argument('--limit') ?? 50);
    let done = 0;
    let skipped = 0;
    for (;;) {
      const { entries } = await listDeadLetters({ state: 'pending', limit, cursor: null });
      if (!entries.length) break;
      for (const entry of entries) {
        const outcome = await requeueDeadLetter(entry.id, { requestedBy: 'script' });
        if (outcome.status === 'requeued') done += 1;
        else skipped += 1;
      }
      // The list is read again from the top, because the failures that were
      // put back are no longer open.
      if (entries.length < limit) break;
    }
    console.log(`requeued: ${done}, already handled: ${skipped}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueue().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  });
