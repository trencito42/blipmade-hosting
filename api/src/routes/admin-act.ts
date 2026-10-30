import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import {
  IMPERSONATION_TTL_MS,
  RETURN_COOKIE,
  SESSION_COOKIE,
  assertMayActOnAccount,
  requirePermission,
  requireStaff,
  resolveCookieSecure,
} from '../plugins/auth.js';
import { destroyVps, ownedVps, reinstallVps, setVpsPower, vpsUsage, vpsView } from '../services/vps.js';
import { enqueueVpsProvisioning } from '../services/queue.js';

/**
 * What the staff does on behalf of a customer.
 *
 * Acting as the customer is a session of one hour that is marked as opened by the staff
 * member, written to the journal, and refused on the routes that hold the keys of the
 * account (password, email, sessions, closing, the payment method). The session of the
 * staff member is kept in a cookie of its own and comes back with one click.
 */
export async function registerAdminActRoutes(app: FastifyInstance): Promise<void> {
  const cookieOptions = (request: FastifyRequest, expires: Date) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: resolveCookieSecure(request),
    path: '/',
    expires,
  });

  app.post('/admin/customers/:id/impersonate', { preHandler: [requirePermission('customers.write')] }, async (request, reply) => {
    const actor = await requireStaff(request);
    if (request.impersonatedBy) throw badRequest('Return to your own account first.');
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const customer = await prisma.user.findUnique({ where: { id } });
    if (!customer) throw notFound('Customer not found.');
    if (customer.role !== 'CUSTOMER') throw badRequest('You can only act as a customer, not as a member of the staff.');
    assertMayActOnAccount(actor, customer.role, customer.id);
    const mine = request.cookies[SESSION_COOKIE];
    if (!mine) throw badRequest('Your session could not be found.');

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
    await prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: customer.id,
        expiresAt,
        ip: request.ip ?? null,
        userAgent: (request.headers['user-agent'] ?? null) as string | null,
        impersonatedById: actor.id,
        impersonatedByEmail: actor.email,
      },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'staff.impersonation_started', targetType: 'user', targetId: customer.id, ip: request.ip });
    reply.setCookie(RETURN_COOKIE, mine, cookieOptions(request, expiresAt));
    reply.setCookie(SESSION_COOKIE, token, cookieOptions(request, expiresAt));
    return { ok: true };
  });

  app.post('/admin/impersonation/stop', async (request, reply) => {
    const returnToken = request.cookies[RETURN_COOKIE];
    const current = request.cookies[SESSION_COOKIE];
    if (!request.impersonatedBy || !returnToken || !current) throw badRequest('You are not acting as a customer.');
    const back = await prisma.session.findUnique({ where: { tokenHash: hashToken(returnToken) } });
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(current) } });
    reply.clearCookie(RETURN_COOKIE, { path: '/' });
    if (!back || back.expiresAt < new Date()) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true, signedOut: true };
    }
    reply.setCookie(SESSION_COOKIE, returnToken, cookieOptions(request, back.expiresAt));
    await audit({ actorId: back.userId, action: 'staff.impersonation_ended', targetType: 'session', targetId: back.id, ip: request.ip });
    return { ok: true };
  });

  // --- virtual private servers, for the staff ---------------------------------

  const serviceOf = async (id: string) => {
    const service = await prisma.vpsService.findUnique({ where: { id }, include: { product: { select: { slug: true, name: true } }, user: { select: { id: true, email: true } } } });
    if (!service) throw notFound('That server was not found.');
    return service;
  };

  app.get('/admin/vps', { preHandler: [requirePermission('services.read')] }, async () => {
    const services = await prisma.vpsService.findMany({
      include: { product: { select: { slug: true, name: true } }, user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      servers: await Promise.all(
        services.map(async (service) => ({ ...(await vpsView(service)), owner: service.user, slot: service.slot, vmid: service.vmid, privateIp: service.privateIp })),
      ),
    };
  });

  app.get('/admin/vps/:id', { preHandler: [requirePermission('services.read')] }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const service = await serviceOf(id);
    return { server: { ...(await vpsView(service)), owner: service.user, slot: service.slot, vmid: service.vmid, privateIp: service.privateIp } };
  });

  app.get('/admin/vps/:id/usage', { preHandler: [requirePermission('services.read')] }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const service = await serviceOf(id);
    return { usage: await vpsUsage(service.userId, id) };
  });

  app.post('/admin/vps/:id/power', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { action } = z.object({ action: z.enum(['start', 'shutdown', 'stop', 'reboot']) }).parse(request.body ?? {});
    const service = await serviceOf(id);
    await setVpsPower(service.userId, id, action);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: `admin.vps.${action}`, targetType: 'vps', targetId: id });
    return { server: await vpsView(await ownedVps(service.userId, id)) };
  });

  app.post('/admin/vps/:id/reinstall', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    z.object({ confirm: z.literal(true) }).parse(request.body ?? {});
    const service = await serviceOf(id);
    await reinstallVps(service.userId, id);
    await enqueueVpsProvisioning(id, { reason: 'reinstall by staff' });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.vps.reinstall', targetType: 'vps', targetId: id });
    return { server: await vpsView(await ownedVps(service.userId, id)) };
  });

  /** Puts a server that failed to build back on the queue. */
  app.post('/admin/vps/:id/retry', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const service = await serviceOf(id);
    if (service.status !== 'FAILED' && service.status !== 'PENDING') throw badRequest('Only a server that failed or waits can be built again.');
    await prisma.vpsService.update({ where: { id }, data: { status: 'PENDING', lastError: null } });
    await enqueueVpsProvisioning(id, { reason: 'retry by staff' });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.vps.retry', targetType: 'vps', targetId: id });
    return { server: await vpsView(await ownedVps(service.userId, id)) };
  });

  /** Deletes the machine. The subscription is cancelled on the customer's billing, not here. */
  app.delete('/admin/vps/:id', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    z.object({ confirm: z.literal(true) }).parse(request.body ?? {});
    await serviceOf(id);
    await destroyVps(id);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.vps.destroy', targetType: 'vps', targetId: id });
    return { ok: true };
  });
}
