import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { hashPassword, passwordProblems, verifyPassword } from '../lib/password.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { sendMail } from '../lib/mailer.js';
import { audit } from '../lib/audit.js';
import { fullName } from '../lib/people.js';
import {
  createSession,
  destroySession,
  loadSession,
  pruneSessions,
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

export async function sendVerificationEmail(userId: string, email: string, name: string): Promise<void> {
  const token = await issueToken(userId, 'EMAIL_VERIFY', 24);
  const url = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  const result = await sendMail({
    to: email,
    subject: 'Confirm your Blipmade email address',
    text: `Hi${name ? ` ${name}` : ''},\n\nConfirm your email address to activate your Blipmade account:\n${url}\n\nThe link expires in 24 hours. If you did not create this account, ignore this message.`,
  });
  if (!result.delivered) {
    // Without SMTP the message was written to disk; log the link so an operator
    // can complete the flow manually.
    console.info(`[mail:file] verification link for ${email}: ${url}`);
  }
}

export async function sendResetEmail(userId: string, email: string, name: string): Promise<void> {
  const token = await issueToken(userId, 'PASSWORD_RESET', 1);
  const url = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const result = await sendMail({
    to: email,
    subject: 'Reset your Blipmade password',
    text: `Hi${name ? ` ${name}` : ''},\n\nUse this link to choose a new Blipmade password:\n${url}\n\nThe link expires in 1 hour. If you did not ask for it, nothing changed and you can ignore this message.`,
  });
  if (!result.delivered) {
    console.info(`[mail:file] reset link for ${email}: ${url}`);
  }
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
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

      await createSession(request, reply, user.id);
      await sendVerificationEmail(user.id, user.email, fullName(user));
      await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.register', targetType: 'user', targetId: user.id, ip: request.ip });

      return reply.code(201).send({ user: publicUser(user) });
    },
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest, reply) => {
      const body = loginSchema.parse(request.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });

      // Always run a hash comparison so a missing account and a wrong password
      // take the same time.
      const stored = user?.passwordHash ?? 'scrypt$16384$8$1$AAAA$AAAA';
      const ok = await verifyPassword(body.password, stored);

      if (!user || !ok) {
        await audit({ actorEmail: body.email, action: 'auth.login_failed', ip: request.ip });
        throw unauthorized('Email or password is not correct.');
      }
      if (user.suspendedAt) throw unauthorized('This account is suspended.');

      await createSession(request, reply, user.id);
      await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.login', targetType: 'user', targetId: user.id, ip: request.ip });

      return { user: publicUser(user) };
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
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest, reply) => {
      const { email } = z.object({ email: emailSchema }).parse(request.body ?? {});
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerifiedAt) {
        await sendVerificationEmail(user.id, user.email, fullName(user));
      }
      // Always the same answer, so this cannot be used to test for accounts.
      return reply.code(204).send();
    },
  });

  app.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest, reply) => {
      const { email } = z.object({ email: emailSchema }).parse(request.body);
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.suspendedAt) {
        await sendResetEmail(user.id, user.email, fullName(user));
        await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.reset_requested', ip: request.ip });
      }
      // Always the same answer, so this cannot be used to test for accounts.
      return reply.code(204).send();
    },
  });

  app.post('/auth/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
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
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
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
      await createSession(request, reply, user.id);
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
