import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { fullName } from '../lib/people.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requirePermission } from '../plugins/auth.js';
import { notifyTicketOpenedForStaff } from '../services/notifications.js';
import { humanAvailable } from '../services/support-availability.js';
import { publishSupportEvent } from '../services/support-events.js';
import { fireAutomations } from '../services/support-automation.js';

/**
 * The live chat of a customer.
 *
 * A chat is a ticket of the channel CHAT: it has the same messages, notes, attachments and history as any ticket, and the
 * replies are written through the same route. What is added here is how a chat starts, how it is found again after the
 * page was closed, what happens when no person is here, and how it becomes a ticket.
 *
 * When nobody of the staff is connected, a chat is not opened: the message is saved as a ticket and the customer is told
 * so. The customer is never promised an answer in a time, and a message is never kept only in the browser.
 */

const limit = (app: FastifyInstance) => ({
  config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
  preHandler: customerLimit(app, LIMITS.mail),
});

/** The newest chat of the customer that is not closed. */
async function currentChat(userId: string) {
  return prisma.ticket.findFirst({ where: { userId, channel: 'CHAT', status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' } });
}

export async function registerSupportChatRoutes(app: FastifyInstance): Promise<void> {
  /** Whether a person is here. Only a yes or a no: the platform does not promise a time. */
  app.get('/support/availability', async (request: FastifyRequest) => {
    await requireAuth(request);
    const { departmentId } = z.object({ departmentId: z.string().optional() }).parse(request.query ?? {});
    return { available: await humanAvailable(departmentId) };
  });

  /** The open chat of the customer, so the widget finds it again after a reload or in another tab. */
  app.get('/support/chat/current', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const chat = await currentChat(user.id);
    return { conversation: chat ? { id: chat.id, number: chat.number, status: chat.status.toLowerCase(), channel: 'chat' } : null };
  });

  app.post('/support/chat', limit(app), async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const body = z
      .object({
        message: z.string().trim().min(1, 'Write a message.').max(4000),
        departmentId: z.string().optional(),
      })
      .parse(request.body);
    if (body.departmentId) {
      const department = await prisma.supportDepartment.findFirst({ where: { id: body.departmentId, visible: true } });
      if (!department) throw badRequest('That department is not available.');
    }

    // The chat that is open takes the message: one conversation, not one for every sentence.
    const existing = await currentChat(user.id);
    if (existing) {
      const now = new Date();
      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketMessage.create({ data: { ticketId: existing.id, authorId: user.id, body: body.message } });
        await tx.ticket.update({ where: { id: existing.id }, data: { lastReplyAt: now, lastCustomerAt: now, status: 'AWAITING_STAFF' } });
        return created;
      });
      await publishSupportEvent({ type: 'message', ticketId: existing.id, ownerId: user.id, internal: false, seq: String(message.seq) });
      return reply.code(200).send({ conversation: { id: existing.id, number: existing.number, channel: 'chat' }, mode: 'chat', resumed: true });
    }

    const available = await humanAvailable(body.departmentId);
    const channel = available ? 'CHAT' : 'TICKET';
    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        channel,
        subject: available ? 'Live chat' : `Message left in the chat: ${body.message.slice(0, 80)}`,
        category: 'OTHER',
        status: 'OPEN',
        departmentId: body.departmentId ?? null,
        lastCustomerAt: new Date(),
        messages: { create: { authorId: user.id, body: body.message } },
        events: { create: { type: 'created', message: available ? 'Chat started.' : 'Message left while nobody was online.', actorId: user.id } },
      },
      include: { messages: { select: { seq: true } } },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'support.chat_started', targetType: 'ticket', targetId: ticket.id, meta: { channel } });
    await notifyTicketOpenedForStaff({ userId: user.id, ticketId: ticket.id, ticketNumber: String(ticket.number), subject: ticket.subject, customer: fullName(user) || user.email, occurrence: ticket.id }).catch(() => undefined);
    await publishSupportEvent({ type: 'created', ticketId: ticket.id, ownerId: user.id, internal: false });
    await fireAutomations('conversation_created', ticket.id, ticket.id);
    return reply.code(201).send({
      conversation: { id: ticket.id, number: ticket.number, channel: channel.toLowerCase() },
      mode: available ? 'chat' : 'ticket',
    });
  });

  /** A chat becomes an ordinary ticket: the history stays, the staff answers when they can. */
  app.post('/support/chat/:id/convert', limit(app), async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const chat = await prisma.ticket.findFirst({ where: { id, userId: user.id, channel: 'CHAT' } });
    if (!chat) throw notFound('Chat not found.');
    await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { channel: 'TICKET' } }),
      prisma.ticketEvent.create({ data: { ticketId: id, type: 'converted', message: 'The chat was turned into a ticket.', actorId: user.id } }),
    ]);
    await publishSupportEvent({ type: 'status', ticketId: id, ownerId: user.id, internal: false });
    return { conversation: { id, channel: 'ticket' } };
  });

  /** One to five, with an optional comment. Kept as an event of the conversation, so the history holds it. */
  app.post('/support/chat/:id/rating', limit(app), async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }).parse(request.body);
    const ticket = await prisma.ticket.findFirst({ where: { id, userId: user.id } });
    if (!ticket) throw notFound('Conversation not found.');
    if (await prisma.ticketEvent.findFirst({ where: { ticketId: id, type: 'rating' } })) throw badRequest('This conversation was already rated.');
    await prisma.ticketEvent.create({ data: { ticketId: id, type: 'rating', message: `Rated ${body.rating}/5${body.comment ? `: ${body.comment}` : ''}`, actorId: user.id } });
    return { rated: true };
  });

  /** "Is typing". Not stored: it is a signal for the other side and it is gone after a few seconds. */
  app.post('/support/chat/:id/typing', limit(app), async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const ticket = await prisma.ticket.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!ticket) throw notFound('Conversation not found.');
    await publishSupportEvent({ type: 'typing', ticketId: id, ownerId: user.id, internal: false, actor: 'customer' });
    return { ok: true };
  });

  app.post('/admin/support/conversations/:id/typing', limit(app), async (request: FastifyRequest) => {
    await requirePermission('tickets.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { userId: true } });
    if (!ticket) throw notFound('Conversation not found.');
    await publishSupportEvent({ type: 'typing', ticketId: id, ownerId: ticket.userId, internal: false, actor: 'staff' });
    return { ok: true };
  });
}
