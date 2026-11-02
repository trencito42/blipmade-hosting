import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { notFound, unauthorized } from '../lib/errors.js';
import { notifyTicketCustomerReplied, notifyTicketOpenedForStaff, notifyTicketReopened } from '../services/notifications.js';
import { fullName } from '../lib/people.js';
import { fireAutomations } from '../services/support-automation.js';
import { publishSupportEvent } from '../services/support-events.js';

/**
 * Email that comes in to the support.
 *
 * The mail system hands each message it receives for the support address to this route, with the shared secret
 * (`SUPPORT_INBOUND_TOKEN`) and the result of its own checks of the sender. The route does not read a mailbox and does not
 * trust a header it was not given a reason to trust: the sender must have passed SPF or DKIM there, must be a customer with a
 * verified address, and a reply must come from the owner of the conversation it names. Without the secret the route does not
 * exist. A message is taken in once, by its Message-ID, so a message handed over twice is one message.
 */

function requireMailSystem(request: FastifyRequest): void {
  if (!env.SUPPORT_INBOUND_TOKEN) throw notFound('Not found.');
  const header = String(request.headers.authorization ?? '');
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(given);
  const b = Buffer.from(env.SUPPORT_INBOUND_TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized('The key of the mail system is not correct.');
}

const messageId = z.string().min(3).max(300);

const mailSchema = z.object({
  from: z.object({ email: z.string().email().max(200), name: z.string().max(200).optional() }),
  subject: z.string().max(500).default(''),
  messageId,
  inReplyTo: messageId.optional(),
  references: z.array(messageId).max(50).default([]),
  text: z.string().max(200_000),
  /** Headers that say the message was written by a program. */
  headers: z.record(z.string(), z.string().max(500)).default({}),
  /** What the mail system checked about the sender. */
  auth: z.object({ spf: z.string().max(20).optional(), dkim: z.string().max(20).optional() }).default({}),
});

/** A message written by a program, or a bounce: it is never a customer writing, and answering it would start a loop. */
export function isAutomatic(mail: z.infer<typeof mailSchema>): 'bounce' | 'automatic' | null {
  const header = (name: string) => (mail.headers[name] ?? mail.headers[name.toLowerCase()] ?? '').toLowerCase();
  const sender = mail.from.email.toLowerCase();
  if (/^(mailer-daemon|postmaster)@/.test(sender) || /^(undelivered|delivery status|mail delivery failed|returned mail)/i.test(mail.subject)) return 'bounce';
  const autoSubmitted = header('Auto-Submitted');
  if ((autoSubmitted && autoSubmitted !== 'no') || ['bulk', 'junk', 'list'].includes(header('Precedence')) || header('X-Auto-Response-Suppress') || header('List-Id') || /^(no-?reply|noreply|do-?not-?reply)@/.test(sender)) return 'automatic';
  return null;
}

/** The text of a reply without the quoted part and the signature line, so the thread holds what the customer wrote. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .{5,200} wrote:\s*$/.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^From: .+/.test(line) && out.length > 0 && out.at(-1) === '') break;
    if (line.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

const normalizeId = (value: string) => value.trim().replace(/^<|>$/g, '').toLowerCase();

export async function registerInternalSupportEmailRoutes(app: FastifyInstance): Promise<void> {
  app.post('/internal/support/inbound', async (request, reply) => {
    requireMailSystem(request);
    const mail = mailSchema.parse(request.body);
    const ignore = async (reason: string) => {
      await audit({ action: 'support.email_ignored', meta: { reason, from: mail.from.email.toLowerCase(), messageId: normalizeId(mail.messageId) } });
      return reply.code(202).send({ accepted: false, reason });
    };

    const id = normalizeId(mail.messageId);
    if (await prisma.ticketMessage.findUnique({ where: { externalId: id }, select: { id: true } })) return reply.code(200).send({ accepted: true, duplicate: true });

    const kind = isAutomatic(mail);
    if (kind === 'bounce') {
      // A failed delivery of an email that the platform sent: the staff reads it in the conversation.
      const ref = [mail.inReplyTo, ...mail.references].filter(Boolean).map((value) => normalizeId(value!));
      const known = ref.length ? await prisma.ticketMessage.findFirst({ where: { externalId: { in: ref } }, select: { ticketId: true } }) : null;
      if (known) await prisma.ticketEvent.create({ data: { ticketId: known.ticketId, type: 'bounce', message: `An email to the customer was not delivered: ${mail.subject.slice(0, 200)}`, actorId: null } });
      return ignore('bounce');
    }
    if (kind === 'automatic') return ignore('automatic_message');

    // The mail system must vouch for the sender.
    if (mail.auth.spf !== 'pass' && mail.auth.dkim !== 'pass') return ignore('sender_not_authenticated');

    const sender = await prisma.user.findFirst({ where: { email: { equals: mail.from.email, mode: 'insensitive' }, role: 'CUSTOMER' } });
    if (!sender) return ignore('unknown_sender');
    if (!sender.emailVerifiedAt) return ignore('sender_not_verified');
    if (sender.suspendedAt) return ignore('sender_suspended');

    const body = stripQuoted(mail.text).slice(0, 20_000) || mail.text.trim().slice(0, 20_000);
    if (!body) return ignore('empty');

    // The conversation a message belongs to: the Message-ID it answers first, the reference in the subject second.
    const ids = [mail.inReplyTo, ...mail.references].filter(Boolean).map((value) => normalizeId(value!));
    let ticket = ids.length ? await prisma.ticket.findFirst({ where: { messages: { some: { externalId: { in: ids } } } } }) : null;
    if (!ticket) {
      const number = /\[(?:Ticket )?#(\d{1,9})\]/i.exec(mail.subject)?.[1];
      if (number) ticket = await prisma.ticket.findUnique({ where: { number: Number(number) } });
    }
    // Only the owner of a conversation can write in it: a reference is not a key.
    if (ticket && ticket.userId !== sender.id) ticket = null;

    const now = new Date();
    if (!ticket) {
      const created = await prisma.ticket.create({
        data: {
          userId: sender.id,
          channel: 'EMAIL',
          subject: (mail.subject.replace(/^(re|fwd?):\s*/gi, '').trim() || 'Email to support').slice(0, 160),
          category: 'OTHER',
          status: 'OPEN',
          lastCustomerAt: now,
          messages: { create: { authorId: sender.id, body, externalId: id } },
          events: { create: { type: 'created', message: 'Opened by email.', actorId: sender.id } },
        },
      });
      await audit({ actorId: sender.id, actorEmail: sender.email, action: 'support.email_received', targetType: 'ticket', targetId: created.id });
      await notifyTicketOpenedForStaff({ userId: sender.id, ticketId: created.id, ticketNumber: String(created.number), subject: created.subject, customer: fullName(sender) || sender.email, occurrence: created.id }).catch(() => undefined);
      await publishSupportEvent({ type: 'created', ticketId: created.id, ownerId: sender.id, internal: false });
      await fireAutomations('conversation_created', created.id, created.id);
      return reply.code(201).send({ accepted: true, conversation: created.number, created: true });
    }

    const reopens = ticket.status === 'CLOSED';
    const message = await prisma.$transaction(async (tx) => {
      const added = await tx.ticketMessage.create({ data: { ticketId: ticket!.id, authorId: sender.id, body, externalId: id } });
      await tx.ticket.update({ where: { id: ticket!.id }, data: { status: 'AWAITING_STAFF', lastReplyAt: now, lastCustomerAt: now, ...(reopens ? { closedAt: null, reopenedAt: now } : {}) } });
      if (reopens) await tx.ticketEvent.create({ data: { ticketId: ticket!.id, type: 'reopened', message: 'Ticket reopened by an email.', actorId: sender.id } });
      await tx.ticketEvent.create({ data: { ticketId: ticket!.id, type: 'reply', message: 'Reply added by email.', actorId: sender.id } });
      return added;
    });
    await publishSupportEvent({ type: 'message', ticketId: ticket.id, ownerId: ticket.userId, internal: false, seq: String(message.seq) });
    if (reopens) await notifyTicketReopened({ userId: ticket.userId, ticketId: ticket.id, ticketNumber: String(ticket.number), subject: ticket.subject, occurrence: `reopen-${message.id}` }).catch(() => undefined);
    await notifyTicketCustomerReplied({ userId: ticket.userId, ticketId: ticket.id, ticketNumber: String(ticket.number), subject: ticket.subject, excerpt: body.slice(0, 300), staffId: ticket.assignedToId, occurrence: message.id }).catch(() => undefined);
    if (reopens) await fireAutomations('reopened', ticket.id, message.id);
    await fireAutomations('customer_replied', ticket.id, message.id);
    return reply.code(201).send({ accepted: true, conversation: ticket.number, created: false });
  });
}
