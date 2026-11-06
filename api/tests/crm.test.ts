import { describe, expect, it } from 'vitest';
import {
  campaignMayDeliver,
  campaignTransition,
  compileSegmentWhere,
  evalExpr,
  matchesSegment,
  parseSegmentFilter,
  promotionCrmGate,
  spendBand,
  validateTemplate,
} from '../src/services/crm.js';
import { backoffMs, parseGraph, stepAutomation } from '../src/services/crm-automation.js';

const ctx = {
  facts: [
    { key: 'core.lifecycle', value: 'active' },
    { key: 'billing.spend_cents', value: '5000', numeric: 5000 },
    { key: 'billing.spend_band', value: 'mid' },
  ],
  tags: ['vip'],
  marketing: true,
  createdAt: new Date('2024-01-01'),
};

describe('crm segments and campaigns', () => {
  it('matches typed facts and marketing consent', () => {
    const row = { facts: { lifecycle: 'active', spend_band: 'mid' }, tags: ['vip'], marketing: true };
    expect(matchesSegment(row, { facts: { lifecycle: 'active' }, marketing: true, tags: ['vip'] })).toBe(true);
    expect(matchesSegment(row, { marketing: false })).toBe(false);
    expect(matchesSegment(row, { tags: ['reseller'] })).toBe(false);
  });

  it('evaluates nested AND/OR and numeric operators', () => {
    const expr = parseSegmentFilter({
      op: 'and',
      children: [
        { fact: 'core.lifecycle', cmp: 'eq', value: 'active' },
        {
          op: 'or',
          children: [
            { fact: 'billing.spend_cents', cmp: 'gt', value: '4000' },
            { field: 'tags', cmp: 'in', values: ['vip'] },
          ],
        },
      ],
    });
    expect(evalExpr(expr, ctx)).toBe(true);
    expect(evalExpr({ fact: 'billing.spend_cents', cmp: 'lt', value: '100' }, ctx)).toBe(false);
    expect(evalExpr({ fact: 'core.lifecycle', cmp: 'neq', value: 'lead' }, ctx)).toBe(true);
    expect(evalExpr({ fact: 'core.plan_family', cmp: 'not_exists' }, ctx)).toBe(true);
  });

  it('refuses security facts in a segment', () => {
    expect(() => parseSegmentFilter({ fact: 'security.shared_ip', cmp: 'eq', value: '1' })).toThrow(/Unknown fact|Security/);
  });

  it('compiles a Prisma where without sampling the first 200 rows', () => {
    const where = compileSegmentWhere({ facts: { lifecycle: 'active' }, marketing: true });
    expect(where).toMatchObject({ role: 'CUSTOMER' });
    expect(JSON.stringify(where)).not.toMatch(/"take":200/);
    expect(JSON.stringify(where)).toMatch(/customerFacts/);
  });

  it('approves a campaign without sending while delivery is off', () => {
    expect(campaignTransition('draft', 'submit')).toEqual({ status: 'pending_approval' });
    expect(campaignTransition('pending_approval', 'approve')).toEqual({ status: 'approved' });
    expect(campaignTransition('approved', 'pause')).toEqual({ status: 'paused' });
    const gate = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: true });
    expect(gate.ok).toBe(true);
    expect(gate.deliver).toBe(false);
    expect(gate.reason).toMatch(/Live delivery is off/);
  });

  it('never delivers without per-recipient consent', () => {
    const gate = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: false });
    expect(gate.ok).toBe(false);
    expect(gate.deliver).toBe(false);
  });

  it('never treats hardcoded consent as a send', () => {
    const approved = campaignMayDeliver({ status: 'approved', suppressed: false, marketingConsent: true });
    expect(approved.deliver).toBe(false);
  });

  it('bands spend without inventing revenue', () => {
    expect(spendBand(0)).toBe('none');
    expect(spendBand(1999)).toBe('low');
    expect(spendBand(5000)).toBe('mid');
  });

  it('validates template variables', () => {
    expect(validateTemplate('Hello {{firstName}}').ok).toBe(true);
    expect(validateTemplate('Hello {{ssn}}').ok).toBe(false);
  });

  it('enforces first-purchase and assigned codes', () => {
    expect(promotionCrmGate({
      firstPurchaseOnly: true, paidOrders: 1, privateCode: false, assignedUserId: null, userId: 'u1',
      familySlug: null, orderFamily: null, inSegment: true, hasSegment: false,
    }).ok).toBe(false);
    expect(promotionCrmGate({
      firstPurchaseOnly: false, paidOrders: 0, privateCode: true, assignedUserId: 'u1', userId: 'u2',
      familySlug: null, orderFamily: null, inSegment: true, hasSegment: false,
    }).ok).toBe(false);
  });
});

describe('crm automation', () => {
  it('deduplicates by not stepping a succeeded run', () => {
    const graph = parseGraph({
      start: 'msg',
      nodes: [{ id: 'msg', type: 'message', body: 'Hi {{firstName}}' }],
      edges: [],
    });
    if ('error' in graph) throw new Error(graph.error);
    const first = stepAutomation({
      graph,
      state: { nodeId: 'msg', status: 'running', waitUntil: null, attempts: 0, lastError: null },
      ctx,
      consent: true,
    });
    expect(first.effects[0]?.type).toBe('message');
    expect((first.effects[0]?.payload as { deliver?: boolean }).deliver).toBe(false);
    const second = stepAutomation({
      graph,
      state: first.state,
      ctx,
      consent: true,
    });
    expect(second.effects).toEqual([]);
  });

  it('waits then continues', () => {
    const graph = parseGraph({
      start: 'w',
      nodes: [
        { id: 'w', type: 'wait', ms: 60_000 },
        { id: 'stop', type: 'stop' },
      ],
      edges: [{ from: 'w', to: 'stop' }],
    });
    if ('error' in graph) throw new Error(graph.error);
    const now = new Date('2026-01-01T00:00:00Z');
    const waiting = stepAutomation({
      graph,
      state: { nodeId: 'w', status: 'running', waitUntil: null, attempts: 0, lastError: null },
      ctx,
      consent: true,
      now,
    });
    expect(waiting.state.status).toBe('waiting');
    const later = stepAutomation({
      graph,
      state: waiting.state,
      ctx,
      consent: true,
      now: new Date('2026-01-01T00:02:00Z'),
    });
    expect(later.state.status).toBe('stopped');
  });

  it('backs off retries', () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(8)).toBe(60_000);
  });

  it('branches on eligibility', () => {
    const graph = parseGraph({
      start: 'if',
      nodes: [
        { id: 'if', type: 'condition', expr: { fact: 'core.lifecycle', cmp: 'eq', value: 'active' } },
        { id: 'yes', type: 'tag', add: ['warm'] },
        { id: 'no', type: 'stop' },
      ],
      edges: [
        { from: 'if', to: 'yes', branch: 'yes' },
        { from: 'if', to: 'no', branch: 'no' },
      ],
    });
    if ('error' in graph) throw new Error(graph.error);
    const result = stepAutomation({
      graph,
      state: { nodeId: 'if', status: 'running', waitUntil: null, attempts: 0, lastError: null },
      ctx,
      consent: true,
    });
    expect(result.effects.some((effect) => effect.type === 'tag')).toBe(true);
  });
});
