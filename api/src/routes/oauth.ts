import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireAuth, loadSession } from '../plugins/auth.js';
import { handleOAuthCallback } from '../services/oauth/callback-handler.js';
import { buildAuthorizeRedirect, completeOAuthCallback } from '../services/oauth/flow.js';
import { readOAuth2faCookie } from '../services/oauth/oauth-2fa-cookie.js';
import { listLoginProviders, providerEnabled, resolveWebAppUrl } from '../services/oauth/providers.js';
import { linkIdentityToUser, findIdentity } from '../services/oauth/identity.js';
import { takeTry } from '../services/second-factor.js';
import { prisma } from '../db.js';
import { AppError } from '../lib/errors.js';

const providerParam = z.enum(['github', 'google', 'discord', 'apple']);

async function redirectOAuthFailure(reply: FastifyReply, provider: string, reason: string): Promise<void> {
  const safe = reason.replace(/[^a-z0-9_]/gi, '').slice(0, 40) || 'failed';
  return reply.redirect(resolveWebAppUrl(`/login?oauth=${encodeURIComponent(safe)}&provider=${provider}`));
}

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/oauth/providers', async () => ({
    providers: listLoginProviders().filter((p) => p.enabled),
    githubApp: env.githubAppEnabled,
    discordCommunity: env.discordCommunityEnabled,
  }));

  app.get('/oauth/second-step/methods', async (request) => {
    const token = readOAuth2faCookie(request);
    if (!token) throw unauthorized('No pending sign-in.');
    const userId = await takeTry(token);
    if (!userId) throw unauthorized('This sign-in expired. Try again.');
    const passkeys = await prisma.passkey.count({ where: { userId } });
    return { methods: ['totp', 'backup', ...(passkeys > 0 ? ['passkey'] : [])] };
  });

  app.get('/oauth/:provider/start', async (request, reply) => {
    const provider = providerParam.parse((request.params as { provider: string }).provider);
    const query = z
      .object({
        intent: z.enum(['login', 'link']).default('login'),
        returnTo: z.string().max(500).optional(),
      })
      .parse(request.query ?? {});
    let userId: string | null = null;
    if (query.intent === 'link') {
      await loadSession(request);
      if (!request.user) throw unauthorized('Sign in first.');
      userId = request.user.id;
    }
    const url = await buildAuthorizeRedirect({
      provider,
      intent: query.intent,
      userId,
      returnTo: query.returnTo ?? null,
    });
    return reply.redirect(url);
  });

  app.get('/oauth/:provider/callback', async (request, reply) => {
    const provider = providerParam.parse((request.params as { provider: string }).provider);
    if (!providerEnabled(provider)) throw badRequest('This sign-in method is not available.');
    const query = z
      .object({
        code: z.string().min(1),
        state: z.string().min(10),
        error: z.string().optional(),
      })
      .parse(request.query ?? {});
    if (query.error) {
      return reply.redirect(resolveWebAppUrl(`/login?oauth=denied&provider=${provider}`));
    }
    try {
      await handleOAuthCallback(request, reply, provider, { code: query.code, state: query.state });
    } catch (error) {
      if (error instanceof AppError) {
        const code = error.code === 'conflict' ? 'link_required' : error.code === 'bad_request' ? 'provider_error' : 'failed';
        return reply.redirect(resolveWebAppUrl(`/login?oauth=${code}&provider=${provider}`));
      }
      return redirectOAuthFailure(reply, provider, 'failed');
    }
  });

  app.post('/oauth/apple/callback', async (request, reply) => {
    if (!providerEnabled('apple')) throw badRequest('This sign-in method is not available.');
    const body = z
      .object({
        code: z.string().min(1),
        state: z.string().min(10),
        id_token: z.string().optional(),
        error: z.string().optional(),
      })
      .parse(request.body ?? {});
    if (body.error) {
      return reply.redirect(resolveWebAppUrl('/login?oauth=denied&provider=apple'));
    }
    try {
      await handleOAuthCallback(request, reply, 'apple', { code: body.code, state: body.state, idToken: body.id_token });
    } catch (error) {
      if (error instanceof AppError) {
        const code = error.code === 'conflict' ? 'link_required' : error.code === 'bad_request' ? 'provider_error' : 'failed';
        return reply.redirect(resolveWebAppUrl(`/login?oauth=${code}&provider=apple`));
      }
      return redirectOAuthFailure(reply, 'apple', 'failed');
    }
  });

  app.post('/oauth/link-after-login', async (request, reply) => {
    const user = await requireAuth(request);
    const body = z.object({ provider: providerParam, code: z.string().min(1), state: z.string().min(10) }).parse(request.body ?? {});
    const result = await completeOAuthCallback({ provider: body.provider, code: body.code, state: body.state });
    const collision = await findIdentity(result.profile.provider, result.profile.providerUserId);
    if (collision && collision.userId !== user.id) throw conflict('This provider account is already linked to another Blipmade account.');
    await linkIdentityToUser(user.id, result.profile, result.refreshToken);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'oauth.link', meta: { provider: body.provider }, ip: request.ip });
    return { ok: true };
  });
}
