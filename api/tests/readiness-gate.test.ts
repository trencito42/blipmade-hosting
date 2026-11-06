import { describe, expect, it } from 'vitest';
import { evaluateGate, type GateFacts } from '../src/services/readiness-gate.js';

const facts = (over: Partial<GateFacts> = {}): GateFacts => ({
  panelConfigured: true,
  eggs: { known: true, ids: new Set([5]), names: new Set(['paper']) },
  nodes: [{ freeMemoryMb: 8192, freeDiskMb: 100_000 }],
  proxmoxConfigured: true,
  vpsCapacity: { freeMemoryMb: 65_536, freeDiskGb: 800, usedSlots: 2, maxSlots: 150 },
  ...over,
});
const product = {
  name: 'P', slug: 'p', deployable: true, visible: true, fulfilment: 'SERVER' as const, eggId: 5, eggName: null,
  minRam: 512, defaultRam: 1024, maxRam: 4096, minCpu: 1, defaultCpu: 1, maxCpu: 2, minDisk: 5, defaultDisk: 10, maxDisk: 50,
};
const monthly = [{ period: 'MONTHLY' as const, active: true }];
const failed = (gate: ReturnType<typeof evaluateGate>) => gate.checks.filter((c) => !c.ok).map((c) => c.id);

describe('readiness gate', () => {
  it('is ready when every fact holds', () => {
    expect(evaluateGate(product, monthly, 500, facts()).ready).toBe(true);
  });
  it('refuses an egg that is not on the panel', () => {
    expect(failed(evaluateGate({ ...product, eggId: 99 }, monthly, 500, facts()))).toEqual(['resolvedEgg']);
  });
  it('refuses a product without an egg', () => {
    expect(failed(evaluateGate({ ...product, eggId: null }, monthly, 500, facts()))).toContain('resolvedEgg');
  });
  it('refuses a zero quote and a missing price', () => {
    expect(failed(evaluateGate(product, monthly, 0, facts()))).toEqual(['priceQuoteValid']);
    expect(failed(evaluateGate(product, [], null, facts()))).toEqual(['priceQuoteValid']);
  });
  it('refuses when the panel is out of reach or full', () => {
    expect(failed(evaluateGate(product, monthly, 500, facts({ nodes: null })))).toEqual(['providerReady', 'capacityReady']);
    expect(failed(evaluateGate(product, monthly, 500, facts({ nodes: [{ freeMemoryMb: 100, freeDiskMb: 100 }] })))).toEqual(['capacityReady']);
  });
  it('refuses a plan out of order', () => {
    expect(failed(evaluateGate({ ...product, defaultRam: 8192 }, monthly, 500, facts()))).toEqual(['planValid']);
  });
  it('refuses a closed product', () => {
    expect(failed(evaluateGate({ ...product, deployable: false }, monthly, 500, facts()))).toEqual(['eligibleFulfillment']);
  });
  it('needs no egg or node for a VPS', () => {
    const vps = { ...product, fulfilment: 'VPS' as const, eggId: null };
    expect(evaluateGate(vps, monthly, 500, facts({ nodes: null, eggs: { known: false, ids: new Set(), names: new Set() } })).ready).toBe(true);
    expect(failed(evaluateGate(vps, monthly, 500, facts({ proxmoxConfigured: false, vpsCapacity: null })))).toEqual(['providerReady', 'capacityReady']);
  });
  it('refuses a VPS when the hypervisor is full', () => {
    const vps = { ...product, fulfilment: 'VPS' as const, eggId: null, defaultRam: 4096, defaultDisk: 20 };
    expect(failed(evaluateGate(vps, monthly, 500, facts({ vpsCapacity: { freeMemoryMb: 512, freeDiskGb: 800, usedSlots: 2, maxSlots: 150 } })))).toEqual(['capacityReady']);
    expect(failed(evaluateGate(vps, monthly, 500, facts({ vpsCapacity: { freeMemoryMb: 65_536, freeDiskGb: 800, usedSlots: 150, maxSlots: 150 } })))).toEqual(['capacityReady']);
  });
});
