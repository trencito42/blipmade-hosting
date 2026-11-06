import { describe, expect, it } from 'vitest';
import { coverageFor, destinationState, inventoryNote, type OffsiteCopyView, type WorkloadPolicy } from '../src/services/ops-coverage.js';

const NOW = new Date('2026-11-06T08:00:00.000Z');

const policy: WorkloadPolicy = {
  id: 'postgres',
  name: 'Blipmade PostgreSQL',
  host: 'vm103',
  method: 'pg_dump',
  frequency: 'daily',
  retention: 'newest',
  freshnessHours: 26,
  match: (c) => c.kind === 'DATABASE',
};

function copy(overrides: Partial<OffsiteCopyView>): OffsiteCopyView {
  return {
    kind: 'DATABASE',
    sourceId: 'postgres',
    state: 'OFFSITE_VERIFIED',
    takenAt: NOW,
    uploadedAt: NOW,
    verifiedAt: NOW,
    decryptVerifiedAt: null,
    restoreVerifiedAt: null,
    isolatedRestore: false,
    sizeBytes: 10,
    error: null,
    instanceId: null,
    ...overrides,
  };
}

describe('backup coverage', () => {
  it('treats a missing receipt as not protected, not healthy', () => {
    const row = coverageFor(policy, [], NOW);
    expect(row.state).toBe('not_protected');
    expect(row.reason).toMatch(/missing receipt/i);
  });

  it('does not treat an upload as a remote verification', () => {
    const row = coverageFor(policy, [copy({ state: 'OFFSITE_PENDING', verifiedAt: null })], NOW);
    expect(row.state).toBe('uploaded');
  });

  it('does not treat a verified copy as a restore', () => {
    const row = coverageFor(policy, [copy({ restoreVerifiedAt: null })], NOW);
    expect(row.state).toBe('restore_untested');
    expect(row.verification).toBe('remote_readback');
    expect(row.reason).toMatch(/not a restore/i);
  });

  it('does not treat decrypt plus archive test as a restore', () => {
    const row = coverageFor(policy, [copy({ decryptVerifiedAt: NOW, restoreVerifiedAt: null })], NOW);
    expect(row.state).toBe('decrypt_verified');
    expect(row.verification).toBe('decrypt_opened');
    expect(row.reason).toMatch(/not a restore/i);
  });

  it('marks last month as stale even when verified', () => {
    const old = new Date('2026-10-01T08:00:00.000Z');
    const row = coverageFor(policy, [copy({ takenAt: old, uploadedAt: old, verifiedAt: old })], NOW);
    expect(row.state).toBe('stale');
  });

  it('records isolated restore separately from decrypt', () => {
    const row = coverageFor(policy, [copy({ decryptVerifiedAt: NOW, restoreVerifiedAt: NOW, isolatedRestore: true })], NOW);
    expect(row.state).toBe('restore_verified');
    expect(row.verification).toBe('restore_tested');
    expect(row.reason).toMatch(/operational recovery/i);
  });

  it('does not treat a legacy drill restoreVerifiedAt as an isolated restore', () => {
    const row = coverageFor(policy, [copy({ restoreVerifiedAt: NOW, isolatedRestore: false })], NOW);
    expect(row.state).toBe('decrypt_verified');
    expect(row.verification).toBe('decrypt_opened');
    expect(row.lastRestoreAt).toBeNull();
    expect(row.lastDecryptAt).toBe(NOW.toISOString());
  });

  it('does not call vacant absence healthy', () => {
    const row = coverageFor({ ...policy, vacant: true }, [], NOW);
    expect(row.state).toBe('not_configured');
  });
});

describe('destination evidence', () => {
  it('does not treat a missing probe as reachable', () => {
    expect(destinationState(null, NOW).state).toBe('not_configured');
  });

  it('marks an old successful probe stale', () => {
    const at = new Date('2026-11-05T08:00:00.000Z').toISOString();
    expect(destinationState({ reachable: true, at }, NOW).state).toBe('stale');
  });

  it('does not treat local verified rows as remote files', () => {
    expect(inventoryNote(4, 0)).toMatch(/empty/);
    expect(inventoryNote(4, null)).toMatch(/not proof/);
  });
});
