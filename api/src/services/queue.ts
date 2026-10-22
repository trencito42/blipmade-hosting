import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../redis.js';
import { env } from '../env.js';

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
}

export const isQueueEnabled = env.isProduction || env.NODE_ENV !== 'test';
