import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { suspendedAccountError } from '../lib/suspension.js';
import { createSession, loadSession, requireAuth } from '../plugins/auth.js';
import { recordSignIn } from '../services/account-security.js';
import { twoFactorEnabled, startSecondStep } from '../services/second-factor.js';
import {
  createUserFromOAuth,
  findIdentity,
  linkIdentityToUser,
  publicUserFromRecord,
  fullName,
} from '../services/oauth/identity.js';
import { buildAuthorizeRedirect, completeOAuthCallback } from '../services/oauth/flow.js';
import { listLoginProviders, providerEnabled } from '../services/oauth/providers.js';
import type { OAuthProviderId } from '../services/oauth/types.js';

const providerParam = z.enum(['github', 'google', 'discord', 'apple']);

function appReturnUrl(path: string): string {
  const base = env.APP_ORIGIN.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function finishOAuthLogin(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  via: string,
): Promise<{ redirect: string; twoFactor?: { token: string } }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { staff: true } });
  if (!user) throw unauthorized('Account not found.');
  if (user.suspendedAt) throw suspendedAccountError();
  if (await twoFactorEnabled(user.id)) {
    const step = await startSecondStep(user.id);
    return { redirect: appReturnUrl('/login?oauth=2fa'), twoFactor: step };
  }
  await createSession(request, reply, user.id, user.email);
  await recordSignIn(request, user, via);
  await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.login', targetType: 'user', targetId: user.id, meta: { via }, ip: request.ip });
  return { redirect: appReturnUrl('/app') };
}

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/oauth/providers', async () => ({ providers: listLoginProviders(), githubApp: env.githubAppEnabled, discordCommunity: env.discordCommunityEnabled }));

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
        error_description: z.string().optional(),
      })
      .parse(request.query ?? {});
    if (query.error) {
      return reply.redirect(appReturnUrl(`/login?oauth=denied&provider=${provider}`));
    }
    const result = await completeOAuthCallback({ provider, code: query.code, state: query.state });
    const via = `oauth:${provider}`;

    if (result.intent === 'link') {
      if (!result.userId) throw badRequest('Link session expired. Try again from Settings.');
      const collision = await findIdentity(result.profile.provider, result.profile.providerUserId);
      if (collision && collision.userId !== result.userId) {
        return reply.redirect(appReturnUrl('/app/settings/connections?error=linked_elsewhere'));
      }
      await linkIdentityToUser(result.userId, result.profile, result.refreshToken);
      await audit({
        actorId: result.userId,
        action: 'oauth.link',
        targetType: 'connected_identity',
        meta: { provider },
        ip: request.ip,
      });
      return reply.redirect(appReturnUrl(result.returnTo ?? '/app/settings/connections?linked=1'));
    }

    const existing = await findIdentity(result.profile.provider, result.profile.providerUserId);
    if (existing) {
      await linkIdentityToUser(existing.userId, result.profile, result.refreshToken);
      const done = await finishOAuthLogin(request, reply, existing.user.id, via);
      if (done.twoFactor) return reply.redirect(appReturnUrl(`/login?oauth=2fa&token=${encodeURIComponent(done.twoFactor.token)}`));
      return reply.redirect(result.returnTo ? appReturnUrl(result.returnTo) : done.redirect);
    }

    if (result.profile.email) {
      const identity = await import('../lib/email-identity.js').then((m) => m.emailIdentity(result.profile.email!));
      const emailUser = await prisma.user.findFirst({
        where: { OR: [{ email: result.profile.email }, { emailIdentity: identity }] },
        include: { staff: true },
      });
      if (emailUser) {
        return reply.redirect(
          appReturnUrl(
            `/login?oauth=link_required&email=${encodeURIComponent(emailUser.email)}&provider=${provider}`,
          ),
        );
      }
    }

    const user = await createUserFromOAuth(result.profile, result.refreshToken);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.register', targetType: 'user', targetId: user.id, meta: { via }, ip: request.ip });
    const done = await finishOAuthLogin(request, reply, user.id, via);
    return reply.redirect(result.returnTo ? appReturnUrl(result.returnTo) : done.redirect);
  });

  /** Apple uses form_post; mirror the GET handler. */
  app.post('/oauth/apple/callback', async (request, reply) => {
    const body = z
      .object({
        code: z.string().min(1),
        state: z.string().min(10),
        id_token: z.string().optional(),
        error: z.string().optional(),
      })
      .parse(request.body ?? {});
    if (body.error) return reply.redirect(appReturnUrl('/login?oauth=denied&provider=apple'));
    const result = await completeOAuthCallback({
      provider: 'apple',
      code: body.code,
      state: body.state,
      idToken: body.id_token,
    });
    const existing = await findIdentity('apple', result.profile.providerUserId);
    if (existing) {
      await linkIdentityToUser(existing.userId, result.profile, result.refreshToken);
      const done = await finishOAuthLogin(request, reply, existing.user.id, 'oauth:apple');
      return reply.redirect(done.redirect);
    }
    const user = await createUserFromOAuth(result.profile, result.refreshToken);
    const done = await finishOAuthLogin(request, reply, user.id, 'oauth:apple');
    return reply.redirect(done.redirect);
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
