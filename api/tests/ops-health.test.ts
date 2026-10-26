import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backoffMinutes, decideAlert, type OpsAlertState } from '../src/lib/ops-alert-policy.js';

/**
 * The health of the platform.
 *
 * The checks of this file are the ones that can be made without a machine
 * that is running: the rule of the alarms, and the wiring between the
 * checks, the publishers of the events and the routes of the back office.
 *
 * The rule of the alarms is the part that decides whether a broken platform
 * becomes a flood of mail. It is checked here with a clock that does not
 * move on its own, so the result does not depend on when the suite runs.
 */

const ROOT = resolve(process.cwd(), '..');
const SRC = join(ROOT, 'api', 'src');

/** The eleven checks of the platform. */
const CHECK_IDS = [
  'provisioning',
  'webhooks',
  'delivery',
  'backup',
  'offsite',
  'restore',
  'mailcow',
  'capacity',
  'certificate',
  'incident',
  'security',
];

/** The publisher of every alarm. */
const PUBLISHERS: Record<string, string> = {
  'ops.provisioning_stuck': 'notifyOpsProvisioningStuck',
  'ops.webhook_failures': 'notifyOpsWebhookFailures',
  'ops.delivery_failures': 'notifyOpsDeliveryFailures',
  'ops.backup_failed': 'notifyOpsBackupFailed',
  'ops.offsite_backup_missing': 'notifyOpsOffsiteBackupMissing',
  'ops.restore_verification_failed': 'notifyOpsRestoreVerificationFailed',
  'ops.mailcow_unhealthy': 'notifyOpsMailcowUnhealthy',
  'ops.incident': 'notifyOpsIncident',
  'ops.capacity_critical': 'notifyOpsCapacityCritical',
  'ops.dns_certificate_failure': 'notifyOpsDnsCertificateFailure',
  'ops.security_change': 'notifyOpsSecurityChange',
  'ops.recovered': 'notifyOpsRecovered',
};

/** A moment in time that does not depend on when the suite runs. */
const NOW = new Date('2026-10-26T08:00:00.000Z');

/** The state of a finding that was already reported. */
function firing(overrides: Partial<OpsAlertState> = {}): OpsAlertState {
  return {
    check: 'mailcow',
    fingerprint: 'mailcow:unreachable',
    status: 'firing',
    since: '2026-10-26T07:00:00.000Z',
    lastSentAt: '2026-10-26T07:00:00.000Z',
    sends: 1,
    acknowledgedAt: null,
    ...overrides,
  };
}

describe('the pause before the next alarm', () => {
  it('grows with every alarm that was sent', () => {
    expect(backoffMinutes(0)).toBe(30);
    expect(backoffMinutes(1)).toBe(30);
    expect(backoffMinutes(2)).toBe(120);
    expect(backoffMinutes(3)).toBe(480);
    expect(backoffMinutes(4)).toBe(1440);
  });

  it('stops growing at the last step, so a week-long problem is still reported', () => {
    expect(backoffMinutes(50)).toBe(backoffMinutes(4));
  });
});

describe('the decision about an alarm', () => {
  it('reports a finding that was never reported', () => {
    expect(decideAlert(null, 'mailcow:unreachable', NOW).decision).toBe('notify');
  });

  it('reports a finding that was fixed and came back', () => {
    expect(decideAlert(firing({ status: 'ok' }), 'mailcow:unreachable', NOW).decision).toBe('notify');
  });

  it('reports a different finding, even when one is already firing', () => {
    expect(decideAlert(firing(), 'backup:failed', NOW).decision).toBe('notify');
  });

  it('holds back a finding that was just reported', () => {
    const decision = decideAlert(firing(), 'mailcow:unreachable', new Date('2026-10-26T07:10:00.000Z'));
    expect(decision.decision).toBe('suppress');
    expect(decision.reason.length).toBeGreaterThan(5);
  });

  it('reports a finding again after the pause has passed', () => {
    const decision = decideAlert(firing(), 'mailcow:unreachable', new Date('2026-10-26T07:40:00.000Z'));
    expect(decision.decision).toBe('repeat');
  });

  it('holds back a finding an operator has taken in hand', () => {
    const decision = decideAlert(
      firing({ acknowledgedAt: '2026-10-26T07:30:00.000Z' }),
      'mailcow:unreachable',
      new Date('2026-10-27T07:30:00.000Z'),
    );
    expect(decision.decision).toBe('suppress');
    expect(decision.reason).toContain('operator');
  });

  it('waits longer and longer between the alarms of the same finding', () => {
    const first = decideAlert(firing({ sends: 1 }), 'mailcow:unreachable', new Date('2026-10-26T08:00:00.000Z'));
    expect(first.decision).toBe('repeat');

    const second = decideAlert(
      firing({ sends: 2, lastSentAt: '2026-10-26T07:30:00.000Z' }),
      'mailcow:unreachable',
      new Date('2026-10-26T08:00:00.000Z'),
    );
    expect(second.decision).toBe('suppress');
  });
});

