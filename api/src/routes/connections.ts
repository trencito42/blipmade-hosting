import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireAuth } from '../plugins/auth.js';
import { verifyPassword } from '../lib/password.js';
import { userHasPassword } from '../services/account-auth-methods.js';
import { listConnections, unlinkProvider } from '../services/oauth/identity.js';
import { getCustomerCommunityStatus } from '../services/discord/community.js';
import { buildAuthorizeRedirect } from '../services/oauth/flow.js';
import { listLoginProviders, webReturnToFromRequest } from '../services/oauth/providers.js';
import type { OAuthProviderId } from '../services/oauth/types.js';

const providerParam = z.enum(['github', 'google', 'discord', 'apple']);

async function requireRecentPassword(userId: string, password: string | undefined): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !userHasPassword(user.passwordHash)) return;
  if (!password || !(await verifyPassword(password, user.passwordHash!))) {
    throw badRequest('Enter your current password to continue.');
  }
}

export async function registerConnectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/connections', async (request) => {
    const user = await requireAuth(request);
    const identities = await listConnections(user.id);
    const installations = await prisma.gitHubAppInstallation.findMany({
      where: { userId: user.id, suspendedAt: null },
      select: {
        id: true,
        installationId: true,
        accountLogin: true,
        accountType: true,
        repositorySelection: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { repositories: true } },
      },
    });
    const discordCommunity = await getCustomerCommunityStatus(user.id);
    return {
      providers: listLoginProviders(),
      identities,
      githubInstallations: installations.map((row) => ({
        id: row.id,
        installationId: row.installationId,
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        repositorySelection: row.repositorySelection,
        repositoryCount: row._count.repositories,
        connectedAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      discordCommunity,
    };
  });

  app.post('/account/connections/:provider/link', async (request) => {
    const user = await requireAuth(request);
    const provider = providerParam.parse((request.params as { provider: string }).provider) as OAuthProviderId;
    const body = z.object({ returnTo: z.string().max(500).optional() }).parse(request.body ?? {});
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
    const url = await buildAuthorizeRedirect({
      provider,
      intent: 'link',
      userId: user.id,
      returnTo: webReturnToFromRequest(origin, body.returnTo ?? '/app/settings/connections'),
    });
    return { url };
  });

  app.delete('/account/connections/:provider', async (request) => {
    const user = await requireAuth(request);
    const provider = providerParam.parse((request.params as { provider: string }).provider) as OAuthProviderId;
    const body = z.object({ password: z.string().optional() }).parse(request.body ?? {});
    await requireRecentPassword(user.id, body.password);
    await unlinkProvider(user.id, provider);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'oauth.unlink', meta: { provider }, ip: request.ip });
    return { ok: true };
  });
}
