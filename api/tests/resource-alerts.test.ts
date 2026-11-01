import { describe, expect, it } from 'vitest';
import { passedThresholds, percentOf } from '../src/services/resource-alerts.js';

describe('resource alerts', () => {
  it('counts the use as a percentage of the plan', () => {
    expect(percentOf(512 * 1024 * 1024, 1024 * 1024 * 1024)).toBe(50);
    expect(percentOf(1, 0)).toBeNull();
  });
  it('says which thresholds are passed, and only those', () => {
    expect(passedThresholds({ used: 93, threshold: 90 }, { used: 40, threshold: 80 })).toEqual(['Memory use is at 93% of the plan (you asked to be told at 90%).']);
    expect(passedThresholds({ used: 50, threshold: null }, { used: 85, threshold: 85 })).toHaveLength(1);
    expect(passedThresholds({ used: 10, threshold: 90 }, { used: null, threshold: 80 })).toEqual([]);
  });
});
