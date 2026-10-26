import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { EMAIL_QUEUE, PROVISION_QUEUE, enqueueEmail, enqueueProvisioning, getEmailQueue } from './queue.js';

/**
 * The failures that are not given up on.
 *
 * A queue keeps a failed job only for a while and then forgets it, so a job
 * that failed for good left nothing behind: nothing to read and nothing to
 * put back on the queue. This service is the place where the failure is kept.
 *
 * The table is written with plain SQL on purpose. The Prisma client of this
 * repository is generated into a directory that the worktrees share, so a
 * model that is added to the schema only reaches the client when the client
 * is generated again, and that generation is owned by whoever runs it. The
 * statements below do not depend on the generated client, so the dead letter
 * keeps working whichever client is installed.
 */

/** What is known about a job that was given up on. */
export interface DeadLetterEntry {
  id: string;
  queue: string;
  jobId: string;
  name: string;
  payload: unknown;
  error: string;
  errorClass: string | null;
  attempts: number;
  failedAt: Date;
  state: 'pending' | 'requeued' | 'resolved';
  requeuedAt: Date | null;
  requeuedBy: string | null;
  requeueCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DeadLetterRow {
  id: string;
  queue: string;
  jobId: string;
  name: string;
  payload: unknown;
  error: string;
  errorClass: string | null;
  attempts: number;
  failedAt: Date;
  state: 'pending' | 'requeued' | 'resolved';
  requeuedAt: Date | null;
  requeuedBy: string | null;
  requeueCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = Prisma.sql`
  "id", "queue", "jobId", "name", "payload", "error", "errorClass",
  "attempts", "failedAt", "state", "requeuedAt", "requeuedBy",
  "requeueCount", "createdAt", "updatedAt"
`;

/**
 * A moment as the database writes it.
 *
 * The columns of the table are timestamps without a time zone, and the
 * database writes them as the wall clock of the Coordinated Universal Time. A
 * moment that is bound as a date is read by the database as an instant and is
 * compared with the wall clock of the time zone of the server, which is four
 * hours off on this host. The moment is therefore written as the text of the
 * wall clock and cast by the database, so the comparison is the same wherever
 * the server is and whatever its time zone is.
 */
function naiveTimestamp(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * What is written down about a job that failed.
 *
 * The payload of a job is only the identifiers of the rows it works on. The
 * body of a message is never written here: a message that failed is read
 * through the table of the deliveries, and the body of a message never
 * belongs in a table of failures.
 */
export interface DeadLetterInput {
  queue: string;
  jobId: string;
  name: string;
  payload?: unknown;
  error: string;
  errorClass?: string | null;
  attempts?: number;
  failedAt?: Date;
}

/**
 * What is kept of the payload of a job.
 *
 * The queue of the provisioning carries the identifier of an instance and
 * nothing else, so the whole payload is kept. The queue of the mail carries
 * the message itself, so only the name of the message and its kind are kept:
 * the failure can be read, and the message is never copied into a table that
 * is read by the people of the platform.
 */
function payloadToKeep(queue: string, payload: unknown): unknown {
  if (queue === EMAIL_QUEUE) {
    const body = (payload ?? {}) as { key?: unknown; kind?: unknown };
    return { key: typeof body.key === 'string' ? body.key : null, kind: typeof body.kind === 'string' ? body.kind : null };
  }
  return payload ?? null;
}

/** The part of a job of a queue that the dead letter needs. */
export interface FailedJob {
  id?: string | undefined;
  name?: string | undefined;
  data?: unknown;
  attemptsMade?: number | undefined;
}

/**
 * Writes down the failure of a job.
 *
 * The worker calls this when a job fails. The failure is written on every
 * attempt, so a job that fails and then works on a later attempt leaves a row
 * that is closed again when it works.
 */
export async function noteJobFailure(queue: string, job: FailedJob | undefined, error: Error): Promise<void> {
  if (!job?.id) return;
  await recordDeadLetter({
    queue,
    jobId: job.id,
    name: job.name ?? 'unknown',
    payload: job.data,
    error: error.message,
    errorClass: error.name,
    attempts: job.attemptsMade ?? 0,
  });
}

/**
 * Closes the failure of a job that worked.
 *
 * A job that failed and then worked on a later attempt has no failure to
 * read, so its row is closed instead of being left open.
 */
export async function noteJobCompleted(queue: string, job: FailedJob | undefined): Promise<void> {
  if (!job?.id) return;
  await resolveDeadLetter(queue, job.id);
}

/**
 * Writes a failure down.
 *
 * The write is safe to repeat: the queue and the name of the job are the
 * identity of the row, so the same failure written twice is still one row.
 * A job that fails again after it was put back on the queue opens its row
 * again, so the list of the open failures is always the list of the failures
 * that are not solved yet.
 */
export async function recordDeadLetter(input: DeadLetterInput): Promise<void> {
  const payload = payloadToKeep(input.queue, input.payload);
  const failedAt = input.failedAt ?? new Date();
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "DeadLetterJob"
        ("id", "queue", "jobId", "name", "payload", "error", "errorClass",
         "attempts", "failedAt", "state", "requeueCount", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${input.queue}, ${input.jobId}, ${input.name},
         ${JSON.stringify(payload)}::jsonb, ${input.error}, ${input.errorClass ?? null},
         ${input.attempts ?? 0}, ${naiveTimestamp(failedAt)}::timestamp, 'pending', 0,
         ${naiveTimestamp(failedAt)}::timestamp, ${naiveTimestamp(failedAt)}::timestamp)
      ON CONFLICT ("queue", "jobId") DO UPDATE SET
        "name" = EXCLUDED."name",
        "payload" = EXCLUDED."payload",
        "error" = EXCLUDED."error",
        "errorClass" = EXCLUDED."errorClass",
        "attempts" = EXCLUDED."attempts",
        "failedAt" = EXCLUDED."failedAt",
        "state" = 'pending',
        "requeuedAt" = NULL,
        "requeuedBy" = NULL,
        "updatedAt" = EXCLUDED."updatedAt"
    `,
  );
}

/**
 * Closes a failure that is not a failure any more.
 *
 * A job that failed and then worked on a later attempt has no failure to
 * read, so its row is closed instead of being left open.
 */
export async function resolveDeadLetter(queue: string, jobId: string): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "DeadLetterJob"
      SET "state" = 'resolved', "updatedAt" = ${naiveTimestamp(new Date())}::timestamp
      WHERE "queue" = ${queue} AND "jobId" = ${jobId}
    `,
  );
}

/**
 * Closes the failures of the instances that are gone.
 *
 * A failure of an instance that was deleted is not a failure any more: the
 * service it was about is gone, and there is nothing an operator could do
 * about it. The row is closed, so the queue of the operator does not hold a
 * failure that can never be fixed and cannot be put back on the queue
 * either.
 *
 * The function answers how many rows it closed.
 */
export async function resolveDeadLettersOfGoneInstances(): Promise<number> {
  const { entries } = await listDeadLetters({ state: 'pending', queue: PROVISION_QUEUE, limit: 200, cursor: null });
  let closed = 0;
  for (const entry of entries) {
    const instanceId = (entry.payload as { instanceId?: unknown } | null)?.instanceId;
    if (typeof instanceId !== 'string' || !instanceId) continue;
    const instance = await prisma.instance.findUnique({ where: { id: instanceId }, select: { id: true } });
    if (instance) continue;
    await resolveDeadLetter(entry.queue, entry.jobId);
    closed += 1;
  }
  return closed;
}

/** One failure of the list. */
export async function getDeadLetter(id: string): Promise<DeadLetterEntry | null> {
  const rows = await prisma.$queryRaw<DeadLetterRow[]>(
    Prisma.sql`SELECT ${COLUMNS} FROM "DeadLetterJob" WHERE "id" = ${id} LIMIT 1`,
  );
  const row = rows[0];
  return row ? toEntry(row) : null;
}

/**
 * The failure of a job.
 *
 * The name of the job is only unique on its queue, so the queue is part of
 * the way it is looked for.
 */
export async function getDeadLetterByJob(queue: string, jobId: string): Promise<DeadLetterEntry | null> {
  const rows = await prisma.$queryRaw<DeadLetterRow[]>(
    Prisma.sql`SELECT ${COLUMNS} FROM "DeadLetterJob" WHERE "queue" = ${queue} AND "jobId" = ${jobId} LIMIT 1`,
  );
  const row = rows[0];
  return row ? toEntry(row) : null;
}

/** The failures of the list, newest first. */
export async function listDeadLetters(options: {
  state?: 'pending' | 'requeued' | 'resolved' | 'all';
  queue?: string;
  limit: number;
  cursor?: { at: Date; id: string } | null;
}): Promise<{ entries: DeadLetterEntry[]; nextCursor: { at: Date; id: string } | null; total: number }> {
  const filters: Prisma.Sql[] = [];
  if (options.state && options.state !== 'all') filters.push(Prisma.sql`"state" = ${options.state}::"DeadLetterState"`);
  if (options.queue) filters.push(Prisma.sql`"queue" = ${options.queue}`);
  const filter = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.sql``;

  const conditions = [...filters];
  if (options.cursor) {
    conditions.push(
      Prisma.sql`("failedAt" < ${naiveTimestamp(options.cursor.at)}::timestamp OR ("failedAt" = ${naiveTimestamp(options.cursor.at)}::timestamp AND "id" < ${options.cursor.id}))`,
    );
  }
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.sql``;

  const rows = await prisma.$queryRaw<DeadLetterRow[]>(
    Prisma.sql`
      SELECT ${COLUMNS} FROM "DeadLetterJob" ${where}
      ORDER BY "failedAt" DESC, "id" DESC
      LIMIT ${options.limit + 1}
    `,
  );

  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) AS "count" FROM "DeadLetterJob" ${filter}`,
  );

  const hasMore = rows.length > options.limit;
  const page = rows.slice(0, options.limit);
  const last = page[page.length - 1];
  return {
    entries: page.map(toEntry),
    nextCursor: hasMore && last ? { at: last.failedAt, id: last.id } : null,
    total: Number(countRows[0]?.count ?? 0),
  };
}

/** How many failures are still open. */
export async function pendingDeadLetterCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`SELECT COUNT(*) AS "count" FROM "DeadLetterJob" WHERE "state" = 'pending'`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** What happened when a failure was put back on its queue. */
export type RequeueOutcome =
  | { status: 'requeued'; entry: DeadLetterEntry }
  | { status: 'already-handled'; entry: DeadLetterEntry }
  | { status: 'not-requeueable'; entry: DeadLetterEntry; reason: string };

/**
 * Puts a failed job back on its queue.
 *
 * The path is safe to run twice. The row is claimed with a single statement
 * that only touches the rows that are still open, so two calls that arrive at
 * the same time cannot both claim the same failure: the second one is told
 * that the failure was already handled. The job itself is put back on the
 * queue under the name it had, so a job that is already waiting is not put on
 * the queue a second time.
 *
 * A failure that is put back on the queue is not closed: it stands open
 * again, and the number of attempts is the one of the run that starts, so the
 * row never says that a job that is running again was given up on.
 */
export async function requeueDeadLetter(id: string, options: { requestedBy?: string | null } = {}): Promise<RequeueOutcome> {
  // The failure is read before it is claimed: the number of attempts belongs
  // to the run that was given up on, and it is put back if the job does not
  // go back on the queue.
  const before = await getDeadLetter(id);
  if (!before) throw notFound('That failure is not known.');

  const claimed = await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "DeadLetterJob"
      SET "state" = 'requeued',
          "requeuedAt" = ${naiveTimestamp(new Date())}::timestamp,
          "requeuedBy" = ${options.requestedBy ?? null},
          "requeueCount" = "requeueCount" + 1,
          "attempts" = 0,
          "updatedAt" = ${naiveTimestamp(new Date())}::timestamp
      WHERE "id" = ${id} AND "state" = 'pending'
    `,
  );

