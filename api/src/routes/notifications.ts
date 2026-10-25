import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { requireAuth, addressRateLimitKey } from '../plugins/auth.js';
import { decodeCursor, pageOf } from '../lib/perf-data-pagination.js';
import { defaultPreferences, preferencesOf } from '../services/notification-dispatch.js';
import {
  type NotificationCategory,
  type NotificationChannel,
} from '../services/notification-events.js';

/**
 * The notification centre of the customer.
 *
 * Every answer is built from the session of the customer and never from a
 * parameter: the query of a message carries the id of the customer, so a
 * customer who guesses the id of the message of another customer gets
 * nothing at all, not even the fact that it exists.
 */

/** The groups of the messages, as the customer reads them. */
const CATEGORY_VIEWS: Array<{
  key: NotificationCategory;
  label: string;
  description: string;
  classification: 'essential' | 'optional' | 'marketing';
  essential: boolean;
  channels: NotificationChannel[];
}> = [
  {
    key: 'accountSecurity',
    label: 'Account and security',
    description:
      'The messages about your account and its security: the verification of the address, the change of the password, the change of the address. They are always sent, because they protect the account.',
    classification: 'essential',
    essential: true,
    channels: ['email', 'in_app'],
  },
  {
    key: 'ordersBilling',
    label: 'Orders and billing',
    description:
      'The messages about your orders, your payments and your invoices. The notices about a payment that failed and about an invoice that is late are always sent.',
    classification: 'essential',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'hostingServices',
    label: 'Hosting services',
    description: 'The messages about the life of your servers: they are built, they work, they are suspended.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'support',
    label: 'Support',
    description: 'The messages about your tickets: a new answer, a change of state, a closing.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'domainsEmail',
    label: 'Domains and email hosting',
    description:
      'The messages about your domains and about the hosted mail: the proof of ownership, the records of DNS, the mailboxes.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'incidents',
    label: 'Incidents and maintenance',
    description: 'The messages about an incident of the platform and about the work that is planned.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'productUpdates',
    label: 'Product announcements',
    description: 'The messages about the platform itself: what is new, what changed, what is planned.',
    classification: 'optional',
    essential: false,
    channels: ['email', 'in_app'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description:
      'The offers of the platform. They are off until you agree to them, and every one of them carries a way to stop them.',
    classification: 'marketing',
    essential: false,
    channels: ['email'],
  },
];

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The list of the notifications of the customer.
   *
   * The list is paginated with a cursor, so a customer with thousands of
   * messages never loads thousands of messages.
   */
  app.get('/notifications', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const query = z
      .object({
        category: z.string().trim().max(40).optional(),
        unread: z.enum(['true', 'false']).optional(),
        cursor: z.string().trim().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(request.query ?? {});

    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const where = {
      userId: user.id,
      ...(query.category ? { category: query.category } : {}),
      ...(query.unread === 'true' ? { readAt: null } : {}),
      // The page after the last one: the rows that are older, and the rows
      // of the same moment with an id that comes after.
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.at } },
              { createdAt: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };

    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    const { rows: page, pagination } = pageOf(rows, limit, 'createdAt');
    return {
      notifications: page.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        body: row.body,
        actionUrl: row.actionUrl,
        actionLabel: row.actionLabel,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unread,
      nextCursor: pagination.nextCursor,
    };
  });

  /** How many messages are waiting to be read. */
  app.get('/notifications/unread-count', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    return { unread };
  });

  /**
   * The stream of the unread count.
   *
   * The count comes from the database, so it is the same in two sessions and
   * on two devices. The stream is a thin layer over a count that is read
   * every few seconds: it costs one indexed question and it never misses a
   * message, whatever the order of the events.
   */
  app.get('/notifications/stream', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let last = -1;
    let closed = false;
    const timer = setInterval(() => {
      void prisma.notification
        .count({ where: { userId: user.id, readAt: null } })
        .then((unread) => {
          if (closed || unread === last) return;
          last = unread;
          reply.raw.write(`event: unread\ndata: ${JSON.stringify({ unread })}\n\n`);
        })
        .catch(() => undefined);
    }, 3000);

    const stop = () => {
      closed = true;
      clearInterval(timer);
    };
    request.raw.on('close', stop);
    request.raw.on('error', stop);

    // The first count goes out at once, so the bell is right before the
    // first tick.
    const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    last = unread;
    reply.raw.write(`event: unread\ndata: ${JSON.stringify({ unread })}\n\n`);

    // The request stays open until the browser goes away.
    await new Promise<void>((resolve) => {
      request.raw.on('close', () => resolve());
      request.raw.on('error', () => resolve());
    });
  });

  /** One message is read. */
  app.post('/notifications/:id/read', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    // The query carries the id of the customer, so a message of another
    // customer is simply not there.
    const updated = await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    if (!updated.count) throw notFound('This notification does not exist.');
    return { ok: true };
  });

  /** Every message is read. */
  app.post('/notifications/read-all', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  });

  /** One message is deleted by the customer. */
  app.delete('/notifications/:id', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const deleted = await prisma.notification.deleteMany({ where: { id, userId: user.id } });
    if (!deleted.count) throw notFound('This notification does not exist.');
    return { ok: true };
  });

  /** The preferences of the customer and the groups of the messages. */
  app.get('/notifications/preferences', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const preferences = await preferencesOf(user.id);
    return {
      preferences,
      categories: CATEGORY_VIEWS.map((category) => ({
        key: category.key,
        label: category.label,
        description: category.description,
        classification: category.classification,
        essential: category.essential,
        channels: category.channels,
      })),
    };
  });

  /**
   * The customer saves the preferences.
   *
   * The essential group is always on, whatever the body says: the messages
   * that protect the account are not a preference of the customer. The
   * marketing needs the agreement, so turning it on keeps the date of the
   * agreement.
   */
  app.put('/notifications/preferences', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const body = z
      .object({
        preferences: z
          .object({
            ordersBilling: z.boolean().optional(),
            billing: z.boolean().optional(),
            hostingServices: z.boolean().optional(),
            support: z.boolean().optional(),
            domainsEmail: z.boolean().optional(),
            incidents: z.boolean().optional(),
            productUpdates: z.boolean().optional(),
            marketing: z.boolean().optional(),
            emailChannel: z.boolean().optional(),
            inAppChannel: z.boolean().optional(),
          })
          .strict(),
      })
      .parse(request.body ?? {});

    const wanted = body.preferences;
    const current = await preferencesOf(user.id);
    const marketing = wanted.marketing ?? current.marketing;
    const marketingOptInAt = marketing
      ? current.marketingOptInAt ?? new Date()
      : null;

    const saved = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        // The essential group is on, whatever the customer sent.
        accountSecurity: true,
        ordersBilling: wanted.ordersBilling ?? current.ordersBilling,
        billing: wanted.billing ?? current.billing,
        hostingServices: wanted.hostingServices ?? current.hostingServices,
        support: wanted.support ?? current.support,
        domainsEmail: wanted.domainsEmail ?? current.domainsEmail,
        incidents: wanted.incidents ?? current.incidents,
        productUpdates: wanted.productUpdates ?? current.productUpdates,
        marketing,
        marketingOptInAt,
        emailChannel: wanted.emailChannel ?? current.emailChannel,
        inAppChannel: wanted.inAppChannel ?? current.inAppChannel,
        updatedAt: new Date(),
      },
      update: {
        accountSecurity: true,
        ...(wanted.ordersBilling !== undefined ? { ordersBilling: wanted.ordersBilling } : {}),
        ...(wanted.billing !== undefined ? { billing: wanted.billing } : {}),
        ...(wanted.hostingServices !== undefined ? { hostingServices: wanted.hostingServices } : {}),
        ...(wanted.support !== undefined ? { support: wanted.support } : {}),
        ...(wanted.domainsEmail !== undefined ? { domainsEmail: wanted.domainsEmail } : {}),
        ...(wanted.incidents !== undefined ? { incidents: wanted.incidents } : {}),
        ...(wanted.productUpdates !== undefined ? { productUpdates: wanted.productUpdates } : {}),
        ...(wanted.marketing !== undefined ? { marketing, marketingOptInAt } : {}),
        ...(wanted.emailChannel !== undefined ? { emailChannel: wanted.emailChannel } : {}),
        ...(wanted.inAppChannel !== undefined ? { inAppChannel: wanted.inAppChannel } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      preferences: {
        accountSecurity: saved.accountSecurity,
        ordersBilling: saved.ordersBilling,
        billing: saved.billing,
        hostingServices: saved.hostingServices,
        support: saved.support,
        domainsEmail: saved.domainsEmail,
        incidents: saved.incidents,
        productUpdates: saved.productUpdates,
        marketing: saved.marketing,
        emailChannel: saved.emailChannel,
        inAppChannel: saved.inAppChannel,
      },
    };
  });
}

/** The default of a customer who never chose anything. */
export { defaultPreferences };
