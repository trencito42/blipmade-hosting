import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { fullName } from '../lib/people.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requirePermission } from '../plugins/auth.js';
import { publishSupportEvent } from '../services/support-events.js';
import { displayEmail } from '../lib/guest.js';
import { readHours } from '../services/support-automation.js';
import { clocksOf, readPolicies, worstOpenState } from '../services/support-sla.js';

/**
 * The unified queue of the support staff and the departments it is sorted into.
 *
 * A department is a row the operator writes; nothing here names one. Reading the queue needs `tickets.read`, working in
 * it `tickets.write`, and changing the departments or who belongs to them `settings.write`: a member of the support
 * staff does not decide who else may see which queue.
 */

export const VIEWS = ['all', 'mine', 'unassigned', 'chat', 'tickets', 'email', 'waiting_customer', 'waiting_staff', 'sla_at_risk', 'closed'] as const;
export type View = (typeof VIEWS)[number];

/** The filter of a view. `me` is the staff member that asks. */
export function viewFilter(view: View, me: string): Prisma.TicketWhereInput {
  switch (view) {
    case 'mine':
      return { assignedToId: me, status: { not: 'CLOSED' } };
    case 'unassigned':
      return { assignedToId: null, status: { not: 'CLOSED' } };
    case 'chat':
      return { channel: 'CHAT', status: { not: 'CLOSED' } };
    case 'tickets':
      return { channel: 'TICKET', status: { not: 'CLOSED' } };
    case 'email':
      return { channel: 'EMAIL', status: { not: 'CLOSED' } };
    case 'waiting_customer':
      return { status: 'AWAITING_CUSTOMER' };
    case 'waiting_staff':
      return { status: { in: ['OPEN', 'AWAITING_STAFF'] } };
    case 'sla_at_risk':
      return { status: { not: 'CLOSED' } };
    case 'closed':
      return { status: 'CLOSED' };
    default:
      return {};
  }
}

const slugOf = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const departmentBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).nullable().optional(),
  visible: z.boolean().optional(),
  position: z.number().int().min(0).max(1000).optional(),
});

function serializeDepartment(row: { id: string; slug: string; name: string; description: string | null; visible: boolean; position: number; _count?: { members: number; tickets: number } }) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    visible: row.visible,
    position: row.position,
    members: row._count?.members ?? 0,
    conversations: row._count?.tickets ?? 0,
  };
}

/** The conversations whose clocks are at risk or late now. Read from the open ones; there are never many. */
async function slaAtRiskIds(): Promise<string[]> {
  const [policies, hours] = await Promise.all([readPolicies(), readHours()]);
  if (policies.length === 0) return [];
  const open = await prisma.ticket.findMany({
    where: { status: { not: 'CLOSED' } },
    select: { id: true, priority: true, status: true, createdAt: true, closedAt: true, firstHumanResponseAt: true, lastCustomerAt: true, lastStaffAt: true },
    take: 2000,
  });
  return open.filter((ticket) => ['at_risk', 'breached'].includes(worstOpenState(clocksOf(ticket, policies, hours)))).map((ticket) => ticket.id);
}

