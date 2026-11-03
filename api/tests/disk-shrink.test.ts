import { describe, expect, it } from 'vitest';
import { diskShrinkDecision } from '../src/services/upgrades.js';

describe('disk shrink', () => {
  it('allows a larger disk and a shrink that still fits', () => {
    expect(diskShrinkDecision({ currentGb: 10, nextGb: 20, usedBytes: null }).ok).toBe(true);
    expect(diskShrinkDecision({ currentGb: 10, nextGb: 5, usedBytes: 1024 }).ok).toBe(true);
  });

  it('refuses a shrink when usage is unknown or too large', () => {
    expect(diskShrinkDecision({ currentGb: 10, nextGb: 5, usedBytes: null }).ok).toBe(false);
    const used = 5 * 1024 * 1024 * 1024;
    expect(diskShrinkDecision({ currentGb: 10, nextGb: 5, usedBytes: used }).ok).toBe(false);
  });
});
