import { describe, expect, it } from 'vitest';
import { campaignMayDeliver, campaignTransition, matchesSegment, spendBand } from '../src/services/crm.js';

describe('crm segments and campaigns', () => {
  it('matches typed facts and marketing consent', () => {
    const row = { facts: { lifecycle: 'active', spend_band: 'mid' }, tags: ['vip'], marketing: true };
    expect(matchesSegment(row, { facts: { lifecycle: 'active' }, marketing: true, tags: ['vip'] })).toBe(true);
    expect(matchesSegment(row, { marketing: false })).toBe(false);
    expect(matchesSegment(row, { tags: ['reseller'] })).toBe(false);
  });

  it('approves a campaign without sending while delivery is off', () => {
    expect(campaignTransition('draft', 'submit')).toEqual({ status: 'pending_approval' });
    expect(campaignTransition('pending_approval', 'approve')).toEqual({ status: 'approved' });
    const gate = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: true });
    expect(gate.ok).toBe(true);
    expect(gate.deliver).toBe(false);
    expect(gate.reason).toMatch(/Live delivery is off/);
  });

  it('never delivers without consent', () => {
    const gate = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: false });
    expect(gate.ok).toBe(false);
    expect(gate.deliver).toBe(false);
  });

  it('bands spend without inventing revenue', () => {
    expect(spendBand(0)).toBe('none');
    expect(spendBand(1999)).toBe('low');
    expect(spendBand(5000)).toBe('mid');
  });
});
