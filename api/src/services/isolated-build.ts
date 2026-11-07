/**
 * Smart Deploy build dispatch. Uploaded code is never executed by the API or
 * worker; only the independently deployed sandbox endpoint receives it.
 */
import { createHash, createHmac } from 'node:crypto';
import { prisma } from '../db.js';
import { mintInstallationToken } from './github-app/client.js';

export const SANDBOX_LIMITS = {
  cpu: 1,
  memoryMb: 1024,
  diskMb: 2048,
  timeoutSec: 600,
  network: 'restricted' as const,
};

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_LOG_BYTES = 1024 * 1024;

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

function configuredEndpoint(): URL | null {
  const raw = (process.env.SMART_DEPLOY_SANDBOX_URL ?? process.env.SMART_DEPLOY_SANDBOX ?? '').trim();
  if (!raw) return null;
  try {
    const endpoint = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const local = endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost';
    if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local)) return null;
    endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint;
  } catch {
    return null;
  }
}

function configuredSecret(): string | null {
  const value = (process.env.SMART_DEPLOY_SANDBOX_SECRET ?? '').trim();
  return value.length >= 32 ? value : null;
}

export function sandboxHost(): string | null {
  return configuredEndpoint()?.toString().replace(/\/$/, '') ?? null;
}

export function sandboxReady(): boolean {
  return Boolean(configuredEndpoint() && configuredSecret());
}

export function runtimeForProduct(productSlug: string): string | null {
  const runtimes: Record<string, string> = {
    node: 'node',
    nodejs: 'node',
    'discord-bot': 'node',
    python: 'python',
    php: 'php',
    go: 'go',
    golang: 'go',
    rust: 'rust',
    'rust-runtime': 'rust',
  };
  return runtimes[productSlug] ?? null;
}

export function planIsolatedBuild(input: { buildCommand: string; startCommand: string; runtime: string | null }): IsolatedBuildPlan {
  const host = sandboxHost();
  if (!host || !configuredSecret()) {
    return {
      buildCommand: input.buildCommand,
      startCommand: input.startCommand,
      runtime: input.runtime,
      executes: false,
      sandboxHost: host,
      status: 'blocked_no_sandbox',
      note: 'Commands are recorded but not run. Configure an HTTPS sandbox endpoint and its independent signing secret.',
      limits: SANDBOX_LIMITS,
    };
  }
  if (!input.runtime) {
    return {
      buildCommand: input.buildCommand,
      startCommand: input.startCommand,
      runtime: null,
      executes: false,
      sandboxHost: host,
      status: 'blocked_no_sandbox',
      note: 'This product does not map to a supported disposable build runtime.',
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
    note: 'The worker sends the source to the signed sandbox endpoint. The API and worker do not execute it.',
    limits: SANDBOX_LIMITS,
  };
}

/** Metadata-only representation for diagnostics; source bytes are never put in this object. */
export function sandboxDispatchPayload(job: {
  id: string;
  buildCommand: string;
  startCommand: string;
  sandboxHost: string | null;
}): { url: string | null; body: Record<string, unknown>; executes: false } {
  if (!job.sandboxHost) return { url: null, body: {}, executes: false };
  return {
    url: `${job.sandboxHost.replace(/\/$/, '')}/builds/${encodeURIComponent(job.id)}`,
    executes: false,
    body: { jobId: job.id, buildCommand: job.buildCommand, startCommand: job.startCommand, limits: SANDBOX_LIMITS },
  };
}

export function signedSandboxHeaders(jobId: string, raw: Buffer, secret: string, timestamp = Date.now()): Record<string, string> {
  const sentAt = String(timestamp);
  const digest = createHmac('sha256', secret).update(`${sentAt}.${jobId}.`).update(raw).digest('hex');
  return {
    'content-type': 'application/json',
    'x-blipmade-timestamp': sentAt,
    'x-blipmade-signature': `sha256=${digest}`,
  };
}

async function readLimited(response: Response, maxBytes: number, tooLargeMessage: string): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new Error(tooLargeMessage);
  if (!response.body) throw new Error('The source archive was empty.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error(tooLargeMessage);
    chunks.push(Buffer.from(chunk));
  }
  if (size === 0) throw new Error('The source archive was empty.');
  return Buffer.concat(chunks);
}

