import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, conflict, notFound, tooMany, unauthorized } from '../lib/errors.js';
import { hashPassword, passwordProblems, verifyPassword } from '../lib/password.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { rateLimitRun } from '../lib/rate-limit.js';
import { clearFailedAttempts, isBlocked, recordFailedAttempt } from '../lib/failed-attempts.js';
import { mailEnabled, mailLogLine, mailNotice, registrationNotice, tokenReference, type MailSendResult } from '../lib/mailer.js';
import { passwordResetTemplate, verificationTemplate } from '../lib/email-templates.js';
import { dispatchEmail } from '../services/queue.js';
import { audit } from '../lib/audit.js';
import { fullName } from '../lib/people.js';
import {
  createSession,
  destroySession,
  loadSession,
  pruneSessions,
  rateLimitKey,
  requireAuth,
  type AuthUser,
} from '../plugins/auth.js';

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');
const passwordSchema = z.string().min(1, 'Enter your password.');

/**
 * The name of a customer is required in two parts.
 *
 * The panel account of a customer carries the same two parts, so the name of
 * the customer has to exist before the account is created. A single free text
 * field would have to be split again, and the split would guess.
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter this part of your name.')
  .max(80, 'This part of your name is too long.');

const registerSchema = z.object({
  email: emailSchema,
  password: z.string(),
  firstName: nameSchema,
  lastName: nameSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const tokenSchema = z.object({ token: z.string().min(10, 'This link is not valid.') });

/**
 * The window of the limit of the attempts on one account.
 *
 * The limit of the address protects the server; the limit of the account
 * protects the account. Ten attempts on an account count as ten attempts,
 * even when they come from ten different addresses, so an account cannot be
 * guessed from everywhere at once.
 */
const ACCOUNT_ATTEMPTS_WINDOW = '15 minutes';

/** The same window, in milliseconds, for the counters of the failed attempts. */
const ACCOUNT_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

/**
 * The number of sign-in requests one address may send in the window.
 *
 * The limit of the failed attempts is the one that protects the account and
 * the server. This one counts the requests, so the server is protected from a
 * flood of attempts that come from one address, and it is generous enough
 * that a customer who signs in several times in a row is never refused.
 */
const LOGIN_REQUESTS_MAX = 30;

/**
 * The key of the counter of an address, without the number of the test run.
 *
 * The address of the caller is the key, and the address of the client is
 * only known when the request came through a proxy that the API trusts. When
 * it is not known, the counter is taken per connection, so one visitor can
 * never lock every other visitor out of the sign-in.
 */
function rawAddressKey(request: FastifyRequest): string {
  return rateLimitKey(request);
}

/**
 * The key of the counter of an account, without the number of the test run.
 *
 * The address of the account is the key, written the way the accounts are
 * written.
 *
 * A request without a readable address falls back on the address of the
 * caller, so two requests that cannot be read never share a counter.
 */
function rawAccountKey(request: FastifyRequest): string {
  const body = request.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  return email ? `account:${email}` : `address:${rawAddressKey(request)}`;
}

/**
 * The key of the counter of an address.
 */
function addressKey(request: FastifyRequest): string {
  const key = rawAddressKey(request);
  // In the test environment the key carries the run number, so the counters
  // of one test do not count against the next one.
  return env.isTest ? `${key}:${rateLimitRun()}` : key;
}

/**
 * The key of the counter of an account: the address of the account, written
 * the way the accounts are written.
 */
function accountKey(request: FastifyRequest): string {
  const key = rawAccountKey(request);
  // In the test environment the key carries the run number, so the counters
  // of one test do not count against the next one.
  return env.isTest ? `${key}:${rateLimitRun()}` : key;
}

/**
 * The guard of the attempts on one account.
 *
 * The counter of the account is a counter of its own: it shares nothing with
 * the counter of the address, so the two limits are two limits and a breach
 * of either one is refused with the same answer as the other.
 */
