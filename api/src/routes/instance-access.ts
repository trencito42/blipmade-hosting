import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';

const CODE_DAYS = 7;
const MAX_MEMBERS = 10;

const hashCode = (code: string): string => createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

/** A code the owner can read out: 12 letters and digits without the look-alikes, in three groups. */
function newCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Access to a service for another account.
 *
 * The owner makes a code with a role (viewer reads, manager also runs the server), the other account redeems it
 * once, and the owner can take the access back at any time. The member never gets the key of the owner: the
 * server work still goes through the owner's panel account on the API side. Billing, renaming and cancelling stay
 * with the owner.
 */
export async function registerInstanceAccessRoutes(app: FastifyInstance): Promise<void> {
  const write = {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  };
  const idParam = z.object({ id: z.string() });

  async function ownerInstance(userId: string, id: string) {
    const instance = await prisma.instance.findFirst({ where: { id, userId }, select: { id: true, name: true } });
    if (!instance) throw notFound('Instance not found.');
    return instance;
  }

  app.get('/instances/:id/access', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    await ownerInstance(user.id, id);
    const rows = await prisma.instanceShare.findMany({
      where: { instanceId: id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, firstName: true } } },
    });
    const now = Date.now();
    return {
      members: rows
        .filter((row) => row.redeemedAt)
        .map((row) => ({ id: row.id, role: row.role, email: row.user?.email ?? null, name: row.user?.firstName ?? null, since: row.redeemedAt })),
      invites: rows
        .filter((row) => !row.redeemedAt && row.expiresAt.getTime() > now)
        .map((row) => ({ id: row.id, role: row.role, expiresAt: row.expiresAt })),
    };
  });

  app.post('/instances/:id/access', write, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const body = z.object({ role: z.enum(['viewer', 'manager']) }).parse(request.body ?? {});
    await ownerInstance(user.id, id);
    const open = await prisma.instanceShare.count({ where: { instanceId: id, revokedAt: null } });
    if (open >= MAX_MEMBERS) throw badRequest(`A service can be shared with ${MAX_MEMBERS} accounts at most. Remove one first.`);
    const code = newCode();
    const share = await prisma.instanceShare.create({
      data: { instanceId: id, role: body.role, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_DAYS * 86_400_000) },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.access_invited', targetType: 'instance', targetId: id, meta: { role: body.role }, ip: request.ip });
    // The code is shown once; only its hash is kept.
    return { id: share.id, code, role: share.role, expiresAt: share.expiresAt };
  });

  app.delete('/instances/:id/access/:shareId', write, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id, shareId } = z.object({ id: z.string(), shareId: z.string() }).parse(request.params);
    await ownerInstance(user.id, id);
    const result = await prisma.instanceShare.updateMany({ where: { id: shareId, instanceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 0) throw notFound('Access not found.');
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.access_removed', targetType: 'instance', targetId: id, ip: request.ip });
    return { ok: true };
  });

  // A member leaves a service on their own.
  app.post('/instances/:id/access/leave', write, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const result = await prisma.instanceShare.updateMany({ where: { instanceId: id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 0) throw notFound('Access not found.');
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.access_left', targetType: 'instance', targetId: id, ip: request.ip });
    return { ok: true };
  });

  app.post('/access/redeem', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { code } = z.object({ code: z.string().min(8).max(20) }).parse(request.body ?? {});
    const share = await prisma.instanceShare.findUnique({ where: { codeHash: hashCode(code) }, include: { instance: { select: { id: true, name: true, userId: true } } } });
    if (!share || share.revokedAt || share.redeemedAt || share.expiresAt.getTime() < Date.now()) {
      throw badRequest('This code is not valid. It may have expired or been used already.');
    }
    if (share.instance.userId === user.id) throw badRequest('This is your own service.');
    const already = await prisma.instanceShare.findFirst({ where: { instanceId: share.instanceId, userId: user.id, revokedAt: null } });
    if (already) throw badRequest('You already have access to this service.');
    // Claimed in one write, so two requests with the same code cannot both win.
    const claimed = await prisma.instanceShare.updateMany({
      where: { id: share.id, redeemedAt: null, revokedAt: null },
      data: { userId: user.id, redeemedAt: new Date() },
    });
    if (claimed.count === 0) throw badRequest('This code is not valid. It may have expired or been used already.');
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.access_redeemed', targetType: 'instance', targetId: share.instanceId, meta: { role: share.role }, ip: request.ip });
    return { instanceId: share.instanceId, name: share.instance.name, role: share.role };
  });
}
