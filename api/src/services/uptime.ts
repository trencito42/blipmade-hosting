import { prisma } from '../db.js';
import { notifyServiceIncident, notifyServiceRestored } from './notifications.js';

/** How long a service must stay down before the owner is told, so a restart does not send an email. */
export const ALERT_AFTER_MS = 3 * 60_000;
const KEEP_DAYS = 35;

export interface AlertState {
  downSince: Date | null;
  downAlertedAt: Date | null;
  alertsEnabled: boolean;
}

export type AlertStep =
  | { kind: 'none' }
  | { kind: 'down'; since: Date }
  | { kind: 'alert'; since: Date }
  | { kind: 'restored'; since: Date; alerted: boolean };

/** What one check changes. Pure, so the rule can be proved without a node. */
export function nextAlertStep(state: AlertState, up: boolean, now: Date): AlertStep {
  if (up) {
    return state.downSince ? { kind: 'restored', since: state.downSince, alerted: state.downAlertedAt !== null } : { kind: 'none' };
  }
  if (!state.downSince) return { kind: 'down', since: now };
  if (state.alertsEnabled && !state.downAlertedAt && now.getTime() - state.downSince.getTime() >= ALERT_AFTER_MS) {
    return { kind: 'alert', since: state.downSince };
  }
  return { kind: 'none' };
}

const duration = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

/** Writes the check down and tells the owner when the service has been down long enough, and when it is back. */
export async function recordUptimeCheck(
  instance: { id: string; name: string; userId: string; downSince: Date | null; downAlertedAt: Date | null; alertsEnabled: boolean },
  up: boolean,
  now: Date = new Date(),
): Promise<void> {
  await prisma.instanceCheck.create({ data: { instanceId: instance.id, at: now, up } });
  const step = nextAlertStep(instance, up, now);
  if (step.kind === 'none') return;
  if (step.kind === 'down') {
    await prisma.instance.update({ where: { id: instance.id }, data: { downSince: step.since } });
    return;
  }
  if (step.kind === 'alert') {
    await prisma.instance.update({ where: { id: instance.id }, data: { downAlertedAt: now } });
    await notifyServiceIncident({
      userId: instance.userId,
      instanceName: instance.name,
      message: `It has not been serving since ${step.since.toISOString().slice(11, 16)} UTC. We are looking at it; you can also restart it from the console.`,
      occurrence: step.since,
    });
    return;
  }
  await prisma.instance.update({ where: { id: instance.id }, data: { downSince: null, downAlertedAt: null } });
  if (step.alerted && instance.alertsEnabled) {
    await notifyServiceRestored({
      userId: instance.userId,
      instanceName: instance.name,
      message: `It was down for ${duration(now.getTime() - step.since.getTime())}.`,
      occurrence: step.since,
    });
  }
}

export async function pruneUptimeChecks(): Promise<void> {
  await prisma.instanceCheck.deleteMany({ where: { at: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
}

export interface UptimeSummary {
  windows: { key: 'day' | 'week' | 'month'; label: string; percent: number | null; checks: number }[];
  outages: { from: string; to: string | null; minutes: number }[];
  current: 'up' | 'down' | 'unknown';
}

/** Uptime over 24 hours, 7 days and 30 days, and the outages of the last 30 days. */
export async function uptimeSummary(instanceId: string, now: Date = new Date()): Promise<UptimeSummary> {
  const windows = [
    { key: 'day' as const, label: 'Last 24 hours', ms: 86_400_000 },
    { key: 'week' as const, label: 'Last 7 days', ms: 7 * 86_400_000 },
    { key: 'month' as const, label: 'Last 30 days', ms: 30 * 86_400_000 },
  ];
  const result = [];
  for (const window of windows) {
    const since = new Date(now.getTime() - window.ms);
    const [total, up] = await Promise.all([
      prisma.instanceCheck.count({ where: { instanceId, at: { gte: since } } }),
      prisma.instanceCheck.count({ where: { instanceId, at: { gte: since }, up: true } }),
    ]);
    result.push({ key: window.key, label: window.label, percent: total === 0 ? null : Math.round((up / total) * 10000) / 100, checks: total });
  }
  const downs = await prisma.instanceCheck.findMany({
    where: { instanceId, up: false, at: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
    orderBy: { at: 'asc' },
    select: { at: true },
    take: 5000,
  });
  // Checks that are down and no more than three minutes apart are one outage.
  const outages: UptimeSummary['outages'] = [];
  let from: Date | null = null;
  let last: Date | null = null;
  const close = () => {
    if (from && last) outages.push({ from: from.toISOString(), to: last.toISOString(), minutes: Math.max(1, Math.round((last.getTime() - from.getTime()) / 60_000) + 1) });
  };
  for (const row of downs) {
    if (from && last && row.at.getTime() - last.getTime() <= 3 * 60_000) {
      last = row.at;
    } else {
      close();
      from = row.at;
      last = row.at;
    }
  }
  close();
  const latest = await prisma.instanceCheck.findFirst({ where: { instanceId }, orderBy: { at: 'desc' }, select: { at: true, up: true } });
  const fresh = latest && now.getTime() - latest.at.getTime() < 10 * 60_000;
  const current = !fresh ? 'unknown' : latest.up ? 'up' : 'down';
  return { windows: result, outages: outages.reverse().slice(0, 20), current };
}
