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
    restoreVerifiedAt: null,
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
    expect(row.reason).toMatch(/restore untested/i);
  });

  it('marks last month as stale even when verified', () => {
    const old = new Date('2026-10-01T08:00:00.000Z');
    const row = coverageFor(policy, [copy({ takenAt: old, uploadedAt: old, verifiedAt: old })], NOW);
    expect(row.state).toBe('stale');
  });

  it('records restore separately from verification', () => {
    const row = coverageFor(policy, [copy({ restoreVerifiedAt: NOW })], NOW);
    expect(row.state).toBe('restore_verified');
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
