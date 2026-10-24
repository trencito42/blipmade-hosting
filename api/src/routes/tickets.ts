import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requireStaff, type AuthUser } from '../plugins/auth.js';
import { hasPermission, type Permission } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';
import { fullName } from '../lib/people.js';
import {
  readAttachment,
  removeAttachment,
  safeFilename,
  storageKeyFor,
  storeAttachment,
  validateAttachment,
} from '../lib/attachments.js';

/**
 * The routes of the tickets carry a limit.
 *
 * A ticket that is opened, a reply and a change of the state send a
 * message, so they carry the limit of the mail: the platform may not
 * become a relay for the account of one customer. The attachment is
 * written on the storage of the platform, so it carries the limit of
 * the panel.
 */

/**
 * The enums of a ticket, in the shape the Prisma enums have them.
 *
 * This is the one shape the API speaks: UPPER_CASE. The values of
 * `TicketCategory`, `TicketPriority` and `TicketStatus` are the ones that go
 * out in every answer, and a request may write them in any case, so a client
 * that sends "normal" is understood and always reads back "NORMAL".
 */
const CATEGORY_IDS = ['TECHNICAL', 'BILLING', 'ACCOUNT', 'ABUSE', 'OTHER'] as const;
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_STAFF', 'ON_HOLD', 'CLOSED'] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_IDS)[number], string> = {
  TECHNICAL: 'Technical',
  BILLING: 'Billing',
  ACCOUNT: 'Account',
  ABUSE: 'Abuse report',
  OTHER: 'Other',
};

const CATEGORIES = CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABELS[id] }));

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

/**
 * A field that takes one of the values of an enum.
 *
 * The value is read in any case and with the spaces around it removed, and it
 * is kept in the canonical form. A value that is not allowed is refused with
 * a message that says which values are allowed.
 */
function enumField<T extends string>(allowed: readonly [T, ...T[]]) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.enum(allowed, {
      errorMap: () => ({ message: `must be one of: ${allowed.join(', ')}.` }),
    }),
  );
}

/**
 * Parses a request and turns a failure into an error that names the field
 * that is wrong and says what is allowed there, so the client can show the
 * problem next to the input instead of a general message.
 *
 * The code stays the one of the shared validation error, so the answer keeps
 * the shape the client already reads.
 */
function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'form';
    fields[field] ??= `${field}: ${issue.message}`;
  }
  const message = Object.values(fields)[0] ?? 'Some fields need attention.';
  throw new AppError(400, 'validation_failed', message, fields);
}

/**
 * The form an enum takes when it leaves the API: the upper case of the
 * Prisma enum. It is applied in one place, so every answer carries the same
 * shape, whatever the client wrote in the request.
 */
function canonicalEnum(value: string): string {
  return value.trim().toUpperCase();
}

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
  assignedTo: { user: { firstName: string; lastName: string; email: string } } | null;
  _count?: { messages: number };
}) {
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    category: canonicalEnum(ticket.category),
    priority: canonicalEnum(ticket.priority),
    status: canonicalEnum(ticket.status),
    instanceId: ticket.instanceId,
    instanceName: ticket.instance?.name ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastReplyAt: ticket.lastReplyAt,
    assignedTo: ticket.assignedTo
      ? fullName(ticket.assignedTo.user) || ticket.assignedTo.user.email
      : null,
    messageCount: ticket._count?.messages ?? 0,
  };
}

