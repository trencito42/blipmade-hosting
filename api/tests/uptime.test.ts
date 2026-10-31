import { describe, expect, it } from 'vitest';
import { ALERT_AFTER_MS, nextAlertStep } from '../src/services/uptime.js';

const t0 = new Date('2026-10-31T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('nextAlertStep', () => {
  it('does nothing while the service serves', () => {
    expect(nextAlertStep({ downSince: null, downAlertedAt: null, alertsEnabled: true }, true, t0).kind).toBe('none');
  });
  it('marks the start of an outage without telling anybody', () => {
    expect(nextAlertStep({ downSince: null, downAlertedAt: null, alertsEnabled: true }, false, t0)).toEqual({ kind: 'down', since: t0 });
  });
  it('waits for the grace period before it alerts', () => {
    const state = { downSince: t0, downAlertedAt: null, alertsEnabled: true };
    expect(nextAlertStep(state, false, at(ALERT_AFTER_MS - 1)).kind).toBe('none');
    expect(nextAlertStep(state, false, at(ALERT_AFTER_MS)).kind).toBe('alert');
  });
  it('alerts once per outage', () => {
    expect(nextAlertStep({ downSince: t0, downAlertedAt: at(ALERT_AFTER_MS), alertsEnabled: true }, false, at(ALERT_AFTER_MS * 5)).kind).toBe('none');
  });
  it('never alerts when the owner turned the alerts off', () => {
    expect(nextAlertStep({ downSince: t0, downAlertedAt: null, alertsEnabled: false }, false, at(ALERT_AFTER_MS * 5)).kind).toBe('none');
  });
  it('closes the outage and says whether the owner was told', () => {
    expect(nextAlertStep({ downSince: t0, downAlertedAt: at(ALERT_AFTER_MS), alertsEnabled: true }, true, at(ALERT_AFTER_MS * 2))).toEqual({ kind: 'restored', since: t0, alerted: true });
    expect(nextAlertStep({ downSince: t0, downAlertedAt: null, alertsEnabled: true }, true, at(1000))).toEqual({ kind: 'restored', since: t0, alerted: false });
  });
});
