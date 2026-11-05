import { describe, expect, it } from 'vitest';
import { deploymentsFromEvents } from '../src/services/git-deploy.js';
import { buildReport, type CollectedSource, type DiagnosisFacts } from '../src/services/diagnosis.js';
import { customerStatusOf } from '../src/services/runtime-state.js';

const stale = 35 * 60 * 1000;
const now = Date.parse('2026-11-05T18:00:00Z');

function event(message: string, at: string) {
  return { message, createdAt: new Date(at) };
}

describe('deployment history', () => {
  it('does not treat an old started row as the deployment that is running', () => {
    const rows = deploymentsFromEvents([
      event('deploy:new-deploy:succeeded:20261104020000-abcde123:abcde123:Application passed the health check.', '2026-11-04T02:10:00Z'),
      event('deploy:old-deploy:started:build:owner', '2026-11-04T03:04:00Z'),
    ], { now, activeDeployId: null, staleMs: stale });
    expect(rows.find((row) => row.id === 'old-deploy')?.state).toBe('interrupted');
    expect(rows.find((row) => row.id === 'new-deploy')?.state).toBe('succeeded');
    expect(rows.find((row) => row.id === 'new-deploy')?.release).toBe('20261104020000-abcde123');
  });

  it('keeps the deployment that the queue still holds, and does not guess when the queue cannot be read', () => {
    const events = [event('deploy:live:started:build:owner', '2026-11-05T17:50:00Z')];
    expect(deploymentsFromEvents(events, { now, activeDeployId: 'live', staleMs: stale })[0]?.state).toBe('starting');
    expect(deploymentsFromEvents(events, { now, activeDeployId: 'unknown', staleMs: stale })[0]?.state).toBe('starting');
  });

  it('a linked release is not a healthy application, and a foreign Server Action is not a crash', () => {
    const facts: DiagnosisFacts = { provisionError: null, applicationError: null, installStatus: null, deployState: 'building', deployMessage: null, importPhase: null, importError: null };
    const log: CollectedSource = { id: 'deploy-log', label: 'Deployment log', state: 'available', note: '', text: 'Failed to find Server Action "x". Next.js ready' };
    const report = buildReport('nodejs', [log], facts);
    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining(['deploy-open', 'next-action']));
    expect(report.verdict).toBe('issue');
    expect(report.summary).not.toMatch(/clean|no known cause/i);
  });

  it('a fresh stopped container wins over a platform status that still says online', () => {
    expect(customerStatusOf({ status: 'ONLINE', runtimeCondition: 'stopped', runtimeStateStale: false })).toBe('stopped');
    expect(customerStatusOf({ status: 'STOPPED', runtimeCondition: 'serving', runtimeStateStale: false })).toBe('online');
    expect(customerStatusOf({ status: 'ONLINE', runtimeCondition: 'stopped', runtimeStateStale: true })).toBe('online');
  });
});
