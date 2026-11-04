import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { fullName } from '../../lib/people.js';
import { publishSupportEvent } from '../support-events.js';
import { fireAutomations } from '../support-automation.js';
import { notifyTicketCreated, notifyTicketOpenedForStaff } from '../notifications.js';

export type CreateTicketInput = {
  userId: string;
  userEmail: string;
  subject: string;
  body: string;
  category: 'TECHNICAL' | 'BILLING' | 'ACCOUNT' | 'ABUSE' | 'OTHER';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  instanceId?: string | null;
  mailServiceId?: string | null;
  channel?: 'TICKET' | 'DISCORD';
  auditMeta?: Record<string, unknown>;
};

export async function createCustomerTicket(input: CreateTicketInput): Promise<{ ticketId: string; ticketNumber: number; initialMessageId: string }> {
  if (input.instanceId) {
    const owned = await prisma.instance.findFirst({ where: { id: input.instanceId, userId: input.userId } });
    if (!owned) throw badRequest('That instance does not belong to your account.');
  }
  if (input.mailServiceId) {
    const owned = await prisma.mailService.findFirst({ where: { id: input.mailServiceId, userId: input.userId } });
    if (!owned) throw badRequest('That mail service does not belong to your account.');
  }

  const ticket = await prisma.ticket.create({
    data: {
      userId: input.userId,
      subject: input.subject,
      category: input.category,
      priority: input.priority ?? 'NORMAL',
      status: 'OPEN',
      channel: input.channel ?? 'TICKET',
      instanceId: input.instanceId ?? null,
      mailServiceId: input.mailServiceId ?? null,
      lastCustomerAt: new Date(),
      messages: {
        create: {
          authorId: input.userId,
          body: input.body,
        },
      },
      events: { create: { type: 'created', message: 'Ticket opened.', actorId: input.userId } },
    },
    include: {
      messages: { select: { id: true }, take: 1 },
    },
  });

  await audit({
    actorId: input.userId,
    actorEmail: input.userEmail,
    action: 'ticket.created',
    targetType: 'ticket',
    targetId: ticket.id,
    meta: input.auditMeta,
  });

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { firstName: true, lastName: true, email: true } });
  await notifyTicketCreated({
    userId: input.userId,
    ticketId: ticket.id,
    ticketNumber: String(ticket.number),
    subject: ticket.subject,
    occurrence: ticket.id,
  });
  await notifyTicketOpenedForStaff({
    userId: input.userId,
    ticketId: ticket.id,
    ticketNumber: String(ticket.number),
    subject: ticket.subject,
    customer: (user ? fullName(user) : null) || input.userEmail,
    occurrence: ticket.id,
  });

  await publishSupportEvent({ type: 'created', ticketId: ticket.id, ownerId: ticket.userId, internal: false });
  await fireAutomations('conversation_created', ticket.id, ticket.id);

  return { ticketId: ticket.id, ticketNumber: ticket.number, initialMessageId: ticket.messages[0]!.id };
}

export async function resolveBlipmadeUserFromDiscord(discordUserId: string): Promise<{ userId: string; email: string } | null> {
  const identity = await prisma.connectedIdentity.findFirst({
    where: { provider: 'discord', providerUserId: discordUserId },
    include: { user: { select: { id: true, email: true, suspendedAt: true } } },
  });
  if (!identity?.user || identity.user.suspendedAt) return null;
  return { userId: identity.user.id, email: identity.user.email };
}

export async function listAuthorizedInstances(userId: string): Promise<{ id: string; name: string; productSlug: string }[]> {
  return prisma.instance
    .findMany({
      where: { userId, status: { in: ['ONLINE', 'PROVISIONING', 'RESTARTING', 'DEGRADED', 'STOPPED'] } },
      select: { id: true, name: true, product: { select: { slug: true } } },
      orderBy: { name: 'asc' },
      take: 25,
    })
    .then((rows) => rows.map((r) => ({ id: r.id, name: r.name, productSlug: r.product.slug })));
}

export async function assertStaffDiscordAction(staffUserId: string, permission: string): Promise<void> {
  const staff = await prisma.staffMember.findUnique({
    where: { userId: staffUserId },
    include: { user: { select: { suspendedAt: true, role: true } } },
  });
  if (!staff?.user || staff.user.suspendedAt) throw forbidden('Staff access revoked.');
  const { hasPermission } = await import('../../lib/permissions.js');
  if (!hasPermission(staff.user.role, staff.permissions, permission as never)) {
    throw forbidden('Your role does not allow this action.');
  }
}
