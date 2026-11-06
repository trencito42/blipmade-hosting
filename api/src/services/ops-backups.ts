import { prisma } from '../db.js';
import {
  WORKLOADS,
  coverageFor,
  destinationState,
  inventoryNote,
  type CoverageRow,
  type OffsiteCopyView,
  type OffsiteKindName,
  type WorkloadPolicy,
} from './ops-coverage.js';

const KINDS: OffsiteKindName[] = ['CUSTOMER', 'DATABASE', 'VPS', 'PLATFORM', 'INFRA', 'PVE'];

function asCopy(row: {
  kind: string;
  sourceId: string;
  state: string;
  takenAt: Date | null;
  uploadedAt: Date | null;
  verifiedAt: Date | null;
  decryptVerifiedAt: Date | null;
  restoreVerifiedAt: Date | null;
  isolatedRestore: boolean;
  sizeBytes: bigint;
  error: string | null;
  instanceId: string | null;
}): OffsiteCopyView {
  return {
    kind: row.kind as OffsiteKindName,
    sourceId: row.sourceId,
    state: row.state as OffsiteCopyView['state'],
    takenAt: row.takenAt,
    uploadedAt: row.uploadedAt,
    verifiedAt: row.verifiedAt,
    decryptVerifiedAt: row.decryptVerifiedAt,
    restoreVerifiedAt: row.restoreVerifiedAt,
    isolatedRestore: row.isolatedRestore,
    sizeBytes: row.sizeBytes,
    error: row.error,
    instanceId: row.instanceId,
  };
}

export async function backupCoverage(now = new Date()): Promise<{
  destination: ReturnType<typeof destinationState> & {
    totalBytes: number | null;
    usedBytes: number | null;
    fileCount: number | null;
    inventory: string;
    encrypted: boolean;
    identityMatchesRecipient: boolean | null;
  };
  coverage: CoverageRow[];
  lastVerifiedAt: string | null;
  lastDecryptAt: string | null;
  lastRestoreAt: string | null;
}> {
  const [destinationRow, copies, instanceCount, vpsCount] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'offsite.destination' } }),
    prisma.offsiteBackup.findMany({
      select: {
        kind: true,
        sourceId: true,
        state: true,
        takenAt: true,
        uploadedAt: true,
        verifiedAt: true,
        decryptVerifiedAt: true,
        restoreVerifiedAt: true,
        isolatedRestore: true,
        sizeBytes: true,
        error: true,
        instanceId: true,
      },
    }),
    prisma.instance.count({ where: { status: { in: ['ONLINE', 'STOPPED', 'DEGRADED', 'RESTARTING'] } } }),
    prisma.vpsService.count({ where: { status: { in: ['ACTIVE', 'SUSPENDED'] } } }),
  ]);
  const dest = (destinationRow?.value ?? null) as {
    reachable?: boolean;
    totalBytes?: number;
    usedBytes?: number;
    error?: string;
    at?: string;
    fileCount?: number;
    identityMatchesRecipient?: boolean;
  } | null;
  const views = copies.map(asCopy);
  const destState = destinationState(dest, now);
  const verified = views.filter((c) => c.state === 'OFFSITE_VERIFIED').length;
  const fileCount = dest?.fileCount ?? null;
  const policies: WorkloadPolicy[] = WORKLOADS.map((policy) => ({
    ...policy,
    vacant:
      (policy.id === 'customer-game' && instanceCount === 0) ||
      (policy.id === 'vps' && vpsCount === 0) ||
      (policy.id === 'customer-db' && !views.some(policy.match) && instanceCount === 0),
  }));
  const coverage = policies.map((policy) => coverageFor(policy, views, now));
  const lastVerified = views
    .map((c) => c.verifiedAt?.getTime() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const lastDecrypt = views
    .map((c) => (c.decryptVerifiedAt ?? (!c.isolatedRestore ? c.restoreVerifiedAt : null))?.getTime() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const lastRestore = views
    .map((c) => (c.isolatedRestore ? c.restoreVerifiedAt?.getTime() ?? 0 : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  return {
    destination: {
      ...destState,
      totalBytes: dest?.totalBytes ?? null,
      usedBytes: dest?.usedBytes ?? null,
      fileCount,
      inventory: inventoryNote(verified, fileCount),
      encrypted: true,
      identityMatchesRecipient: typeof dest?.identityMatchesRecipient === 'boolean' ? dest.identityMatchesRecipient : null,
    },
    coverage,
    lastVerifiedAt: lastVerified ? new Date(lastVerified).toISOString() : null,
    lastDecryptAt: lastDecrypt ? new Date(lastDecrypt).toISOString() : null,
    lastRestoreAt: lastRestore ? new Date(lastRestore).toISOString() : null,
  };
}

export async function backupHistory(query: { kind?: string; state?: string; q?: string; take?: number }) {
  const take = Math.min(Math.max(query.take ?? 50, 1), 200);
  const kind = KINDS.includes(query.kind as OffsiteKindName) ? (query.kind as OffsiteKindName) : undefined;
  const state = ['OFFSITE_PENDING', 'OFFSITE_VERIFIED', 'FAILED'].includes(query.state ?? '')
    ? query.state
    : undefined;
  const q = query.q?.trim().slice(0, 80);
  const rows = await prisma.offsiteBackup.findMany({
    where: {
      ...(kind ? { kind } : {}),
      ...(state ? { state: state as 'OFFSITE_PENDING' | 'OFFSITE_VERIFIED' | 'FAILED' } : {}),
      ...(q
        ? {
            OR: [
              { sourceId: { contains: q, mode: 'insensitive' } },
              { error: { contains: q, mode: 'insensitive' } },
              { node: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take,
    select: {
      id: true,
      kind: true,
      sourceId: true,
      instanceId: true,
      node: true,
      remotePath: true,
      sizeBytes: true,
      state: true,
      error: true,
      takenAt: true,
      uploadedAt: true,
      verifiedAt: true,
      decryptVerifiedAt: true,
      restoreVerifiedAt: true,
      isolatedRestore: true,
      updatedAt: true,
    },
  });
  return {
    backups: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      source: row.sourceId,
      instanceId: row.instanceId,
      node: row.node,
      destinationPath: row.remotePath,
      sizeBytes: Number(row.sizeBytes),
      encrypted: true,
      transfer: row.state,
      integrity: row.state === 'OFFSITE_VERIFIED',
      decryptVerified: Boolean(row.decryptVerifiedAt || (!row.isolatedRestore && row.restoreVerifiedAt)),
      restoreVerified: Boolean(row.isolatedRestore && row.restoreVerifiedAt),
      takenAt: row.takenAt,
      uploadedAt: row.uploadedAt,
      verifiedAt: row.verifiedAt,
      decryptVerifiedAt: row.decryptVerifiedAt,
      restoreVerifiedAt: row.restoreVerifiedAt,
      error: row.error,
      updatedAt: row.updatedAt,
    })),
  };
}
