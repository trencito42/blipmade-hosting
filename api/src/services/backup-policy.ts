import { prisma } from '../db.js';
import * as client from './pterodactyl/client.js';
import * as operations from './panel/operations.js';
import { backupsIncluded } from '../lib/plan-limits.js';

/**
 * The backups a customer can switch on: one schedule of the panel that runs a backup, named so the
 * platform can find it again. Nothing is stored by the platform itself.
 */
export type BackupPreset = 'off' | 'daily' | 'weekly';

export const SCHEDULE_NAME = 'Blipmade automatic backup';

/** Both run in the quiet hours of the node, at 03:30 UTC. */
export const PRESET_CRON: Record<Exclude<BackupPreset, 'off'>, string> = {
  daily: '30 3 * * *',
  weekly: '30 3 * * 0',
};

export function presetOfCron(cron: string, active: boolean): BackupPreset {
  if (!active) return 'off';
  if (cron === PRESET_CRON.daily) return 'daily';
  if (cron === PRESET_CRON.weekly) return 'weekly';
  return 'off';
}

export interface BackupRow {
  uuid: string;
  name: string;
  created_at: string;
  is_locked: boolean;
}

/**
 * Which backups to delete so one slot is free for the next one.
 *
 * Only backups that are not locked are ever chosen, oldest first. When a restore was started a moment
 * ago nothing is deleted, because the restore reads one of them. The plan is empty when there is room.
 */
export function planRetention(backups: BackupRow[], limit: number, restoreRunning: boolean): string[] {
  if (restoreRunning || limit < 1) return [];
  const excess = backups.length - (limit - 1);
  if (excess <= 0) return [];
  return backups
    .filter((backup) => !backup.is_locked)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, excess)
    .map((backup) => backup.uuid);
}

/** How the backup came to be, for the list. The panel names a scheduled one by the time it ran. */
export function backupKind(backup: { name: string; is_locked: boolean }): 'scheduled' | 'manual' {
  return /^Backup at \d{4}-\d{2}-\d{2}/.test(backup.name) ? 'scheduled' : 'manual';
}

export async function readPreset(token: string, uuid: string): Promise<{ preset: BackupPreset; lastRun: string | null; nextRun: string | null; scheduleId: number | null }> {
  const schedules = await client.listSchedules(token, uuid);
  const found = schedules.find((schedule) => schedule.name === SCHEDULE_NAME && schedule.action === 'backup');
  if (!found) return { preset: 'off', lastRun: null, nextRun: null, scheduleId: null };
  return { preset: presetOfCron(found.cron, found.active), lastRun: found.last_run, nextRun: found.next_run, scheduleId: found.id };
}

/** Switches the automatic backup of a server on, to another rhythm, or off. */
export async function applyPreset(token: string, uuid: string, preset: BackupPreset): Promise<void> {
  const schedules = await client.listSchedules(token, uuid);
  const found = schedules.find((schedule) => schedule.name === SCHEDULE_NAME && schedule.action === 'backup');
  if (preset === 'off') {
    if (found) await client.deleteSchedule(token, uuid, found.id);
    return;
  }
  // A schedule is replaced instead of edited: the panel keeps the cron and the task apart.
  if (found) await client.deleteSchedule(token, uuid, found.id);
  await client.createSchedule(token, uuid, { name: SCHEDULE_NAME, cron: PRESET_CRON[preset], action: 'backup', active: true, payload: {} });
}

/** Makes room on one server for the next backup. Returns what was removed. */
export async function enforceRetention(instance: operations.OwnedInstance & { ram: number }): Promise<number> {
  const token = await operations.customerToken(instance);
  const uuid = instance.pterodactylUuid as string;
  const backups = await client.listBackups(token, uuid);
  const recent = await prisma.instanceEvent.findFirst({
    where: { instanceId: instance.id, type: 'backups', message: { startsWith: 'Restored' }, createdAt: { gte: new Date(Date.now() - 20 * 60_000) } },
    select: { id: true },
  });
  const doomed = planRetention(backups, backupsIncluded(instance.ram), Boolean(recent));
  for (const id of doomed) await client.deleteBackup(token, uuid, id);
  if (doomed.length) {
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'backups', message: `Removed ${doomed.length} old backup(s) to make room for the next automatic one.` } });
  }
  return doomed.length;
}

/**
 * The hourly pass: servers with an automatic backup get a free slot before it runs. A server that fails
 * is noted in its events and the pass goes on.
 */
export async function sweepBackupRetention(limit = 200): Promise<{ checked: number; removed: number; failed: number }> {
  const instances = await prisma.instance.findMany({
    where: { pterodactylUuid: { not: null }, pterodactylServerId: { not: null }, status: { in: ['ONLINE', 'STOPPED', 'DEGRADED', 'RESTARTING'] } },
    select: { id: true, userId: true, pterodactylUuid: true, pterodactylServerId: true, status: true, generatedVariables: true, ram: true, product: { select: { generatedVariables: true } } },
    take: limit,
  });
  let removed = 0;
  let failed = 0;
  for (const row of instances) {
    const { product, ...rest } = row;
    const instance = { ...rest, productVariables: product.generatedVariables };
    try {
      const token = await operations.customerToken(instance);
      const { preset } = await readPreset(token, instance.pterodactylUuid as string);
      if (preset === 'off') continue;
      removed += await enforceRetention(instance);
    } catch (error) {
      failed += 1;
      await prisma.instanceEvent
        .create({ data: { instanceId: instance.id, type: 'backups', message: `The backup rotation failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}` } })
        .catch(() => undefined);
    }
  }
  return { checked: instances.length, removed, failed };
}
