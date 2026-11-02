import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requireStaff, type AuthUser } from '../plugins/auth.js';
import { hasPermission, type Permission } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { redis } from '../redis.js';
import { publishSupportEvent } from '../services/support-events.js';
import { fireAutomations } from '../services/support-automation.js';
import { randomUUID } from 'node:crypto';
import {
  notifyTicketClosed,
  notifyTicketCreated,
  notifyTicketCustomerReplied,
  notifyTicketOpenedForStaff,
  notifyTicketReopened,
  notifyTicketReplyCreated,
  notifyTicketStatusChanged,
} from '../services/notifications.js';
import { fullName } from '../lib/people.js';
import {
  readAttachment,
  removeAttachment,
  safeFilename,
  storageKeyFor,
  storeAttachment,
  validateAttachment,
  verifyAttachmentContent,
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
    z.enum(allowed, { error: `must be one of: ${allowed.join(', ')}.` }),
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
  mailServiceId?: string | null;
  mailService?: { product: { name: string } } | null;
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
    mailServiceId: ticket.mailServiceId ?? null,
    // What the ticket is about, whether it is a server or a mail service.
    serviceName: ticket.instance?.name ?? ticket.mailService?.product.name ?? null,
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
      include: { instance: { select: { name: true } }, mailService: { select: { product: { select: { name: true } } } }, assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { messages: true } } },
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
        mailServiceId: z.string().optional(),
        attachments: z.array(attachmentSchema).max(5).optional(),
      }),
      request.body,
    );

    if (body.instanceId) {
      const owned = await prisma.instance.findFirst({ where: { id: body.instanceId, userId: user.id } });
      if (!owned) throw badRequest('That instance does not belong to your account.');
    }
    if (body.mailServiceId) {
      const owned = await prisma.mailService.findFirst({ where: { id: body.mailServiceId, userId: user.id } });
      if (!owned) throw badRequest('That mail service does not belong to your account.');
    }

    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        subject: body.subject,
        category: body.category,
        priority: body.priority,
        status: 'OPEN',
        instanceId: body.instanceId ?? null,
        mailServiceId: body.mailServiceId ?? null,
        lastCustomerAt: new Date(),
        messages: {
          create: {
            authorId: user.id,
            body: body.body,
            attachmentMeta: (body.attachments ?? []) as never,
          },
        },
        events: { create: { type: 'created', message: 'Ticket opened.', actorId: user.id } },
      },
      include: { instance: { select: { name: true } }, mailService: { select: { product: { select: { name: true } } } }, assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { messages: true } } },
    });

    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'created', message: 'Ticket opened.', actorId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.created', targetType: 'ticket', targetId: ticket.id });

    // The customer is told that the ticket is in the queue, and the staff
    // that works the queue is told that a new ticket arrived. The two
    // messages are two events: one event has one audience.
    await notifyTicketCreated({
      userId: user.id,
      ticketId: ticket.id,
      ticketNumber: String(ticket.number),
      subject: ticket.subject,
      occurrence: ticket.id,
    });
    await notifyTicketOpenedForStaff({
      userId: user.id,
      ticketId: ticket.id,
      ticketNumber: String(ticket.number),
      subject: ticket.subject,
      customer: fullName(user) || user.email,
      occurrence: ticket.id,
    });

    await publishSupportEvent({ type: 'created', ticketId: ticket.id, ownerId: ticket.userId, internal: false });
    await fireAutomations('conversation_created', ticket.id, ticket.id);
    return reply.code(201).send({ ticket: serializeTicket(ticket) });
  });

  app.get('/tickets/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = parse(z.object({ id: z.string() }), request.params);
    const { before } = parse(z.object({ before: z.string().max(40).optional() }), request.query);
    const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        instance: { select: { name: true } },
        mailService: { select: { product: { select: { name: true } } } },
        assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        // The newest messages, a page at a time: a long conversation is not sent whole. The customer never receives an
        // internal note, so it is left out by the query and not only by the filter below.
        messages: {
          where: isStaff ? undefined : { internal: false },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            attachments: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: MESSAGE_PAGE + 1,
          ...(before ? { cursor: { id: before }, skip: 1 } : {}),
        },
        events: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!ticket) throw notFound('Ticket not found.');

    requireTicketPermission(user, 'tickets.read');
    if (ticket.userId !== user.id && !isStaff) throw notFound('Ticket not found.');

    const hasMoreMessages = ticket.messages.length > MESSAGE_PAGE;
    const messages = ticket.messages
      .slice(0, MESSAGE_PAGE)
      .reverse()
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
    // The customer is told what happened to the ticket, not that the staff talked among themselves or who took it.
    const events = ticket.events.filter((event) => isStaff || !isInternalEvent(event));

    return {
      ticket: {
        ...serializeTicket({ ...ticket, _count: { messages: messages.length } }),
        messages,
        hasMoreMessages,
        events: events.map((event) => ({ id: event.id, type: event.type, message: event.message, createdAt: event.createdAt })),
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

    // A retried request (the network dropped, the button was pressed twice) carries the same key and is answered with
    // the message that was already written instead of a second one.
    const key = replyKey(request, user.id, ticket.id);
    if (key) {
      const claim = await claimKey(key);
      if (claim.state === 'busy') throw conflict('This reply is already being saved.');
      if (claim.state === 'replay') {
        const existing = await prisma.ticketMessage.findFirst({
          where: { id: claim.messageId, ticketId: ticket.id },
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
        });
        if (existing) return reply.code(200).send({ message: serializeReply(existing), replayed: true });
      }
    }

    const reopens = !body.internal && ticket.status === 'CLOSED';
    const nextStatus = body.internal
      ? ticket.status
      : isStaff
        ? 'AWAITING_CUSTOMER'
        : 'AWAITING_STAFF';

    // The message, the state of the ticket and the event are one change: either all of them are written or none.
    const now = new Date();
    let message;
    try {
      message = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            authorId: user.id,
            body: body.body,
            internal: body.internal ?? false,
            attachmentMeta: (body.attachments ?? []) as never,
          },
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
        });
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            lastReplyAt: now,
            status: nextStatus,
            ...(reopens ? { closedAt: null, reopenedAt: now } : {}),
            // The moments the answer times are counted from. A note is not an answer, and neither is a bot.
            ...(body.internal ? {} : isStaff ? { lastStaffAt: now } : { lastCustomerAt: now }),
          },
        });
        if (isStaff && !body.internal) {
          await tx.ticket.updateMany({ where: { id: ticket.id, firstHumanResponseAt: null }, data: { firstHumanResponseAt: now } });
        }
        if (reopens) {
          await tx.ticketEvent.create({ data: { ticketId: ticket.id, type: 'reopened', message: 'Ticket reopened by a reply.', actorId: user.id } });
        }
        await tx.ticketEvent.create({
          data: { ticketId: ticket.id, type: body.internal ? 'note' : 'reply', message: body.internal ? 'Internal note added.' : 'Reply added.', actorId: user.id },
        });
        return created;
      });
    } catch (error) {
      if (key) await releaseKey(key);
      throw error;
    }
    if (key) await finishKey(key, message.id);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.replied', targetType: 'ticket', targetId: ticket.id, meta: { internal: Boolean(body.internal), reopened: reopens } });
    if (reopens) {
      await notifyTicketReopened({ userId: ticket.userId, ticketId: ticket.id, ticketNumber: String(ticket.number), subject: ticket.subject, occurrence: `reopen-${message.id}` });
    }

    if (!body.internal) {
      // The author of a reply is never told about their own reply: the
      // answer of the staff goes to the customer, and the answer of the
      // customer goes to the staff. The two are two events, because an
      // event has one audience.
      const excerpt = body.body.trim().slice(0, 300);
      if (isStaff) {
        await notifyTicketReplyCreated({
          userId: ticket.userId,
          ticketId: ticket.id,
          ticketNumber: String(ticket.number),
          subject: ticket.subject,
          excerpt,
          occurrence: message.id,
        });
      } else {
        await notifyTicketCustomerReplied({
          userId: ticket.userId,
          ticketId: ticket.id,
          ticketNumber: String(ticket.number),
          subject: ticket.subject,
          excerpt,
          staffId: ticket.assignedToId,
          occurrence: message.id,
        });
      }
    }

    await publishSupportEvent({ type: 'message', ticketId: ticket.id, ownerId: ticket.userId, internal: message.internal, seq: String(message.seq) });
    if (!body.internal) {
      if (reopens) await fireAutomations('reopened', ticket.id, message.id);
      await fireAutomations(isStaff ? 'staff_replied' : 'customer_replied', ticket.id, message.id);
    }
    return reply.code(201).send({ message: serializeReply(message) });
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
    const { messageId } = parse(z.object({ messageId: z.string().optional() }), request.query);

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
    verifyAttachmentContent(file.mimetype, content);

    // The web client uploads after creating the reply, so the stored file is attached to that exact message. The legacy
    // standalone upload route still creates its own message when no message id is supplied.
    const existing = messageId
      ? await prisma.ticketMessage.findFirst({ where: { id: messageId, ticketId: ticket.id, authorId: user.id } })
      : null;
    if (messageId && !existing) throw notFound('Ticket message not found.');

    // The file is written first: a message that points to a file that was never stored is worse than a file without a
    // message, which is removed again when the rows cannot be written.
    const folder = randomUUID();
    const storageKey = storageKeyFor(ticket.id, folder, file.filename);
    const stored = await storeAttachment({ storageKey, content });
    let message;
    let attachment;
    try {
      ({ message, attachment } = await prisma.$transaction(async (tx) => {
        const created = existing ?? (await tx.ticketMessage.create({
          data: { ticketId: ticket.id, authorId: user.id, body: `Attached ${file.filename}.`, internal: false },
        }));
        const row = await tx.attachment.create({
          data: {
            ticketMessageId: created.id,
            ticketId: ticket.id,
            filename: file.filename,
            contentType: file.mimetype,
            size: stored.size,
            storageKey: stored.storageKey,
            sha256: stored.sha256,
          },
        });
        await tx.ticketEvent.create({
          data: { ticketId: ticket.id, type: 'attachment', message: `File attached: ${file.filename}.`, actorId: user.id },
        });
        return { message: created, attachment: row };
      }));
    } catch (error) {
      await removeAttachment(stored.storageKey).catch(() => {});
      throw error;
    }
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'ticket.attachment_uploaded',
      targetType: 'ticket',
      targetId: ticket.id,
      meta: { filename: file.filename, size: stored.size },
    });

    await publishSupportEvent({ type: 'attachment', ticketId: ticket.id, ownerId: ticket.userId, internal: message.internal });
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

    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, ticketId: id }, include: { ticketMessage: { select: { internal: true } } } });
    // A file of an internal note is for the staff; for anybody else it does not exist.
    if (!attachment || (attachment.ticketMessage.internal && !isStaff)) throw notFound('Attachment not found.');

    const content = await readAttachment(attachment.storageKey);
    reply.header('content-type', attachment.contentType);
    reply.header('content-length', String(content.byteLength));
    reply.header('content-disposition', `attachment; filename="${safeFilename(attachment.filename)}"`);
    reply.header('x-content-type-options', 'nosniff');
    return reply.send(content);
  });

  app.post('/tickets/:id/close', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = parse(z.object({ id: z.string() }), request.params);
    const ticket = await prisma.ticket.findFirst({ where: { id, userId: user.id } });
    if (!ticket) throw notFound('Ticket not found.');
    if (ticket.status === 'CLOSED') return { closed: true };
    await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    const event = await prisma.ticketEvent.create({ data: { ticketId: id, type: 'closed', message: 'Customer closed the ticket.', actorId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.closed_by_customer', targetType: 'ticket', targetId: id });
    await notifyTicketClosed({ userId: user.id, ticketId: id, ticketNumber: String(ticket.number), subject: ticket.subject, occurrence: event.id });
    return { closed: true };
  });

  app.post('/tickets/:id/status', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireStaff(request);
    requireTicketPermission(user, 'tickets.write');
    const { id } = parse(z.object({ id: z.string() }), request.params);
    const { status, ifUpdatedAt } = parse(z.object({ status: enumField(STATUSES), ifUpdatedAt: z.string().datetime().optional() }), request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');

    const previousStatus = ticket.status;
    // A staff member that read the ticket before somebody else changed it sends the moment they read it; the change is
    // refused when the ticket moved since, so the last write does not silently win.
    const changed = await prisma.ticket.updateMany({
      where: { id: ticket.id, ...(ifUpdatedAt ? { updatedAt: new Date(ifUpdatedAt) } : {}) },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
    });
    if (changed.count === 0) throw conflict('Somebody changed this ticket since you opened it. Reload it and try again.');
    const ticketEvent = await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'status', message: `Status changed to ${status}.`, actorId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'ticket.status_changed', targetType: 'ticket', targetId: ticket.id, meta: { status } });

    // The state of a ticket travels in words. The closing, the reopening and
    // the other changes are three different messages, so the customer reads
    // what actually happened.
    const common = {
      userId: ticket.userId,
      ticketId: ticket.id,
      ticketNumber: String(ticket.number),
      subject: ticket.subject,
      occurrence: ticketEvent.id,
    };
    if (status === 'CLOSED') {
      await notifyTicketClosed(common);
    } else if (previousStatus === 'CLOSED') {
      await notifyTicketReopened(common);
    } else {
      await notifyTicketStatusChanged({ ...common, status });
    }

    const updated = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: { instance: { select: { name: true } }, mailService: { select: { product: { select: { name: true } } } }, assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { messages: true } } },
    });
    await publishSupportEvent({ type: 'status', ticketId: ticket.id, ownerId: ticket.userId, internal: false });
    await fireAutomations('status_changed', ticket.id, ticketEvent.id);
    return { ticket: serializeTicket(updated!) };
  });
}