function accountGuard(app: FastifyInstance, max: number) {
  const limiter = app.createRateLimit({
    max,
    timeWindow: ACCOUNT_ATTEMPTS_WINDOW,
    keyGenerator: accountKey,
  });

  return async (request: FastifyRequest) => {
    const result = await limiter(request);
    if (result.isAllowed) return;
    if (!result.isExceeded) return;
    throw tooMany();
  };
}

/**
 * The guard of the sign-in.
 *
 * The counters of the account and of the address count the attempts that
 * failed. A sign-in that worked does not count, so a customer who signs in
 * several times in a row is never locked out of their own account, and a
 * guess of a password is still counted.
 *
 * The guard is read before the attempt, so a blocked key is refused without
 * the cost of the comparison of the password.
 */
function loginGuardForAttempts(max: number) {
  return async (request: FastifyRequest) => {
    if (isBlocked(rawAccountKey(request), max)) throw tooMany();
    if (isBlocked(rawAddressKey(request), max)) throw tooMany();
  };
}

/** The shape returned to the browser. Never includes password material. */
export function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerifiedAt: Date | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: fullName(user),
    role: user.role as AuthUser['role'],
    emailVerified: Boolean(user.emailVerifiedAt),
    pterodactylUserId: null,
    permissions: [],
  };
}

async function issueToken(userId: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET', ttlHours: number): Promise<string> {
  const token = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      tokenHash: hashToken(token),
      type,
      userId,
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
    },
  });
  return token;
}

/**
 * Sends the confirmation of an address.
 *
 * The token lives in the message and in the database, where it is stored
 * hashed. It is never written to a log line, to a file name or to the name of
 * a job, so the only reference to it is the short hash.
 */
