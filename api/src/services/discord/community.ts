import { env } from '../../env.js';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest } from '../../lib/errors.js';
import { DISCORD_RULE_CATALOG, evaluateDiscordRoleRules, ensureDefaultDiscordRoleMappings } from './rules.js';

const API = 'https://discord.com/api/v10';

export type DiscordCommunitySyncState =
  | 'not_configured'
  | 'not_linked'
  | 'not_member'
  | 'joined'
  | 'synced'
  | 'error'
  | 'left_guild';

export function computeManagedRoleDelta(
  currentRoleIds: string[],
  managedRoleIds: Iterable<string>,
  grantRoleIds: string[],
): { add: string[]; remove: string[] } {
  const managed = new Set(managedRoleIds);
  const current = new Set(currentRoleIds);
  const target = new Set(grantRoleIds.filter((id) => id.length > 0));
  const add = [...target].filter((id) => !current.has(id));
  const remove = [...current].filter((id) => managed.has(id) && !target.has(id));
  return { add, remove };
}

/** @deprecated use computeManagedRoleDelta in tests */
export function mergeManagedDiscordRoles(memberRoles: string[], managedRoleIds: Iterable<string>, grantRoleIds: string[]): string[] {
  const managedIds = new Set(managedRoleIds);
  const preserved = memberRoles.filter((roleId) => !managedIds.has(roleId));
  return [...new Set([...preserved, ...grantRoleIds])];
}

function parseDiscordError(text: string): string {
  try {
    const json = JSON.parse(text) as { message?: string; code?: number };
    if (json.code === 50013) return 'The bot lacks permission (often role hierarchy — move the bot role above managed roles).';
    if (json.code === 10007) return 'This Discord user is not in the server anymore.';
    if (json.code === 10004) return 'The configured Discord server was not found. Check DISCORD_GUILD_ID.';
    if (json.message) return json.message;
  } catch {
    /* plain text */
  }
  return text.slice(0, 500) || 'Discord API error';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function botFetch(path: string, init?: RequestInit, attempt = 0): Promise<Response> {
  if (!env.DISCORD_BOT_TOKEN) throw badRequest('Discord community is not configured.');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 429 && attempt < 4) {
    const retry = Number(res.headers.get('retry-after') ?? '1');
    await sleep(Math.min(10, retry) * 1000);
    return botFetch(path, init, attempt + 1);
  }
  return res;
}

export async function fetchGuildSnapshot(): Promise<{ id: string; name: string } | null> {
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId || !env.DISCORD_BOT_TOKEN) return null;
  const res = await botFetch(`/guilds/${guildId}?with_counts=false`);
  if (!res.ok) return null;
  const guild = (await res.json()) as { id: string; name: string };
  return { id: guild.id, name: guild.name };
}

export async function fetchGuildRoles(): Promise<{ id: string; name: string; managed: boolean; position: number }[]> {
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId) return [];
  const res = await botFetch(`/guilds/${guildId}/roles`);
  if (!res.ok) return [];
  const roles = (await res.json()) as { id: string; name: string; managed: boolean; position: number }[];
  return roles.sort((a, b) => b.position - a.position);
}

export async function probeDiscordBotHealth(): Promise<{
  ok: boolean;
  botReachable: boolean;
  guild: { id: string; name: string } | null;
  botInGuild: boolean;
  canManageRoles: boolean;
  message: string | null;
}> {
  if (!env.discordCommunityEnabled) {
    return { ok: false, botReachable: false, guild: null, botInGuild: false, canManageRoles: false, message: 'Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID on the server.' };
  }
  const meRes = await botFetch('/users/@me');
  if (!meRes.ok) {
    return { ok: false, botReachable: false, guild: null, botInGuild: false, canManageRoles: false, message: 'Bot token rejected by Discord.' };
  }
  const me = (await meRes.json()) as { id: string };
  const guild = await fetchGuildSnapshot();
  if (!guild) {
    return { ok: false, botReachable: true, guild: null, botInGuild: false, canManageRoles: false, message: 'Bot cannot read the guild — invite it to the server with Manage Roles.' };
  }
  const memberRes = await botFetch(`/guilds/${guild.id}/members/${me.id}`);
  const botInGuild = memberRes.ok;
  let canManageRoles = false;
  if (botInGuild) {
    const member = (await memberRes.json()) as { permissions?: string };
    const perm = BigInt(member.permissions ?? '0');
    const MANAGE_ROLES = 1n << 28n;
    canManageRoles = (perm & MANAGE_ROLES) === MANAGE_ROLES;
  }
  const ok = botInGuild && canManageRoles;
  return {
    ok,
    botReachable: true,
    guild,
    botInGuild,
    canManageRoles,
    message: ok ? null : botInGuild ? 'Bot is in the guild but lacks Manage Roles permission.' : 'Bot is not in the guild — use the OAuth2 URL generator to add it.',
  };
}