/** The messages of a ticket that are sent at once. */
const MESSAGE_PAGE = 200;

/** Events that only the staff reads: internal notes (also the ones written before they had a type of their own) and assignments. */
function isInternalEvent(event: { type: string; message: string }): boolean {
  return event.type === 'note' || event.type === 'assigned' || event.type === 'department' || event.type === 'rating' || event.type === 'automation' || event.message === 'Internal note added.';
}

type ReplyRow = {
  id: string;
  body: string;
  internal: boolean;
  createdAt: Date;
  attachmentMeta: unknown;
  author: { id: string; firstName: string; lastName: string; email: string; role: string };
};

function serializeReply(message: ReplyRow) {
  return {
    id: message.id,
    body: message.body,
    internal: message.internal,
    author: { id: message.author.id, name: fullName(message.author) || message.author.email, role: message.author.role },
    createdAt: message.createdAt,
    attachments: (message.attachmentMeta ?? []) as { name: string; size: number; type: string }[],
  };
}

/** The key of a reply, from the `Idempotency-Key` header. Null when the client did not send one. */
function replyKey(request: FastifyRequest, userId: string, ticketId: string): string | null {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw badRequest('The Idempotency-Key must be 8 to 100 letters, digits, dashes or underscores.');
  return `ticket-reply:${userId}:${ticketId}:${value}`;
}

type Claim = { state: 'new' } | { state: 'busy' } | { state: 'replay'; messageId: string };

const KEY_SECONDS = 24 * 60 * 60;

/**
 * Claims a key for one day. When the key is taken, the claim says which message it produced; a request that is still
 * running is "busy", so the same reply is not written twice at once. A Redis that does not answer lets the reply
 * through: the reply is worth more than the protection.
 */
async function claimKey(key: string): Promise<Claim> {
  try {
    if ((await redis.set(key, 'pending', 'EX', KEY_SECONDS, 'NX')) === 'OK') return { state: 'new' };
    const value = await redis.get(key);
    return value && value !== 'pending' ? { state: 'replay', messageId: value } : { state: 'busy' };
  } catch {
    return { state: 'new' };
  }
}

async function finishKey(key: string, messageId: string): Promise<void> {
  await redis.set(key, messageId, 'EX', KEY_SECONDS).catch(() => {});
}

async function releaseKey(key: string): Promise<void> {
  await redis.del(key).catch(() => {});
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

