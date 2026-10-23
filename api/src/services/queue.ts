import { createHash } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../redis.js';
import { env } from '../env.js';
import {
  mailDeliveryRecords,
  mailEnabled,
  mailTransportName,
  mailDeliveryRows,
  noteQueued,
  sendMail,
  type MailDeliveryState,
  type MailJobPayload,
  type MailSendResult,
} from '../lib/mailer.js';

export const PROVISION_QUEUE = 'blipmade.provision';

export interface ProvisionJobData {
  instanceId: string;
  /** Set when an administrator asks for a retry, so the reason is auditable. */
  reason?: string;
  requestedBy?: string;
}

/**
 * The job id is the instance id, so enqueueing the same instance twice while a
 * job is queued or running does not create a duplicate job. BullMQ rejects a
 * custom id that contains a colon, so a dash is used.
 */
export function provisioningJobId(instanceId: string): string {
  return `provision-${instanceId}`;
}

let queue: Queue<ProvisionJobData> | null = null;

export function getQueue(): Queue<ProvisionJobData> {
  if (!queue) {
    queue = new Queue<ProvisionJobData>(PROVISION_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return queue;
}

/** Enqueues provisioning for an instance. Safe to call repeatedly. */
export async function enqueueProvisioning(
  instanceId: string,
  options: { reason?: string; requestedBy?: string } = {},
): Promise<void> {
  const jobId = provisioningJobId(instanceId);
  const existing = await getQueue().getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'waiting' || state === 'active' || state === 'delayed') return;
    // A finished or failed job with the same id can be retried by removing it.
    await existing.remove().catch(() => undefined);
  }
  await getQueue().add('provision', { instanceId, ...options }, { jobId });
}

export function createProvisionWorker(
  handler: (job: Job<ProvisionJobData>) => Promise<void>,
): Worker<ProvisionJobData> {
  return new Worker<ProvisionJobData>(PROVISION_QUEUE, handler, {
    connection: redis,
    concurrency: 2,
    lockDuration: 120_000,
  });
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
  }
}

export const isQueueEnabled = env.isProduction || env.NODE_ENV !== 'test';

/* ------------------------------------------------------------------ *
 * The mail queue.
 *
 * The messages are not sent while the request waits for them: they are put
 * on a queue and the worker sends them. A message that keeps failing ends
 * in the failed state of the queue, where it can be read.
 * ------------------------------------------------------------------ */

export const EMAIL_QUEUE = 'blipmade.email';

/** What the worker hands back, so the state of a message can be read. */
export interface EmailJobResult {
  state: MailDeliveryState;
  delivered: boolean;
  id: string;
}

/** What a queued message carries. */
export type EmailJobData = MailJobPayload;

let emailQueue: Queue<EmailJobData, EmailJobResult> | null = null;

export function getEmailQueue(): Queue<EmailJobData, EmailJobResult> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData, EmailJobResult>(EMAIL_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        // A message is tried a few times with a growing pause. After that it
        // stays in the failed state, where an operator can read it.
        attempts: 4,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return emailQueue;
}

/**
 * The name of the job of a message.
 *
 * It is built from the key of the message, so the same message never has two
 * jobs. BullMQ refuses a name with a colon in it, so a dash is used. The key
 * of a message is a hash, so the name never carries a token.
 */