type BuildSource = {
  kind: string;
  zipBytes: Uint8Array | null;
  repoUrl: string | null;
  branch: string | null;
  githubRepositoryFullName: string | null;
  githubInstallation: { installationId: string } | null;
};

async function githubArchive(fullName: string, branch: string, token?: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error('The GitHub repository name is invalid.');
  const response = await fetch(`https://api.github.com/repos/${fullName}/tarball/${encodeURIComponent(branch)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Blipmade',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub did not provide the selected source archive (${response.status}).`);
  return readLimited(response, MAX_ARCHIVE_BYTES, 'The source archive is larger than 8 MB.');
}

async function archiveFor(source: BuildSource): Promise<Buffer> {
  if (source.zipBytes?.byteLength) return Buffer.from(source.zipBytes);
  if (source.githubRepositoryFullName && source.githubInstallation) {
    const token = await mintInstallationToken(source.githubInstallation.installationId);
    return githubArchive(source.githubRepositoryFullName, source.branch || 'main', token);
  }
  if (source.repoUrl) {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i.exec(source.repoUrl);
    if (match) return githubArchive(`${match[1]}/${match[2]}`, source.branch || 'main');
  }
  throw new Error('This import source cannot yet be fetched by the isolated builder. Upload a ZIP/tar or use GitHub.');
}

type SandboxAnswer = {
  status?: string;
  log?: string;
  error?: string;
  artifactSha256?: string;
  artifactBytesLength?: number;
  artifactBase64?: string;
};

class SandboxDispatchError extends Error {
  constructor(message: string, readonly buildLog = '') {
    super(message);
  }
}

