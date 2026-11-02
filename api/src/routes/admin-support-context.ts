import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { fullName } from '../lib/people.js';
import { notFound } from '../lib/errors.js';
import { requirePermission } from '../plugins/auth.js';
import { hasPermission } from '../lib/permissions.js';
import { readHours } from '../services/support-automation.js';
import { clocksOf, readPolicies } from '../services/support-sla.js';

/**
 * What the staff needs to know about the customer of a conversation, beside the thread.
 *
 * It is a summary of what the platform already holds and no more: who the customer is, their services and the status of
 * the one the conversation is about, their other conversations, and, for a role that may read orders, the state of their
 * last invoices. It carries no password, no key, no token, no card and no panel credential, and the billing part is left
 * out for a role without the permission.
 */

export async function registerAdminSupportContextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/support/conversations/:id/context', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const staff = await requirePermission('tickets.read')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, emailVerifiedAt: true, createdAt: true, suspendedAt: true } },
        instance: { select: { id: true, name: true, status: true, product: { select: { name: true, slug: true } } } },
        department: { select: { name: true } },
        assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!ticket) throw notFound('Conversation not found.');

    const [instances, servers, mail, recent, policies, hours] = await Promise.all([
      prisma.instance.findMany({ where: { userId: ticket.userId }, select: { id: true, name: true, status: true, product: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.vpsService.findMany({ where: { userId: ticket.userId }, select: { id: true, name: true, status: true, product: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.mailService.findMany({ where: { userId: ticket.userId }, select: { id: true, status: true, product: { select: { name: true } } }, take: 10 }),
      prisma.ticket.findMany({ where: { userId: ticket.userId, id: { not: id } }, select: { id: true, number: true, subject: true, status: true, channel: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
      readPolicies(),
      readHours(),
    ]);

    // The money is for the roles that read orders.
    const billing = hasPermission(staff.role, staff.permissions, 'orders.read')
      ? await prisma.invoice.findMany({ where: { userId: ticket.userId }, select: { number: true, status: true, total: true, currency: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 })
      : null;

    const clocks = clocksOf(ticket, policies, hours);
    return {
      customer: {
        id: ticket.user.id,
        name: fullName(ticket.user) || ticket.user.email,
        email: ticket.user.email,
        verified: Boolean(ticket.user.emailVerifiedAt),
        suspended: Boolean(ticket.user.suspendedAt),
        since: ticket.user.createdAt,
      },
      conversation: {
        channel: ticket.channel.toLowerCase(),
        priority: ticket.priority.toLowerCase(),
        status: ticket.status.toLowerCase(),
        department: ticket.department?.name ?? null,
        assignedTo: ticket.assignedTo ? fullName(ticket.assignedTo.user) || ticket.assignedTo.user.email : null,
        relatedInstance: ticket.instance ? { id: ticket.instance.id, name: ticket.instance.name, status: ticket.instance.status.toLowerCase(), product: ticket.instance.product.name } : null,
        sla: { first: { state: clocks.first.state, dueAt: clocks.first.dueAt }, next: { state: clocks.next.state, dueAt: clocks.next.dueAt }, resolution: { state: clocks.resolution.state, dueAt: clocks.resolution.dueAt } },
      },
      services: [
        ...instances.map((row) => ({ kind: 'app', id: row.id, name: row.name, product: row.product.name, status: row.status.toLowerCase() })),
        ...servers.map((row) => ({ kind: 'server', id: row.id, name: row.name, product: row.product.name, status: row.status.toLowerCase() })),
        ...mail.map((row) => ({ kind: 'mail', id: row.id, name: row.product.name, product: row.product.name, status: String(row.status).toLowerCase() })),
      ],
      recent: recent.map((row) => ({ id: row.id, number: row.number, subject: row.subject, status: row.status.toLowerCase(), channel: row.channel.toLowerCase(), createdAt: row.createdAt })),
      billing: billing?.map((row) => ({ number: row.number, status: row.status.toLowerCase(), total: row.total, currency: row.currency, createdAt: row.createdAt })) ?? null,
    };
  });

  /** Articles for a reply or for the customer's question: the public documentation and, for the staff only, the notes of the team. */
  app.get('/admin/support/articles', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    await requirePermission('tickets.read')(request);
    const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query ?? {});
    const { searchDocs } = await import('../services/support-bot.js');
    const team = await prisma.setting.findUnique({ where: { key: 'support.knowledge' } });
    const needle = q.toLowerCase();
    const notes = (Array.isArray(team?.value) ? (team!.value as { id: string; title: string; body: string }[]) : []).filter((article) => `${article.title} ${article.body}`.toLowerCase().includes(needle)).slice(0, 5).map((article) => ({ source: 'team' as const, title: article.title, body: article.body.slice(0, 600) }));
    return { public: searchDocs(q, 5), team: notes };
  });
}

/** What a customer may be shown before they open a conversation: public documentation only. */
export async function registerSupportSuggestRoutes(app: FastifyInstance): Promise<void> {
  const { requireAuth } = await import('../plugins/auth.js');
  app.get('/support/suggest', async (request: FastifyRequest) => {
    await requireAuth(request);
    const { q } = z.object({ q: z.string().trim().min(3).max(200) }).parse(request.query ?? {});
    const { searchDocs } = await import('../services/support-bot.js');
    return { articles: searchDocs(q, 4) };
  });
}
