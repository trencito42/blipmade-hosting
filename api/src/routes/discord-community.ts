import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { badRequest } from '../lib/errors.js';
import { requireAuth } from '../plugins/auth.js';
import {
  addMemberWithOAuthAccess,
  getCustomerCommunityStatus,
  syncDiscordRolesForUser,
} from '../services/discord/community.js';
import { buildAuthorizeRedirect } from '../services/oauth/flow.js';
import { webReturnToFromRequest, resolveWebAppUrl } from '../services/oauth/providers.js';
import { consumeOAuthTransaction } from '../services/oauth/transactions.js';
import { syncInstallationRepositories } from '../services/github-app/repositories.js';
import { prisma } from '../db.js';

export async function registerDiscordCommunityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/integrations/discord/community/status', async (request) => {
    const user = await requireAuth(request);
    return getCustomerCommunityStatus(user.id);
  });

  app.post('/integrations/discord/community/join/start', async (request) => {
    const user = await requireAuth(request);
    if (!env.discordCommunityEnabled) throw badRequest('Discord community is not configured.');
    const status = await getCustomerCommunityStatus(user.id);
    if (!status.discordLinked) throw badRequest('Connect Discord under sign-in providers first.');
    if (status.inGuild) throw badRequest('You are already a member of the community server.');
    const url = await buildAuthorizeRedirect({
      provider: 'discord',
      intent: 'discord_guild_join',
      userId: user.id,
      returnTo: webReturnToFromRequest(undefined, '/app/settings/connections?discord_join=1'),
    });
    return { url };
  });

  app.post('/integrations/discord/community/sync', async (request) => {
    const user = await requireAuth(request);
    if (!env.discordCommunityEnabled) throw badRequest('Discord community is not configured.');
    await syncDiscordRolesForUser(user.id);
    return getCustomerCommunityStatus(user.id);
  });

  app.post('/integrations/discord/community/refresh', async (request) => {
    const user = await requireAuth(request);
    if (!env.discordCommunityEnabled) throw badRequest('Discord community is not configured.');
    return getCustomerCommunityStatus(user.id);
  });
}

export async function registerGitHubSetupRoute(app: FastifyInstance): Promise<void> {
  app.get('/integrations/github/setup', async (request, reply) => {
    const query = z
      .object({
        installation_id: z.coerce.string(),
        state: z.string().optional(),
        setup_action: z.string().optional(),
      })
      .parse(request.query ?? {});
    if (query.setup_action === 'request') {
      return reply.redirect(resolveWebAppUrl('/app/settings/connections?github=install'));
    }
    let userId: string | null = null;
    if (query.state) {
      try {
        const tx = await consumeOAuthTransaction('github', query.state);
        userId = tx.userId;
      } catch {
        userId = null;
      }
    }
    if (!userId) {
      return reply.redirect(resolveWebAppUrl('/app/settings/connections?error=github_setup'));
    }
    const row = await prisma.gitHubAppInstallation.upsert({
      where: { installationId: query.installation_id },
      create: {
        userId,
        installationId: query.installation_id,
        accountLogin: 'pending',
        accountType: 'User',
      },
      update: { suspendedAt: null },
    });
    await syncInstallationRepositories(row.id);
    return reply.redirect(resolveWebAppUrl('/app/settings/connections?github=connected'));
  });
}
