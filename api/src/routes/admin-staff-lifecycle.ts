import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { assertFreshStepUp } from '../services/staff-step-up.js';
import {
  assertAdministrator,
  createStaffInvitation,
  grantExistingCustomer,
  removeStaffAccess,
  searchStaffCandidates,
} from '../services/staff-lifecycle.js';

const roleSchema = z.enum(['STAFF', 'ADMIN']);

const writeLimit = {
  config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
};

/**
 * Grant, invite and remove staff access.
 *
 * These routes sit beside the existing staff editor. They never delete a
 * customer account, and they never return an invitation token.
 */
export async function registerAdminStaffLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/staff/candidates', { preHandler: requirePermission('staff.read') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    assertAdministrator(actor.role);
    const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query);
    return { candidates: await searchStaffCandidates(q) };
  });

  app.get('/admin/staff/invitations', { preHandler: requirePermission('staff.read') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    assertAdministrator(actor.role);
    const invitations = await prisma.staffInvitation.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      invitations: invitations.map((invitation) => ({
        ...invitation,
        role: invitation.role.toLowerCase(),
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      })),
    };
  });

  app.post('/admin/staff/members', {
    ...writeLimit,
    preHandler: [requirePermission('staff.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    assertAdministrator(actor.role);
    await assertFreshStepUp(request.sessionId);
    const body = z.object({ userId: z.string().min(1).max(64), role: roleSchema }).parse(request.body ?? {});
    const granted = await grantExistingCustomer(body.userId, body.role);
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'staff.access_granted',
      targetType: 'user',
      targetId: granted.userId,
      meta: { role: granted.role },
      ip: request.ip,
    });
    return { staff: { userId: granted.userId, email: granted.email, role: granted.role.toLowerCase() } };
  });

  app.post('/admin/staff/invitations', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('staff.write'), customerLimit(app, LIMITS.mail)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    assertAdministrator(actor.role);
    await assertFreshStepUp(request.sessionId);
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: roleSchema }).parse(request.body ?? {});
    const invitation = await createStaffInvitation({ email: body.email, role: body.role, invitedById: actor.id });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'staff.invited',
      targetType: 'staff_invitation',
      targetId: invitation.id,
      meta: { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() },
      ip: request.ip,
    });
    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role.toLowerCase(),
        expiresAt: invitation.expiresAt.toISOString(),
      },
    };
  });

  app.delete('/admin/staff/invitations/:id', {
    ...writeLimit,
    preHandler: [requirePermission('staff.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    assertAdministrator(actor.role);
    await assertFreshStepUp(request.sessionId);
    const { id } = z.object({ id: z.string().min(1).max(64) }).parse(request.params);
    const existing = await prisma.staffInvitation.findUnique({ where: { id }, select: { id: true, email: true, usedAt: true } });
    if (!existing || existing.usedAt) return { cancelled: false };
    await prisma.staffInvitation.delete({ where: { id } });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'staff.invitation_cancelled',
      targetType: 'staff_invitation',
      targetId: id,
      meta: { email: existing.email },
      ip: request.ip,
    });
    return { cancelled: true };
  });

  app.post('/admin/staff/:userId/remove', {
    ...writeLimit,
    preHandler: [requirePermission('staff.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    assertAdministrator(actor.role);
    await assertFreshStepUp(request.sessionId);
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const removed = await removeStaffAccess(userId);
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'staff.access_removed',
      targetType: 'user',
      targetId: userId,
      meta: { previousRole: removed.previousRole },
      ip: request.ip,
    });
    return { userId, role: 'customer' };
  });
}