export async function sendVerificationEmail(userId: string, email: string, name: string): Promise<MailSendResult> {
  const token = await issueToken(userId, 'EMAIL_VERIFY', 24);
  const template = verificationTemplate(name, token);
  const result = await dispatchEmail({
    key: `verification-${tokenReference(token)}`,
    kind: 'verification',
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
  console.info(mailLogLine('verification', result, email, token));
  return result;
}

/**
 * Sends the link that opens the page where a new password is chosen.
 *
 * The token is treated like the token of the confirmation: it never reaches a
 * log line or a file.
 */
export async function sendResetEmail(userId: string, email: string, name: string): Promise<MailSendResult> {
  const token = await issueToken(userId, 'PASSWORD_RESET', 1);
  const template = passwordResetTemplate(name, token);
  const result = await dispatchEmail({
    key: `reset-${tokenReference(token)}`,
    kind: 'reset',
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
  console.info(mailLogLine('reset', result, email, token));
  return result;
}

/**
 * Records that a reset message did not leave the system.
 *
 * The customer is never told: the answer of the reset flow is the same for
 * every address, so it can never be used to find out whether an account
 * exists. The operator reads what happened in the table of the deliveries and
 * in the report of the mail of the admin area.
 *
 * A message that waits on the queue has not been sent yet: the worker writes
 * what really happened in the table of the deliveries, so nothing is written
 * here for it.
 */
async function noteResetDelivery(
  user: { id: string; email: string },
  result: MailSendResult,
  ip: string | undefined,
): Promise<void> {
  if (result.delivered) return;
  if (result.state === 'queued') return;
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'auth.reset_not_delivered',
    targetType: 'user',
    targetId: user.id,
    meta: { state: result.state, transport: result.transport, errorClass: result.errorClass },
    ip,
  });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // The counters of the accounts. Every one of them is a counter of its own,
  // so the limit of the address and the limit of the account are two limits.
  // The sign-in counts the attempts that failed, so a customer who signs in
  // several times in a row is never locked out of their own account.
  const loginGuard = loginGuardForAttempts(env.loginRateLimitMax);
  const registerGuard = accountGuard(app, 10);
  const mailGuard = accountGuard(app, 5);
  const enrollGuard = accountGuard(app, 5);

  app.post('/auth/register', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes', keyGenerator: addressKey } },
    preHandler: registerGuard,
    handler: async (request: FastifyRequest, reply) => {
      const body = registerSchema.parse(request.body);
      const problems = passwordProblems(body.password);
      if (problems.length) {
        throw badRequest(problems.join(' '), { password: problems.join(' ') });
      }

      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) throw conflict('An account already uses this email address.');

      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: {
          email: body.email,
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          role: 'CUSTOMER',
        },
      });

      await createSession(request, reply, user.id, user.email);
      const mail = await sendVerificationEmail(user.id, user.email, fullName(user));
      await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.register', targetType: 'user', targetId: user.id, ip: request.ip });

      return reply.code(201).send({
        user: publicUser(user),
        // The account exists, so the state of the message can be shown.
        mail: { state: mail.state, message: registrationNotice() },
      });
    },
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: LOGIN_REQUESTS_MAX, timeWindow: '15 minutes', keyGenerator: addressKey } },
    preHandler: loginGuard,
    handler: async (request: FastifyRequest, reply) => {
      const body = loginSchema.parse(request.body);
      const user = await prisma.user.findUnique({ where: { email: body.email }, include: { staff: true } });

      // Always run a hash comparison so a missing account and a wrong password
      // take the same time.
      const stored = user?.passwordHash ?? 'scrypt$16384$8$1$AAAA$AAAA';
      const ok = await verifyPassword(body.password, stored);

      if (!user || !ok) {
        // The attempt that failed is counted on the account and on the
        // address, so a guess of a password is counted from everywhere at
        // once and never lets a caller try again without a pause.
        recordFailedAttempt(rawAccountKey(request), ACCOUNT_ATTEMPTS_WINDOW_MS);
        recordFailedAttempt(rawAddressKey(request), ACCOUNT_ATTEMPTS_WINDOW_MS);
        await audit({ actorEmail: body.email, action: 'auth.login_failed', ip: request.ip });
        throw unauthorized('Email or password is not correct.');
      }
      if (user.suspendedAt) throw unauthorized('This account is suspended.');

      // The sign-in that worked forgets the attempts that failed on this
      // account: a customer who mistyped the password and then signed in
      // correctly is not a customer under suspicion.
      clearFailedAttempts(rawAccountKey(request));

      await createSession(request, reply, user.id, user.email);
      await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.login', targetType: 'user', targetId: user.id, ip: request.ip });

      // The answer of the sign-in carries the permissions of the account, so
      // the interface is right from the first frame and not only after the
      // session is read again.
      return { user: { ...publicUser(user), permissions: user.staff?.permissions ?? [] } };
    },
  });

  app.post('/auth/logout', async (request: FastifyRequest, reply) => {
    if (request.user) {
      await audit({ actorId: request.user.id, actorEmail: request.user.email, action: 'auth.logout', ip: request.ip });
    }
    await destroySession(request, reply);
    return reply.code(204).send();
  });

  app.get('/auth/session', async (request: FastifyRequest) => {
    if (!request.user) return { user: null };
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { staff: true },
    });
    if (!user) return { user: null };
    return {
      user: {
        ...publicUser(user),
        permissions: user.staff?.permissions ?? [],
      },
    };
  });

  app.post('/auth/verify-email', async (request: FastifyRequest, reply) => {
    const { token } = tokenSchema.parse(request.body);
    const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.type !== 'EMAIL_VERIFY' || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest('This confirmation link is invalid or has expired.');
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    await audit({ actorId: record.userId, action: 'auth.email_verified', targetType: 'user', targetId: record.userId, ip: request.ip });
    return reply.code(204).send();
  });

  app.post('/auth/resend-verification', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: addressKey } },
    preHandler: mailGuard,
    handler: async (request: FastifyRequest, reply) => {
      const { email } = z.object({ email: emailSchema }).parse(request.body ?? {});
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerifiedAt) {
        await sendVerificationEmail(user.id, user.email, fullName(user));
      }
      // Always the same answer, so this cannot be used to test for accounts.
      // The message says what really happened with the delivery.
      return reply.code(200).send({
        message: mailNotice('verification'),
        mail: { configured: mailEnabled() },
      });
    },
  });

  app.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: addressKey } },
    preHandler: mailGuard,
    handler: async (request: FastifyRequest, reply) => {
      const { email } = z.object({ email: emailSchema }).parse(request.body);
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.suspendedAt) {
        const result = await sendResetEmail(user.id, user.email, fullName(user));
        await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.reset_requested', ip: request.ip });
        // What happened to the message is written down for the operator. The
        // answer below is the same for every address, so it never says that a
        // message was sent when it was not, and it never says whether an
        // account exists.
        await noteResetDelivery(user, result, request.ip);
      }
      // Always the same answer, so this cannot be used to test for accounts.
      // The message says what really happened with the delivery.
      return reply.code(200).send({
        message: mailNotice('reset'),
        mail: { configured: mailEnabled() },
      });
    },
  });

  app.post('/auth/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: addressKey } },
    handler: async (request: FastifyRequest, reply) => {
      const body = z.object({ token: z.string().min(10), password: z.string() }).parse(request.body);
      const problems = passwordProblems(body.password);
      if (problems.length) throw badRequest(problems.join(' '), { password: problems.join(' ') });

      const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
      if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
        throw badRequest('This reset link is invalid or has expired.');
      }

      const passwordHash = await hashPassword(body.password);
      await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
        prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
        // Changing a password ends every existing session.
        prisma.session.deleteMany({ where: { userId: record.userId } }),
      ]);
      await audit({ actorId: record.userId, action: 'auth.password_reset', targetType: 'user', targetId: record.userId, ip: request.ip });
      return reply.code(204).send();
    },
  });

  /**
   * Initial administrator enrollment. Only works while the platform has no
   * administrator, and only with the enrollment key from the environment.
   */
  app.post('/auth/enroll-admin', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: addressKey } },
    preHandler: enrollGuard,
    handler: async (request: FastifyRequest, reply) => {
      if (!env.ADMIN_ENROLLMENT_KEY) {
        throw badRequest('Administrator enrollment is not configured on this environment.');
      }
      const body = z
        .object({
          email: emailSchema,
          password: z.string(),
          enrollmentKey: z.string(),
          firstName: nameSchema,
          lastName: nameSchema,
        })
        .parse(request.body);

      if (body.enrollmentKey !== env.ADMIN_ENROLLMENT_KEY) {
        throw unauthorized('The enrollment key is not correct.');
      }

      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount > 0) throw conflict('This platform already has an administrator.');

      const problems = passwordProblems(body.password);
      if (problems.length) throw badRequest(problems.join(' '), { password: problems.join(' ') });

      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) throw conflict('An account already uses this email address.');

      const passwordHash = await hashPassword(body.password);
      const user = await prisma.user.create({
        data: {
          email: body.email,
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          role: 'ADMIN',
        },
      });
      await prisma.staffMember.create({ data: { userId: user.id, permissions: [] } });
      await createSession(request, reply, user.id, user.email);
      await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.admin_enrolled', targetType: 'user', targetId: user.id, ip: request.ip });

      return { user: publicUser(user) };
    },
  });

  /** Used by the worker to clear expired sessions. */
  app.post('/internal/prune-sessions', async (request: FastifyRequest) => {
    const token = request.headers.authorization?.replace(/^Bearer /i, '');
    if (!env.internalToken || token !== env.internalToken) throw unauthorized();
    return { pruned: await pruneSessions() };
  });

  /** Session probe used by the tests and the health check. */
  app.get('/internal/whoami', async (request: FastifyRequest) => {
    const user = await loadSession(request);
    return { user: user ?? null };
  });

  app.get('/auth/require', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    return { user };
  });

  app.get('/internal/not-a-real-route', async () => {
    throw notFound('This route does not exist.');
  });
}
