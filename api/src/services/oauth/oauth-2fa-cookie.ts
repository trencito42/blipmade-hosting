import type { FastifyReply, FastifyRequest } from 'fastify';
import { resolveCookieSecure } from '../../plugins/auth.js';

export const OAUTH_2FA_COOKIE = 'bm_oauth_2fa';

const MAX_AGE = 5 * 60;

export function setOAuth2faCookie(request: FastifyRequest, reply: FastifyReply, token: string): void {
  reply.setCookie(OAUTH_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: resolveCookieSecure(request),
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function readOAuth2faCookie(request: FastifyRequest): string | null {
  const value = request.cookies[OAUTH_2FA_COOKIE];
  return typeof value === 'string' && value.length >= 10 && value.length <= 200 ? value : null;
}

export function clearOAuth2faCookie(reply: FastifyReply): void {
  reply.clearCookie(OAUTH_2FA_COOKIE, { path: '/' });
}

export function resolveSecondStepToken(request: FastifyRequest, bodyToken: string | undefined): string | null {
  if (bodyToken && bodyToken.length >= 10) return bodyToken;
  return readOAuth2faCookie(request);
}