export async function registerAdminSupportRoutes(app: FastifyInstance): Promise<void> {
  const write = { config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } } };

  // --- departments ----------------------------------------------------------

  /** The departments a customer may choose when they open a conversation. */
  app.get('/support/departments', async (request: FastifyRequest) => {
    await requireAuth(request);
    const rows = await prisma.supportDepartment.findMany({ where: { visible: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
    return { departments: rows.map((row) => ({ id: row.id, name: row.name, description: row.description })) };
  });

  app.get('/admin/support/departments', { preHandler: requirePermission('tickets.read') }, async () => {
    const rows = await prisma.supportDepartment.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { members: true, tickets: true } }, members: { select: { userId: true } } },
    });
    return { departments: rows.map((row) => ({ ...serializeDepartment(row), memberIds: row.members.map((member) => member.userId) })) };
  });

  app.post('/admin/support/departments', { ...write, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requirePermission('settings.write')(request);
    const body = departmentBody.parse(request.body);
    const slug = slugOf(body.name);
    if (!slug) throw badRequest('Give the department a name with letters or digits.');
    if (await prisma.supportDepartment.findUnique({ where: { slug } })) throw conflict('A department with that name exists.');
    const row = await prisma.supportDepartment.create({
      data: { slug, name: body.name, description: body.description ?? null, visible: body.visible ?? true, position: body.position ?? 0 },
      include: { _count: { select: { members: true, tickets: true } } },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.department_created', targetType: 'support_department', targetId: row.id, meta: { name: row.name }, ip: request.ip });
    return reply.code(201).send({ department: serializeDepartment(row) });
  });

  app.put('/admin/support/departments/:id', { ...write, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = departmentBody.partial().parse(request.body);
    if (!(await prisma.supportDepartment.findUnique({ where: { id } }))) throw notFound('Department not found.');
    const row = await prisma.supportDepartment.update({
      where: { id },
      data: { name: body.name, description: body.description, visible: body.visible, position: body.position },
      include: { _count: { select: { members: true, tickets: true } } },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.department_updated', targetType: 'support_department', targetId: id, meta: body, ip: request.ip });
    return { department: serializeDepartment(row) };
  });

  /** A department that holds conversations is hidden, not deleted: the history keeps its queue. */
  app.delete('/admin/support/departments/:id', { ...write, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.supportDepartment.findUnique({ where: { id }, include: { _count: { select: { tickets: true } } } });
    if (!row) throw notFound('Department not found.');
    if (row._count.tickets > 0) throw conflict('This department holds conversations. Hide it instead of deleting it.');
    await prisma.supportDepartment.delete({ where: { id } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.department_deleted', targetType: 'support_department', targetId: id, meta: { name: row.name }, ip: request.ip });
    return { deleted: true };
  });

  app.put('/admin/support/departments/:id/members', { ...write, preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { userIds } = z.object({ userIds: z.array(z.string()).max(200) }).parse(request.body);
    if (!(await prisma.supportDepartment.findUnique({ where: { id } }))) throw notFound('Department not found.');
    const people = await prisma.user.findMany({ where: { id: { in: userIds }, role: { in: ['STAFF', 'ADMIN'] } }, select: { id: true } });
    if (people.length !== new Set(userIds).size) throw badRequest('Only staff members can belong to a department.');
    await prisma.$transaction(async (tx) => {
      for (const person of people) await tx.staffMember.upsert({ where: { userId: person.id }, update: {}, create: { userId: person.id, permissions: [] } });
      await tx.supportDepartmentMember.deleteMany({ where: { departmentId: id } });
      await tx.supportDepartmentMember.createMany({ data: people.map((person) => ({ departmentId: id, userId: person.id })) });
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.department_members_set', targetType: 'support_department', targetId: id, meta: { count: people.length }, ip: request.ip });
    return { members: people.length };
  });

  // --- the queue ------------------------------------------------------------

  app.get('/admin/support/conversations', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const me = await requirePermission('tickets.read')(request);
    const query = z
      .object({
        view: z.enum(VIEWS).default('all'),
        q: z.string().trim().max(100).optional(),
        departmentId: z.string().optional(),
      })
      .parse(request.query ?? {});
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 50, maxSize: 100 });

    const search = query.q
      ? {
          OR: [
            { subject: { contains: query.q, mode: 'insensitive' as const } },
            { user: { email: { contains: query.q, mode: 'insensitive' as const } } },
            ...(/^\d{1,9}$/.test(query.q) ? [{ number: Number(query.q) }] : []),
          ],
        }
      : {};
    const atRisk = query.view === 'sla_at_risk' ? await slaAtRiskIds() : null;
    const where: Prisma.TicketWhereInput = { ...viewFilter(query.view, me.id), ...(atRisk ? { id: { in: atRisk } } : {}), ...(query.departmentId ? { departmentId: query.departmentId } : {}), ...search };

    const rows = await prisma.ticket.findMany({
      where: withCursor(where, cursor, 'updatedAt'),
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true } },
        assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: pageOrder('updatedAt'),
      take: limit + 1,
    });
    const page = pageOf(rows, limit, 'updatedAt');
    const [policies, hours] = await Promise.all([readPolicies(), readHours()]);
    return {
      conversations: page.rows.map((ticket) => ({
        sla: worstOpenState(clocksOf(ticket, policies, hours)),
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        channel: ticket.channel.toLowerCase(),
        priority: ticket.priority.toLowerCase(),
        status: ticket.status.toLowerCase(),
        department: ticket.department,
        customer: { id: ticket.user.id, email: displayEmail(ticket.user.email), name: fullName(ticket.user) },
        assignedToId: ticket.assignedToId,
        assignedTo: ticket.assignedTo ? fullName(ticket.assignedTo.user) || ticket.assignedTo.user.email : null,
        lastCustomerAt: ticket.lastCustomerAt,
        lastStaffAt: ticket.lastStaffAt,
        messageCount: ticket._count.messages,
        updatedAt: ticket.updatedAt,
      })),
      pagination: page.pagination,
    };
  });

  /** How many conversations each view holds, for the left side of the console. */
  app.get('/admin/support/counts', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const me = await requirePermission('tickets.read')(request);
    const risky = await slaAtRiskIds();
    const entries = await Promise.all(VIEWS.map(async (view) => [view, view === 'sla_at_risk' ? risky.length : await prisma.ticket.count({ where: viewFilter(view, me.id) })] as const));
    return { counts: Object.fromEntries(entries) };
  });

  app.put('/admin/support/conversations/:id/department', { ...write, preHandler: [requirePermission('tickets.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requirePermission('tickets.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { departmentId } = z.object({ departmentId: z.string().nullable() }).parse(request.body);
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Conversation not found.');
    let name = 'no department';
    if (departmentId) {
      const department = await prisma.supportDepartment.findUnique({ where: { id: departmentId } });
      if (!department) throw badRequest('That department does not exist.');
      name = department.name;
    }
    await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { departmentId } }),
      prisma.ticketEvent.create({ data: { ticketId: id, type: 'department', message: `Moved to ${name}.`, actorId: actor.id } }),
    ]);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.conversation_department', targetType: 'ticket', targetId: id, meta: { departmentId }, ip: request.ip });
    await publishSupportEvent({ type: 'assigned', ticketId: id, ownerId: ticket.userId, internal: true });
    return { conversation: { id, departmentId } };
  });
}