export async function registerTicketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tickets/categories', async () => ({ categories: CATEGORIES }));

  app.get('/tickets', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 100, maxSize: 200 });
    const rows = await prisma.ticket.findMany({
      where: withCursor({ userId: user.id }, cursor, 'updatedAt'),
      include: { instance: { select: { name: true } }, assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { messages: true } } },
      orderBy: pageOrder('updatedAt'),
      take: limit + 1,
    });
    const page = pageOf(rows, limit, 'updatedAt');
    return { tickets: page.rows.map(serializeTicket), pagination: page.pagination };
  });

  app.post('/tickets', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const body = parse(
      z.object({
        subject: z.string().trim().min(3, 'Give the ticket a short subject.').max(160),
        category: enumField(CATEGORY_IDS).default('TECHNICAL'),
        priority: enumField(PRIORITIES).default('NORMAL'),
        body: z.string().trim().min(1, 'Describe the problem.').max(20_000),
        instanceId: z.string().optional(),
        attachments: z.array(attachmentSchema).max(5).optional(),
      }),
      request.body,
    );

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
            attachmentMeta: (body.attachments ?? []) as never,
          },
        },
        events: { create: { type: 'created', message: 'Ticket opened.', actorId: user.id } },
      },
      include: { instance: { select: { name: true } }, assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { messages: true } } },
    });

    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'created', message: 'Ticket opened.', actorId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.created', targetType: 'ticket', targetId: ticket.id });
    await notifyStaff(ticket.id, ticket.subject);

    return reply.code(201).send({ ticket: serializeTicket(ticket) });
  });

  app.get('/tickets/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = parse(z.object({ id: z.string() }), request.params);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        instance: { select: { name: true } },
        assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        messages: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw notFound('Ticket not found.');

    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    requireTicketPermission(user, 'tickets.read');
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');

    const messages = ticket.messages
      .filter((message) => isStaff || !message.internal)
      .map((message) => ({
        id: message.id,
        body: message.body,
        internal: message.internal,
        author: {
          id: message.author.id,
          name: fullName(message.author) || message.author.email,
          role: message.author.role,
        },
        createdAt: message.createdAt,
        attachments: [
          ...((message.attachmentMeta ?? []) as { name: string; size: number; type: string }[]),
          ...message.attachments.map((file) => ({
            name: file.filename,
            size: file.size,
            type: file.contentType,
            id: file.id,
            downloadable: true,
          })),
        ],
      }));

    return {
      ticket: {
        ...serializeTicket({ ...ticket, _count: { messages: messages.length } }),
        messages,
        events: ticket.events.map((event) => ({ id: event.id, type: event.type, message: event.message, createdAt: event.createdAt })),
      },
    };
  });

  app.post('/tickets/:id/replies', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    requireTicketPermission(user, 'tickets.write');
    const { id } = parse(z.object({ id: z.string() }), request.params);
    const body = parse(
      z.object({
        body: z.string().trim().min(1, 'Write a reply.').max(20_000),
        internal: z.boolean().optional(),
        attachments: z.array(attachmentSchema).max(5).optional(),
      }),
      request.body,
    );

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');

    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    requireTicketPermission(user, 'tickets.write');
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');
    if (body.internal && !isStaff) throw forbidden('Only staff can add internal notes.');

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        body: body.body,
        internal: body.internal ?? false,
        attachmentMeta: (body.attachments ?? []) as never,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
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
        author: { id: message.author.id, name: fullName(message.author) || message.author.email, role: message.author.role },
        createdAt: message.createdAt,
        attachments: (message.attachmentMeta ?? []) as { name: string; size: number; type: string }[],
      },
    });
  });

  /**
   * Uploads a file to a ticket. The file is stored on the attachment volume
   * and can only be read through the download route, which checks who is
   * allowed to see it.
   */
  app.post('/tickets/:id/attachments', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    requireTicketPermission(user, 'tickets.write');
    const { id } = parse(z.object({ id: z.string() }), request.params);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');
    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    requireTicketPermission(user, 'tickets.write');
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');

    if (!request.isMultipart()) {
      throw badRequest('The file has to be sent as multipart form data.');
    }

    const file = await request.file();
    if (!file) throw badRequest('No file was uploaded.');

    const content = await file.toBuffer();
    validateAttachment(file.mimetype, content.byteLength);

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        body: `Attached ${file.filename}.`,
        internal: false,
      },
    });

    const storageKey = storageKeyFor(ticket.id, message.id, file.filename);
    const stored = await storeAttachment({ storageKey, content });

    const attachment = await prisma.attachment.create({
      data: {
        ticketMessageId: message.id,
        ticketId: ticket.id,
        filename: file.filename,
        contentType: file.mimetype,
        size: stored.size,
        storageKey: stored.storageKey,
        sha256: stored.sha256,
      },
    });

    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'attachment', message: `File attached: ${file.filename}.`, actorId: user.id },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'ticket.attachment_uploaded',
      targetType: 'ticket',
      targetId: ticket.id,
      meta: { filename: file.filename, size: stored.size },
    });

    return reply.code(201).send({
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        messageId: message.id,
      },
    });
  });

  /** Downloads a file that was attached to a ticket. */
  app.get('/tickets/:id/attachments/:attachmentId', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id, attachmentId } = parse(z.object({ id: z.string(), attachmentId: z.string() }), request.params);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');
    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    requireTicketPermission(user, 'tickets.read');
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');

    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, ticketId: id } });
    if (!attachment) throw notFound('Attachment not found.');

    const content = await readAttachment(attachment.storageKey);
    reply.header('content-type', attachment.contentType);
    reply.header('content-length', String(content.byteLength));
    reply.header('content-disposition', `attachment; filename="${safeFilename(attachment.filename)}"`);
    reply.header('x-content-type-options', 'nosniff');
    return reply.send(content);
  });

  app.post('/tickets/:id/status', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireStaff(request);
    requireTicketPermission(user, 'tickets.write');
    const { id } = parse(z.object({ id: z.string() }), request.params);
    const { status } = parse(z.object({ status: enumField(STATUSES) }), request.body);

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
      include: { instance: { select: { name: true } }, assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { messages: true } } },
    });
    return { ticket: serializeTicket(updated!) };
  });
}

/**
 * A staff member needs the permission to work in the support queue.
 *
 * The routes of the tickets are the routes of the customer, so the role alone
 * is not enough: without the permission a staff member would read the
 * tickets of every customer, answer in their name and close them.
 */
function requireTicketPermission(user: AuthUser, permission: Permission): void {
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') return;
  if (!hasPermission(user.role, user.permissions, permission)) {
    throw forbidden(`Your role does not allow "${permission}".`);
  }
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
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!customer) return;
  const result = await sendMail({
    to: customer.email,
    subject: `[Blipmade] Re: ${subject}`,
    text: `Your support ticket has a new reply.\n\nReference: ${ticketId}\n`,
  });
  if (!result.delivered) console.info(`[mail:file] ticket reply notification for ${customer.email}`);
}
