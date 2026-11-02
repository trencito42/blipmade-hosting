import { describe, expect, it } from 'vitest';
import { allocateProductMargin } from '../src/services/capacity.js';

describe('the margin of a product', () => {
  const rows = [
    { amount: 3000, ramMb: 6144 },
    { amount: 1000, ramMb: 2048 },
    { amount: 500, ramMb: 1024 },
  ];

  it('is unknown, never zero, when the cost is not declared', () => {
    for (const row of allocateProductMargin(rows, null)) {
      expect(row.cost).toBeNull();
      expect(row.margin).toBeNull();
    }
  });

  it('shares the cost by the memory that is sold', () => {
    const result = allocateProductMargin(rows, 9216);
    expect(result.map((row) => row.cost)).toEqual([6144, 2048, 1024]);
    expect(result.map((row) => row.margin)).toEqual([-3144, -1048, -524]);
  });

  it('adds the shares up to the cost, whatever the division leaves', () => {
    const result = allocateProductMargin(rows, 1000);
    expect(result.reduce((sum, row) => sum + (row.cost ?? 0), 0)).toBe(1000);
    expect(result.reduce((sum, row) => sum + (row.margin ?? 0), 0)).toBe(4500 - 1000);
  });

  it('can show a product that loses money', () => {
    const [first] = allocateProductMargin([{ amount: 100, ramMb: 1024 }], 500);
    expect(first!.margin).toBe(-400);
  });

  it('knows nothing when nothing is sold', () => {
    expect(allocateProductMargin([], 500)).toEqual([]);
    expect(allocateProductMargin([{ amount: 0, ramMb: 0 }], 500)[0]!.margin).toBeNull();
  });
});
