import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { sendMail } from '../lib/mailer.js';
import { renderEmailTemplate } from '../lib/email-design.js';
import {
  businessKey,
  eventDefinition,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationClassification,
  type NotificationEventType,
  type EventPayloadMap,
} from './notification-events.js';

/**
 * The notification engine.
 *
 * A business service publishes an event and stops. The event is written in
 * the same transaction as the business change, and the work of turning it
 * into a message happens here, later, in the worker. A mail server that is
 * down therefore never rolls back a payment, an order or a provisioning.
 *
 * The engine writes two kinds of message:
 *
 *   * the e-mail, which goes on the queue of the mail of the platform and is
 *     delivered by the same mailer as every other message of the platform;
 *   * the message of the notification centre, which stays in the database
 *     and is read by the customer of the account.
 *
 * The preference of the customer decides what they hear about. The essential
 * messages are never suppressed: they protect the account, they carry a
 * contractual obligation or they are required by the law. The optional ones
 * follow the switches of the customer, and the messages of the marketing
 * follow their agreement.
 */

/** What the customer chose. */
export interface PreferenceState {
  accountSecurity: boolean;
  ordersBilling: boolean;
  billing: boolean;
  hostingServices: boolean;
  support: boolean;
  domainsEmail: boolean;
  incidents: boolean;
  productUpdates: boolean;
  marketing: boolean;
  emailChannel: boolean;
  inAppChannel: boolean;
  marketingOptInAt: Date | null;
}

/** The preferences of a customer who never chose anything. */
export function defaultPreferences(): PreferenceState {
  return {
    accountSecurity: true,
    ordersBilling: true,
    billing: true,
    hostingServices: true,
    support: true,
    domainsEmail: true,
    incidents: true,
    productUpdates: true,
    // The marketing is off until the customer agrees to it.
    marketing: false,
    emailChannel: true,
    inAppChannel: true,
    marketingOptInAt: null,
  };
}

/**
 * The switch of the old platform, next to the new one.
 *
 * The platform had five groups before the groups of the brief. A customer
 * who switched off the billing of the old platform keeps that choice, so
 * the old switch is honoured together with the new one.
 */
const LEGACY_COLUMN: Partial<Record<NotificationCategory, keyof PreferenceState>> = {
  ordersBilling: 'billing',
  support: 'support',
  incidents: 'incidents',
  productUpdates: 'productUpdates',
  marketing: 'marketing',
};

/** The preferences of a customer, read from the database. */
export async function preferencesOf(userId: string): Promise<PreferenceState> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row) return defaultPreferences();
  return {
    accountSecurity: row.accountSecurity,
    ordersBilling: row.ordersBilling,
    billing: row.billing,
    hostingServices: row.hostingServices,
    support: row.support,
    domainsEmail: row.domainsEmail,
    incidents: row.incidents,
    productUpdates: row.productUpdates,
    marketing: row.marketing,
    emailChannel: row.emailChannel,
    inAppChannel: row.inAppChannel,
    marketingOptInAt: row.marketingOptInAt,
  };
}

/**
 * Whether the customer wants this message on this channel.
 *
 * The essential messages always go out: they are the ones that protect the
 * account and that carry the obligation of the platform. The optional ones
 * follow the group of the customer and the channel they chose. The messages
 * of the marketing need their agreement, which is kept with a date.
 */
export function wantsMessage(
  preferences: PreferenceState,
  classification: NotificationClassification,
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  if (classification === 'essential') return true;

  if (classification === 'marketing') {
    // The marketing never goes to the notification centre: it is a message
    // the customer asked for by e-mail and nothing else.
    if (channel !== 'email') return false;
    if (!preferences.marketing) return false;
    if (!preferences.emailChannel) return false;
    // The agreement is kept with a date. Without it there is no marketing.
    return preferences.marketingOptInAt !== null;
  }

  if (!preferences[category]) return false;
  const legacy = LEGACY_COLUMN[category];
  if (legacy && !preferences[legacy]) return false;
  if (channel === 'email' && !preferences.emailChannel) return false;
  if (channel === 'in_app' && !preferences.inAppChannel) return false;
  return true;
}

