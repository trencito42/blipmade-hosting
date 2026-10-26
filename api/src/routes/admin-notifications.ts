/**
 * The back office of the notifications.
 *
 * The back office shows what the platform said, what it sent and what it
 * could not send. It shows the state of the things and the facts about them,
 * never the secrets: a message is a kind, a recipient, a state and a moment,
 * never a body, never a token, never a credential.
 *
 * The truth of the transport is the most important thing this module says.
 * The platform has two transports: the relay, which sends, and the file,
 * which only writes the message on the disk. A message that was written to a
 * file was not delivered, so it is never counted as delivered and the answer
 * always says in words that nothing is being sent when there is no relay.
 *
 * The permissions of this module are the ones that exist today: `audit.read`
 * for the reads and `infrastructure.write` for the writes. There is no
 * granular permission for the notifications yet.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { boundedRecord } from '../lib/bounded.js';
import { badRequest, conflict, notFound, upstream } from '../lib/errors.js';
import { mailEnabled, mailTransportName, noteQueued, redactTokens } from '../lib/mailer.js';
import {
  encodeCursor,
  pageOf,
  pageOrder,
  parsePagination,
  withCursor,
} from '../lib/perf-data-pagination.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { emailTemplateCatalog, renderEmailTemplate, validateEmailTemplatePayload } from '../lib/email-design.js';
import { defaultPreferences, dispatchPendingEvents } from '../services/notification-dispatch.js';
import { EVENT_DEFINITIONS, eventDefinition } from '../services/notification-events.js';
import { dispatchEmail, enqueueEmail } from '../services/queue.js';

/**
 * How many events the dispatcher is asked to read after a repetition.
 *
 * The number is small on purpose: the answer has to say what really
 * happened, and a small batch is a batch the operator can read.
 */
const DISPATCH_LIMIT = 5;

/**
 * How many keys a payload of the operator may carry.
 */
const MAX_TEMPLATE_PAYLOAD_KEYS = 100;

/**
 * The placeholders a payload does not carry.
 *
 * The module of the designs refuses an identifier it does not know, so a
 * template that is not in the catalogue has no placeholder at all here: the
 * caller checks the catalogue before it asks.
 */
function missingPlaceholders(id: string, payload: Record<string, unknown>): string[] {
  try {
    return validateEmailTemplatePayload(id, payload);
  } catch {
    return [];
  }
}

/**
 * Renders a template, or nothing when the catalogue does not know it.
 */
function renderTemplate(id: string, payload: Record<string, unknown>) {
  try {
    return renderEmailTemplate(id, payload);
  } catch {
    return null;
  }
}

/** The keys whose value is a secret and is never shown in the back office. */
const SECRET_KEY = /(token|secret|password|credential|recovery|otp|api[_-]?key)/i;

/**
 * The payload of an event, without its secrets.
 *
 * The dispatcher empties the payload of an event that holds a secret as soon
 * as the message is on the queue, so the back office usually sees it empty.
 * An event that still holds its secret is shown without the secret: the
 * operator sees that the fact is there and never what it is.
 */
function safePayload(payload: unknown): { payload: Record<string, unknown>; redacted: boolean } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { payload: {}, redacted: false };
  }
  const entries = Object.entries(payload as Record<string, unknown>);
  let redacted = false;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (SECRET_KEY.test(key)) {
      safe[key] = '[redacted]';
      redacted = true;
      continue;
    }
    safe[key] = value;
  }
  return { payload: safe, redacted };
}

/**
 * The truth of the transport.
 *
 * The words are the same everywhere: the back office never lets the operator
 * believe that a message left the platform when it did not.
 */
function transportTruth(): {
  transport: 'smtp' | 'file';
  relayConfigured: boolean;
  sending: boolean;
  notice: string;
} {
  const transport = mailTransportName();
  const relayConfigured = mailEnabled();
  if (transport === 'smtp') {
    return {
      transport,
      relayConfigured,
      sending: true,
      notice: 'The relay is configured: the messages leave the platform.',
    };
  }
  return {
    transport,
    relayConfigured,
    sending: false,
    notice:
      'No relay is configured: the platform writes the messages to files, so nothing is being sent to anybody.',
  };
}

/**
 * A moment as the database writes it.
 *
 * The columns of the table are timestamps without a time zone, and the
 * database writes them as the wall clock of the Coordinated Universal Time.
 * The moment is therefore written as the text of that wall clock and cast by
 * the database, so the day of a message is the same wherever the server is.
 */
