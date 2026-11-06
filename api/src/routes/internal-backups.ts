import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';

/**
 * What the backup agents tell the platform. The agents run on the node and on the hypervisor, where the files are;
 * they encrypt, upload, read the copy back and report what they measured. The platform records it and never
 * touches the destination itself. Every call carries the shared secret of the agents.
 */
function requireAgent(request: FastifyRequest): void {
  if (!env.BACKUP_REPORT_TOKEN) throw notFound('Not found.');
  const header = String(request.headers.authorization ?? '');
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(given);
  const b = Buffer.from(env.BACKUP_REPORT_TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized('The agent key is not correct.');
}

/** A path on the destination: letters, digits and a few separators, no way up the tree. */
const remotePath = z.string().min(3).max(300).regex(/^[A-Za-z0-9][A-Za-z0-9._/@=+-]*$/).refine((value) => !value.includes('..'), 'No way up the tree.');

const reportSchema = z.object({
  kind: z.enum(['CUSTOMER', 'DATABASE', 'VPS', 'PLATFORM', 'INFRA', 'PVE']),
  remotePath,
  sourceId: z.string().min(1).max(200),
  node: z.string().max(100).optional(),
  sizeBytes: z.number().int().min(0).max(2 ** 50).default(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  state: z.enum(['OFFSITE_PENDING', 'OFFSITE_VERIFIED', 'FAILED']),
  error: z.string().max(500).optional(),
  takenAt: z.string().datetime().optional(),
});

export async function registerInternalBackupRoutes(app: FastifyInstance): Promise<void> {
  app.post('/internal/backups/report', async (request) => {
    requireAgent(request);
    const body = reportSchema.parse(request.body ?? {});
    const now = new Date();
    const verified = body.state === 'OFFSITE_VERIFIED';
    const row = await prisma.offsiteBackup.upsert({
      where: { remotePath: body.remotePath },
      create: {
        kind: body.kind, remotePath: body.remotePath, sourceId: body.sourceId, node: body.node ?? null,
        sizeBytes: BigInt(body.sizeBytes), sha256: body.sha256 ?? null, state: body.state, error: body.state === 'FAILED' ? (body.error ?? 'unknown error') : null,
        takenAt: body.takenAt ? new Date(body.takenAt) : null, uploadedAt: body.state === 'OFFSITE_PENDING' ? null : now, verifiedAt: verified ? now : null,
      },
      update: {
        sizeBytes: BigInt(body.sizeBytes), sha256: body.sha256 ?? undefined, state: body.state, error: body.state === 'FAILED' ? (body.error ?? 'unknown error') : null,
        uploadedAt: body.state === 'OFFSITE_PENDING' ? undefined : now, verifiedAt: verified ? now : undefined,
      },
      select: { id: true },
    });
    return { id: row.id };
  });

  // Decrypt + archive listing/gzip/zstd. Not a restore. The drill posts here.
  app.post('/internal/backups/decrypt-verified', async (request) => {
    requireAgent(request);
    const body = z.object({ remotePath, note: z.string().max(200).optional() }).parse(request.body ?? {});
    const done = await prisma.offsiteBackup.updateMany({
      where: { remotePath: body.remotePath, state: 'OFFSITE_VERIFIED' },
      data: { decryptVerifiedAt: new Date() },
    });
    if (done.count === 0) throw badRequest('That copy is not a verified one.');
    await audit({ action: 'backup.decrypt_verified', targetType: 'offsite_backup', targetId: body.remotePath, meta: { note: body.note ?? null } });
    return { ok: true };
  });

  // Isolated restore only. Decrypt drills must not call this. isolatedRestore: true is required so an old agent cannot mark a listing as a restore.
  app.post('/internal/backups/restore-verified', async (request) => {
    requireAgent(request);
    const body = z.object({
      remotePath,
      note: z.string().max(200).optional(),
      isolatedRestore: z.literal(true),
    }).parse(request.body ?? {});
    const done = await prisma.offsiteBackup.updateMany({
      where: { remotePath: body.remotePath, state: 'OFFSITE_VERIFIED' },
      data: { restoreVerifiedAt: new Date(), isolatedRestore: true },
    });
    if (done.count === 0) throw badRequest('That copy is not a verified one.');
    await audit({ action: 'backup.restore_verified', targetType: 'offsite_backup', targetId: body.remotePath, meta: { note: body.note ?? null, isolatedRestore: true } });
    return { ok: true };
  });

  // The state of the destination, as the agent saw it: reachable or not, and how much room is left.
  app.post('/internal/backups/destination', async (request) => {
    requireAgent(request);
    const body = z.object({
      reachable: z.boolean(),
      totalBytes: z.number().int().min(0).optional(),
      usedBytes: z.number().int().min(0).optional(),
      fileCount: z.number().int().min(0).optional(),
      identityMatchesRecipient: z.boolean().optional(),
      error: z.string().max(300).optional(),
      node: z.string().max(100).optional(),
    }).parse(request.body ?? {});
    const previous = await prisma.setting.findUnique({ where: { key: 'offsite.destination' } });
    const previousValue = (previous?.value ?? null) as { identityMatchesRecipient?: boolean } | null;
    const value = {
      ...body,
      at: new Date().toISOString(),
      identityMatchesRecipient:
        body.identityMatchesRecipient ?? previousValue?.identityMatchesRecipient ?? null,
    };
    await prisma.setting.upsert({ where: { key: 'offsite.destination' }, create: { key: 'offsite.destination', value }, update: { value } });
    return { ok: true };
  });

  // The copies the agent must never delete: the newest verified one of each source. A copy that is not linked
  // to a service yet is its own source, until it is 60 days old.
  app.get('/internal/backups/protected', async (request) => {
    requireAgent(request);
    const { kind } = z.object({ kind: z.enum(['CUSTOMER', 'DATABASE', 'VPS', 'PLATFORM', 'INFRA', 'PVE']) }).parse(request.query);
    const rows = await prisma.offsiteBackup.findMany({
      where: { kind, state: 'OFFSITE_VERIFIED' },
      orderBy: { verifiedAt: 'desc' },
      select: { remotePath: true, instanceId: true, sourceId: true, verifiedAt: true },
      take: 20_000,
    });
    const cutoff = Date.now() - 60 * 86_400_000;
    const seen = new Set<string>();
    const keep: string[] = [];
    for (const row of rows) {
      const group = kind === 'CUSTOMER' ? (row.instanceId ?? `unlinked:${row.sourceId}`) : row.sourceId.replace(/\/.*$/, '');
      if (seen.has(group)) continue;
      if (!row.instanceId && kind === 'CUSTOMER' && (row.verifiedAt?.getTime() ?? 0) < cutoff) continue;
      seen.add(group);
      keep.push(row.remotePath);
    }
    return { protected: keep };
  });
}
