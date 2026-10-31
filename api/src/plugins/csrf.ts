import type { FastifyReply, FastifyRequest } from 'fastify';
import { CSRF_COOKIE, resolveCookieSecure } from './auth.js';
import { safeEqual } from '../lib/password.js';
import { randomToken } from '../lib/tokens.js';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Endpoints that act only on credentials carried in the request body, so no
 * ambient authority is abused and a CSRF token would add nothing.
 */
const EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/enroll-admin',
]);

/**
 * Double-submit CSRF protection. The browser reads the `bm_csrf` cookie and
 * echoes it in the `X-CSRF-Token` header; a cross-site request can send the
 * cookie but cannot read it to build the header.
 */
export function csrfGuard(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  if (request.url.split('?')[0]!.startsWith('/api/webhooks/')) return;
  if (EXEMPT_PATHS.has(request.url.split('?')[0]!)) return;
  // A request with an API key and no session cookie carries no ambient authority: a page of another
  // site cannot make the browser send the key, so a CSRF token would add nothing.
  if (typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer bmk_') && !request.cookies['bm_session']) return;

  const cookie = request.cookies[CSRF_COOKIE];
  const header = request.headers['x-csrf-token'];

  if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
    throw forbidden('Invalid or missing CSRF token. Reload the page and try again.');
  }
}

/** Issues the CSRF cookie when it is missing so the client can echo it. */
export function ensureCsrfCookie(request: FastifyRequest, reply: FastifyReply): void {
  if (request.cookies[CSRF_COOKIE]) return;
  reply.setCookie(CSRF_COOKIE, randomToken(24), {
    httpOnly: false,
    sameSite: 'lax',
    // The flag follows the protocol of the request, so the cookie is also sent
    // back by a staging environment that is served over plain HTTP.
    secure: resolveCookieSecure(request),
    path: '/',
    maxAge: 60 * 60 * 24,
  });
}
