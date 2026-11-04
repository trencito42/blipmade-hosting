/** Decisions for a stored import. They do not touch the database or a server. */

export const IMPORT_ZIP_TTL_MS = 24 * 60 * 60 * 1000;
export const IMPORT_ZIP_MAX_BYTES = 8 * 1024 * 1024;
export const IMPORT_ZIP_QUOTA_BYTES = 24 * 1024 * 1024;
export const IMPORT_ZIP_QUOTA_COUNT = 3;
export const IMPORT_MAX_ATTEMPTS = 5;

export type ImportPhase = 'pending' | 'queued' | 'checking' | 'failed' | 'applied';
export type ApplicationHealth = 'ready' | 'unhealthy' | 'unknown';

/** Why a new archive cannot be stored, or null when it fits the account quota. */
export function zipQuotaProblem(held: { bytes: number }[], incoming: number): string | null {
  if (incoming <= 0) return 'The archive is empty.';
  if (incoming > IMPORT_ZIP_MAX_BYTES) return 'The zip must be a zip file of at most 8 MB.';
  if (held.length >= IMPORT_ZIP_QUOTA_COUNT) return 'Too many project archives are waiting. Wait for one to expire before uploading another.';
  const total = held.reduce((sum, row) => sum + row.bytes, 0) + incoming;
  if (total > IMPORT_ZIP_QUOTA_BYTES) return 'Project archives for this account are over the 24 MB waiting limit.';
  return null;
}

/** True when the stored bytes should be removed. Applied archives go immediately. The rest expire. */
export function zipShouldPurge(row: { bytes: number; expiresAt: number | null; appliedAt: number | null }, now: number): boolean {
  if (row.bytes <= 0) return false;
  if (row.appliedAt !== null) return true;
  return row.expiresAt !== null && row.expiresAt <= now;
}

/**
 * A queued import whose job is still the one we recorded has to be left alone.
 * Anything else can be tried again, and appliedAt stays empty until the build and the health check succeed.
 */
export function queuedImportIsStale(input: { jobPresent: boolean; jobDeployId: string | null; recordedDeployId: string | null }): 'wait' | 'retry' {
  if (input.jobPresent && input.recordedDeployId && input.jobDeployId === input.recordedDeployId) return 'wait';
  return 'retry';
}

/** The queue answer. Accepted work is queued. A refusal is still pending and is not applied. */
export function afterQueueAttempt(accepted: boolean): { phase: 'pending' | 'queued'; markApplied: false; error: string | null } {
  if (accepted) return { phase: 'queued', markApplied: false, error: null };
  return { phase: 'pending', markApplied: false, error: 'The deployment queue did not accept the job. It will be tried again.' };
}

export function deployOutcomeFromMessage(message: string, deployId: string): 'succeeded' | 'failed' | null {
  const prefix = `deploy:${deployId}:`;
  if (!message.startsWith(prefix)) return null;
  const state = message.slice(prefix.length).split(':')[0];
  if (state === 'succeeded' || state === 'failed') return state;
  return null;
}

/**
 * What the import becomes after a build is observed.
 * Success is applied only when the health check is ready. Queue submission is not success.
 */
export function afterDeployObservation(input: {
  deployState: 'succeeded' | 'failed' | 'building' | 'built' | 'none';
  health: ApplicationHealth;
  attempts: number;
}): {
  phase: ImportPhase;
  markApplied: boolean;
  clearZip: boolean;
  fulfill: boolean;
  error: string | null;
  retry: boolean;
} {
  if (input.deployState === 'building' || input.deployState === 'none' || input.deployState === 'built') {
    return { phase: 'queued', markApplied: false, clearZip: false, fulfill: false, error: null, retry: false };
  }
  if (input.deployState === 'failed') {
    return {
      phase: 'failed',
      markApplied: false,
      clearZip: false,
      fulfill: false,
      error: 'The build failed inside the server.',
      retry: input.attempts < IMPORT_MAX_ATTEMPTS,
    };
  }
  if (input.health === 'unknown') {
    return {
      phase: 'checking',
      markApplied: false,
      clearZip: false,
      fulfill: false,
      error: 'The build finished. The application health check has not answered yet.',
      retry: false,
    };
  }
  if (input.health === 'unhealthy') {
    return {
      phase: 'failed',
      markApplied: false,
      clearZip: false,
      fulfill: false,
      error: 'The build finished, but the application did not pass its health check.',
      retry: input.attempts < IMPORT_MAX_ATTEMPTS,
    };
  }
  return { phase: 'applied', markApplied: true, clearZip: true, fulfill: true, error: null, retry: false };
}

/** The order is fulfilled only when every remaining server is online and its application is ready. */
export function orderFulfillmentDecision(input: { instances: { cancelled: boolean; online: boolean; applicationReady: boolean }[] }): 'FULFILLED' | 'PROVISIONING' {
  const open = input.instances.filter((instance) => !instance.cancelled);
  if (open.length === 0) return 'PROVISIONING';
  return open.every((instance) => instance.online && instance.applicationReady) ? 'FULFILLED' : 'PROVISIONING';
}

/**
 * appliedAt alone is not readiness. An import stays unfulfilled until applicationReadyAt is set,
 * including when the process stopped between those two writes.
 */
export function fulfillmentAllowed(input: { cancelled: boolean; applicationReady: boolean; importAttached: boolean }): boolean {
  if (input.cancelled) return true;
  if (input.applicationReady) return true;
  return !input.importAttached;
}

export function healthKind(productSlug: string): 'process' | 'http' {
  return productSlug === 'discord-bot' ? 'process' : 'http';
}

export function interpretProcessState(state: string): ApplicationHealth {
  if (state === 'running') return 'ready';
  if (state === 'offline' || state === 'stopped' || state === 'stopping') return 'unhealthy';
  return 'unknown';
}

/** An HTTP status is healthy only for a successful response. A redirect is not a health proof. */
export function interpretHttpStatus(status: number | null, handshake: boolean): ApplicationHealth {
  if (!handshake || status === null || status <= 0) return 'unknown';
  if (status >= 200 && status < 300) return 'ready';
  if (status >= 300 && status < 400) return 'unknown';
  return 'unhealthy';
}
