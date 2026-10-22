import { prisma } from '../db.js';

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Writes an audit entry. Failures are swallowed on purpose: an audit write must
 * never roll back the action it is recording, but it is logged so the gap is
 * visible.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: (input.meta ?? undefined) as never,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record entry', input.action, (error as Error).message);
  }
}
