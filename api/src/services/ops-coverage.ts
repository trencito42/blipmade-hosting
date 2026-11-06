/**
 * Workload coverage from off-site receipts.
 *
 * A row in OffsiteBackup is a local record of what an agent measured. It is
 * not proof the file is still on the Storage Box. Destination inventory is a
 * separate probe. A verified copy is not a restore. Decrypting an archive is
 * not a restore. A copy from last month is not today's backup.
 */

export type OffsiteKindName = 'CUSTOMER' | 'DATABASE' | 'VPS' | 'PLATFORM' | 'INFRA' | 'PVE';

export type CoverageState =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'unknown'
  | 'not_configured'
  | 'probe_failed'
  | 'stale'
  | 'uploaded'
  | 'remote_verified'
  | 'decrypt_verified'
  | 'restore_verified'
  | 'restore_untested'
  | 'not_protected';

export interface OffsiteCopyView {
  kind: OffsiteKindName;
  sourceId: string;
  state: 'OFFSITE_PENDING' | 'OFFSITE_VERIFIED' | 'FAILED';
  takenAt: Date | null;
  uploadedAt: Date | null;
  verifiedAt: Date | null;
  decryptVerifiedAt: Date | null;
  restoreVerifiedAt: Date | null;
  isolatedRestore: boolean;
  sizeBytes: bigint | number;
  error: string | null;
  instanceId: string | null;
}

export interface WorkloadPolicy {
  id: string;
  name: string;
  host: string;
  method: string;
  frequency: string;
  retention: string;
  freshnessHours: number;
  match: (copy: OffsiteCopyView) => boolean;
  /** When true, no live resource of this kind exists, so a gap is "not configured". */
  vacant?: boolean;
}

export interface CoverageRow {
  id: string;
  name: string;
  host: string;
  method: string;
  frequency: string;
  retention: string;
  freshnessHours: number;
  lastLocalAt: string | null;
  lastOffsiteAt: string | null;
  lastVerifiedAt: string | null;
  lastDecryptAt: string | null;
  lastRestoreAt: string | null;
  sizeBytes: number | null;
  state: CoverageState;
  reason: string;
  source: 'offsite_backup' | 'none';
  verification: 'none' | 'upload_reported' | 'remote_readback' | 'decrypt_opened' | 'restore_tested';
}

export const DESTINATION_STALE_HOURS = 3;

export const WORKLOADS: Omit<WorkloadPolicy, 'vacant'>[] = [
  {
    id: 'postgres',
    name: 'Blipmade PostgreSQL',
    host: 'vm103',
    method: 'pg_dump, age, Storage Box',
    frequency: 'daily',
    retention: 'newest verified copy kept',
    freshnessHours: 26,
    match: (c) => c.kind === 'DATABASE' && /postgres|platform|blipmade|vm103/i.test(c.sourceId),
  },
  {
    id: 'uploads',
    name: 'Platform file uploads',
    host: 'vm103',
    method: 'archive, age, Storage Box',
    frequency: 'daily',
    retention: 'newest verified copy kept',
    freshnessHours: 26,
    match: (c) => c.kind === 'PLATFORM' && /upload|files|attach/i.test(c.sourceId),
  },
  {
    id: 'vm103',
    name: 'VM103 application and configuration',
    host: 'vm103',
    method: 'platform agent archive, age, Storage Box',
    frequency: 'daily',
    retention: 'newest verified copy kept',
    freshnessHours: 26,
    match: (c) => c.kind === 'PLATFORM' && !/upload|files|attach/i.test(c.sourceId),
  },
  {
    id: 'panel',
    name: 'Pterodactyl Panel',
    host: 'panel VM',
    method: 'infra vzdump or platform archive',
    frequency: 'weekly',
    retention: 'newest verified copy kept',
    freshnessHours: 9 * 24,
    match: (c) => (c.kind === 'INFRA' || c.kind === 'PLATFORM') && /panel|pterodactyl|vm104|vm102/i.test(c.sourceId),
  },
  {
    id: 'wings',
    name: 'Wings and game-node files',
    host: 'Wings node',
    method: 'infra vzdump',
    frequency: 'weekly',
    retention: 'newest verified copy kept',
    freshnessHours: 9 * 24,
    match: (c) => c.kind === 'INFRA' && /wings|node|vm105/i.test(c.sourceId),
  },
  {
    id: 'customer-game',
    name: 'Customer game backups',
    host: 'Wings node',
    method: 'panel backup, age, Storage Box',
    frequency: 'daily or weekly per service',
    retention: 'newest verified copy per instance, 60 days unlinked',
    freshnessHours: 50,
    match: (c) => c.kind === 'CUSTOMER',
  },
  {
    id: 'customer-db',
    name: 'Customer databases',
    host: 'database node',
    method: 'dump, age, Storage Box',
    frequency: 'daily',
    retention: 'newest verified copy kept',
    freshnessHours: 26,
    match: (c) => c.kind === 'DATABASE' && !/postgres|platform|blipmade|vm103/i.test(c.sourceId),
  },
  {
    id: 'vps',
    name: 'VPS qcow2 images',
    host: 'Proxmox n7030e1',
    method: 'qcow2, age, Storage Box',
    frequency: 'weekly',
    retention: 'newest verified copy per VM',
    freshnessHours: 9 * 24,
    match: (c) => c.kind === 'VPS',
  },
  {
    id: 'mailcow',
    name: 'Mailcow email data and databases',
    host: 'mail VM',
    method: 'infra vzdump or database dump',
    frequency: 'weekly',
    retention: 'newest verified copy kept',
    freshnessHours: 9 * 24,
    match: (c) => /mailcow|mail/i.test(c.sourceId) || (c.kind === 'INFRA' && /vm100|mail/i.test(c.sourceId)),
  },
  {
    id: 'pve',
    name: 'Proxmox configuration',
    host: 'n7030e1',
    method: 'qemu-server tar, age, Storage Box',
    frequency: 'on change / daily agent',
    retention: '14 copies',
    freshnessHours: 36,
    match: (c) => c.kind === 'PVE' || /pve-config|qemu-server/i.test(c.sourceId),
  },
  {
    id: 'infra-vms',
    name: 'Other critical persistent volumes (infra vzdump)',
    host: 'n7030e1',
    method: 'vzdump, age, Storage Box',
    frequency: 'weekly',
    retention: 'newest verified copy per VM',
    freshnessHours: 9 * 24,
    match: (c) => c.kind === 'INFRA' && !/wings|node|vm105|mailcow|mail|panel|pterodactyl/i.test(c.sourceId),
  },
];

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Decrypt or listing. A legacy drill timestamp is decrypt, not a restore. */
export function decryptEvidenceAt(copy: OffsiteCopyView): Date | null {
  if (copy.decryptVerifiedAt) return copy.decryptVerifiedAt;
  if (!copy.isolatedRestore) return copy.restoreVerifiedAt;
  return null;
}