/**
 * Writes an event in the outbox.
 *
 * The event is written in the same transaction as the business change, when
 * the caller has one. The write is idempotent on the key of the occurrence:
 * the same occurrence, written twice, is one event and one message.
 */
export async function publishEvent<Type extends NotificationEventType>(
  input: {
    type: Type;
    /** The business identity of the thing that happened: the id of the service, of the invoice. */
    subject: string;
    /** The customer the event belongs to. */
    userId?: string | null;
    /** The facts of the event. */
    payload: EventPayloadMap[Type];
    /**
     * What makes the occurrence unique. Without it, the key holds only the
     * subject and every future occurrence of the same state would be
     * considered the same one.
     */
    occurrence?: string | Date | number | null;
    occurredAt?: Date;
  },
  tx?: Prisma.TransactionClient,
): Promise<{ eventId: string; created: boolean }> {
  const definition = eventDefinition(input.type);
  if (!definition) {
    // An event that nobody decided about is refused in words: a new event
    // cannot slip into the platform without a decision about its message.
    throw new Error(`Unknown notification event: ${input.type}`);
  }
  const key = businessKey({
    type: input.type,
    subject: input.subject,
    occurrence: input.occurrence ?? input.occurredAt ?? null,
  });
  const client = tx ?? prisma;
  const existing = await client.notificationEvent.findUnique({ where: { businessKey: key } });
  if (existing) return { eventId: existing.id, created: false };
  const created = await client.notificationEvent.create({
    data: {
      type: input.type,
      businessKey: key,
      userId: input.userId ?? null,
      payload: input.payload as unknown as Prisma.InputJsonObject,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
  return { eventId: created.id, created: true };
}

/** What the dispatcher did with a batch of events. */
export interface DispatchReport {
  read: number;
  processed: number;
  failed: number;
  sent: number;
  skipped: number;
  /** The messages that were written to a file: nobody received them. */
  written: number;
}

/** The state of one channel after the dispatcher was there. */
type ChannelOutcome = 'sent' | 'skipped' | 'failed' | 'written';

interface Recipient {
  email: string | null;
  userId: string | null;
}

/** Who the message of an event is for. */
async function resolveRecipient(
  type: NotificationEventType,
  userId: string | null,
  payload: Record<string, unknown>,
): Promise<Recipient[]> {
  const definition = eventDefinition(type);
  if (!definition) return [];

  if (definition.audience === 'operator') {
    const address = env.MAIL_OPERATOR_EMAIL || env.MAIL_SUPPORT_EMAIL;
    return address ? [{ email: address, userId: null }] : [];
  }

  if (definition.audience === 'staff') {
    const staffId = (payload as { staffId?: string | null }).staffId ?? null;
    if (staffId) {
      const member = await prisma.staffMember.findUnique({
        where: { userId: staffId },
        include: { user: { select: { id: true, email: true } } },
      });
      return member ? [{ email: member.user.email, userId: member.user.id }] : [];
    }
    // No staff member was named, so the message goes to the people who work
    // the queue: the members of the staff that may read the tickets. A
    // customer never reaches a member who is not allowed to see the ticket.
    const members = await prisma.staffMember.findMany({
      include: { user: { select: { id: true, email: true, role: true } } },
      take: 20,
    });
    const reachable = members.filter(
      (member) =>
        member.user.role === 'ADMIN' || member.permissions.includes('tickets.read'),
    );
    if (reachable.length > 0) {
      return reachable.map((member) => ({ email: member.user.email, userId: member.user.id }));
    }
    // Nobody of the staff can read the queue, so the operator is the one who
    // has to know.
    const address = env.MAIL_OPERATOR_EMAIL || env.MAIL_SUPPORT_EMAIL;
    return address ? [{ email: address, userId: null }] : [];
  }

  if (!userId) return [];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  return user ? [{ email: user.email, userId: user.id }] : [];
}

/**
 * Delivers one event on the channels it declares.
 *
 * The outcome of every channel is written on the event, so the back office
 * can answer "was this event ever sent?" without guessing.
 */
async function deliverEvent(event: {
  id: string;
  type: string;
  businessKey: string;
  userId: string | null;
  payload: unknown;
}): Promise<{ outcomes: Record<string, ChannelOutcome>; sent: number; skipped: number; written: number }> {
  const definition = eventDefinition(event.type);
  if (!definition) return { outcomes: {}, sent: 0, skipped: 0, written: 0 };
  const type = event.type as NotificationEventType;

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const recipients = await resolveRecipient(type, event.userId, payload);
  const outcomes: Record<string, ChannelOutcome> = {};
  let sent = 0;
  let skipped = 0;
  let written = 0;

  if (recipients.length === 0) {
    for (const channel of definition.channels) outcomes[channel] = 'skipped';
    return { outcomes, sent, skipped: skipped + definition.channels.length, written };
  }

  for (const recipient of recipients) {
    // The preferences are the ones of the person who receives the message,
    // not the ones of the account the event belongs to: the message that
    // goes to a staff member follows the choice of the staff member.
    const preferences = recipient.userId
      ? await preferencesOf(recipient.userId)
      : defaultPreferences();

    // The key of the message is the key of the occurrence. When an event
    // has more than one recipient, the address is added, so two recipients
    // never share one delivery.
    const deliveryKey =
      recipients.length === 1 ? event.businessKey : `${event.businessKey}#${recipient.email}`;

    for (const channel of definition.channels) {
      if (!wantsMessage(preferences, definition.classification, definition.category, channel)) {
        outcomes[channel] = 'skipped';
        skipped += 1;
        continue;
      }

      if (channel === 'in_app' && !recipient.userId) {
        // The notification centre belongs to the customers of the panel. A
        // message that goes to an address without an account has no place
        // in it.
        outcomes.in_app = 'skipped';
        skipped += 1;
        continue;
      }

      try {
        if (channel === 'email') {
          // The action of the e-mail is built by the engine and not by the
          // template: the template receives the link and never the token that
          // a link of a verification carries.
          const action = definition.emailLink?.(payload as never) ?? definition.link?.(payload as never) ?? null;
          const rendered = renderEmailTemplate(
            definition.template,
            action ? { ...payload, action } : payload,
          );
          const result = await sendMail({
            to: recipient.email ?? '',
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
            kind: event.type,
            // The key of the occurrence: the same occurrence is one message,
            // and two occurrences of the same state are two messages.
            idempotencyKey: deliveryKey,
            eventId: event.id,
          });

          // The outcome tells the truth. A message that was written to a
          // file on the server was not delivered to anybody, and the
          // operator has to see it.
          if (result.delivered) {
            outcomes.email = 'sent';
            sent += 1;
          } else if (result.state === 'written-to-file') {
            outcomes.email = 'written';
            written += 1;
            await audit({
              action: 'notification.message_not_delivered',
              targetType: 'notification_event',
              targetId: event.id,
              meta: {
                type: event.type,
                state: result.state,
                transport: result.transport,
                errorClass: result.errorClass,
              },
            });
          } else {
            outcomes.email = 'failed';
            await audit({
              action: 'notification.channel_failed',
              targetType: 'notification_event',
              targetId: event.id,
              meta: { channel: 'email', error: result.error ?? 'the relay refused the message' },
            });
          }
        } else {
          const link = definition.link?.(payload as never) ?? null;
          // The key of the message of the centre carries the recipient, so
          // two recipients of one event never share one row.
          const eventKey = `${event.businessKey}#${recipient.userId}`;
          await prisma.notification.upsert({
            where: { eventKey },
            create: {
              userId: recipient.userId!,
              category: definition.category,
              title: definition.title(payload as never),
              body: definition.body(payload as never),
              actionUrl: link?.url ?? null,
              actionLabel: link?.label ?? null,
              eventKey,
            },
            update: {},
          });
          outcomes.in_app = 'sent';
          sent += 1;
        }
      } catch (error) {
        outcomes[channel] = 'failed';
        await audit({
          action: 'notification.channel_failed',
          targetType: 'notification_event',
          targetId: event.id,
          meta: { channel, error: (error as Error).message },
        });
      }
    }
  }

  return { outcomes, sent, skipped, written };
}

/**
 * The pause between two tries of the same event.
 *
 * The first try happens at once. The ones after it wait longer and longer,
 * so a relay that is down is not asked again and again, and a message that
 * failed for a moment is still sent the next minute.
 */
const BACKOFF_SECONDS = [0, 30, 120, 600, 1800];

function backoffMs(attempts: number): number {
  const index = Math.max(0, Math.min(attempts, BACKOFF_SECONDS.length - 1));
  return BACKOFF_SECONDS[index]! * 1000;
}

/** How many times an event is tried before it is given up on. */
const MAX_ATTEMPTS = 5;

/** How long a claimed event may stay claimed before it is taken back. */
const CLAIM_TIMEOUT_MS = 5 * 60_000;

/**
 * Reads the pending events and delivers them.
 *
 * The function is safe to run again: an event that was delivered is marked
 * as processed and is not read a second time, and an event that failed is
 * tried again, up to a few times.
 *
 * Every event is claimed before it is delivered, so two workers never send
 * the same message twice. An event that was claimed and never finished -
 * because the worker died in the middle - is taken back after a few minutes.
 */
export async function dispatchPendingEvents(limit = 50): Promise<DispatchReport> {
  const stale = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const pending = await prisma.notificationEvent.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ state: 'pending' }, { state: 'processing', updatedAt: { lt: stale } }],
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(limit, 200)),
  });

  const report: DispatchReport = {
    read: pending.length,
    processed: 0,
    failed: 0,
    sent: 0,
    skipped: 0,
    written: 0,
  };
  const now = Date.now();

  for (const event of pending) {
    // The event waits for its turn when it was tried a moment ago.
    if (event.state === 'pending' && event.updatedAt.getTime() + backoffMs(event.attempts) > now) {
      continue;
    }

    // The event is claimed, so another worker leaves it alone.
    const claimed = await prisma.notificationEvent.updateMany({
      where: { id: event.id, state: event.state },
      data: { state: 'processing' },
    });
    if (claimed.count === 0) continue;

    try {
      const result = await deliverEvent(event);
      const failed = Object.values(result.outcomes).includes('failed');
      const attempts = event.attempts + 1;
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          // An event that failed too many times is not tried again: it is
          // read by the operator in the back office.
          state: failed ? (attempts >= MAX_ATTEMPTS ? 'failed' : 'pending') : 'processed',
          processedAt: failed ? null : new Date(),
          channels: result.outcomes as unknown as Prisma.InputJsonObject,
          attempts: { increment: 1 },
          lastError: failed ? 'one of the channels failed' : null,
          // The facts that hold a secret are emptied as soon as the message
          // is on the queue. A token of a verification never stays in the
          // outbox longer than the seconds it needs to reach the mail
          // server. The payload is only emptied when the event really went
          // through: a message that failed is tried again, and it needs its
          // token to be sent again.
          ...(eventDefinition(event.type)?.holdsSecret && !failed ? { payload: {} } : {}),
        },
      });
      report.processed += 1;
      report.sent += result.sent;
      report.skipped += result.skipped;
      report.written += result.written;
      if (failed) report.failed += 1;
    } catch (error) {
      report.failed += 1;
      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: {
          state: event.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts: { increment: 1 },
          lastError: (error as Error).message,
        },
      });
    }
  }

  return report;
}
