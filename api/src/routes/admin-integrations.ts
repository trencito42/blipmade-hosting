import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { requirePermission } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import {
  adminRetryDiscordSync,
  fetchGuildRoles,
  probeDiscordBotHealth,
  reconcileDiscordCommunity,
} from '../services/discord/community.js';
import { DISCORD_RULE_CATALOG, DISCORD_RULE_KEYS, ensureDefaultDiscordRoleMappings } from '../services/discord/rules.js';

export async function registerAdminIntegrationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/integrations', async (request) => {
    await requirePermission('settings.read')(request);
    await ensureDefaultDiscordRoleMappings();
    const [identities, installations, discordLinks, failedDiscord, suspendedGithub, discordFailures, health] = await Promise.all([
      prisma.connectedIdentity.groupBy({ by: ['provider'], _count: { _all: true } }),
      prisma.gitHubAppInstallation.count({ where: { suspendedAt: null } }),
      prisma.discordCommunityLink.count({ where: { joinedAt: { not: null } } }),
      prisma.discordCommunityLink.count({ where: { syncState: 'error' } }),
      prisma.gitHubAppInstallation.findMany({
        where: { suspendedAt: { not: null } },
        take: 20,
        orderBy: { updatedAt: 'desc' },
        select: { installationId: true, accountLogin: true, suspendedAt: true, userId: true },
      }),
      prisma.discordCommunityLink.findMany({
        where: { OR: [{ syncState: 'error' }, { lastError: { not: null } }] },
        take: 20,
        orderBy: { updatedAt: 'desc' },
        select: { userId: true, syncState: true, lastError: true, lastSyncAt: true },
      }),
      probeDiscordBotHealth(),
    ]);
    return {
      oauth: {
        github: { enabled: env.oauthGithubEnabled, linkedAccounts: identities.find((r) => r.provider === 'github')?._count._all ?? 0 },
        google: { enabled: env.oauthGoogleEnabled, linkedAccounts: identities.find((r) => r.provider === 'google')?._count._all ?? 0 },
        discord: { enabled: env.oauthDiscordEnabled, linkedAccounts: identities.find((r) => r.provider === 'discord')?._count._all ?? 0 },
        apple: { enabled: env.oauthAppleEnabled, linkedAccounts: identities.find((r) => r.provider === 'apple')?._count._all ?? 0 },
      },
      githubApp: {
        enabled: env.githubAppEnabled,
        activeInstallations: installations,
        slug: env.GITHUB_APP_SLUG || null,
        suspendedInstallations: suspendedGithub.map((row) => ({
          installationId: row.installationId,
          accountLogin: row.accountLogin,
          suspendedAt: row.suspendedAt?.toISOString() ?? null,
        })),
      },
      discordCommunity: {
        enabled: env.discordCommunityEnabled,
        guildConfigured: Boolean(env.DISCORD_GUILD_ID),
        guildName: health.guild?.name ?? null,
        botHealth: health,
        membersJoined: discordLinks,
        syncErrors: failedDiscord,
        recentFailures: discordFailures.map((row) => ({
          userId: row.userId,
          syncState: row.syncState,
          lastError: row.lastError,
          lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
        })),
      },
    };
  });

  app.get('/admin/integrations/discord', async (request) => {
    await requirePermission('settings.read')(request);
    await ensureDefaultDiscordRoleMappings();
    const [health, roles, mappings, failures] = await Promise.all([
      probeDiscordBotHealth(),
      fetchGuildRoles(),
      prisma.discordRoleMapping.findMany({ orderBy: { ruleKey: 'asc' } }),
      prisma.discordCommunityLink.findMany({
        where: { OR: [{ syncState: 'error' }, { lastError: { not: null } }] },
        take: 30,
        orderBy: { updatedAt: 'desc' },
        select: { userId: true, discordUserId: true, syncState: true, lastError: true, lastSyncAt: true, joinedAt: true },
      }),
    ]);
    return {
      health,
      guildRoles: roles.filter((r) => r.name !== '@everyone').map((r) => ({ id: r.id, name: r.name, managed: r.managed })),
      ruleCatalog: DISCORD_RULE_CATALOG,
      mappings,
      failures: failures.map((row) => ({
        ...row,
        lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
        joinedAt: row.joinedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post('/admin/integrations/discord/reconcile', async (request) => {
    const actor = await requirePermission('settings.write')(request);
    const body = z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(request.body ?? {});
    const count = await reconcileDiscordCommunity(body.limit ?? 50);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'discord.community_reconcile', meta: { count } });
    return { reconciled: count };
  });

  app.post('/admin/integrations/discord/users/:userId/sync', async (request) => {
    const actor = await requirePermission('settings.write')(request);
    const userId = (request.params as { userId: string }).userId;
    await adminRetryDiscordSync(userId, actor.id);
    return { ok: true };
  });

  app.get('/admin/integrations/discord/roles', async (request) => {
    await requirePermission('settings.read')(request);
    await ensureDefaultDiscordRoleMappings();
    const mappings = await prisma.discordRoleMapping.findMany({ orderBy: { ruleKey: 'asc' } });
    return { mappings, ruleCatalog: DISCORD_RULE_CATALOG, ruleKeys: DISCORD_RULE_KEYS };
  });

  app.put('/admin/integrations/discord/roles/:ruleKey', async (request) => {
    const actor = await requirePermission('settings.write')(request);
    const ruleKey = (request.params as { ruleKey: string }).ruleKey;
    if (!DISCORD_RULE_KEYS.includes(ruleKey)) {
      const { badRequest } = await import('../lib/errors.js');
      throw badRequest('Unknown rule key.');
    }
    const body = z.object({ discordRoleId: z.string().max(32).optional(), enabled: z.boolean().optional() }).parse(request.body ?? {});
    const row = await prisma.discordRoleMapping.upsert({
      where: { ruleKey },
      create: { ruleKey, discordRoleId: body.discordRoleId ?? '', enabled: body.enabled ?? false },
      update: { ...(body.discordRoleId !== undefined ? { discordRoleId: body.discordRoleId } : {}), ...(body.enabled !== undefined ? { enabled: body.enabled } : {}) },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'discord.role_mapping_update', meta: { ruleKey, enabled: row.enabled } });
    return { mapping: row };
  });
}