/** Isolated restore only. restoreVerifiedAt from an old drill does not count. */
export function isolatedRestoreAt(copy: OffsiteCopyView): Date | null {
  return copy.isolatedRestore ? copy.restoreVerifiedAt : null;
}

function hoursSince(at: Date | null | undefined, now: Date): number | null {
  if (!at) return null;
  return (now.getTime() - at.getTime()) / 3_600_000;
}

function latest(copies: OffsiteCopyView[], pick: (c: OffsiteCopyView) => Date | null): OffsiteCopyView | null {
  let best: OffsiteCopyView | null = null;
  let bestTime = 0;
  for (const copy of copies) {
    const at = pick(copy);
    if (!at) continue;
    const t = at.getTime();
    if (t > bestTime) {
      best = copy;
      bestTime = t;
    }
  }
  return best;
}

/** Decide the coverage state of one workload from its matching copies. */
export function coverageFor(policy: WorkloadPolicy, copies: OffsiteCopyView[], now: Date): CoverageRow {
  const matched = copies.filter(policy.match);
  const failed = latest(matched.filter((c) => c.state === 'FAILED'), (c) => c.uploadedAt ?? c.takenAt);
  const pending = latest(matched.filter((c) => c.state === 'OFFSITE_PENDING'), (c) => c.uploadedAt ?? c.takenAt);
  const verified = latest(matched.filter((c) => c.state === 'OFFSITE_VERIFIED'), (c) => c.verifiedAt ?? c.uploadedAt ?? c.takenAt);
  const decrypted = latest(matched.filter((c) => decryptEvidenceAt(c)), decryptEvidenceAt);
  const restored = latest(matched.filter((c) => isolatedRestoreAt(c)), isolatedRestoreAt);
  const any = verified ?? pending ?? failed;
  const lastLocal = latest(matched, (c) => c.takenAt);
  const lastOffsite = latest(matched, (c) => c.uploadedAt);
  const lastVerified = verified;
  const size = any ? Number(any.sizeBytes) : null;

  const base = {
    id: policy.id,
    name: policy.name,
    host: policy.host,
    method: policy.method,
    frequency: policy.frequency,
    retention: policy.retention,
    freshnessHours: policy.freshnessHours,
    lastLocalAt: iso(lastLocal?.takenAt ?? null),
    lastOffsiteAt: iso(lastOffsite?.uploadedAt ?? null),
    lastVerifiedAt: iso(lastVerified?.verifiedAt ?? null),
    lastDecryptAt: iso(decrypted ? decryptEvidenceAt(decrypted) : null),
    lastRestoreAt: iso(restored ? isolatedRestoreAt(restored) : null),
    sizeBytes: Number.isFinite(size) ? size : null,
    source: matched.length ? ('offsite_backup' as const) : ('none' as const),
  };

  if (policy.vacant && matched.length === 0) {
    return {
      ...base,
      state: 'not_configured',
      reason: 'No live resource of this kind exists, so there is nothing to protect yet.',
      verification: 'none',
    };
  }

  if (matched.length === 0) {
    return {
      ...base,
      state: 'not_protected',
      reason: `No off-site receipt matches this workload. A missing receipt is not a successful backup.`,
      verification: 'none',
    };
  }

  if (!verified && failed && !pending) {
    return {
      ...base,
      state: 'critical',
      reason: failed.error ?? 'The last transfer failed. The destination was not verified.',
      verification: 'none',
    };
  }

  if (!verified && pending) {
    return {
      ...base,
      state: 'uploaded',
      reason: 'A copy was reported as uploaded. Remote read-back has not succeeded.',
      verification: 'upload_reported',
    };
  }

  if (!verified) {
    return {
      ...base,
      state: 'unknown',
      reason: 'Receipts exist but none are a verified remote copy.',
      verification: 'none',
    };
  }

  const age = hoursSince(verified.verifiedAt, now);
  if (age !== null && age > policy.freshnessHours) {
    return {
      ...base,
      state: 'stale',
      reason: `Last remote verification is ${Math.round(age)} hours old. Freshness for this workload is ${policy.freshnessHours} hours. An old verified copy does not make today healthy.`,
      verification: 'remote_readback',
    };
  }

  if (!restored && decrypted) {
    return {
      ...base,
      state: 'decrypt_verified',
      reason: 'Remote copy verified. Decryption and archive integrity passed. That is not a restore of this workload.',
      verification: 'decrypt_opened',
    };
  }

  if (!restored) {
    return {
      ...base,
      state: 'restore_untested',
      reason: 'Remote copy verified. Decrypt, isolated restore, and operational recovery have not been proven. A read-back is not a restore.',
      verification: 'remote_readback',
    };
  }

  const restoreAge = hoursSince(isolatedRestoreAt(restored), now);
  if (restoreAge !== null && restoreAge > policy.freshnessHours * 8) {
    return {
      ...base,
      state: 'degraded',
      reason: `Remote copy is fresh. Last isolated restore is ${Math.round(restoreAge ?? 0)} hours old. Operational recovery of live service was not recorded.`,
      verification: 'restore_tested',
    };
  }

  return {
    ...base,
    state: 'restore_verified',
    reason: 'An isolated restore of this workload was recorded. Operational recovery of live service is a separate operator check.',
    verification: 'restore_tested',
  };
}

