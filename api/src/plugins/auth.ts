import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { rateLimitRun } from '../lib/rate-limit.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { suspendedAccountError } from '../lib/suspension.js';
import { hasPermission, type Permission } from '../lib/permissions.js';
import { fullName } from '../lib/people.js';
import { audit } from '../lib/audit.js';

export const SESSION_COOKIE = 'bm_session';
export const CSRF_COOKIE = 'bm_csrf';
/** Holds the session of the staff member while they act as a customer. */
export const RETURN_COOKIE = 'bm_return';
export const IMPERSONATION_TTL_MS = 1000 * 60 * 60;

/** What a member of the staff cannot do while they act as a customer: the keys of the account. */
const IMPERSONATION_BLOCKED = [/^\/(api\/)?settings\/(email|password|sessions|account\/closure|2fa|passkeys)/, /^\/(api\/)?billing\/payment-method/];
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export interface AuthUser {
  id: string;
  email: string;
  /** The two parts of the name of the customer. Both are always present. */
  firstName: string;
  lastName: string;
  /** The two parts as one line, for the screens that show a single name. */
  name: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  emailVerified: boolean;
  pterodactylUserId: string | null;
  permissions: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    sessionId?: string;
    /**
     * The session exists but the account was suspended.
     *
     * The flag is what lets the answer of the platform say "the account is
     * suspended" instead of "the session is gone". The two are told apart
     * for the customer, who has to know why they were disconnected.
     */
    accountSuspended?: boolean;
    /** The email of the staff member who opened this session to act as the customer. */
    impersonatedBy?: string;
  }
}

/**
 * Whether the session cookie is marked Secure.
 *
 * `COOKIE_SECURE` is the override of the operator: "true" always marks the
 * cookie Secure, "false" never does. When it is not set, the attribute
 * follows the protocol of the request that carries the cookie, so an operator
 * who works on the panel over plain HTTP still gets a cookie the browser sends
 * back, while a request that really came in over HTTPS always gets a Secure
 * cookie.
 *
 * The protocol is the one Fastify resolves for the request. `request.protocol`
 * only takes `x-forwarded-proto` into account when the request came through
 * one of the trusted proxies (`env.trustProxies`), so a client cannot forge
 * the header to force a Secure cookie on a plain HTTP request.
 *
 * A production environment is served over HTTPS, so the cookie is marked
 * Secure there even when the request that carries it arrived over plain
 * HTTP. That happens when the proxy in front of the API is not in the list of
 * the trusted proxies: the request is then read as plain HTTP even though the
 * visitor is on HTTPS. A request must never quietly lower the protection of
 * the cookie, so the production environment marks it Secure and an operator
 * that really serves the panel over plain HTTP says `COOKIE_SECURE=false`.
 */
export function resolveCookieSecure(request: FastifyRequest): boolean {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  if (env.isProduction) return true;
  return request.protocol === 'https';
}

/**
 * The key the rate limit counts by.
 *
 * The address of the caller is the key. Fastify resolves that address out of
 * the chain of the forwarding header, but only when the request came through
 * a proxy the API knows. When the request comes from a proxy that is not
 * trusted, the resolved address is the address of that proxy and every
 * visitor shares it, so one counter would be the counter of the whole
 * platform and one visitor could lock every other visitor out of the sign-in.
 *
 * The counter is then taken per connection, which is the smallest unit that
 * can be told apart when the address of the client is not known. The limit of
 * the account is a counter of its own and is not weakened by this: it is the
 * limit that protects an account from a guessing of the password.
 *
 * A request that carries no chain of the forwarding header comes from a
 * client that speaks for itself, and it keeps the counter of its address.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const peer = request.socket?.remoteAddress ?? '';
  const address = request.ip;
  // The address of the client was resolved out of the chain, so it is known.
  if (address && address !== peer) return address;

  const forwarded = request.headers['x-forwarded-for'];
  const chain = typeof forwarded === 'string' ? forwarded.split(',').map((entry) => entry.trim()).filter(Boolean) : [];
  if (!chain.length) return address;

  // The request came through a proxy that the API does not know, so the
  // address of the client cannot be told apart from the address of the proxy.
  return `${address}:${request.socket?.remotePort ?? 0}`;
}

/**
 * The key the counters of the addresses are kept under.
 *
 * The counter of an address is the counter of the client when the address is
 * known, and the counter of the connection when it is not. Either way the
 * counter belongs to one visitor and never to the whole platform, so a limit
 * can no longer lock every visitor out of a page or of the sign-in.
 *
 * In the test environment the key carries the number of the run, so the
 * counters of one test do not count against the next one.
 */
export function addressRateLimitKey(request: FastifyRequest): string {
  const key = rateLimitKey(request);
  return env.isTest ? `${key}:${rateLimitRun()}` : key;
}

/**
 * How many sessions an account may hold at the same time.
 *
 * Every sign-in opens a session, and the old ones are not closed by themselves
 * until they expire. Without a limit the list of the sessions grows without
 * end and the customer sees a wall of entries that look the same. The oldest
 * sessions are closed when the limit is passed.
 */
const MAX_SESSIONS_PER_USER = 20;

/**
 * How often the moment of the last use of a session is written.
 *
 * The write happens once every five minutes for every session, so the column
 * can say when a session was last used without a write on every request.
 */
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Opens the session of an account.
 *
 * When the request already carries a session of the same account, that
 * session is rotated: the row stays, the token and the term are new. The
 * session is found by its token and never by the address or by the browser,
 * because two devices can share an address and a browser.
 */
