import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { clearGuestCookie, GUEST_EMAIL_DOMAIN, issueGuestToken, requireGuest, readOptionalGuest } from '../lib/guest.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { LIMITS } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requirePermission } from '../plugins/auth.js';
import { notifyTicketOpenedForStaff } from '../services/notifications.js';
import { fireAutomations } from '../services/support-automation.js';
import { humanAvailable } from '../services/support-availability.js';
import { publishSupportEvent } from '../services/support-events.js';
import { guestConfigSchema, readGuestConfig, saveGuestConfig } from '../services/support-guest.js';
import { stream } from './support-stream.js';

/**
 * The chat for a visitor who has not signed in.
 *
 * It is off until an operator switches it on. A guest gets a short-lived credential that opens only their own chat; it is
 * not a session of the platform and the chat accepts nothing else as a guest. A guest cannot be trusted as a person: what
 * they write as a name or a contact is shown as given, never as verified, no email is ever sent to them, and the staff
 * sees "Guest" instead of an address. The consent to the notice is asked before anything is stored. The start of a chat is
 * limited per address and for the whole platform, and everything a guest wrote is deleted after the retention period.
 * A guest who then signs in can move the conversation to their account.
 */

const MAX_MESSAGES = 200;
const GLOBAL_STARTS_PER_MINUTE = 60;

/** A request from another site is refused: the chat is used from the pages of this one. */
function sameOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const host = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '').split(',')[0]!.trim();
  let given = '';
  try {
    given = new URL(origin).host;
  } catch {
    throw forbidden('That origin is not allowed.');
  }
  if (given !== host) throw forbidden('That origin is not allowed.');
}

