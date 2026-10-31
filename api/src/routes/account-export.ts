import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { describeAgent } from './settings.js';

/**
 * A copy of what the platform holds about the account, in one file (the right of access).
 *
 * It is what the person gave and what they did: the profile, the billing address, their services,
 * orders, invoices, payments (never card numbers: the platform does not hold them), tickets and the
 * messages they wrote, the notifications, the sessions and the log of the security of the account.
 * Secrets are never in it: no password hash, no keys, no codes of two-factor.
 */
export async function registerAccountExportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/settings/export',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: addressRateLimitKey } },
      preHandler: customerLimit(app, LIMITS.accountWrite),
    },
    async (request: FastifyRequest, reply) => {
      const auth = await requireAuth(request);
      const id = auth.id;
      const [user, instances, orders, invoices, payments, subscriptions, tickets, notifications, sessions, activity, passkeys, twoFactor] = await Promise.all([
        prisma.user.findUnique({ where: { id } }),
        prisma.instance.findMany({ where: { userId: id }, include: { product: { select: { name: true, slug: true } } } }),
        prisma.order.findMany({ where: { userId: id }, include: { items: true } }),
        prisma.invoice.findMany({ where: { userId: id } }),
        prisma.payment.findMany({ where: { userId: id } }),
        prisma.subscription.findMany({ where: { userId: id } }),
        prisma.ticket.findMany({ where: { userId: id }, include: { messages: { where: { internal: false }, select: { body: true, createdAt: true, authorId: true } } } }),
        prisma.notification.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 1000 }),
        prisma.session.findMany({ where: { userId: id }, select: { createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true } }),
        prisma.auditLog.findMany({ where: { OR: [{ actorId: id }, { targetType: 'user', targetId: id }] }, orderBy: { createdAt: 'desc' }, take: 2000, select: { action: true, ip: true, createdAt: true } }),
        prisma.passkey.findMany({ where: { userId: id }, select: { name: true, createdAt: true, lastUsedAt: true, deviceType: true } }),
        prisma.userTwoFactor.findUnique({ where: { userId: id }, select: { enabledAt: true } }),
      ]);
      if (!user) return reply.code(404).send({ error: { code: 'not_found', message: 'Account not found.' } });

      const data = {
        exportedAt: new Date().toISOString(),
        about: 'A copy of the data Blipmade holds about this account. Secrets (password, keys, codes) are not included.',
        profile: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role.toLowerCase(),
          emailVerifiedAt: user.emailVerifiedAt,
          billingAddress: user.billingAddress,
          createdAt: user.createdAt,
        },
        security: { twoFactorEnabled: Boolean(twoFactor?.enabledAt), passkeys },
        services: instances.map((instance) => ({ name: instance.name, product: instance.product.name, status: instance.status, ram: instance.ram, cpu: instance.cpu, disk: instance.disk, price: instance.price, currency: instance.currency, createdAt: instance.createdAt })),
        subscriptions: subscriptions.map((row) => ({ status: row.status, amount: row.amount, currency: row.currency, currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd, createdAt: row.createdAt })),
        orders: orders.map((order) => ({ number: order.number, status: order.status, total: order.total, currency: order.currency, createdAt: order.createdAt, items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, total: item.total })) })),
        invoices: invoices.map((invoice) => ({ number: invoice.number, status: invoice.status, amount: invoice.amount, tax: invoice.tax, total: invoice.total, currency: invoice.currency, createdAt: invoice.createdAt, paidAt: invoice.paidAt })),
        payments: payments.map((payment) => ({ status: payment.status, amount: payment.amount, currency: payment.currency, createdAt: payment.createdAt })),
        tickets: tickets.map((ticket) => ({ number: ticket.number, subject: ticket.subject, status: ticket.status, createdAt: ticket.createdAt, messages: ticket.messages.map((message) => ({ by: message.authorId === id ? 'you' : 'support', body: message.body, createdAt: message.createdAt })) })),
        notifications: notifications.map((row) => ({ title: row.title, body: row.body, readAt: row.readAt, createdAt: row.createdAt })),
        sessions: sessions.map((session) => ({ device: describeAgent(session.userAgent), ip: session.ip, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt })),
        activity,
      };
      await audit({ actorId: id, actorEmail: auth.email, action: 'settings.data_exported', targetType: 'user', targetId: id, ip: request.ip });
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="blipmade-export-${new Date().toISOString().slice(0, 10)}.json"`);
      reply.header('Cache-Control', 'no-store');
      return reply.send(JSON.stringify(data, null, 2));
    },
  );
}