function naiveTimestamp(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

/** The day a moment belongs to, as the platform writes its dates. */
function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The date of a moment, as the back office shows it. */
function moment(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function registerAdminNotificationRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The overview of the deliveries.
   *
   * The answer says what the platform did with its messages, how many
   * events are waiting and what the transport of the platform is. The truth
   * of the transport comes first: when there is no relay, the platform only
   * writes files, and the answer says that nothing is being sent.
   */
  app.get('/admin/notifications/overview', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const [deliveryStates, eventStates, unread, templates] = await Promise.all([
      prisma.mailDelivery.groupBy({ by: ['state', 'transport'], _count: { _all: true } }),
      prisma.notificationEvent.groupBy({ by: ['state'], _count: { _all: true } }),
      prisma.notification.count({ where: { readAt: null } }),
      Promise.resolve(emailTemplateCatalog().length),
    ]);

    const deliveries = { queued: 0, delivered: 0, writtenToFile: 0, failed: 0, total: 0 };
    for (const row of deliveryStates) {
      const count = row._count._all;
      deliveries.total += count;
      if (row.state === 'queued') deliveries.queued += count;
      else if (row.state === 'failed') deliveries.failed += count;
      else if (row.state === 'written-to-file') deliveries.writtenToFile += count;
      // A row that says "delivered" but that the file transport wrote is a
      // contradiction, so it is not counted as delivered: the answer must
      // never say that a message was delivered when the platform has no
      // relay.
      else if (row.state === 'delivered' && row.transport === 'smtp') deliveries.delivered += count;
    }

    const events = { pending: 0, processed: 0, failed: 0, total: 0 };
    for (const row of eventStates) {
      const count = row._count._all;
      events.total += count;
      if (row.state === 'pending') events.pending += count;
      else if (row.state === 'processed') events.processed += count;
      else if (row.state === 'failed') events.failed += count;
    }

    return {
      overview: {
        transport: transportTruth(),
        deliveries,
        events,
        unreadNotifications: unread,
        templates,
      },
    };
  });

  /**
   * The ledger of the messages.
   *
   * The list shows the state of every message the platform remembers: the
   * kind, the recipient, the state, the transport, the attempts and the
   * class of the last failure. It never holds the body of a message.
   */
  app.get('/admin/notifications/deliveries', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const query = z
      .object({
        state: z.string().trim().optional(),
        kind: z.string().trim().optional(),
        q: z.string().trim().optional(),
        eventId: z.string().trim().optional(),
      })
      .parse(request.query ?? {});
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 50, maxSize: 200 });

    const where: Prisma.MailDeliveryWhereInput = {};
    if (query.state) where.state = query.state;
    if (query.kind) where.kind = query.kind;
    if (query.eventId) where.eventId = query.eventId;
    if (query.q) where.to = { contains: query.q, mode: 'insensitive' };

    // The key of a message is its own boundary: the model has no id of its
    // own, so the cursor of the page is the key of the last row.
    const rows = await prisma.mailDelivery.findMany({
      where: cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  { updatedAt: { lt: cursor.at } },
                  { updatedAt: cursor.at, key: { lt: cursor.id } },
                ],
              },
            ],
          }
        : where,
      orderBy: [{ updatedAt: 'desc' }, { key: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor({ at: last.updatedAt, id: last.key }) : null;
    const total = await prisma.mailDelivery.count({ where });

    return {
      deliveries: page.map((row) => ({
        key: row.key,
        kind: row.kind,
        to: row.to,
        state: row.state,
        transport: row.transport,
        attempts: row.attempts,
        errorClass: row.lastErrorClass,
        error: row.lastError ? redactTokens(row.lastError) : null,
        eventId: row.eventId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deliveredAt: moment(row.deliveredAt),
      })),
      nextCursor,
      total,
    };
  });

  /**
   * The history of the events.
   *
   * The list shows what the platform published and what came of it: the
   * state of the event and the outcome of every channel.
   */
  app.get('/admin/notifications/events', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const query = z
      .object({
        type: z.string().trim().optional(),
        state: z.string().trim().optional(),
        userId: z.string().trim().optional(),
        q: z.string().trim().optional(),
      })
      .parse(request.query ?? {});
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 50, maxSize: 200 });

    const where: Prisma.NotificationEventWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.state) where.state = query.state;
    if (query.userId) where.userId = query.userId;
    if (query.q) {
      where.OR = [
        { type: { contains: query.q, mode: 'insensitive' } },
        { businessKey: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const rows = await prisma.notificationEvent.findMany({
      where: withCursor(where, cursor, 'createdAt'),
      include: { user: { select: { id: true, email: true } } },
      orderBy: pageOrder('createdAt'),
      take: limit + 1,
    });

    const page = pageOf(rows, limit, 'createdAt');
    const total = await prisma.notificationEvent.count({ where });

    return {
      events: page.rows.map((row) => ({
        id: row.id,
        type: row.type,
        businessKey: row.businessKey,
        userId: row.userId,
        customer: row.user ? { id: row.user.id, email: row.user.email } : null,
        state: row.state,
        channels: (row.channels ?? {}) as Record<string, string>,
        attempts: row.attempts,
        lastError: row.lastError ? redactTokens(row.lastError) : null,
        occurredAt: row.occurredAt.toISOString(),
        processedAt: moment(row.processedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor: page.pagination.nextCursor,
      total,
    };
  });

  /**
   * One event, with its facts and what came of it.
   *
   * The payload of an event that holds a secret was emptied by the
   * dispatcher, so the answer shows it as it is: empty when the message is
   * on its way, and without its secret when it is not.
   */
  app.get('/admin/notifications/events/:id', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const row = await prisma.notificationEvent.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!row) throw notFound('This event is not in the history of the platform.');

    const definition = eventDefinition(row.type);
    const facts = safePayload(row.payload);

    return {
      event: {
        id: row.id,
        type: row.type,
        businessKey: row.businessKey,
        template: definition?.template ?? null,
        category: definition?.category ?? null,
        classification: definition?.classification ?? null,
        channels: (row.channels ?? {}) as Record<string, string>,
        userId: row.userId,
        customer: row.user ? { id: row.user.id, email: row.user.email } : null,
        state: row.state,
        attempts: row.attempts,
        lastError: row.lastError ? redactTokens(row.lastError) : null,
        payload: facts.payload,
        payloadRedacted: facts.redacted,
        holdsSecret: definition?.holdsSecret === true,
        occurredAt: row.occurredAt.toISOString(),
        processedAt: moment(row.processedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  });

  /**
   * Puts a failed event back on the queue of the mail.
   *
   * The event goes back to `pending` and its attempts start again at zero,
   * so the dispatcher reads it as if it had never been read. The dispatcher
   * is then asked to read a small batch of the pending events, and the answer
   * says what it really did.
   */
  app.post('/admin/notifications/events/:id/retry', {
    config: {
      rateLimit: {
        max: LIMITS.adminWrite.address,
        timeWindow: LIMITS.adminWrite.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const event = await prisma.notificationEvent.findUnique({ where: { id } });
    if (!event) throw notFound('This event is not in the history of the platform.');
    // An event that was processed is not a failure that can be repeated: the
    // message of its occurrence was already sent, and the platform sends one
    // message per occurrence.
    if (event.state === 'processed') {
      throw conflict('This event was already processed: its message was sent, so it is not repeated.');
    }

    await prisma.notificationEvent.update({
      where: { id },
      data: { state: 'pending', attempts: 0, lastError: null, processedAt: null },
    });

    // The dispatcher reads the pending events of the platform, so it may
    // read another event as well. The answer says what it really did.
    const report = await dispatchPendingEvents(DISPATCH_LIMIT);
    const after = await prisma.notificationEvent.findUnique({ where: { id } });

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'notification.event.retried',
      targetType: 'notification_event',
      targetId: id,
      meta: { type: event.type, state: after?.state ?? null },
      ip: request.ip,
    });

    return {
      ok: true,
      dispatched: {
        read: report.read,
        processed: report.processed,
        failed: report.failed,
        sent: report.sent,
        skipped: report.skipped,
      },
      event: after
        ? {
            id: after.id,
            state: after.state,
            attempts: after.attempts,
            channels: (after.channels ?? {}) as Record<string, string>,
            processedAt: moment(after.processedAt),
          }
        : null,
    };
  });

  /**
   * Puts one failed message back on the queue.
   *
   * The key of a message is the hash of its idempotency key, so the message
   * is rebuilt from the event it belongs to. A message that has no event
   * cannot be rebuilt: the platform does not have the facts of it, and the
   * refusal says so in words.
   */
  app.post('/admin/notifications/deliveries/:key/retry', {
    config: {
      rateLimit: {
        max: LIMITS.adminWrite.address,
        timeWindow: LIMITS.adminWrite.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { key } = z.object({ key: z.string().min(1) }).parse(request.params);

    const row = await prisma.mailDelivery.findUnique({ where: { key } });
    if (!row) throw notFound('This message is not in the ledger of the platform.');

    if (!row.eventId) {
      throw conflict(
        'This message cannot be repeated: the platform does not have the facts of the message it would have to rebuild. Send a new message instead.',
      );
    }

    const event = await prisma.notificationEvent.findUnique({ where: { id: row.eventId } });
    if (!event) {
      throw conflict(
        'This message cannot be repeated: the event it belongs to is not in the history of the platform any more, so the platform cannot rebuild the message.',
      );
    }

    const definition = eventDefinition(event.type);
    if (!definition) {
      throw conflict(
        `This message cannot be repeated: the platform does not know the event "${event.type}" any more, so it cannot rebuild the message.`,
      );
    }

    const payload = ((event.payload ?? {}) as unknown as Record<string, unknown>) ?? {};
    const missing = missingPlaceholders(definition.template, payload);
    if (missing.length) {
      throw conflict(
        `This message cannot be repeated: the facts of its message are not in the platform any more (${missing.join(', ')}). Send a new message instead.`,
      );
    }

    const rendered = renderTemplate(definition.template, payload);
    if (!rendered) {
      throw conflict(
        `This message cannot be repeated: the platform does not know the template "${definition.template}" any more, so it cannot rebuild the message.`,
      );
    }
    const jobId = await enqueueEmail({
      key: row.key,
      kind: event.type,
      to: row.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      eventId: event.id,
    });
    // The ledger says that the message is waiting again, so the operator sees
    // the truth of the queue and not the failure that is over.
    await noteQueued(
      {
        key: row.key,
        kind: event.type,
        to: row.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        eventId: event.id,
      },
      jobId,
    );

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'notification.delivery.retried',
      targetType: 'mail_delivery',
      targetId: row.key,
      meta: { eventId: event.id, type: event.type },
      ip: request.ip,
    });

    return { ok: true, key: row.key, state: 'queued', jobId };
  });

  /**
   * The catalogue of the templates.
   *
   * The list holds what every template is made of: its identity, its
   * version, its category, its subject and the placeholders it needs.
   */
  app.get('/admin/notifications/templates', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const catalogue = emailTemplateCatalog();
    return {
      templates: catalogue.map((entry) => ({
        id: entry.id,
        version: entry.version,
        category: entry.category,
        subject: entry.subject,
        placeholders: entry.placeholders,
      })),
    };
  });

  /**
   * Renders a template without sending anything.
   *
   * The operator gives the facts of the message and the back office answers
   * with the subject, the preheader, the text and the HTML. A payload that
   * does not carry every placeholder is refused in words: a broken template
   * is worse than no template.
   */
  app.post('/admin/notifications/templates/:id/preview', {
    config: {
      rateLimit: {
        max: LIMITS.adminWrite.address,
        timeWindow: LIMITS.adminWrite.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({ payload: boundedRecord(z.record(z.unknown()), MAX_TEMPLATE_PAYLOAD_KEYS, 'The payload').default({}) })
      .parse(request.body ?? {});

    if (!emailTemplateCatalog().some((entry) => entry.id === id)) {
      throw notFound(`There is no template called "${id}" in the catalogue.`);
    }

    const payload = body.payload as Record<string, unknown>;
    const missing = missingPlaceholders(id, payload);
    if (missing.length) {
      throw badRequest(
        `The payload does not carry every placeholder of this template. These are missing: ${missing.join(', ')}.`,
      );
    }

    const rendered = renderTemplate(id, payload);
    if (!rendered) throw notFound(`There is no template called "${id}" in the catalogue.`);

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'notification.template.previewed',
      targetType: 'email_template',
      targetId: id,
      ip: request.ip,
    });

    return {
      preview: {
        id,
        subject: rendered.subject,
        preheader: rendered.preheader,
        text: rendered.text,
        html: rendered.html ?? null,
      },
    };
  });

  /**
   * The placeholders a payload does not carry.
   *
   * The answer names them, so the operator knows what is missing before the
   * message is built.
   */
  app.post('/admin/notifications/templates/:id/validate', {
    config: {
      rateLimit: {
        max: LIMITS.adminWrite.address,
        timeWindow: LIMITS.adminWrite.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({ payload: boundedRecord(z.record(z.unknown()), MAX_TEMPLATE_PAYLOAD_KEYS, 'The payload').default({}) })
      .parse(request.body ?? {});

    if (!emailTemplateCatalog().some((entry) => entry.id === id)) {
      throw notFound(`There is no template called "${id}" in the catalogue.`);
    }

    const missing = missingPlaceholders(id, (body.payload ?? {}) as Record<string, unknown>);

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'notification.template.validated',
      targetType: 'email_template',
      targetId: id,
      meta: { missing: missing.length },
      ip: request.ip,
    });

    return { missing };
  });

  /**
   * Sends one message to one address that the operator gave.
   *
   * The address is never taken from a list of customers: it is the address
   * the operator wrote down, and the message goes to that address only.
   * The message goes through the mailer of the platform, so it is written in
   * the ledger like every other message.
   */
  app.post('/admin/notifications/test-send', {
    config: {
      rateLimit: {
        max: LIMITS.adminWrite.address,
        timeWindow: LIMITS.adminWrite.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('infrastructure.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const body = z
      .object({
        to: z
          .string()
          .trim()
          .min(3)
          .max(320)
          .refine((value) => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(value), {
            message: 'The address of a test message must be a real address, not a name.',
          }),
        templateId: z.string().trim().min(1).max(120),
        payload: boundedRecord(z.record(z.unknown()), MAX_TEMPLATE_PAYLOAD_KEYS, 'The payload').optional(),
      })
      .parse(request.body ?? {});

    if (!emailTemplateCatalog().some((entry) => entry.id === body.templateId)) {
      throw notFound(`There is no template called "${body.templateId}" in the catalogue.`);
    }

    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const missing = missingPlaceholders(body.templateId, payload);
    if (missing.length) {
      throw badRequest(
        `The payload does not carry every placeholder of this template. These are missing: ${missing.join(', ')}.`,
      );
    }

    const rendered = renderTemplate(body.templateId, payload);
    if (!rendered) throw notFound(`There is no template called "${body.templateId}" in the catalogue.`);

    // The key of a message is the hash of its idempotency key, so the key
    // cannot be used to sign in and it is the same in every process.
    const idempotencyKey = `admin-test-send:${body.templateId}:${randomBytes(8).toString('hex')}`;
    const key = createHash('sha256').update(idempotencyKey).digest('hex');

    const result = await dispatchEmail({
      key,
      kind: 'admin-test-send',
      to: body.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    // A message that was not delivered is never answered as a success.
    if (result.state === 'failed') {
      await audit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'notification.test_send.failed',
        targetType: 'mail_delivery',
        targetId: key,
        meta: { templateId: body.templateId, errorClass: result.errorClass },
        ip: request.ip,
      });
      if (result.transport === 'file') {
        throw upstream(
          `The message could not be written to a file, so it was not sent. The class of the failure is ${result.errorClass ?? 'unknown'}.`,
        );
      }
      throw upstream(
        `The relay refused the message, so it was not sent. The class of the failure is ${result.errorClass ?? 'unknown'}.`,
      );
    }

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'notification.test_sent',
      targetType: 'mail_delivery',
      targetId: key,
      meta: { templateId: body.templateId, state: result.state, transport: result.transport },
      ip: request.ip,
    });

    const truth = transportTruth();
    return {
      ok: true,
      key,
      state: result.state,
      delivered: result.state === 'delivered',
      transport: result.transport,
      notice:
        result.state === 'written-to-file'
          ? 'No relay is configured: the message was written to a file and nobody received it.'
          : truth.notice,
    };
  });

  /**
   * The categories of the messages.
   *
   * The answer says what every group of the messages means: how important
   * its messages are, on which channels they travel and how many events of
   * that kind the platform knows.
   */
  app.get('/admin/notifications/categories', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const summary = new Map<
      string,
      { classifications: Set<string>; channels: Set<string>; eventTypes: number }
    >();
    for (const definition of Object.values(EVENT_DEFINITIONS)) {
      const entry = summary.get(definition.category) ?? {
        classifications: new Set<string>(),
        channels: new Set<string>(),
        eventTypes: 0,
      };
      entry.classifications.add(definition.classification);
      for (const channel of definition.channels) entry.channels.add(channel);
      entry.eventTypes += 1;
      summary.set(definition.category, entry);
    }

    const byType = await prisma.notificationEvent.groupBy({ by: ['type'], _count: { _all: true } });
    const counts = new Map<string, number>();
    for (const row of byType) {
      const definition = eventDefinition(row.type);
      if (!definition) continue;
      counts.set(definition.category, (counts.get(definition.category) ?? 0) + row._count._all);
    }

    return {
      categories: [...summary.entries()].map(([key, entry]) => ({
        key,
        classifications: [...entry.classifications],
        channels: [...entry.channels],
        eventTypes: entry.eventTypes,
        events: counts.get(key) ?? 0,
      })),
    };
  });

  /**
   * The activity of the last days.
   *
   * The answer says what happened every day: how many messages were
   * delivered, how many failed, how many were written to a file and how
   * many events were published. A message that was written to a file is
   * never counted as delivered.
   */
  app.get('/admin/notifications/trends', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const query = z
      .object({ days: z.coerce.number().int().min(1).max(30).optional() })
      .parse(request.query ?? {});
    const days = query.days ?? 7;

    const today = new Date();
    const since = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1)),
    );

    // The days are counted by the database itself: the ledger of the platform
    // grows with every message, and the back office must not read it all to
    // count a week.
    const [deliveries, events] = await Promise.all([
      prisma.$queryRaw<Array<{ day: string; state: string; transport: string; count: number }>>(
        Prisma.sql`
          SELECT to_char("updatedAt", 'YYYY-MM-DD') AS "day", "state", "transport", COUNT(*)::int AS "count"
          FROM "MailDelivery"
          WHERE "updatedAt" >= ${naiveTimestamp(since)}::timestamp
          GROUP BY 1, 2, 3
        `,
      ),
      prisma.$queryRaw<Array<{ day: string; count: number }>>(
        Prisma.sql`
          SELECT to_char("createdAt", 'YYYY-MM-DD') AS "day", COUNT(*)::int AS "count"
          FROM "NotificationEvent"
          WHERE "createdAt" >= ${naiveTimestamp(since)}::timestamp
          GROUP BY 1
        `,
      ),
    ]);

    const buckets = new Map<string, { delivered: number; failed: number; writtenToFile: number; events: number }>();
    for (let index = 0; index < days; index += 1) {
      const day = new Date(since.getTime() + index * 86_400_000);
      buckets.set(dayKey(day), { delivered: 0, failed: 0, writtenToFile: 0, events: 0 });
    }

    for (const row of deliveries) {
      const bucket = buckets.get(row.day);
      if (!bucket) continue;
      if (row.state === 'failed') bucket.failed += row.count;
      else if (row.state === 'written-to-file') bucket.writtenToFile += row.count;
      // A row that says "delivered" but that the file transport wrote is a
      // contradiction, so it is not counted as delivered.
      else if (row.state === 'delivered' && row.transport === 'smtp') bucket.delivered += row.count;
    }
    for (const row of events) {
      const bucket = buckets.get(row.day);
      if (bucket) bucket.events += row.count;
    }

    return {
      days: [...buckets.entries()].map(([date, bucket]) => ({ date, ...bucket })),
      from: dayKey(since),
      to: dayKey(today),
      transport: transportTruth(),
    };
  });

  /**
   * The preferences of the customers.
   *
   * The answer says how many customers have every group switched on and how
   * many have every channel switched on. A customer who never chose anything
   * is counted with the defaults of the platform.
   */
  app.get('/admin/notifications/preferences', {
    config: {
      rateLimit: {
        max: LIMITS.adminService.address,
        timeWindow: LIMITS.adminService.window,
        keyGenerator: addressRateLimitKey,
      },
    },
    preHandler: [requirePermission('audit.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const defaults = defaultPreferences();
    const keys = [
      'accountSecurity',
      'ordersBilling',
      'billing',
      'hostingServices',
      'support',
      'domainsEmail',
      'incidents',
      'productUpdates',
      'marketing',
      'emailChannel',
      'inAppChannel',
    ] as const;

    const [customers, rows] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.notificationPreference.findMany({
        where: { user: { role: 'CUSTOMER' } },
        select: {
          accountSecurity: true,
          ordersBilling: true,
          billing: true,
          hostingServices: true,
          support: true,
          domainsEmail: true,
          incidents: true,
          productUpdates: true,
          marketing: true,
          emailChannel: true,
          inAppChannel: true,
        },
      }),
    ]);

    const withoutChoice = Math.max(0, customers - rows.length);

    return {
      groups: keys.map((key) => {
        const chosen = rows.filter((row) => row[key] === true).length;
        const fallback = defaults[key] ? withoutChoice : 0;
        return {
          key,
          kind: key === 'emailChannel' || key === 'inAppChannel' ? 'channel' : 'group',
          enabled: defaults[key],
          count: chosen + fallback,
          total: customers,
        };
      }),
      customers,
    };
  });
}
