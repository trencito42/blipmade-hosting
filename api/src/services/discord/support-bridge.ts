import { env } from '../../env.js';
import { prisma } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { fullName } from '../../lib/people.js';
import { botFetch, parseDiscordError } from './http.js';
import { getChannelBinding } from './server-config.js';
import { discordStaffMayReply } from './channel-access.js';
import { createCustomerTicket, resolveBlipmadeUserFromDiscord } from '../support/tickets-core.js';

const THREAD_TYPE_PRIVATE = 12;

export async function openDiscordSupportTicket(input: {
  discordUserId: string;
  subject: string;
  body: string;
  category: 'TECHNICAL' | 'BILLING' | 'ACCOUNT' | 'ABUSE' | 'OTHER';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  instanceId?: string | null;
}): Promise<{ ticketId: string; ticketNumber: number; threadId: string | null; bridgeError: string | null }> {
  const user = await resolveBlipmadeUserFromDiscord(input.discordUserId);
  if (!user) throw forbidden('Link your Discord account to Blipmade under Account → Connections, then try again.');

  const parentId = (await getChannelBinding('support_desk')) ?? (await getChannelBinding('staff_queue'));
  if (!parentId) throw badRequest('Support desk channel is not configured in Admin → Integrations → Discord.');

  const { ticketId, ticketNumber, initialMessageId } = await createCustomerTicket({
    userId: user.userId,
    userEmail: user.email,
    subject: input.subject,
    body: input.body,
    category: input.category,
    priority: input.priority,
    instanceId: input.instanceId ?? null,
    channel: 'DISCORD',
    auditMeta: { source: 'discord', discordUserId: input.discordUserId },
  });

  const threadName = `ticket-${ticketNumber}`.slice(0, 100);
  const threadRes = await botFetch(`/channels/${parentId}/threads`, {
    method: 'POST',
    body: JSON.stringify({
      name: threadName,
      type: THREAD_TYPE_PRIVATE,
      auto_archive_duration: 10080,
      invitable: false,
    }),
  });
  if (!threadRes.ok) {
    const bridgeError = parseDiscordError(await threadRes.text());
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorId: user.userId,
        body: `Discord thread was not created: ${bridgeError}. The ticket stays open in Blipmade.`,
        internal: true,
      },
    });
    return { ticketId, ticketNumber, threadId: null, bridgeError };
  }

  const thread = (await threadRes.json()) as { id: string };
  await addThreadMember(thread.id, input.discordUserId);
  const staffIds = await staffDiscordUserIds();
  for (const staffId of staffIds) await addThreadMember(thread.id, staffId);
  await botFetch(`/channels/${thread.id}`, {
    method: 'PUT',
    body: JSON.stringify({ topic: `Blipmade ticket #${ticketNumber} (${ticketId})` }),
  });

  const bridge = await prisma.discordTicketBridge.create({
    data: {
      ticketId,
      discordGuildId: env.DISCORD_GUILD_ID,
      discordChannelId: thread.id,
      openedByDiscordUserId: input.discordUserId,
    },
  });

  const opener = await prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } });
  const intro = [
    `**Ticket #${ticketNumber}** — ${input.subject}`,
    `Opened by ${opener ? fullName(opener) || user.email : user.email} via Discord.`,
    '',
    input.body,
    '',
    `_Staff: reply here for the customer, or use Blipmade Admin. Internal notes never sync to Discord._`,
  ].join('\n');

  const msgRes = await botFetch(`/channels/${thread.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: intro.slice(0, 1900),
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: 'Claim', custom_id: `bm:staff:claim:${ticketId}` },
            { type: 2, style: 3, label: 'Resolve', custom_id: `bm:staff:resolve:${ticketId}` },
            { type: 2, style: 2, label: 'Reopen', custom_id: `bm:staff:reopen:${ticketId}` },
          ],
        },
      ],
    }),
  });
  if (msgRes.ok) {
    const msg = (await msgRes.json()) as { id: string };
    await prisma.discordTicketBridge.update({
      where: { id: bridge.id },
      data: { lastDiscordMessageId: msg.id },
    });
    await prisma.discordMessageBridge.create({
      data: {
        bridgeId: bridge.id,
        ticketMessageId: initialMessageId,
        discordMessageId: msg.id,
        direction: 'blipmade_to_discord',
      },
    });
  }

  return { ticketId, ticketNumber, threadId: thread.id, bridgeError: null };
}

async function addThreadMember(threadId: string, discordUserId: string): Promise<void> {
  await botFetch(`/channels/${threadId}/thread-members/${discordUserId}`, { method: 'PUT' });
}

async function staffDiscordUserIds(): Promise<string[]> {
  const staff = await prisma.staffMember.findMany({
    include: { user: { select: { role: true, suspendedAt: true } } },
    take: 25,
  });
  const ids: string[] = [];
  for (const row of staff) {
    if (!discordStaffMayReply({ role: row.user.role, permissions: row.permissions, suspended: Boolean(row.user.suspendedAt) })) continue;
    const identity = await prisma.connectedIdentity.findFirst({
      where: { userId: row.userId, provider: 'discord' },
    });
    if (identity) ids.push(identity.providerUserId);
  }
  return ids;
}

export async function pushBlipmadeMessageToDiscord(ticketMessageId: string): Promise<void> {
  if (!env.discordCommunityEnabled) return;
  const message = await prisma.ticketMessage.findUnique({
    where: { id: ticketMessageId },
    include: {
      author: { select: { firstName: true, lastName: true, role: true } },
      ticket: { select: { id: true, number: true, userId: true, discordBridge: true } },
    },
  });
  if (!message || message.internal) return;
  const bridge = message.ticket.discordBridge;
  if (!bridge || bridge.syncState !== 'active') return;

  const existing = await prisma.discordMessageBridge.findUnique({ where: { ticketMessageId } });
  if (existing) return;

  const label =
    message.authorId === message.ticket.userId
      ? 'Customer'
      : message.author.role === 'STAFF' || message.author.role === 'ADMIN'
        ? 'Staff'
        : 'Support';
  const prefix = `**${label}:** `;
  const content = `${prefix}${message.body}`.slice(0, 2000);

  const res = await botFetch(`/channels/${bridge.discordChannelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) return;
  const sent = (await res.json()) as { id: string };
  await prisma.discordMessageBridge.create({
    data: {
      bridgeId: bridge.id,
      ticketMessageId: message.id,
      discordMessageId: sent.id,
      direction: 'blipmade_to_discord',
    },
  });
  await prisma.discordTicketBridge.update({
    where: { id: bridge.id },
    data: { lastDiscordMessageId: sent.id, lastBlipmadeMessageSeq: message.seq },
  });
}

