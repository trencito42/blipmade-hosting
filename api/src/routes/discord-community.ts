import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { badRequest } from '../lib/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { addMemberWithOAuthAccess } from '../services/discord/community.js';
import { buildAuthorizeRedirect } from '../services/oauth/flow.js';
import { beginOAuthTransaction, consumeOAuthTransaction } from '../services/oauth/transactions.js';
import { prisma } from '../db.js';
import { syncInstallationRepositories } from '../services/github-app/repositories.js';

export async function registerDiscordCommunityRoutes(app: FastifyInstance): Promise<void> {
  app.post('/integrations/discord/community/join', async (request) => {
    const user = await requireAuth(request);
    if (!env.discordCommunityEnabled) throw badRequest('Discord community is not configured.');
    const body = z.object({ accessToken: z.string().min(20).max(4096) }).parse(request.body ?? {});
    await addMemberWithOAuthAccess(user.id, body.accessToken);
    return { ok: true };
  });

  app.post('/integrations/discord/community/sync', async (request) => {
    const user = await requireAuth(request);
    const { syncDiscordRolesForUser } = await import('../services/discord/community.js');
    await syncDiscordRolesForUser(user.id);
    return { ok: true };
  });

  app.get('/integrations/discord/community/join/start', async (request) => {
    const user = await requireAuth(request);
    const url = await buildAuthorizeRedirect({
      provider: 'discord',
      intent: 'link',
      userId: user.id,
      returnTo: '/app/settings/connections?discord_join=1',
    });
    return { url, note: 'After linking, call community join with the OAuth access token from a guilds.join scope flow.' };
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
      return reply.redirect(`${env.APP_ORIGIN.replace(/\/+$/, '')}/app/settings/connections?github=install`);
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
      return reply.redirect(`${env.APP_ORIGIN.replace(/\/+$/, '')}/app/settings/connections?github=error`);
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
    return reply.redirect(`${env.APP_ORIGIN.replace(/\/+$/, '')}/app/settings/connections?github=connected`);
  });
}