describe('the severity of a finding that is not fixed', () => {
  it('keeps the severity of a finding that was reported once', () => {
    // The pause before the second alarm is half an hour.
    const decision = decideAlert(firing({ sends: 1 }), 'mailcow:unreachable', new Date('2026-10-26T08:00:00.000Z'), 'warning');
    expect(decision.decision).toBe('repeat');
    expect(decision.severity).toBe('warning');
  });

  it('makes a finding that was reported again and again a critical one', () => {
    // The pause before the third alarm is two hours, so the third alarm is
    // due at ten in the morning.
    const decision = decideAlert(firing({ sends: 2 }), 'mailcow:unreachable', new Date('2026-10-26T10:00:00.000Z'), 'warning');
    expect(decision.decision).toBe('repeat');
    // The third alarm says that this is not a moment any more.
    expect(decision.severity).toBe('critical');
  });

  it('never makes a critical finding a small one', () => {
    const decision = decideAlert(firing({ sends: 1 }), 'mailcow:unreachable', new Date('2026-10-26T08:00:00.000Z'), 'critical');
    expect(decision.severity).toBe('critical');
  });

  it('reports a new finding with the severity it has', () => {
    const decision = decideAlert(null, 'mailcow:unreachable', NOW, 'critical');
    expect(decision.decision).toBe('notify');
    expect(decision.severity).toBe('critical');
  });
});

describe('the wiring of the health of the platform', () => {
  it('has a publisher for every alarm of the catalogue', async () => {
    const source = await readFile(join(SRC, 'services', 'notifications.ts'), 'utf-8');
    for (const [event, publisher] of Object.entries(PUBLISHERS)) {
      expect(source, `the event ${event} has no publisher`).toContain(`export async function ${publisher}(`);
      expect(source, `the publisher of ${event} does not publish it`).toContain(`'${event}'`);
    }
  });

  it('tells the operator that a problem is over', async () => {
    // The end of a problem is a thing the operator has to know about as
    // well: a platform that only talks about what is broken teaches the
    // operator to wait for the next message instead of reading the ones it
    // gets.
    const source = await readFile(join(SRC, 'services', 'ops-health.ts'), 'utf-8');
    expect(source).toContain('notifyOpsRecovered(');
    // The message is only sent for a finding that was reported: a finding
    // that nobody was told about does not need an ending.
    expect(source).toMatch(/state\.sends\s*>\s*0/);
  });

  it('calls every publisher from the sweep of the health', async () => {
    const source = await readFile(join(SRC, 'services', 'ops-health.ts'), 'utf-8');
    for (const publisher of Object.values(PUBLISHERS)) {
      expect(source, `the sweep does not call ${publisher}`).toContain(`${publisher}(`);
    }
  });

  it('names every check of the platform', async () => {
    const source = await readFile(join(SRC, 'services', 'ops-health.ts'), 'utf-8');
    for (const id of CHECK_IDS) {
      expect(source, `the check ${id} is not in the sweep`).toContain(`'${id}'`);
    }
  });

  it('registers the routes of the dashboard', async () => {
    const source = await readFile(join(SRC, 'app.ts'), 'utf-8');
    expect(source).toContain("registerOpsRoutes");
    const routes = await readFile(join(SRC, 'routes', 'ops.ts'), 'utf-8');
    for (const route of [
      '/ops/health',
      '/ops/alerts',
      '/ops/channels',
      '/ops/checks/:id/ack',
      '/ops/incident',
    ]) {
      expect(routes, `the route ${route} is missing`).toContain(route);
    }
  });

  it('asks the sweep of the health from the worker', async () => {
    const source = await readFile(join(SRC, 'worker.ts'), 'utf-8');
    expect(source).toContain('runOpsSweep');
    expect(source).toContain('sweepOpsHealth');
  });

  it('writes the alarm in a journal that does not need the mail server', async () => {
    const source = await readFile(join(SRC, 'services', 'ops-health.ts'), 'utf-8');
    // The journal is written before the webhook is tried, so an alarm about
    // the mail server still leaves the host.
    expect(source).toContain('writeJournal');
    expect(source).toContain('OPS_ALERT_WEBHOOK_URL');
    expect(source.indexOf('writeJournal(alert)')).toBeLessThan(source.indexOf('pushWebhook(alert)'));
  });

  it('never turns the verification of a certificate off', async () => {
    const source = await readFile(join(SRC, 'services', 'ops-health.ts'), 'utf-8');
    expect(source).toContain('rejectUnauthorized: true');
    expect(source).not.toContain('rejectUnauthorized: false');
  });

  it('watches the certificate of the mail server', async () => {
    const source = await readFile(join(SRC, 'services', 'ops-health.ts'), 'utf-8');
    expect(source).toContain("['the mail server', env.MAILCOW_API_URL]");
  });
});