async function fetchGuildMember(discordUserId: string): Promise<{ roles: string[]; user?: { username: string; global_name?: string | null } } | null> {
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId) return null;
  const res = await botFetch(`/guilds/${guildId}/members/${discordUserId}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as { roles: string[]; user?: { username: string; global_name?: string | null } };
}

async function addMemberRole(discordUserId: string, roleId: string): Promise<Response> {
  const guildId = env.DISCORD_GUILD_ID!;
  return botFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'PUT' });
}

async function removeMemberRole(discordUserId: string, roleId: string): Promise<Response> {
  const guildId = env.DISCORD_GUILD_ID!;
  return botFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, { method: 'DELETE' });
}

async function upsertLinkRow(
  userId: string,
  discordUserId: string,
  patch: Partial<{ joinedAt: Date | null; syncState: string; lastError: string | null; rolesSynced: string[]; lastSyncAt: Date }>,
): Promise<void> {
  const guildId = env.DISCORD_GUILD_ID!;
  await prisma.discordCommunityLink.upsert({
    where: { userId },
    create: {
      userId,
      discordUserId,
      guildId,
      syncState: patch.syncState ?? 'not_member',
      joinedAt: patch.joinedAt ?? null,
      lastError: patch.lastError ?? null,
      rolesSynced: patch.rolesSynced ?? [],
      lastSyncAt: patch.lastSyncAt ?? null,
    },
    update: patch,
  });
}

/** Reconcile DB + Discord API for guild membership (handles users who joined manually or left). */
export async function refreshCommunityMembership(userId: string): Promise<{ inGuild: boolean }> {
  if (!env.discordCommunityEnabled) return { inGuild: false };
  const identity = await prisma.connectedIdentity.findFirst({ where: { userId, provider: 'discord' } });
  if (!identity) {
    await prisma.discordCommunityLink.deleteMany({ where: { userId } });
    return { inGuild: false };
  }
  const member = await fetchGuildMember(identity.providerUserId);
  if (!member) {
    await upsertLinkRow(userId, identity.providerUserId, {
      joinedAt: null,
      syncState: 'not_member',
      lastError: null,
      rolesSynced: [],
      lastSyncAt: new Date(),
    });
    return { inGuild: false };
  }
  const existing = await prisma.discordCommunityLink.findUnique({ where: { userId } });
  await upsertLinkRow(userId, identity.providerUserId, {
    joinedAt: existing?.joinedAt ?? new Date(),
    syncState: existing?.syncState === 'error' ? 'joined' : existing?.syncState ?? 'joined',
    lastError: null,
  });
  return { inGuild: true };
}

export async function addMemberWithOAuthAccess(userId: string, accessToken: string): Promise<void> {
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId) throw badRequest('Discord community is not configured.');
  const identity = await prisma.connectedIdentity.findFirst({ where: { userId, provider: 'discord' } });
  if (!identity) throw badRequest('Connect Discord for sign-in first.');
  const res = await botFetch(`/guilds/${guildId}/members/${identity.providerUserId}`, {
    method: 'PUT',
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (res.status === 201 || res.status === 204) {
    await upsertLinkRow(userId, identity.providerUserId, {
      joinedAt: new Date(),
      syncState: 'joined',
      lastError: null,
    });
    await syncDiscordRolesForUser(userId);
    return;
  }
  const text = await res.text();
  const message = parseDiscordError(text);
  await upsertLinkRow(userId, identity.providerUserId, { syncState: 'error', lastError: message });
  throw badRequest(
    res.status === 403
      ? 'Discord could not add you to the server. Complete membership screening in Discord if prompted, then try again.'
      : message,
  );
}

export async function syncDiscordRolesForUser(userId: string): Promise<void> {
  if (!env.discordCommunityEnabled) return;
  const { inGuild } = await refreshCommunityMembership(userId);
  if (!inGuild) return;

  const link = await prisma.discordCommunityLink.findUnique({ where: { userId } });
  if (!link) return;

  await ensureDefaultDiscordRoleMappings();
  const mappings = await prisma.discordRoleMapping.findMany({ where: { enabled: true } });
  const configured = mappings.filter((m) => m.discordRoleId.trim().length > 0);
  const eligible = await evaluateDiscordRoleRules(
    userId,
    configured.map((m) => m.ruleKey),
  );
  const managedIds = configured.map((m) => m.discordRoleId);
  const grantIds = configured.filter((m) => eligible.has(m.ruleKey)).map((m) => m.discordRoleId);

  const member = await fetchGuildMember(link.discordUserId);
  if (!member) {
    await prisma.discordCommunityLink.update({
      where: { userId },
      data: { syncState: 'not_member', joinedAt: null, rolesSynced: [], lastSyncAt: new Date(), lastError: null },
    });
    return;
  }

  const delta = computeManagedRoleDelta(member.roles ?? [], managedIds, grantIds);
  let lastError: string | null = null;
  for (const roleId of delta.remove) {
    const res = await removeMemberRole(link.discordUserId, roleId);
    if (!res.ok && res.status !== 404) {
      lastError = parseDiscordError(await res.text());
      break;
    }
  }
  if (!lastError) {
    for (const roleId of delta.add) {
      const res = await addMemberRole(link.discordUserId, roleId);
      if (!res.ok) {
        lastError = parseDiscordError(await res.text());
        break;
      }
    }
  }

  if (lastError) {
    await prisma.discordCommunityLink.update({
      where: { userId },
      data: { syncState: 'error', lastError, lastSyncAt: new Date() },
    });
    return;
  }

  await prisma.discordCommunityLink.update({
    where: { userId },
    data: { syncState: 'synced', rolesSynced: grantIds, lastSyncAt: new Date(), lastError: null },
  });
}

export async function queueDiscordCommunitySync(userId: string): Promise<void> {
  if (!env.discordCommunityEnabled) return;
  const identity = await prisma.connectedIdentity.findFirst({ where: { userId, provider: 'discord' } });
  if (!identity) return;
  await syncDiscordRolesForUser(userId).catch(() => undefined);
}

export async function handleDiscordIdentityUnlinked(userId: string): Promise<void> {
  await prisma.discordCommunityLink.deleteMany({ where: { userId } });
}

export type CustomerCommunityStatus = {
  enabled: boolean;
  configured: boolean;
  discordLinked: boolean;
  discordUsername: string | null;
  guildName: string | null;
  inGuild: boolean;
  syncState: DiscordCommunitySyncState;
  joinedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  managedRoles: { ruleKey: string; label: string; roleId: string; active: boolean }[];
  operatorMessage: string | null;
};

export async function getCustomerCommunityStatus(userId: string): Promise<CustomerCommunityStatus> {
  const base: CustomerCommunityStatus = {
    enabled: env.discordCommunityEnabled,
    configured: env.discordCommunityEnabled,
    discordLinked: false,
    discordUsername: null,
    guildName: null,
    inGuild: false,
    syncState: 'not_configured',
    joinedAt: null,
    lastSyncAt: null,
    lastError: null,
    managedRoles: [],
    operatorMessage: null,
  };
  if (!env.discordCommunityEnabled) {
    return { ...base, syncState: 'not_configured', operatorMessage: 'Community server integration is not configured on this environment.' };
  }

  const health = await probeDiscordBotHealth();
  if (!health.ok) {
    return {
      ...base,
      guildName: health.guild?.name ?? null,
      syncState: 'error',
      operatorMessage: health.message,
    };
  }

  const identity = await prisma.connectedIdentity.findFirst({ where: { userId, provider: 'discord' } });
  if (!identity) {
    return { ...base, guildName: health.guild?.name ?? null, syncState: 'not_linked' };
  }

  base.discordLinked = true;
  base.discordUsername = identity.displayName;
  base.guildName = health.guild?.name ?? null;

  const { inGuild } = await refreshCommunityMembership(userId);
  const link = await prisma.discordCommunityLink.findUnique({ where: { userId } });
  const mappings = await prisma.discordRoleMapping.findMany({ orderBy: { ruleKey: 'asc' } });
  const eligible = await evaluateDiscordRoleRules(
    userId,
    mappings.filter((m) => m.enabled && m.discordRoleId).map((m) => m.ruleKey),
  );

  base.inGuild = inGuild;
  base.joinedAt = link?.joinedAt?.toISOString() ?? null;
  base.lastSyncAt = link?.lastSyncAt?.toISOString() ?? null;
  base.lastError = link?.lastError ?? null;
  base.managedRoles = mappings
    .filter((m) => m.discordRoleId.trim())
    .map((m) => ({
      ruleKey: m.ruleKey,
      label: DISCORD_RULE_CATALOG[m.ruleKey]?.label ?? m.ruleKey,
      roleId: m.discordRoleId,
      active: eligible.has(m.ruleKey),
    }));

  if (!inGuild) {
    base.syncState = 'not_member';
    return base;
  }

  const state = (link?.syncState as DiscordCommunitySyncState) ?? 'joined';
  base.syncState = state === 'error' ? 'error' : state === 'synced' ? 'synced' : 'joined';
  return base;
}

export async function reconcileDiscordCommunity(limit = 40): Promise<number> {
  if (!env.discordCommunityEnabled) return 0;
  const identities = await prisma.connectedIdentity.findMany({
    where: { provider: 'discord' },
    take: limit,
    orderBy: { lastUsedAt: 'desc' },
  });
  for (const identity of identities) {
    await syncDiscordRolesForUser(identity.userId).catch(() => undefined);
  }
  return identities.length;
}

/** @deprecated alias */
export async function reconcileDiscordRoles(limit = 50): Promise<number> {
  return reconcileDiscordCommunity(limit);
}

export async function adminRetryDiscordSync(userId: string, actorId: string): Promise<void> {
  await syncDiscordRolesForUser(userId);
  await audit({ actorId, action: 'discord.community_sync_retry', targetType: 'user', targetId: userId });
}
