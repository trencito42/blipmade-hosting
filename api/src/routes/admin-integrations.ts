import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { requirePermission } from '../plugins/auth.js';

export async function registerAdminIntegrationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/integrations', async (request) => {
    await requirePermission('settings.read')(request);
    const [identities, installations, discordLinks, failedDiscord] = await Promise.all([
      prisma.connectedIdentity.groupBy({ by: ['provider'], _count: { _all: true } }),
      prisma.gitHubAppInstallation.count({ where: { suspendedAt: null } }),
      prisma.discordCommunityLink.count({ where: { joinedAt: { not: null } } }),
      prisma.discordCommunityLink.count({ where: { syncState: 'error' } }),
    ]);
    return {
      oauth: {
        github: { enabled: env.oauthGithubEnabled, linkedAccounts: identities.find((r) => r.provider === 'github')?._count._all ?? 0 },
        google: { enabled: env.oauthGoogleEnabled, linkedAccounts: identities.find((r) => r.provider === 'google')?._count._all ?? 0 },
        discord: { enabled: env.oauthDiscordEnabled, linkedAccounts: identities.find((r) => r.provider === 'discord')?._count._all ?? 0 },
        apple: { enabled: env.oauthAppleEnabled, linkedAccounts: identities.find((r) => r.provider === 'apple')?._count._all ?? 0 },
      },
      githubApp: { enabled: env.githubAppEnabled, activeInstallations: installations, slug: env.GITHUB_APP_SLUG || null },
      discordCommunity: {
        enabled: env.discordCommunityEnabled,
        guildConfigured: Boolean(env.DISCORD_GUILD_ID),
        membersJoined: discordLinks,
        syncErrors: failedDiscord,
      },
    };
  });

  app.get('/admin/integrations/discord/roles', async (request) => {
    await requirePermission('settings.read')(request);
    return { mappings: await prisma.discordRoleMapping.findMany({ orderBy: { ruleKey: 'asc' } }) };
  });

  app.put('/admin/integrations/discord/roles/:ruleKey', async (request) => {
    await requirePermission('settings.write')(request);
    const ruleKey = (request.params as { ruleKey: string }).ruleKey;
    const body = (request.body ?? {}) as { discordRoleId?: string; enabled?: boolean };
    const row = await prisma.discordRoleMapping.upsert({
      where: { ruleKey },
      create: { ruleKey, discordRoleId: body.discordRoleId ?? '', enabled: body.enabled ?? true },
      update: { discordRoleId: body.discordRoleId ?? '', enabled: body.enabled ?? true },
    });
    return { mapping: row };
  });
}
