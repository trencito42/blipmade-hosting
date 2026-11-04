import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest } from '../lib/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { beginOAuthTransaction, consumeOAuthTransaction } from '../services/oauth/transactions.js';
import { hashOAuthState } from '../services/oauth/providers.js';
import { githubAppInstallUrl } from '../services/github-app/client.js';
import { listUserRepositories, syncInstallationRepositories } from '../services/github-app/repositories.js';

export async function registerGitHubIntegrationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/integrations/github/status', async (request) => {
    await requireAuth(request);
    return { enabled: env.githubAppEnabled, slug: env.GITHUB_APP_SLUG || null };
  });

  app.post('/integrations/github/install', async (request) => {
    const user = await requireAuth(request);
    if (!env.githubAppEnabled) throw badRequest('GitHub App is not configured.');
    const { state } = await beginOAuthTransaction({
      provider: 'github',
      intent: 'github_app_install',
      userId: user.id,
      returnTo: '/app/settings/connections',
    });
    return { url: githubAppInstallUrl(state) };
  });

  app.get('/integrations/github/repositories', async (request) => {
    const user = await requireAuth(request);
    const query = z.object({ q: z.string().max(100).optional() }).parse(request.query ?? {});
    return listUserRepositories(user.id, query.q);
  });

  app.post('/integrations/github/installations/:installationId/sync', async (request) => {
    const user = await requireAuth(request);
    const params = z.object({ installationId: z.string().min(1) }).parse(request.params ?? {});
    const row = await prisma.gitHubAppInstallation.findFirst({
      where: { userId: user.id, OR: [{ id: params.installationId }, { installationId: params.installationId }] },
    });
    if (!row) throw badRequest('Installation not found.');
    const count = await syncInstallationRepositories(row.id);
    return { synced: count };
  });
}

function verifyGithubSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function registerGitHubAppWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/github-app', {
    config: { rawBody: true },
    handler: async (request, reply) => {
      const raw = (request as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
      const sig = request.headers['x-hub-signature-256'] as string | undefined;
      const delivery = request.headers['x-github-delivery'] as string | undefined;
      const event = request.headers['x-github-event'] as string | undefined;
      if (!verifyGithubSignature(raw, sig)) return reply.code(401).send({ error: 'invalid signature' });
      if (!delivery || !event) return reply.code(400).send({ error: 'missing headers' });
      const seen = await prisma.gitHubWebhookDelivery.findUnique({ where: { id: delivery } });
      if (seen) return reply.code(204).send();
      const body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      await prisma.gitHubWebhookDelivery.create({ data: { id: delivery, event } });

      if (event === 'installation' && body.action === 'created') {
        const installation = body.installation as { id: number; account?: { login: string; type: string }; repository_selection?: string };
        const state = typeof body.state === 'string' ? body.state : null;
        let userId: string | null = null;
        if (state) {
          try {
            const tx = await consumeOAuthTransaction('github', state);
            userId = tx.userId;
          } catch {
            userId = null;
          }
        }
        if (userId && installation?.id) {
          const row = await prisma.gitHubAppInstallation.upsert({
            where: { installationId: String(installation.id) },
            create: {
              userId,
              installationId: String(installation.id),
              accountLogin: installation.account?.login ?? 'unknown',
              accountType: installation.account?.type ?? 'User',
              repositorySelection: installation.repository_selection ?? 'selected',
            },
            update: {
              accountLogin: installation.account?.login ?? 'unknown',
              accountType: installation.account?.type ?? 'User',
              repositorySelection: installation.repository_selection ?? 'selected',
              suspendedAt: null,
            },
          });
          await syncInstallationRepositories(row.id);
        }
      }

      if (event === 'installation' && (body.action === 'deleted' || body.action === 'suspend')) {
        const installation = body.installation as { id: number };
        if (installation?.id) {
          await prisma.gitHubAppInstallation.updateMany({
            where: { installationId: String(installation.id) },
            data: { suspendedAt: new Date() },
          });
        }
      }

      if (event === 'push') {
        const repo = body.repository as { id: number; full_name: string } | undefined;
        const ref = typeof body.ref === 'string' ? body.ref : '';
        const branch = ref.replace(/^refs\/heads\//, '');
        if (repo?.id) {
          const { enqueueGithubPushDeploy } = await import('../services/github-app/push-deploy.js');
          await enqueueGithubPushDeploy({ repositoryId: String(repo.id), branch, after: (body.after as string) ?? null });
        }
      }

      return reply.code(204).send();
    },
  });
}
