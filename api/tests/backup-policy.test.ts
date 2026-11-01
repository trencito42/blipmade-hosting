import { describe, expect, it } from 'vitest';
import { backupKind, planRetention, presetOfCron, type BackupRow } from '../src/services/backup-policy.js';
import { backupsIncluded } from '../src/lib/plan-limits.js';

const row = (uuid: string, day: number, locked = false): BackupRow => ({ uuid, name: uuid, created_at: `2026-10-${String(day).padStart(2, '0')}T03:30:00Z`, is_locked: locked });

describe('backup rotation', () => {
  it('leaves one slot free, removing the oldest unlocked backups first', () => {
    const backups = [row('a', 1), row('b', 2), row('c', 3)];
    expect(planRetention(backups, 3, false)).toEqual(['a']);
    expect(planRetention([row('a', 1), row('b', 2)], 3, false)).toEqual([]);
  });
  it('never removes a locked backup, and waits while a restore runs', () => {
    expect(planRetention([row('a', 1, true), row('b', 2), row('c', 3)], 3, false)).toEqual(['b']);
    expect(planRetention([row('a', 1, true), row('b', 2, true), row('c', 3, true)], 3, false)).toEqual([]);
    expect(planRetention([row('a', 1), row('b', 2), row('c', 3)], 3, true)).toEqual([]);
  });
  it('reads the preset and the kind', () => {
    expect(presetOfCron('30 3 * * *', true)).toBe('daily');
    expect(presetOfCron('30 3 * * 0', true)).toBe('weekly');
    expect(presetOfCron('30 3 * * *', false)).toBe('off');
    expect(backupKind({ name: 'Backup at 2026-10-30 03:30:00', is_locked: false })).toBe('scheduled');
    expect(backupKind({ name: 'before the update', is_locked: false })).toBe('manual');
    expect(backupsIncluded(2048)).toBe(3);
    expect(backupsIncluded(8192)).toBe(5);
  });
});
