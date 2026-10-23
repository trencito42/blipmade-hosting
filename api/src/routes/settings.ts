import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { hashPassword, passwordProblems, verifyPassword } from '../lib/password.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { audit } from '../lib/audit.js';
import { fullName } from '../lib/people.js';
import { sendMail } from '../lib/mailer.js';
import { emailChangeTemplate } from '../lib/email-templates.js';
import { requireAuth, type AuthUser } from '../plugins/auth.js';

/**
 * The settings of the account of a customer.
 *
 * Every page of the settings reads from here, so the page never shows a value
 * the server does not know and never offers a change the server would refuse.
 *
 * The rules that are the same everywhere:
 *
 * - a change of the address is only used after the new address has answered,
 *   so a mistyped address cannot lock a customer out;
 * - a change of the password needs the current password and closes the other
 *   sessions of the account;
 * - a session can be closed one by one;
 * - the preferences of the notifications are kept with the account and say
 *   what the customer wants, not what has been sent;
 * - the closing of the account is a request, not a deletion: nothing is
 *   removed before a person has looked at it.
 */

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');
const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter this part of your name.')
  .max(80, 'This part of your name is too long.');

const profileSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
});

const preferenceSchema = z.object({
  productUpdates: z.boolean(),
  billing: z.boolean(),
  support: z.boolean(),
  incidents: z.boolean(),
  marketing: z.boolean(),
});

/**
 * Parses a request and turns a failure into an error that names the field
 * that is wrong, so the client can show the problem next to the input.
 */
function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'form';
    fields[field] ??= `${field}: ${issue.message}`;
  }
  const message = Object.values(fields)[0] ?? 'Some fields need attention.';
  throw new AppError(400, 'validation_failed', message, fields);
}

/** How long a link for a change of the address stays valid. */
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

/** The preferences a customer gets when they never chose anything. */
const DEFAULT_PREFERENCES = {
  productUpdates: true,
  billing: true,
  support: true,
  incidents: true,
  marketing: false,
} as const;

function serializePreferences(preferences: {
  productUpdates: boolean;
  billing: boolean;
  support: boolean;
  incidents: boolean;
  marketing: boolean;
  updatedAt: Date;
}) {
  return {
    productUpdates: preferences.productUpdates,
    billing: preferences.billing,
    support: preferences.support,
    incidents: preferences.incidents,
    marketing: preferences.marketing,
    updatedAt: preferences.updatedAt.toISOString(),
  };
}

/** The sessions of the account, newest first. */
function serializeSession(session: {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}, currentId: string | undefined) {
  return {
    id: session.id,
    ip: session.ip,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentId,
  };
}