export function destinationState(
  destination: { reachable?: boolean; at?: string | null; error?: string | null } | null,
  now: Date,
): { state: 'not_configured' | 'reachable' | 'unreachable' | 'stale' | 'probe_failed' | 'unknown'; reason: string; at: string | null } {
  if (!destination) {
    return { state: 'not_configured', reason: 'No agent has reported the Storage Box yet.', at: null };
  }
  const at = destination.at ?? null;
  if (destination.reachable === false) {
    return {
      state: 'unreachable',
      reason: destination.error || 'The agent could not reach the Storage Box.',
      at,
    };
  }
  if (!at) {
    return { state: 'probe_failed', reason: 'A destination row exists with no probe timestamp.', at: null };
  }
  const age = (now.getTime() - new Date(at).getTime()) / 3_600_000;
  if (!Number.isFinite(age) || age > DESTINATION_STALE_HOURS) {
    return {
      state: 'stale',
      reason: `Last successful remote probe is ${Number.isFinite(age) ? `${Math.round(age)} hours` : 'an unknown age'} old. Hourly destination checks should land within ${DESTINATION_STALE_HOURS} hours.`,
      at,
    };
  }
  if (destination.reachable !== true) {
    return { state: 'unknown', reason: 'Reachability was not recorded.', at };
  }
  return { state: 'reachable', reason: 'The agent reached the Storage Box.', at };
}

/**
 * Local verified rows are not the destination listing.
 * When the agent counted remote files, a large gap means the database is lying or the box was emptied.
 */
export function inventoryNote(localVerified: number, remoteFileCount: number | null): string {
  if (remoteFileCount === null) {
    return 'Destination file count was not reported. Local verified rows are not proof the files are still on the box.';
  }
  if (remoteFileCount === 0 && localVerified > 0) {
    return `Local database has ${localVerified} verified row(s) but the destination listing is empty. Do not treat those rows as recoverable files.`;
  }
  return `Destination listing has ${remoteFileCount} file(s). Local database has ${localVerified} verified row(s). Counts need not match (nested paths, failed parts); they must not be treated as the same evidence.`;
}