export async function ingestDiscordThreadMessages(limitBridges = 20): Promise<number> {
  if (!env.discordCommunityEnabled) return 0;
  const bridges = await prisma.discordTicketBridge.findMany({
    where: { syncState: 'active' },
    take: limitBridges,
    orderBy: { updatedAt: 'asc' },
    include: { ticket: { select: { id: true, userId: true, status: true } } },
  });

  let ingested = 0;
  for (const bridge of bridges) {
    const params = new URLSearchParams({ limit: '25' });
    if (bridge.lastDiscordMessageId) params.set('after', bridge.lastDiscordMessageId);
    const res = await botFetch(`/channels/${bridge.discordChannelId}/messages?${params}`);
    if (!res.ok) continue;
    const rows = (await res.json()) as { id: string; author: { id: string; bot?: boolean }; content: string }[];
    const ordered = [...rows].reverse();
    for (const row of ordered) {
      if (row.author.bot) continue;
      const mapped = await prisma.discordMessageBridge.findUnique({ where: { discordMessageId: row.id } });
      if (mapped) continue;

      const blipUser = await resolveBlipmadeUserFromDiscord(row.author.id);
      if (!blipUser) continue;

      const isCustomer = blipUser.userId === bridge.ticket.userId;
      const staff = await prisma.staffMember.findUnique({
        where: { userId: blipUser.userId },
        include: { user: { select: { role: true, suspendedAt: true } } },
      });
      const staffReply = staff
        ? discordStaffMayReply({
            role: staff.user.role,
            permissions: staff.permissions,
            suspended: Boolean(staff.user.suspendedAt),
          })
        : false;
      if (!isCustomer && !staffReply) break;

      const raw = row.content.trim();
      if (!raw) continue;
      const internal = staffReply && raw.startsWith('!note ');
      const body = internal ? raw.slice('!note '.length).trim() : raw;
      if (!body) continue;

      const created = await prisma.ticketMessage.create({
        data: {
          ticketId: bridge.ticket.id,
          authorId: blipUser.userId,
          body,
          internal,
        },
      });
      await prisma.discordMessageBridge.create({
        data: {
          bridgeId: bridge.id,
          ticketMessageId: created.id,
          discordMessageId: row.id,
          direction: 'discord_to_blipmade',
        },
      });
      if (!internal) {
        await prisma.ticket.update({
          where: { id: bridge.ticket.id },
          data: {
            lastReplyAt: new Date(),
            status: isCustomer ? 'AWAITING_STAFF' : 'AWAITING_CUSTOMER',
            ...(isCustomer ? { lastCustomerAt: new Date() } : { lastStaffAt: new Date() }),
          },
        });
      }
      await prisma.discordTicketBridge.update({
        where: { id: bridge.id },
        data: { lastDiscordMessageId: row.id, lastBlipmadeMessageSeq: created.seq },
      });
      ingested += 1;
    }
  }
  return ingested;
}

