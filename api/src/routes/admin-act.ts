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
import { relayVpsConsole } from '../services/vps-console.js';
import { cancelSubscription, resumeSubscription } from '../services/stripe.js';
import { sendResetEmail } from './auth.js';
import { fullName } from '../lib/people.js';

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

  app.get('/admin/vps/:id/console/stream', { websocket: true }, (socket, request: FastifyRequest) => {
    void (async () => {
      try {
        await requirePermission('services.write')(request);
      } catch {
        return void socket.close(4403, 'Not allowed.');
      }
      await relayVpsConsole(socket, request, true);
    })();
  });

  // --- the account of a customer, for the staff ---------------------------------

  const customerOf = async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const customer = await prisma.user.findUnique({ where: { id } });
    if (!customer) throw notFound('Customer not found.');
    assertMayActOnAccount(actor, customer.role, customer.id);
    return { actor, customer };
  };

  app.get('/admin/customers/:id/subscriptions', { preHandler: [requirePermission('customers.read')] }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const rows = await prisma.subscription.findMany({
      where: { userId: id },
      include: {
        instance: { select: { name: true } },
        mailService: { select: { product: { select: { name: true } } } },
        vpsService: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      subscriptions: rows.map((row) => ({
        id: row.id,
        name: row.instance?.name ?? row.vpsService?.name ?? row.mailService?.product.name ?? 'Subscription',
        kind: row.instanceId ? 'server' : row.mailService ? 'mail' : row.vpsService ? 'vps' : 'other',
        status: row.status.toLowerCase(),
        amount: row.amount,
        currency: row.currency,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      })),
    };
  });

  app.post('/admin/subscriptions/:id/cancel', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw notFound('Subscription not found.');
    const updated = await cancelSubscription(subscription);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.subscription.cancel_at_period_end', targetType: 'subscription', targetId: id, ip: request.ip });
    return { subscription: { id: updated.id, status: updated.status.toLowerCase(), cancelAtPeriodEnd: updated.cancelAtPeriodEnd, currentPeriodEnd: updated.currentPeriodEnd } };
  });

  app.post('/admin/subscriptions/:id/resume', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw notFound('Subscription not found.');
    const updated = await resumeSubscription(subscription);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.subscription.resume', targetType: 'subscription', targetId: id, ip: request.ip });
    return { subscription: { id: updated.id, status: updated.status.toLowerCase(), cancelAtPeriodEnd: updated.cancelAtPeriodEnd, currentPeriodEnd: updated.currentPeriodEnd } };
  });

  app.patch('/admin/customers/:id/name', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    const body = z.object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60) }).parse(request.body ?? {});
    await prisma.user.update({ where: { id: customer.id }, data: body });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.rename', targetType: 'user', targetId: customer.id, ip: request.ip });
    return { name: fullName({ ...customer, ...body }) };
  });

  app.post('/admin/customers/:id/verify-email', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    await prisma.user.update({ where: { id: customer.id }, data: { emailVerifiedAt: customer.emailVerifiedAt ?? new Date() } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.verify_email', targetType: 'user', targetId: customer.id, ip: request.ip });
    return { ok: true };
  });

  app.post('/admin/customers/:id/send-password-reset', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    await sendResetEmail(customer.id, customer.email, fullName(customer));
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.send_password_reset', targetType: 'user', targetId: customer.id, ip: request.ip });
    return { ok: true };
  });

  app.post('/admin/customers/:id/revoke-sessions', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    const result = await prisma.session.deleteMany({ where: { userId: customer.id } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.revoke_sessions', targetType: 'user', targetId: customer.id, meta: { closed: result.count }, ip: request.ip });
    return { closed: result.count };
  });
}
