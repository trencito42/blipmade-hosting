import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { suspendedAccountError } from '../../lib/suspension.js';
import { createSession } from '../../plugins/auth.js';
import { recordSignIn } from '../account-security.js';
import { addMemberWithOAuthAccess } from '../discord/community.js';
import { startSecondStep, twoFactorEnabled } from '../second-factor.js';
import { createUserFromOAuth, findIdentity, linkIdentityToUser } from './identity.js';
import { completeOAuthCallback } from './flow.js';
import { clearOAuth2faCookie, setOAuth2faCookie } from './oauth-2fa-cookie.js';
import { resolveWebAppUrl } from './providers.js';
import type { OAuthProviderId } from './types.js';

function appReturnUrl(pathOrUrl: string): string {
  return resolveWebAppUrl(pathOrUrl);
}

async function finishOAuthLogin(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  via: string,
): Promise<{ redirect: string; needs2fa: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { staff: true } });
  if (!user) throw unauthorized('Account not found.');
  if (user.suspendedAt) throw suspendedAccountError();
  if (await twoFactorEnabled(user.id)) {
    const step = await startSecondStep(user.id);
    setOAuth2faCookie(request, reply, step.token);
    return { redirect: appReturnUrl('/login?oauth=2fa'), needs2fa: true };
  }
  await createSession(request, reply, user.id, user.email);
  await recordSignIn(request, user, via);
  await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.login', targetType: 'user', targetId: user.id, meta: { via }, ip: request.ip });
  return { redirect: appReturnUrl('/app'), needs2fa: false };
}

export async function handleOAuthCallback(
  request: FastifyRequest,
  reply: FastifyReply,
  provider: OAuthProviderId,
  input: { code: string; state: string; idToken?: string },
): Promise<void> {
  const result = await completeOAuthCallback({ provider, code: input.code, state: input.state, idToken: input.idToken });
  const via = `oauth:${provider}`;

  if (result.intent === 'discord_guild_join') {
    if (!result.userId) throw badRequest('Join session expired. Try again from Settings.');
    await linkIdentityToUser(result.userId, result.profile, result.refreshToken);
    await addMemberWithOAuthAccess(result.userId, result.accessToken);
    await audit({ actorId: result.userId, action: 'discord.community_join', ip: request.ip });
    return reply.redirect(appReturnUrl(result.returnTo ?? '/app/settings/connections?discord_join=1'));
  }

  if (result.intent === 'link') {
    if (!result.userId) throw badRequest('Link session expired. Try again from Settings.');
    const collision = await findIdentity(result.profile.provider, result.profile.providerUserId);
    if (collision && collision.userId !== result.userId) {
      return reply.redirect(appReturnUrl('/app/settings/connections?error=linked_elsewhere'));
    }
    await linkIdentityToUser(result.userId, result.profile, result.refreshToken);
    await audit({ actorId: result.userId, action: 'oauth.link', targetType: 'connected_identity', meta: { provider }, ip: request.ip });
    return reply.redirect(appReturnUrl(result.returnTo ?? '/app/settings/connections?linked=1'));
  }

  const existing = await findIdentity(result.profile.provider, result.profile.providerUserId);
  if (existing) {
    await linkIdentityToUser(existing.userId, result.profile, result.refreshToken);
    const done = await finishOAuthLogin(request, reply, existing.userId, via);
    if (done.needs2fa) return reply.redirect(done.redirect);
    return reply.redirect(result.returnTo ? appReturnUrl(result.returnTo) : done.redirect);
  }

  if (result.profile.email) {
    const { emailIdentity } = await import('../../lib/email-identity.js');
    const identity = emailIdentity(result.profile.email);
    const emailUser = await prisma.user.findFirst({
      where: { OR: [{ email: result.profile.email }, { emailIdentity: identity }] },
      select: { id: true, email: true },
    });
    if (emailUser) {
      return reply.redirect(appReturnUrl(`/login?oauth=link_required&provider=${provider}`));
    }
  }

  const user = await createUserFromOAuth(result.profile, result.refreshToken);
  await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.register', targetType: 'user', targetId: user.id, meta: { via }, ip: request.ip });
  const done = await finishOAuthLogin(request, reply, user.id, via);
  if (done.needs2fa) return reply.redirect(done.redirect);
  return reply.redirect(result.returnTo ? appReturnUrl(result.returnTo) : done.redirect);
}
