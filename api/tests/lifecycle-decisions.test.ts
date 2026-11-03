import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { backupCompleted, interruptedSwitchNeedsRestore, maySwitchProduct, runRepurposeSwitch } from '../src/services/repurpose-gate.js';
import { activationStatus, classifyHttpsResponse, httpDomainUpdate, probeTcpPort } from '../src/services/domain-activation.js';
import { approvalDecision, recordsFingerprint, type CustomerRecord, type RecordPreview } from '../src/services/dns-approval.js';
import {
  IMPORT_MAX_ATTEMPTS,
  IMPORT_ZIP_MAX_BYTES,
  afterDeployObservation,
  afterQueueAttempt,
  deployOutcomeFromMessage,
  fulfillmentAllowed,
  orderFulfillmentDecision,
  queuedImportIsStale,
  zipQuotaProblem,
  zipShouldPurge,
} from '../src/services/import-lifecycle.js';
import { DISCORD_TEMPLATES } from '../src/services/discord-templates.js';

describe('import application state', () => {
  it('does not mark an import applied when the queue refuses the job', () => {
    const refused = afterQueueAttempt(false);
    expect(refused.phase).toBe('pending');
    expect(refused.markApplied).toBe(false);
    expect(refused.error).toMatch(/did not accept/);
  });

  it('queues an accepted job and still waits for the build', () => {
    const accepted = afterQueueAttempt(true);
    expect(accepted).toEqual({ phase: 'queued', markApplied: false, error: null });
  });

  it('applies only after a successful build and a ready health check', () => {
    expect(afterDeployObservation({ deployState: 'succeeded', health: 'unknown', attempts: 1 }).phase).toBe('checking');
    expect(afterDeployObservation({ deployState: 'succeeded', health: 'unhealthy', attempts: 1 })).toMatchObject({ phase: 'failed', markApplied: false, fulfill: false });
    expect(afterDeployObservation({ deployState: 'failed', health: 'ready', attempts: 1 })).toMatchObject({ phase: 'failed', fulfill: false, markApplied: false });
    const ready = afterDeployObservation({ deployState: 'succeeded', health: 'ready', attempts: 1 });
    expect(ready).toMatchObject({ phase: 'applied', markApplied: true, clearZip: true, fulfill: true });
  });

  it('retries a failed build until the attempt limit', () => {
    expect(afterDeployObservation({ deployState: 'failed', health: 'unknown', attempts: IMPORT_MAX_ATTEMPTS - 1 }).retry).toBe(true);
    expect(afterDeployObservation({ deployState: 'failed', health: 'unknown', attempts: IMPORT_MAX_ATTEMPTS }).retry).toBe(false);
  });

  it('reads a finished deployment from the event and ignores the start line', () => {
    expect(deployOutcomeFromMessage('deploy:abc:started:build:import', 'abc')).toBeNull();
    expect(deployOutcomeFromMessage('deploy:abc:succeeded:rel:commit:ok', 'abc')).toBe('succeeded');
    expect(deployOutcomeFromMessage('deploy:other:failed:rel:commit:no', 'abc')).toBeNull();
  });

  it('waits only for the deployment that was recorded', () => {
    expect(queuedImportIsStale({ jobPresent: true, jobDeployId: 'a', recordedDeployId: 'a' })).toBe('wait');
    expect(queuedImportIsStale({ jobPresent: true, jobDeployId: 'b', recordedDeployId: 'a' })).toBe('retry');
    expect(queuedImportIsStale({ jobPresent: false, jobDeployId: null, recordedDeployId: 'a' })).toBe('retry');
  });

  it('does not fulfill an order while the imported application is not ready', () => {
    expect(orderFulfillmentDecision({
      instances: [{ cancelled: false, online: true, applicationReady: false }],
    })).toBe('PROVISIONING');
    expect(orderFulfillmentDecision({
      instances: [{ cancelled: false, online: true, applicationReady: true }],
    })).toBe('FULFILLED');
    expect(fulfillmentAllowed({ cancelled: false, applicationReady: false, importAttached: true })).toBe(false);
    expect(fulfillmentAllowed({ cancelled: false, applicationReady: true, importAttached: true })).toBe(true);
    expect(fulfillmentAllowed({ cancelled: false, applicationReady: false, importAttached: false })).toBe(true);
  });
});

describe('import archive retention', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');

  it('refuses an archive over the size or the account quota', () => {
    expect(zipQuotaProblem([], IMPORT_ZIP_MAX_BYTES + 1)).toMatch(/8 MB/);
    expect(zipQuotaProblem([{ bytes: 8_000_000 }, { bytes: 8_000_000 }, { bytes: 8_000_000 }], 100)).toMatch(/Too many/);
    expect(zipQuotaProblem([{ bytes: 20 * 1024 * 1024 }], 5 * 1024 * 1024)).toMatch(/24 MB/);
    expect(zipQuotaProblem([{ bytes: 1000 }], 2000)).toBeNull();
  });

  it('purges an applied archive immediately and an unapplied archive after it expires', () => {
    expect(zipShouldPurge({ bytes: 10, expiresAt: now + 1000, appliedAt: now }, now)).toBe(true);
    expect(zipShouldPurge({ bytes: 10, expiresAt: now - 1, appliedAt: null }, now)).toBe(true);
    expect(zipShouldPurge({ bytes: 10, expiresAt: now + 1000, appliedAt: null }, now)).toBe(false);
    expect(zipShouldPurge({ bytes: 0, expiresAt: now - 1, appliedAt: null }, now)).toBe(false);
  });
});