/** The short name of a browser, so the list of sessions can be read. */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'A browser';
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return system ? `${browser} on ${system}` : browser;
}

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  /** Everything the settings page needs, in one answer. */
  app.get('/settings', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const [account, preferences, sessions, pending] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          emailVerifiedAt: true,
          role: true,
          createdAt: true,
          deletionRequestedAt: true,
        },
      }),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
      prisma.session.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.emailChangeRequest.findFirst({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const services = await prisma.instance.count({
      where: { userId: user.id, status: { notIn: ['CANCELLED'] } },
    });
    const subscriptions = await prisma.subscription.count({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED'] } },
    });

    return {
      profile: {
        firstName: account?.firstName ?? '',
        lastName: account?.lastName ?? '',
        email: account?.email ?? user.email,
        emailVerified: Boolean(account?.emailVerifiedAt),
        role: account?.role ?? user.role,
        createdAt: (account?.createdAt ?? new Date()).toISOString(),
      },
      pendingEmail: pending?.email ?? null,
      pendingEmailExpiresAt: pending?.expiresAt.toISOString() ?? null,
      preferences: serializePreferences(
        preferences ?? { ...DEFAULT_PREFERENCES, updatedAt: new Date() },
      ),
      sessions: sessions.map((session) => ({
        ...serializeSession(session, request.sessionId),
        device: describeAgent(session.userAgent),
      })),
      account: {
        deletionRequestedAt: account?.deletionRequestedAt?.toISOString() ?? null,
        services,
        subscriptions,
      },
    };
  });

  /** The name of the customer. */
  app.patch('/settings/profile', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const body = parse(profileSchema, request.body ?? {});

    await prisma.user.update({
      where: { id: user.id },
      data: { firstName: body.firstName, lastName: body.lastName },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'settings.profile_updated',
      targetType: 'user',
      targetId: user.id,
      ip: request.ip,
    });

    return { firstName: body.firstName, lastName: body.lastName };
  });

  /**
   * A new address for the account.
   *
   * The address of the account does not change here: a link is sent to the
   * new address and the change happens when that link is opened.
   */
  app.post('/settings/email', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest) => {
      const user = await requireAuth(request);
      const body = parse(z.object({ email: emailSchema }), request.body ?? {});
      const email = body.email;

      if (email === user.email.toLowerCase()) {
        throw badRequest('That is already the address of this account.', {
          email: 'This account already uses this address.',
        });
      }
      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) {
        throw conflict('Another account already uses this address.');
      }

      // An older request for the same address is replaced by this one.
      await prisma.emailChangeRequest.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      const token = randomToken(32);
      const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
      await prisma.emailChangeRequest.create({
        data: { userId: user.id, email, tokenHash: hashToken(token), expiresAt },
      });

      const template = emailChangeTemplate(fullName({ firstName: user.firstName, lastName: user.lastName }), token);
      const result = await sendMail({
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
        kind: 'email-change',
        idempotencyKey: `email-change:${user.id}:${hashToken(token).slice(0, 16)}`,
      });

      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'settings.email_change_requested',
        targetType: 'user',
        targetId: user.id,
        ip: request.ip,
      });

      return {
        pendingEmail: email,
        expiresAt: expiresAt.toISOString(),
        // The answer never says that the message was sent when it was not.
        delivery: result.state,
        delivered: result.delivered,
        message: result.delivered
          ? 'A confirmation link is on its way to the new address.'
          : 'The confirmation link could not be sent yet. Contact support and we will finish the change for you.',
      };
    },
  });

  /** The new address is used once the link has been opened. */
  app.post('/settings/email/confirm', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest) => {
      const user = await requireAuth(request);
      const body = parse(z.object({ token: z.string().min(10, 'This link is not valid.') }), request.body ?? {});

      const request_ = await prisma.emailChangeRequest.findUnique({
        where: { tokenHash: hashToken(body.token) },
      });
      if (!request_ || request_.usedAt || request_.expiresAt < new Date()) {
        throw badRequest('This confirmation link is invalid or has expired.');
      }
      if (request_.userId !== user.id) {
        throw new AppError(403, 'forbidden', 'This link belongs to another account.');
      }

      const taken = await prisma.user.findUnique({
        where: { email: request_.email },
        select: { id: true },
      });
      if (taken && taken.id !== user.id) {
        throw conflict('Another account already uses this address.');
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { email: request_.email, emailVerifiedAt: new Date() },
        }),
        prisma.emailChangeRequest.update({
          where: { id: request_.id },
          data: { usedAt: new Date() },
        }),
      ]);
      await audit({
        actorId: user.id,
        actorEmail: request_.email,
        action: 'settings.email_changed',
        targetType: 'user',
        targetId: user.id,
        ip: request.ip,
      });

      return { email: request_.email };
    },
  });

  /** A new password. The current one is needed, and the other sessions end. */
  app.post('/settings/password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest) => {
      const user = await requireAuth(request);
      const body = parse(
        z.object({
          currentPassword: z.string().min(1, 'Enter your current password.'),
          newPassword: z.string().min(1, 'Choose a new password.'),
        }),
        request.body ?? {},
      );

      const account = await prisma.user.findUnique({ where: { id: user.id } });
      if (!account) throw notFound('This account does not exist.');

      const ok = await verifyPassword(body.currentPassword, account.passwordHash);
      if (!ok) {
        throw badRequest('The current password is not correct.', {
          currentPassword: 'The current password is not correct.',
        });
      }
      const problems = passwordProblems(body.newPassword);
      if (problems.length) {
        throw badRequest(problems.join(' '), { newPassword: problems.join(' ') });
      }
      if (await verifyPassword(body.newPassword, account.passwordHash)) {
        throw badRequest('The new password is the same as the current one.', {
          newPassword: 'Choose a password you have not used here.',
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.newPassword) },
      });

      // The other sessions of the account end with the password change. The
      // session of this device stays, so the customer is not signed out of
      // the page they are on.
      const closed = await prisma.session.deleteMany({
        where: { userId: user.id, ...(request.sessionId ? { id: { not: request.sessionId } } : {}) },
      });
      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'settings.password_changed',
        targetType: 'user',
        targetId: user.id,
        ip: request.ip,
      });

      return { changed: true, closedSessions: closed.count };
    },
  });

  /** The sessions of the account. */
  app.get('/settings/sessions', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      sessions: sessions.map((session) => ({
        ...serializeSession(session, request.sessionId),
        device: describeAgent(session.userAgent),
      })),
    };
  });

  /** One session is closed. The current one may be closed too. */
  app.delete('/settings/sessions/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params ?? {});

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.userId !== user.id) {
      throw notFound('This session does not exist.');
    }
    await prisma.session.delete({ where: { id } });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'settings.session_revoked',
      targetType: 'session',
      targetId: id,
      ip: request.ip,
    });

    return { revoked: true, current: session.id === request.sessionId };
  });

  /** What the customer wants to hear about. */
  app.get('/settings/notifications', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const preferences = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    return {
      preferences: serializePreferences(
        preferences ?? { ...DEFAULT_PREFERENCES, updatedAt: new Date() },
      ),
    };
  });

  app.put('/settings/notifications', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const body = parse(preferenceSchema, request.body ?? {});

    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body },
      update: { ...body },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'settings.notifications_updated',
      targetType: 'user',
      targetId: user.id,
      ip: request.ip,
    });

    return { preferences: serializePreferences(preferences) };
  });

  /**
   * The closing of the account.
   *
   * This is a request and not a deletion. The services and the subscriptions
   * of the customer are not touched by the request, and nothing is removed
   * before a person of the team has looked at it.
   */
  app.post('/settings/account/closure', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request: FastifyRequest) => {
      const user = await requireAuth(request);
      const body = parse(
        z.object({
          password: z.string().min(1, 'Enter your password.'),
          confirmation: z.literal('CLOSE MY ACCOUNT', {
            errorMap: () => ({ message: 'Type CLOSE MY ACCOUNT to confirm.' }),
          }),
        }),
        request.body ?? {},
      );

      const account = await prisma.user.findUnique({ where: { id: user.id } });
      if (!account) throw notFound('This account does not exist.');
      const ok = await verifyPassword(body.password, account.passwordHash);
      if (!ok) {
        throw badRequest('The password is not correct.', { password: 'The password is not correct.' });
      }

      const requestedAt = new Date();
      await prisma.user.update({
        where: { id: user.id },
        data: { deletionRequestedAt: requestedAt },
      });
      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'settings.account_closure_requested',
        targetType: 'user',
        targetId: user.id,
        ip: request.ip,
      });

      const services = await prisma.instance.count({
        where: { userId: user.id, status: { notIn: ['CANCELLED'] } },
      });
      const subscriptions = await prisma.subscription.count({
        where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED'] } },
      });

      return {
        requestedAt: requestedAt.toISOString(),
        services,
        subscriptions,
        message:
          'The request is recorded. Your services keep running until the end of the period you paid for, and the team will write to you before anything is closed.',
      };
    },
  });

  /** The request can be taken back. */
  app.delete('/settings/account/closure', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    await prisma.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: null },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'settings.account_closure_cancelled',
      targetType: 'user',
      targetId: user.id,
      ip: request.ip,
    });
    return { requestedAt: null };
  });
}