export async function listDiscordTicketsForUser(discordUserId: string): Promise<
  { ticketId: string; number: number; subject: string; status: string; threadId: string | null }[]
> {
  const user = await resolveBlipmadeUserFromDiscord(discordUserId);
  if (!user) return [];
  const tickets = await prisma.ticket.findMany({
    where: { userId: user.userId, channel: 'DISCORD' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: { discordBridge: { select: { discordChannelId: true } } },
  });
  return tickets.map((t) => ({
    ticketId: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    threadId: t.discordBridge?.discordChannelId ?? null,
  }));
}

export async function staffDiscordAction(
  discordUserId: string,
  action: 'claim' | 'resolve' | 'reopen',
  ticketId: string,
): Promise<string> {
  const user = await resolveBlipmadeUserFromDiscord(discordUserId);
  if (!user) throw forbidden('Connect Discord to Blipmade first.');
  const staff = await prisma.staffMember.findUnique({
    where: { userId: user.userId },
    include: { user: { select: { role: true, suspendedAt: true } } },
  });
  const allowed = staff
    ? discordStaffMayReply({ role: staff.user.role, permissions: staff.permissions, suspended: Boolean(staff.user.suspendedAt) })
    : false;
  if (!allowed) throw forbidden('You do not have permission to manage this ticket.');
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true } });
  if (!ticket) throw notFound('Ticket not found.');
  if (action === 'claim') {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { assignedToId: user.userId } });
    return `Ticket #${ticket.number} claimed.`;
  }
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: action === 'resolve' ? 'CLOSED' : 'OPEN' },
  });
  return action === 'resolve' ? `Ticket #${ticket.number} resolved.` : `Ticket #${ticket.number} reopened.`;
}

export async function assertDiscordTicketAccess(discordUserId: string, ticketId: string): Promise<{ userId: string }> {
  const user = await resolveBlipmadeUserFromDiscord(discordUserId);
  if (!user) throw forbidden('Connect Discord to Blipmade first.');
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { userId: true } });
  if (!ticket) throw notFound('Ticket not found.');
  if (ticket.userId !== user.userId) {
    const staff = await prisma.staffMember.findUnique({
      where: { userId: user.userId },
      include: { user: { select: { role: true, suspendedAt: true } } },
    });
    const allowed = staff
      ? discordStaffMayReply({
          role: staff.user.role,
          permissions: staff.permissions,
          suspended: Boolean(staff.user.suspendedAt),
        })
      : false;
    if (!allowed) throw forbidden('You cannot access this ticket.');
  }
  return { userId: user.userId };
}
