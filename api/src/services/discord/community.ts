import { env } from '../../env.js';
import { prisma } from '../../db.js';
import { badRequest } from '../../lib/errors.js';

const API = 'https://discord.com/api/v10';

async function botFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!env.DISCORD_BOT_TOKEN) throw badRequest('Discord community is not configured.');
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/** Adds the member to the guild when the user authorized guilds.join on OAuth. */
export async function addMemberWithOAuthAccess(userId: string, accessToken: string): Promise<void> {
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId) throw badRequest('Discord community is not configured.');
  const identity = await prisma.connectedIdentity.findFirst({ where: { userId, provider: 'discord' } });
  if (!identity) throw badRequest('Connect Discord first.');
  const res = await botFetch(`/guilds/${guildId}/members/${identity.providerUserId}`, {
    method: 'PUT',
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (res.status === 201 || res.status === 204) {
    await prisma.discordCommunityLink.upsert({
      where: { userId },
      create: { userId, discordUserId: identity.providerUserId, guildId, joinedAt: new Date(), syncState: 'joined' },
      update: { joinedAt: new Date(), syncState: 'joined', lastError: null },
    });
    return;
  }
  const text = await res.text();
  await prisma.discordCommunityLink.upsert({
    where: { userId },
    create: { userId, discordUserId: identity.providerUserId, guildId, syncState: 'error', lastError: text.slice(0, 500) },
    update: { syncState: 'error', lastError: text.slice(0, 500) },
  });
  throw badRequest('Discord could not add you to the server. Complete any membership screening in the Discord app and try again.');
}

export async function syncDiscordRolesForUser(userId: string): Promise<void> {
  const link = await prisma.discordCommunityLink.findUnique({ where: { userId } });
  if (!link?.joinedAt) return;
  const mappings = await prisma.discordRoleMapping.findMany({ where: { enabled: true } });
  const eligible = await evaluateRoleRules(userId, mappings.map((m) => m.ruleKey));
  const roleIds = mappings.filter((m) => eligible.has(m.ruleKey)).map((m) => m.discordRoleId);
  const guildId = env.DISCORD_GUILD_ID;
  const res = await botFetch(`/guilds/${guildId}/members/${link.discordUserId}`, { method: 'PATCH', body: JSON.stringify({ roles: roleIds }) });
  if (!res.ok) {
    const text = await res.text();
    await prisma.discordCommunityLink.update({
      where: { userId },
      data: { syncState: 'error', lastError: text.slice(0, 500), lastSyncAt: new Date() },
    });
    return;
  }
  await prisma.discordCommunityLink.update({
    where: { userId },
    data: { syncState: 'synced', rolesSynced: roleIds, lastSyncAt: new Date(), lastError: null },
  });
}

async function evaluateRoleRules(userId: string, rules: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt) return out;
  for (const rule of rules) {
    if (rule === 'verified_member' && user.emailVerifiedAt) out.add(rule);
    if (rule === 'active_customer') {
      const active = await prisma.instance.count({ where: { userId, status: { in: ['ONLINE', 'PROVISIONING'] } } });
      if (active > 0) out.add(rule);
    }
  }
  return out;
}

export async function reconcileDiscordRoles(limit = 50): Promise<number> {
  const links = await prisma.discordCommunityLink.findMany({
    where: { joinedAt: { not: null } },
    take: limit,
    orderBy: { lastSyncAt: 'asc' },
  });
  for (const link of links) {
    await syncDiscordRolesForUser(link.userId);
  }
  return links.length;
}
