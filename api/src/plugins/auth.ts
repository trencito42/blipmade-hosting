import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { hasPermission, type Permission } from '../lib/permissions.js';

export const SESSION_COOKIE = 'bm_session';
export const CSRF_COOKIE = 'bm_csrf';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  emailVerified: boolean;
  pterodactylUserId: string | null;
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    sessionId?: string;
  }
}

/** Creates a server-side session and sets the cookies. */
export async function createSession(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: request.ip ?? null,
      userAgent: (request.headers['user-agent'] ?? null) as string | null,
    },
  });

  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/** Ends the current session and clears the cookie. */
export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Resolves the session cookie into a user. Runs on every request, so an
 * expired or revoked session immediately loses access.
 */
export async function loadSession(request: FastifyRequest): Promise<AuthUser | undefined> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return undefined;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { staff: true } },
    },
  });

  if (!session) return undefined;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return undefined;
  }
  if (session.user.suspendedAt) return undefined;

  request.sessionId = session.id;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    emailVerified: Boolean(session.user.emailVerifiedAt),
    pterodactylUserId: session.user.pterodactylUserId,
    permissions: session.user.staff?.permissions ?? [],
  };
}

export async function requireAuth(request: FastifyRequest): Promise<AuthUser> {
  if (!request.user) throw unauthorized();
  return request.user;
}

export async function requireStaff(request: FastifyRequest): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') throw forbidden('Staff access only.');
  return user;
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest): Promise<AuthUser> => {
    const user = await requireStaff(request);
    if (!hasPermission(user.role, user.permissions, permission)) {
      throw forbidden(`Your role does not allow "${permission}".`);
    }
    return user;
  };
}

/** Removes expired sessions. Called by the worker on a schedule. */
export async function pruneSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