export async function registerSupportGuestRoutes(app: FastifyInstance): Promise<void> {
  const config = async () => {
    const value = await readGuestConfig();
    if (!value.enabled) throw notFound('Not found.');
    return value;
  };
  const limit = (max: number, window: string) => ({ config: { rateLimit: { max, timeWindow: window, keyGenerator: addressRateLimitKey } } });

  /** Whether the chat is open to visitors, and the notice they are shown. Public. */
  app.get('/support/guest/config', async () => {
    const value = await readGuestConfig();
    return { enabled: value.enabled, notice: value.enabled ? value.notice : null };
  });

  app.post('/support/guest/start', limit(5, '1 hour'), async (request: FastifyRequest, reply) => {
    sameOrigin(request);
    await config();
    const body = z
      .object({
        name: z.string().trim().min(1, 'Tell us your name.').max(60),
        message: z.string().trim().min(1, 'Write a message.').max(2000),
        contact: z.string().trim().max(200).optional(),
        departmentId: z.string().max(40).optional(),
        consent: z.boolean().refine((value) => value === true, 'Agree to the notice to start the chat.'),
      })
      .parse(request.body);
    if (body.departmentId && !(await prisma.supportDepartment.findFirst({ where: { id: body.departmentId, visible: true } }))) throw badRequest('That department is not available.');

    const existing = await readOptionalGuest(request);
    let userId = existing?.userId;
    if (!userId) {
      const recent = await prisma.user.count({ where: { isGuest: true, createdAt: { gte: new Date(Date.now() - 60_000) } } });
      if (recent >= GLOBAL_STARTS_PER_MINUTE) throw new (await import('../lib/errors.js')).AppError(429, 'rate_limited', 'The chat is busy. Try again in a minute.');
      const created = await prisma.user.create({
        data: { email: `guest-${randomBytes(8).toString('hex')}@${GUEST_EMAIL_DOMAIN}`, passwordHash: `!${randomBytes(24).toString('base64url')}`, firstName: body.name, lastName: '', role: 'CUSTOMER', isGuest: true },
      });
      userId = created.id;
      await issueGuestToken(request, reply, userId);
    }

    const text = body.contact ? `${body.message}\n\nContact given by the visitor (not verified): ${body.contact}` : body.message;
    const open = await prisma.ticket.findFirst({ where: { userId, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' } });
    if (open) {
      const now = new Date();
      const message = await prisma.$transaction(async (tx) => {
        const added = await tx.ticketMessage.create({ data: { ticketId: open.id, authorId: userId!, body: text } });
        await tx.ticket.update({ where: { id: open.id }, data: { lastReplyAt: now, lastCustomerAt: now, status: 'AWAITING_STAFF' } });
        return added;
      });
      await publishSupportEvent({ type: 'message', ticketId: open.id, ownerId: userId, internal: false, seq: String(message.seq) });
      return reply.code(200).send({ conversation: { id: open.id, number: open.number, channel: open.channel.toLowerCase() }, resumed: true });
    }

    const available = await humanAvailable(body.departmentId);
    const channel = available ? 'CHAT' : 'TICKET';
    const ticket = await prisma.ticket.create({
      data: {
        userId,
        channel,
        subject: `${available ? 'Chat' : 'Message'} from a visitor: ${body.message.slice(0, 80)}`,
        category: 'OTHER',
        status: 'OPEN',
        departmentId: body.departmentId ?? null,
        lastCustomerAt: new Date(),
        messages: { create: { authorId: userId, body: text } },
        events: { create: { type: 'created', message: available ? 'Chat started by a visitor.' : 'Message left by a visitor while nobody was online.', actorId: userId } },
      },
    });
    await audit({ actorId: userId, action: 'support.guest_started', targetType: 'ticket', targetId: ticket.id, meta: { channel }, ip: request.ip });
    await notifyTicketOpenedForStaff({ userId, ticketId: ticket.id, ticketNumber: String(ticket.number), subject: ticket.subject, customer: `${body.name} (guest)`, occurrence: ticket.id }).catch(() => undefined);
    await publishSupportEvent({ type: 'created', ticketId: ticket.id, ownerId: userId, internal: false });
    await fireAutomations('conversation_created', ticket.id, ticket.id);
    return reply.code(201).send({ conversation: { id: ticket.id, number: ticket.number, channel: channel.toLowerCase() }, mode: available ? 'chat' : 'ticket' });
  });

  /** The conversation of the guest, public messages only. */
  app.get('/support/guest/thread', async (request: FastifyRequest) => {
    await config();
    const guest = await requireGuest(request);
    const ticket = await prisma.ticket.findFirst({
      where: { userId: guest.userId },
      orderBy: { createdAt: 'desc' },
      include: { messages: { where: { internal: false }, orderBy: { seq: 'asc' }, take: MAX_MESSAGES + 50, select: { id: true, body: true, authorId: true, createdAt: true } } },
    });
    if (!ticket) return { conversation: null, messages: [] };
    return {
      conversation: { id: ticket.id, number: ticket.number, status: ticket.status.toLowerCase(), channel: ticket.channel.toLowerCase() },
      messages: ticket.messages.map((message) => ({ id: message.id, from: message.authorId === guest.userId ? 'you' : 'support', body: message.body, at: message.createdAt })),
    };
  });

  app.post('/support/guest/messages', limit(30, '1 minute'), async (request: FastifyRequest, reply) => {
    sameOrigin(request);
    await config();
    const guest = await requireGuest(request);
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(request.body);
    const ticket = await prisma.ticket.findFirst({ where: { userId: guest.userId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { messages: true } } } });
    if (!ticket) throw notFound('Start the chat first.');
    if (ticket.status === 'CLOSED') throw conflict('This chat is closed.');
    if (ticket._count.messages >= MAX_MESSAGES) throw conflict('This chat reached its limit. Sign in or start a new one.');
    const now = new Date();
    const message = await prisma.$transaction(async (tx) => {
      const added = await tx.ticketMessage.create({ data: { ticketId: ticket.id, authorId: guest.userId, body } });
      await tx.ticket.update({ where: { id: ticket.id }, data: { lastReplyAt: now, lastCustomerAt: now, status: 'AWAITING_STAFF' } });
      return added;
    });
    await publishSupportEvent({ type: 'message', ticketId: ticket.id, ownerId: guest.userId, internal: false, seq: String(message.seq) });
    await fireAutomations('customer_replied', ticket.id, message.id);
    return reply.code(201).send({ message: { id: message.id, from: 'you', body: message.body, at: message.createdAt } });
  });

  app.post('/support/guest/end', limit(10, '1 minute'), async (request: FastifyRequest) => {
    sameOrigin(request);
    await config();
    const guest = await requireGuest(request);
    const ticket = await prisma.ticket.findFirst({ where: { userId: guest.userId, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' } });
    if (!ticket) return { closed: true };
    await prisma.$transaction([
      prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'CLOSED', closedAt: new Date() } }),
      prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'closed', message: 'The visitor ended the chat.', actorId: guest.userId } }),
    ]);
    await publishSupportEvent({ type: 'status', ticketId: ticket.id, ownerId: guest.userId, internal: false });
    return { closed: true };
  });

  app.get('/support/guest/stream', limit(30, '1 minute'), async (request: FastifyRequest, reply) => {
    await config();
    const guest = await requireGuest(request);
    await stream(request, reply, { id: guest.userId }, { userId: guest.userId, staff: false });
  });

  /**
   * A guest who has signed in moves the conversation to their account. Both proofs are needed: the session of the account and
   * the credential of the guest. Afterwards the guest does not exist.
   */
  app.post('/support/guest/claim', limit(10, '1 hour'), async (request: FastifyRequest, reply) => {
    sameOrigin(request);
    const user = await requireAuth(request);
    const guest = await requireGuest(request);
    if (guest.userId === user.id) throw badRequest('Nothing to claim.');
    const moved = await prisma.$transaction(async (tx) => {
      const tickets = await tx.ticket.updateMany({ where: { userId: guest.userId }, data: { userId: user.id } });
      await tx.supportBotSession.updateMany({ where: { userId: guest.userId }, data: { userId: user.id } });
      await tx.user.delete({ where: { id: guest.userId } });
      return tickets.count;
    });
    clearGuestCookie(reply);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'support.guest_claimed', meta: { conversations: moved }, ip: request.ip });
    return { claimed: moved };
  });

  // --- the switch and the retention, for the operator --------------------------

  app.get('/admin/support/guest', { preHandler: requirePermission('tickets.read') }, async () => ({ config: await readGuestConfig() }));

  app.put('/admin/support/guest', { ...limit(LIMITS.adminWrite.address, LIMITS.adminWrite.window), preHandler: requirePermission('settings.write') }, async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const value = guestConfigSchema.parse(request.body);
    await saveGuestConfig(value);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.guest_configured', meta: { enabled: value.enabled, retentionDays: value.retentionDays }, ip: request.ip });
    return { config: value };
  });
}