async function openSession(
  request: FastifyRequest,
  userId: string,
  session: { token: string; expiresAt: Date; ip: string | null; userAgent: string | null },
): Promise<string> {
  const carried = request.cookies?.[SESSION_COOKIE];
  const existing = carried
    ? await prisma.session.findUnique({ where: { tokenHash: hashToken(carried) } })
    : null;

  if (existing && existing.userId === userId && existing.expiresAt.getTime() > Date.now()) {
    await prisma.session.update({
      where: { id: existing.id },
      data: {
        tokenHash: hashToken(session.token),
        expiresAt: session.expiresAt,
        ip: session.ip,
        userAgent: session.userAgent,
        lastSeenAt: new Date(),
      },
    });
    return existing.id;
  }

  const created = await prisma.session.create({
    data: {
      tokenHash: hashToken(session.token),
      userId,
      expiresAt: session.expiresAt,
      ip: session.ip,
      userAgent: session.userAgent,
    },
  });
  return created.id;
}

/**
 * Closes the sessions that are over the cap.
 *
 * Only the sessions that have not expired are counted, so a session that is
 * already dead does not take the place of a live one. The session of the
 * request that is running is never closed: the sign-in that just happened
 * would sign the customer out.
 *
 * Every session that is closed here is written to the journal, because the
 * customer has to be able to read why a session of their account ended.
 */
async function closeSessionsOverTheCap(
  request: FastifyRequest,
  userId: string,
  currentSessionId: string,
  actorEmail: string | null,
): Promise<void> {
  const live = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  // The session of this request takes one of the places of the cap.
  const others = live.filter((session) => session.id !== currentSessionId);
  const closed = others.slice(Math.max(MAX_SESSIONS_PER_USER - 1, 0));

  if (!closed.length) return;

  await prisma.session.deleteMany({ where: { id: { in: closed.map((session) => session.id) } } });

  for (const session of closed) {
    await audit({
      actorId: userId,
      actorEmail,
      action: 'settings.session_revoked',
      targetType: 'session',
      targetId: session.id,
      meta: { reason: 'session_cap' },
      ip: request.ip,
    });
  }
}

/** Creates a server-side session and sets the cookies. */
export async function createSession(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  actorEmail: string | null = null,
): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const sessionId = await openSession(request, userId, {
    token,
    expiresAt,
    ip: request.ip ?? null,
    userAgent: (request.headers['user-agent'] ?? null) as string | null,
  });

  // The account keeps a bounded number of sessions: the oldest ones are
  // closed, so the list of the sessions stays readable and the table cannot
  // grow without end.
  await closeSessionsOverTheCap(request, userId, sessionId, actorEmail);

  request.sessionId = sessionId;

  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // The attribute follows the protocol of the request, so the cookie is
    // usable over plain HTTP and protected over HTTPS.
    secure: resolveCookieSecure(request),
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
  // The path has to be the one the cookie was set with, or the browser keeps
  // the cookie it is asked to clear.
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
  if (session.user.suspendedAt) {
    // The session exists and the account is suspended. The request carries
    // the fact, so the answer can say what happened.
    request.accountSuspended = true;
    return undefined;
  }

  request.sessionId = session.id;
  if (session.impersonatedById) request.impersonatedBy = session.impersonatedByEmail ?? 'staff';

  /**
   * The moment of the last use is written at most once every five minutes
   * for every session. The row is already read here, so the write costs
   * nothing on the requests that do not cross the interval.
   */
  const now = Date.now();
  if (!session.lastSeenAt || session.lastSeenAt.getTime() <= now - LAST_SEEN_WRITE_INTERVAL_MS) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    name: fullName(session.user),
    role: session.user.role,
    emailVerified: Boolean(session.user.emailVerifiedAt),
    pterodactylUserId: session.user.pterodactylUserId,
    permissions: session.user.staff?.permissions ?? [],
  };
}

export async function requireAuth(request: FastifyRequest): Promise<AuthUser> {
  if (request.impersonatedBy && request.method !== 'GET' && IMPERSONATION_BLOCKED.some((pattern) => pattern.test(request.url))) {
    throw forbidden('This is not allowed while you act as the customer.');
  }
  if (!request.user) {
    // The account was suspended while the page was open. The customer is
    // told what happened, and not that the session simply ended.
    if (request.accountSuspended) throw suspendedAccountError();
    throw unauthorized();
  }
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

/**
 * The rule that the accounts of the platform are only acted on by an
 * administrator.
 *
 * The account that administers the platform may only be suspended, be given
 * a new panel key or have its services touched by another administrator, and
 * the same goes for the account of a member of the staff: a member of the
 * staff that could suspend another member of the staff could lock the
 * platform out of its own administration. The rule lives in the server and
 * not in the interface.
 *
 * The rule is about one account that the request names, so it is checked on
 * the routes that write to the account of a customer. A sweep over the whole
 * platform is not about one account and is not covered by it.
 *
 * A person may act on their own account. The rule protects the platform from
 * a member of the staff that acts on the account of another member of the
 * staff; it does not stop a person from refunding their own order or from
 * changing their own address.
 */
export function assertMayActOnAccount(
  actor: AuthUser,
  targetRole: string,
  targetUserId?: string | null,
): void {
  if (actor.role === 'ADMIN') return;
  // The account of the caller is their own: they may act on it.
  if (targetUserId && targetUserId === actor.id) return;
  if (targetRole === 'ADMIN') {
    throw forbidden('Only an administrator can act on the account of an administrator.');
  }
  if (targetRole === 'STAFF') {
    throw forbidden('Only an administrator can act on the account of a member of the staff.');
  }
}

/** Removes expired sessions. Called by the worker on a schedule. */
export async function pruneSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