describe('hostname readiness', () => {
  it('treats any HTTP status as a certificate, and only a 2xx as a healthy application', () => {
    expect(classifyHttpsResponse({ handshake: false, status: null })).toEqual({ tls: 'unavailable', application: 'unknown' });
    expect(classifyHttpsResponse({ handshake: true, status: 200 })).toEqual({ tls: 'ready', application: 'ready' });
    expect(classifyHttpsResponse({ handshake: true, status: 302 })).toEqual({ tls: 'ready', application: 'unknown' });
    expect(classifyHttpsResponse({ handshake: true, status: 502 })).toEqual({ tls: 'ready', application: 'unhealthy' });
  });

  it('accepts a game port only when something is listening', async () => {
    expect(await probeTcpPort('127.0.0.1', 1, 300)).toBe(false);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    expect(await probeTcpPort('127.0.0.1', port, 1000)).toBe(true);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('does not mark a game hostname active from an HTTP route, or a site active without a certificate', () => {
    expect(activationStatus({ purpose: 'game', routeApplied: true, tls: 'ready' })).toBe('PENDING_DNS');
    expect(activationStatus({ purpose: 'http', routeApplied: true, tls: 'unavailable' })).toBe('PENDING_DNS');
    expect(activationStatus({ purpose: 'http', routeApplied: false, tls: 'ready' })).toBe('PENDING_DNS');
    expect(activationStatus({ purpose: 'http', routeApplied: true, tls: 'ready' })).toBe('ACTIVE');
  });

  it('stores an unhealthy application without clearing the active certificate', () => {
    const update = httpDomainUpdate({
      routeApplied: true,
      routeId: 'route-1',
      reason: null,
      probe: { tls: 'ready', application: 'unhealthy' },
    });
    expect(update.status).toBe('ACTIVE');
    expect(update.applicationStatus).toBe('unhealthy');
    expect(update.lastError).toBeNull();
  });
});

describe('DNS approval binding', () => {
  const records: CustomerRecord[] = [{ type: 'A', name: 'Play.Example.com', content: '203.0.113.10' }];
  const diff: RecordPreview[] = [{ type: 'A', name: 'play.example.com', wanted: '203.0.113.10', current: null, action: 'create' }];
  const now = Date.parse('2026-11-03T12:00:00Z');

  it('binds approval to the stored fingerprint and refuses a changed zone', () => {
    const fingerprint = recordsFingerprint(records);
    expect(fingerprint).toBe(recordsFingerprint([{ type: 'A', name: 'play.example.com', content: '203.0.113.10' }]));
    expect(approvalDecision({
      now,
      expiresAt: now + 1000,
      consumedAt: null,
      fingerprint,
      currentFingerprint: fingerprint,
      stored: diff,
      live: diff,
    }).ok).toBe(true);
    const conflict: RecordPreview[] = [{ ...diff[0]!, current: '198.51.100.2', action: 'conflict' }];
    const changed = approvalDecision({
      now,
      expiresAt: now + 1000,
      consumedAt: null,
      fingerprint,
      currentFingerprint: fingerprint,
      stored: diff,
      live: conflict,
    });
    expect(changed.ok).toBe(false);
    expect(approvalDecision({
      now: now + 5000,
      expiresAt: now + 1000,
      consumedAt: null,
      fingerprint,
      currentFingerprint: fingerprint,
      stored: diff,
      live: diff,
    }).ok).toBe(false);
    expect(approvalDecision({
      now,
      expiresAt: now + 1000,
      consumedAt: now,
      fingerprint,
      currentFingerprint: fingerprint,
      stored: diff,
      live: diff,
    }).ok).toBe(false);
  });
});

describe('repurpose backup gate', () => {
  it('restores the previous server when the switch fails', async () => {
    expect(backupCompleted({ completedAt: null, successful: true })).toBe(false);
    expect(maySwitchProduct({ completed: true, archiveProblem: 'truncated' }).ok).toBe(false);
    expect(maySwitchProduct({ completed: true, archiveProblem: null }).ok).toBe(true);
    expect(interruptedSwitchNeedsRestore('switching')).toBe(true);
    expect(interruptedSwitchNeedsRestore('archive_verified')).toBe(false);
    const calls: string[] = [];
    const failed = await runRepurposeSwitch({
      change: async () => { calls.push('change'); throw new Error('install failed'); },
      restore: async () => { calls.push('restore'); },
      revert: async () => { calls.push('revert'); },
    });
    expect(failed.state).toBe('restored');
    expect(calls).toEqual(['change', 'restore', 'revert']);
    const broken = await runRepurposeSwitch({
      change: async () => { throw new Error('install failed'); },
      restore: async () => { throw new Error('restore failed'); },
      revert: async () => undefined,
    });
    expect(broken.state).toBe('restore_failed');
  });
});

describe('discord ticket privacy', () => {
  it('denies the everyone role on a ticket channel', () => {
    expect(DISCORD_TEMPLATES.tickets.index).toContain('PermissionFlagsBits.ViewChannel');
    expect(DISCORD_TEMPLATES.tickets.index).toContain('deny:');
    expect(DISCORD_TEMPLATES.tickets.index).toContain('guild.roles.everyone.id');
    expect(DISCORD_TEMPLATES.moderation.packageJson).toContain('discord.js');
    expect(DISCORD_TEMPLATES.welcome.packageJson).toContain('discord.js');
    expect(DISCORD_TEMPLATES.tickets.packageJson).toContain('discord.js');
  });
});