export function emailJobId(key: string): string {
  return `email-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

/**
 * Puts a message on the queue.
 *
 * A message that is already waiting is not queued a second time, and a
 * message that was already sent is not sent again.
 */
export async function enqueueEmail(payload: EmailJobData): Promise<string> {
  const jobId = emailJobId(payload.key);
  const queue = getEmailQueue();
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized') return jobId;
    // The message was already sent: a second one would be a duplicate.
    if (state === 'completed') return jobId;
    // A failed job can be tried again.
    await existing.remove().catch(() => undefined);
  }
  await queue.add('send', payload, { jobId });
  return jobId;
}

/**
 * Sends a message, through the queue when there is one.
 *
 * The request is never held up by the relay: the message is queued and the
 * caller gets the state back. When the queue cannot be reached the message
 * is sent right away, so it is never lost.
 */
export async function dispatchEmail(payload: EmailJobData): Promise<MailSendResult> {
  const message = {
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    kind: payload.kind,
    idempotencyKey: payload.key,
  };
  if (!isQueueEnabled) {
    return sendMail(message);
  }
  try {
    const jobId = await enqueueEmail(payload);
    noteQueued(payload, jobId);
    const now = new Date().toISOString();
    return {
      state: 'queued',
      delivered: false,
      id: jobId,
      attempts: 0,
      transport: mailTransportName(),
      kind: payload.kind,
      errorClass: null,
      error: null,
      queuedAt: now,
      deliveredAt: null,
      updatedAt: now,
    };
  } catch (error) {
    console.error('[mail] the queue could not be reached, the message is sent right away', (error as Error).message);
    return sendMail(message);
  }
}

/** The worker that sends the queued messages. */
export function createEmailWorker(
  handler: (job: Job<EmailJobData, EmailJobResult>) => Promise<EmailJobResult>,
): Worker<EmailJobData, EmailJobResult> {
  return new Worker<EmailJobData, EmailJobResult>(EMAIL_QUEUE, handler, {
    connection: redis,
    concurrency: 5,
    lockDuration: 60_000,
  });
}

export interface EmailDeliveryMessage {
  key: string;
  kind: string;
  to: string;
  state: MailDeliveryState;
  attempts: number;
  lastErrorClass: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
}

export interface EmailDeliveryReport {
  transport: 'smtp' | 'file';
  configured: boolean;
  counts: { queued: number; delivered: number; writtenToFile: number; failed: number };
  queue: { waiting: number; active: number; delayed: number; completed: number; failed: number };
  messages: EmailDeliveryMessage[];
}

/** The state of a job of the queue. */
async function stateOfJob(job: Job<EmailJobData, EmailJobResult>): Promise<MailDeliveryState> {
  const state = await job.getState();
  if (state === 'completed') {
    const result = job.returnvalue;
    if (result && (result.state === 'delivered' || result.state === 'written-to-file')) return result.state;
    return 'delivered';
  }
  if (state === 'failed') return 'failed';
  return 'queued';
}

/**
 * What is known about the messages.
 *
 * The queue is read as well, because the worker is another process: what the
 * API knows on its own is only what it queued. Nothing here holds a body, a
 * token or a credential.
 */
export async function emailDeliveryReport(): Promise<EmailDeliveryReport> {
  const messages = new Map<string, EmailDeliveryMessage>();

  // The rows in the database come first: they are what the worker wrote, so
  // the state of a message is the same in every process.
  for (const record of await mailDeliveryRows()) {
    messages.set(record.key, {
      key: record.key,
      kind: record.kind,
      to: record.to,
      state: record.state,
      attempts: record.attempts,
      lastErrorClass: record.errorClass,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deliveredAt: record.deliveredAt,
    });
  }

  for (const record of mailDeliveryRecords()) {
    messages.set(record.key, {
      key: record.key,
      kind: record.kind,
      to: record.to,
      state: record.state,
      attempts: record.attempts,
      lastErrorClass: record.errorClass,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deliveredAt: record.deliveredAt,
    });
  }

  const queueCounts = { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 };
  try {
    const queue = getEmailQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    queueCounts.waiting = counts.waiting ?? 0;
    queueCounts.active = counts.active ?? 0;
    queueCounts.delayed = counts.delayed ?? 0;
    queueCounts.completed = counts.completed ?? 0;
    queueCounts.failed = counts.failed ?? 0;

    const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed'], 0, 49, true);
    for (const job of jobs) {
      const state = await stateOfJob(job);
      const created = new Date(job.timestamp ?? Date.now()).toISOString();
      const finished = job.finishedOn ?? job.processedOn ?? job.timestamp ?? Date.now();
      const updated = new Date(finished).toISOString();
      const failedReason = job.failedReason ?? null;
      const lastErrorClass = failedReason ? (failedReason.split(':', 1)[0] ?? null) : null;
      messages.set(job.data.key, {
        key: job.data.key,
        kind: job.data.kind,
        to: job.data.to,
        state,
        attempts: job.attemptsMade,
        lastErrorClass,
        createdAt: created,
        updatedAt: updated,
        deliveredAt: state === 'delivered' || state === 'written-to-file' ? updated : null,
      });
    }
  } catch {
    // The queue could not be read. What the API knows on its own is still
    // reported, so the answer never lies about what was read.
  }

  const list = [...messages.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = { queued: 0, delivered: 0, writtenToFile: 0, failed: 0 };
  for (const message of list) {
    if (message.state === 'queued') counts.queued += 1;
    else if (message.state === 'delivered') counts.delivered += 1;
    else if (message.state === 'written-to-file') counts.writtenToFile += 1;
    else if (message.state === 'failed') counts.failed += 1;
  }

  return {
    transport: mailTransportName(),
    configured: mailEnabled(),
    counts,
    queue: queueCounts,
    messages: list.slice(0, 100),
  };
}