async function dispatchClaimed(jobId: string): Promise<void> {
  const endpoint = configuredEndpoint();
  const secret = configuredSecret();
  if (!endpoint || !secret) throw new Error('The disposable sandbox is not configured.');
  const job = await prisma.isolatedBuildJob.findUnique({
    where: { id: jobId },
    include: {
      importSource: {
        select: {
          kind: true,
          zipBytes: true,
          repoUrl: true,
          branch: true,
          githubRepositoryFullName: true,
          githubInstallation: { select: { installationId: true } },
        },
      },
    },
  });
  if (!job || job.status !== 'running' || !job.runtime) return;
  const archive = await archiveFor(job.importSource);
  const inputSha256 = createHash('sha256').update(archive).digest('hex');
  const raw = Buffer.from(JSON.stringify({
    runtime: job.runtime,
    buildCommand: job.buildCommand,
    archiveSha256: inputSha256,
    archiveBase64: archive.toString('base64'),
  }));
  const url = `${endpoint.toString().replace(/\/$/, '')}/builds/${encodeURIComponent(job.id)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: signedSandboxHeaders(job.id, raw, secret),
    body: raw,
    signal: AbortSignal.timeout((SANDBOX_LIMITS.timeoutSec + 30) * 1000),
  });
  const responseBytes = await readLimited(response, 45 * 1024 * 1024, 'The sandbox response is larger than the accepted artifact limit.');
  let answer: SandboxAnswer = {};
  try {
    answer = JSON.parse(responseBytes.toString('utf8')) as SandboxAnswer;
  } catch {
    throw new Error('The sandbox returned an invalid response.');
  }
  const log = typeof answer.log === 'string' ? answer.log.slice(0, MAX_LOG_BYTES) : '';
  if (!response.ok || answer.status !== 'succeeded' || !answer.artifactBase64 || !answer.artifactSha256) {
    throw new SandboxDispatchError(answer.error || `The sandbox rejected the build (${response.status}).`, log);
  }
  const artifact = Buffer.from(answer.artifactBase64, 'base64');
  if (artifact.length === 0 || artifact.length > MAX_ARTIFACT_BYTES) throw new SandboxDispatchError('The sandbox artifact has an invalid size.', log);
  const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
  if (artifactSha256 !== answer.artifactSha256 || answer.artifactBytesLength !== artifact.length) {
    throw new SandboxDispatchError('The sandbox artifact failed its checksum.', log);
  }
  await prisma.isolatedBuildJob.updateMany({
    where: { id: job.id, status: 'running' },
    data: {
      status: 'succeeded',
      inputSha256,
      artifactSha256,
      artifactBytes: artifact,
      artifactBytesLength: artifact.length,
      log,
      lastError: null,
      finishedAt: new Date(),
    },
  });
}

/** Claims and dispatches queued jobs. Concurrent workers cannot run the same row. */
export async function runPendingIsolatedBuilds(limit = 1): Promise<number> {
  if (!sandboxReady()) return 0;
  const candidates = await prisma.isolatedBuildJob.findMany({ where: { status: 'queued' }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: Math.max(1, Math.min(limit, 5)) });
  let claimed = 0;
  for (const candidate of candidates) {
    const start = await prisma.isolatedBuildJob.updateMany({
      where: { id: candidate.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date(), finishedAt: null, lastError: null, attempts: { increment: 1 } },
    });
    if (start.count !== 1) continue;
    claimed += 1;
    try {
      await dispatchClaimed(candidate.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The isolated build failed.';
      await prisma.isolatedBuildJob.updateMany({
        where: { id: candidate.id, status: 'running' },
        data: {
          status: 'failed',
          lastError: message.slice(0, 1000),
          ...(error instanceof SandboxDispatchError ? { log: error.buildLog } : {}),
          finishedAt: new Date(),
        },
      });
    }
  }
  return claimed;
}

async function stopRemoteBuild(job: { id: string; sandboxHost: string | null }): Promise<boolean> {
  const secret = configuredSecret();
  if (!secret || !job.sandboxHost) return false;
  let endpoint: URL;
  try {
    endpoint = new URL(job.sandboxHost);
  } catch {
    return false;
  }
  const local = endpoint.hostname === '127.0.0.1' || endpoint.hostname === 'localhost';
  if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local)) return false;
  const raw = Buffer.alloc(0);
  const response = await fetch(`${endpoint.toString().replace(/\/$/, '')}/builds/${encodeURIComponent(job.id)}`, {
    method: 'DELETE',
    headers: signedSandboxHeaders(job.id, raw, secret),
    body: raw,
    signal: AbortSignal.timeout(5_000),
  });
  return response.ok;
}

export async function cancelIsolatedBuild(jobId: string, userId: string): Promise<{ ok: boolean; status: string; reason: string }> {
  const job = await prisma.isolatedBuildJob.findFirst({ where: { id: jobId, importSource: { userId } } });
  if (!job) return { ok: false, status: 'missing', reason: 'Build job not found.' };
  if (['succeeded', 'failed', 'cancelled', 'blocked_no_sandbox'].includes(job.status)) {
    return { ok: false, status: job.status, reason: 'This build already finished.' };
  }
  const remoteStopped = job.status === 'running' ? await stopRemoteBuild(job).catch(() => false) : true;
  const stopped = await prisma.isolatedBuildJob.updateMany({
    where: { id: job.id, status: { in: ['planned', 'queued', 'running'] } },
    data: { status: 'cancelled', lastError: 'Cancelled by the customer.', finishedAt: new Date() },
  });
  return stopped.count === 1
    ? {
        ok: true,
        status: 'cancelled',
        reason: remoteStopped
          ? 'The build was cancelled. A late sandbox result will be discarded.'
          : 'The build was cancelled locally. The sandbox did not acknowledge the stop, so any late result will be discarded.',
      }
    : { ok: false, status: 'changed', reason: 'The build changed state. Reload it before trying again.' };
}

export async function recoverStaleBuilds(staleMs = 12 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const result = await prisma.isolatedBuildJob.updateMany({
    where: { status: 'running', updatedAt: { lte: cutoff } },
    data: { status: 'failed', finishedAt: new Date(), lastError: 'The sandbox did not report before its hard timeout. No artifact was accepted.' },
  });
  return result.count;
}
