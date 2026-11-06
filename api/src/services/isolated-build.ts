/**
 * Isolated Smart Deploy builds. The API and the worker never execute uploaded archives.
 * A sandbox host (SMART_DEPLOY_SANDBOX) is the only place commands may run.
 */

import { prisma } from '../db.js';

export const SANDBOX_LIMITS = {
  cpu: 1,
  memoryMb: 1024,
  diskMb: 2048,
  timeoutSec: 600,
  network: 'restricted' as const,
};

export interface IsolatedBuildPlan {
  buildCommand: string;
  startCommand: string;
  runtime: string | null;
  executes: false;
  sandboxHost: string | null;
  status: 'planned' | 'blocked_no_sandbox' | 'queued' | 'cancelled';
  note: string;
  limits: typeof SANDBOX_LIMITS;
}

export function sandboxHost(): string | null {
  const host = (process.env.SMART_DEPLOY_SANDBOX ?? '').trim();
  return host || null;
}

export function planIsolatedBuild(input: { buildCommand: string; startCommand: string; runtime: string | null }): IsolatedBuildPlan {
  const host = sandboxHost();
  if (!host) {
    return {
      buildCommand: input.buildCommand,
      startCommand: input.startCommand,
      runtime: input.runtime,
      executes: false,
      sandboxHost: null,
      status: 'blocked_no_sandbox',
      note: 'Commands are recorded. Nothing runs in the API. Set SMART_DEPLOY_SANDBOX to a disposable builder, then queue the job.',
      limits: SANDBOX_LIMITS,
    };
  }
  return {
    buildCommand: input.buildCommand,
    startCommand: input.startCommand,
    runtime: input.runtime,
    executes: false,
    sandboxHost: host,
    status: 'queued',
    note: 'The sandbox host is the only place that may run these commands. The archive is not executed here.',
    limits: SANDBOX_LIMITS,
  };
}

/** Dispatch payload the sandbox accepts. Never executed in this process. */
export function sandboxDispatchPayload(job: {
  id: string;
  buildCommand: string;
  startCommand: string;
  sandboxHost: string | null;
}): { url: string | null; body: Record<string, unknown>; executes: false } {
  if (!job.sandboxHost) return { url: null, body: {}, executes: false };
  return {
    url: `https://${job.sandboxHost}/builds/${encodeURIComponent(job.id)}`,
    executes: false,
    body: {
      jobId: job.id,
      buildCommand: job.buildCommand,
      startCommand: job.startCommand,
      limits: SANDBOX_LIMITS,
    },
  };
}

export async function cancelIsolatedBuild(jobId: string, userId: string): Promise<{ ok: boolean; status: string; reason: string }> {
  const job = await prisma.isolatedBuildJob.findFirst({
    where: { id: jobId, importSource: { userId } },
  });
  if (!job) return { ok: false, status: 'missing', reason: 'Build job not found.' };
  if (['succeeded', 'failed', 'cancelled', 'blocked_no_sandbox'].includes(job.status)) {
    return { ok: false, status: job.status, reason: 'This build already finished.' };
  }
  await prisma.isolatedBuildJob.update({
    where: { id: job.id },
    data: { status: 'cancelled', lastError: 'Cancelled before the sandbox started it.', log: `${job.log}\ncancelled` },
  });
  return { ok: true, status: 'cancelled', reason: 'The job will not start on the sandbox.' };
}

export async function recoverStaleBuilds(staleMs = 30 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const result = await prisma.isolatedBuildJob.updateMany({
    where: { status: { in: ['queued', 'running'] }, updatedAt: { lte: cutoff } },
    data: { status: 'failed', lastError: 'The sandbox did not report progress. The API did not execute the archive.' },
  });
  return result.count;
}
