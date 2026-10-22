import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth, requireStaff } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';

const CATEGORIES = [
  { id: 'TECHNICAL', label: 'Technical' },
  { id: 'BILLING', label: 'Billing' },
  { id: 'ACCOUNT', label: 'Account' },
  { id: 'ABUSE', label: 'Abuse report' },
  { id: 'OTHER', label: 'Other' },
];

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

const attachmentSchema = z.object({
  name: z.string().min(1).max(200),
  size: z.number().int().min(0).max(5 * 1024 * 1024),
  type: z
    .string()
    .max(120)
    .refine(
      (value) => /^(text\/|application\/(json|pdf|zip|gzip|x-tar|octet-stream)|image\/(png|jpeg|gif|webp))$/.test(value),
      'That file type cannot be attached.',
    ),
});

function serializeTicket(ticket: {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  instanceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastReplyAt: Date | null;
  instance: { name: string } | null;
  assignedTo: { user: { name: string | null; email: string } } | null;
  _count?: { messages: number };
}) {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    category: ticket.category.toLowerCase(),
    priority: ticket.priority.toLowerCase(),
    status: ticket.status.toLowerCase(),
    instanceId: ticket.instanceId,
    instanceName: ticket.instance?.name ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastReplyAt: ticket.lastReplyAt,
    assignedTo: ticket.assignedTo ? (ticket.assignedTo.user.name ?? ticket.assignedTo.user.email) : null,
    messageCount: ticket._count?.messages ?? 0,
  };
}

export async function registerTicketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tickets/categories', async () => ({ categories: CATEGORIES }));

  app.get('/tickets', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const tickets = await prisma.ticket.findMany({
      where: { userId: user.id },
      include: { instance: { select: { name: true } }, assignedTo: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return { tickets: tickets.map(serializeTicket) };
  });

  app.post('/tickets', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const body = z
      .object({
        subject: z.string().trim().min(3, 'Give the ticket a short subject.').max(160),
        category: z.enum(['TECHNICAL', 'BILLING', 'ACCOUNT', 'ABUSE', 'OTHER']).default('TECHNICAL'),
        priority: z.enum(PRIORITIES).default('NORMAL'),
        body: z.string().trim().min(1, 'Describe the problem.').max(20_000),
        instanceId: z.string().optional(),
        attachments: z.array(attachmentSchema).max(5).optional(),
      })
      .parse(request.body);

    if (body.instanceId) {
      const owned = await prisma.instance.findFirst({ where: { id: body.instanceId, userId: user.id } });
      if (!owned) throw badRequest('That instance does not belong to your account.');
    }

    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        subject: body.subject,
        category: body.category,
        priority: body.priority,
        status: 'OPEN',
        instanceId: body.instanceId ?? null,
        messages: {
          create: {
            authorId: user.id,
            body: body.body,
            attachments: (body.attachments ?? []) as never,
          },
        },
        events: { create: { type: 'created', message: 'Ticket opened.', actorId: user.id } },
      },
      include: { instance: { select: { name: true } }, assignedTo: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { messages: true } } },
    });

    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'created', message: 'Ticket opened.', actorId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.created', targetType: 'ticket', targetId: ticket.id });
    await notifyStaff(ticket.id, ticket.subject);

    return reply.code(201).send({ ticket: serializeTicket(ticket) });
  });

  app.get('/tickets/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        instance: { select: { name: true } },
        assignedTo: { include: { user: { select: { name: true, email: true } } } },
        messages: {
          include: { author: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw notFound('Ticket not found.');

    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');

    const messages = ticket.messages
      .filter((message) => isStaff || !message.internal)
      .map((message) => ({
        id: message.id,
        body: message.body,
        internal: message.internal,
        author: {
          id: message.author.id,
          name: message.author.name ?? message.author.email,
          role: message.author.role,
        },
        createdAt: message.createdAt,
        attachments: (message.attachments ?? []) as { name: string; size: number; type: string }[],
      }));

    return {
      ticket: {
        ...serializeTicket({ ...ticket, _count: { messages: messages.length } }),
        messages,
        events: ticket.events.map((event) => ({ id: event.id, type: event.type, message: event.message, createdAt: event.createdAt })),
      },
    };
  });

  app.post('/tickets/:id/replies', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        body: z.string().trim().min(1, 'Write a reply.').max(20_000),
        internal: z.boolean().optional(),
        attachments: z.array(attachmentSchema).max(5).optional(),
      })
      .parse(request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');

    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');
    if (body.internal && !isStaff) throw forbidden('Only staff can add internal notes.');

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        body: body.body,
        internal: body.internal ?? false,
        attachments: (body.attachments ?? []) as never,
      },
      include: { author: { select: { id: true, name: true, email: true, role: true } } },
    });

    const nextStatus = body.internal
      ? ticket.status
      : isStaff
        ? 'AWAITING_CUSTOMER'
        : 'AWAITING_STAFF';

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastReplyAt: new Date(), status: nextStatus },
    });
    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'reply', message: body.internal ? 'Internal note added.' : 'Reply added.', actorId: user.id },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.replied', targetType: 'ticket', targetId: ticket.id, meta: { internal: Boolean(body.internal) } });

    if (!body.internal) {
      await notifyReply(ticket.id, ticket.subject, ticket.userId, user.id);
    }

    return reply.code(201).send({
      message: {
        id: message.id,
        body: message.body,
        internal: message.internal,
        author: { id: message.author.id, name: message.author.name ?? message.author.email, role: message.author.role },
        createdAt: message.createdAt,
        attachments: (message.attachments ?? []) as { name: string; size: number; type: string }[],
      },
    });
  });

  app.post('/tickets/:id/status', async (request: FastifyRequest) => {
    const user = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = z
      .object({ status: z.enum(['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_STAFF', 'ON_HOLD', 'CLOSED']) })
      .parse(request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
    });
    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'status', message: `Status changed to ${status}.`, actorId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.status_changed', targetType: 'ticket', targetId: ticket.id, meta: { status } });

    const updated = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: { instance: { select: { name: true } }, assignedTo: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { messages: true } } },
    });
    return { ticket: serializeTicket(updated!) };
  });
}

/** Notifies the staff team that a ticket was opened. */
async function notifyStaff(ticketId: string, subject: string): Promise<void> {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] } },
    select: { email: true },
    take: 20,
  });
  if (!staff.length) return;
  const recipients = staff.map((member) => member.email).join(', ');
  const result = await sendMail({
    to: recipients,
    subject: `[Blipmade] New ticket: ${subject}`,
    text: `A new support ticket was opened.\n\nSubject: ${subject}\nReference: ${ticketId}\n`,
  });
  if (!result.delivered) console.info(`[mail:file] ticket notification for ${recipients}`);
}

/** Notifies the other party about a reply. */
async function notifyReply(ticketId: string, subject: string, customerId: string, authorId: string): Promise<void> {
  const customer = await prisma.user.findUnique({ where: { id: customerId }, select: { email: true, name: true } });
  if (!customer) return;
  const result = await sendMail({
    to: customer.email,
    subject: `[Blipmade] Re: ${subject}`,
    text: `Your support ticket has a new reply.\n\nReference: ${ticketId}\n`,
  });
  if (!result.delivered) console.info(`[mail:file] ticket reply notification for ${customer.email}`);
}