  if (claimed === 0) {
    const entry = await getDeadLetter(id);
    if (!entry) throw notFound('That failure is not known.');
    return { status: 'already-handled', entry };
  }

  const entry = await getDeadLetter(id);
  if (!entry) throw notFound('That failure is not known.');

  try {
    await putBackOnQueue(entry, options.requestedBy ?? null);
  } catch (error) {
    // The job did not go back on the queue, so the failure is open again and
    // can be tried once more. Nothing is lost by that.
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "DeadLetterJob"
        SET "state" = 'pending',
            "requeuedAt" = NULL,
            "requeuedBy" = NULL,
            "requeueCount" = GREATEST("requeueCount" - 1, 0),
            "attempts" = ${before.attempts},
            "updatedAt" = ${naiveTimestamp(new Date())}::timestamp
        WHERE "id" = ${id} AND "state" = 'requeued'
      `,
    );
    throw error;
  }

  return { status: 'requeued', entry: (await getDeadLetter(id)) ?? entry };
}

/**
 * Puts the job of a failure back on its queue.
 *
 * The queue of the provisioning is put back through the same door as every
 * other provisioning, so the job keeps the name it had and cannot be on the
 * queue twice. The queue of the mail is put back through the same door as
 * every other message, so a message that failed can be sent again.
 */
async function putBackOnQueue(entry: DeadLetterEntry, requestedBy: string | null): Promise<void> {
  if (entry.queue === PROVISION_QUEUE) {
    const payload = (entry.payload ?? {}) as { instanceId?: unknown };
    if (typeof payload.instanceId !== 'string' || !payload.instanceId) {
      throw badRequest('This failure does not name the instance it belongs to, so it cannot be put back on the queue.');
    }
    // The instance has to be there. A failure of an instance that is gone
    // would fail again for ever: the same record is reopened every time, and
    // the platform keeps alerting about it.
    const instance = await prisma.instance.findUnique({
      where: { id: payload.instanceId },
      select: { id: true },
    });
    if (!instance) {
      throw badRequest('The instance of this failure is gone, so the failure cannot be put back on the queue.');
    }
    await enqueueProvisioning(payload.instanceId, { reason: 'dead letter requeue', requestedBy: requestedBy ?? undefined });
    return;
  }

  if (entry.queue === EMAIL_QUEUE) {
    await putMessageBackOnQueue(entry);
    return;
  }

  throw badRequest(`The queue "${entry.queue}" cannot be put back on the queue from here.`);
}

/**
 * Puts the message of a failure back on the queue of the mail.
 *
 * The body of a message is never written in the table of the failures, so it
 * is taken from the job itself: a job that failed is kept in the queue for a
 * week, and the job holds the message that has to be sent. When the job is
 * not in the queue any more, the message is not in the platform any more and
 * the failure cannot be put back on the queue.
 */
async function putMessageBackOnQueue(entry: DeadLetterEntry): Promise<void> {
  const job = await getEmailQueue().getJob(entry.jobId).catch(() => null);
  if (!job) {
    throw badRequest('The job of this message is not in the queue any more, so the message cannot be sent again.');
  }
  const data = job.data as { key?: unknown; kind?: unknown; to?: unknown; subject?: unknown; text?: unknown; html?: unknown };
  if (typeof data?.key !== 'string' || !data.key || typeof data.to !== 'string' || !data.to) {
    throw badRequest('The job of this message does not carry a message, so it cannot be sent again.');
  }
  await enqueueEmail({
    key: data.key,
    kind: typeof data.kind === 'string' ? data.kind : 'message',
    to: data.to,
    subject: typeof data.subject === 'string' ? data.subject : '',
    text: typeof data.text === 'string' ? data.text : '',
    html: typeof data.html === 'string' ? data.html : undefined,
  });
}

/**
 * Closes a failure by hand.
 *
 * The failure is closed when it is not a failure of the platform any more:
 * the service was given up on, the customer was answered by hand. The row is
 * kept, so the moment and the reason of the failure are still readable.
 */
export async function closeDeadLetter(id: string, options: { requestedBy?: string | null } = {}): Promise<DeadLetterEntry> {
  const closed = await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "DeadLetterJob"
      SET "state" = 'resolved', "updatedAt" = ${naiveTimestamp(new Date())}::timestamp
      WHERE "id" = ${id}
    `,
  );
  if (closed === 0) throw notFound('That failure is not known.');
  const entry = await getDeadLetter(id);
  if (!entry) throw notFound('That failure is not known.');
  void options;
  return entry;
}

function toEntry(row: DeadLetterRow): DeadLetterEntry {
  return {
    id: row.id,
    queue: row.queue,
    jobId: row.jobId,
    name: row.name,
    payload: row.payload,
    error: row.error,
    errorClass: row.errorClass,
    attempts: row.attempts,
    failedAt: row.failedAt,
    state: row.state,
    requeuedAt: row.requeuedAt,
    requeuedBy: row.requeuedBy,
    requeueCount: row.requeueCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
