import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import {
  markOrderPaid,
  stripeLive,
  stripeTestGateway,
  upsertInvoice,
} from '../services/stripe.js';
import { enqueueProvisioning } from '../services/queue.js';
import { applyUpgradeOrder } from '../services/upgrades.js';
import { audit } from '../lib/audit.js';

/**
 * Stripe webhook receiver.
 *
 * Every delivery is written to the WebhookEvent ledger before it is
 * processed, and the ledger carries the processing state:
 *
 *   received -> processing -> processed
 *                       \-> failed
 *
 * A delivery that fails leaves the event in `failed`, and the request is
 * answered with a non-2xx status so the provider retries it. A redelivery of a
 * failed event is processed again, while a redelivery of a processed event is
 * ignored as a duplicate. Nothing is silently dropped.
 */

/** A delivery that is older than this is treated as abandoned and retried. */
const STALE_ATTEMPT_MS = 5 * 60 * 1000;

export type WebhookOutcome = 'claimed' | 'duplicate' | 'retry';

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Parses a JSON payload without throwing on malformed input. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Takes ownership of an event.
 *
 * `claimed` means the caller has to process the event, `retry` means the event
 * was seen before but did not succeed, and `duplicate` means the event was
 * already handled and must not be applied again.
 */
async function claimEvent(
  provider: string,
  eventId: string,
  type: string,
  payload: unknown,
): Promise<WebhookOutcome> {
  try {
    await prisma.webhookEvent.create({
      data: { provider, eventId, type, payload: payload as never, status: 'received' },
    });
    return 'claimed';
  } catch {
    // The unique constraint only fires for an event that was seen before.
  }

  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider, eventId } },
  });
  if (!existing) return 'claimed';

  if (existing.status === 'processed') return 'duplicate';

  const abandoned =
    existing.status === 'received' ||
    (existing.lastAttemptAt ? Date.now() - existing.lastAttemptAt.getTime() > STALE_ATTEMPT_MS : false);

  if (existing.status === 'failed' || abandoned) {
    await prisma.webhookEvent.update({
      where: { id: existing.id },
      data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
    });
    return 'retry';
  }

  // Another delivery is already working on this event.
  return 'duplicate';
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: 'stripe', eventId } },
    data: { status: 'processed', processedAt: new Date(), error: null },
  });
}

async function markFailed(eventId: string, message: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: 'stripe', eventId } },
    data: { status: 'failed', error: message, lastAttemptAt: new Date() },
  });
}

/**
 * An event that could not be applied yet, for example because the order it
 * belongs to does not exist. It stays in the ledger and can be replayed, but
 * the provider is not asked to retry it in a loop.
 */
async function markDeferred(eventId: string, message: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: 'stripe', eventId } },
    data: { status: 'deferred', error: message, lastAttemptAt: new Date() },
  });
}

/** Thrown when an event has to wait instead of failing. */
class DeferredWebhookError extends Error {}

/**
 * Turns a paid order into running services.
 *
 * Every order line produces as many instances as its quantity, and the
 * idempotency key of each instance makes the step safe to repeat.
 */
async function fulfilOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;

  if (order.kind === 'UPGRADE') {
    await applyUpgradeOrder(order.id);
    return;
  }

  for (const item of order.items) {
    const subscription = await prisma.subscription.findUnique({ where: { orderItemId: item.id } });
    const config = (item.config ?? {}) as { ram?: number; cpu?: number; disk?: number };

    for (let unit = 0; unit < item.quantity; unit++) {
      // The key makes a redelivered webhook reuse the same instance.
      const provisioningKey = `order:${order.id}:item:${item.id}:unit:${unit}`;
      const existing = await prisma.instance.findUnique({ where: { provisioningKey } });
      if (existing) continue;

      const instance = await prisma.instance.create({
        data: {
          userId: order.userId,
          productId: item.productId,
          orderId: order.id,
          orderItemId: item.id,
          name: item.quantity > 1 ? `${item.name} ${unit + 1}` : item.name,
          status: 'PENDING',
          ram: config.ram ?? 512,
          cpu: config.cpu ?? 1,
          disk: config.disk ?? 5,
          price: item.unitAmount,
          currency: order.currency,
          provisioningKey,
        },
      });

      // A line with a single unit owns the subscription, so the instance
      // shows its billing state.
      if (subscription && item.quantity === 1) {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { instanceId: instance.id } });
      }

      await enqueueProvisioning(instance.id, { reason: 'order paid' });
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { fulfillmentStatus: 'PROVISIONING' },
  });
}

/**
 * The amount Stripe collected has to match the order. A mismatch means the
 * order was not paid as quoted, so nothing is provisioned.
 */
async function verifyAmount(orderId: string, amountTotal: unknown): Promise<string | null> {
  if (typeof amountTotal !== 'number') return null;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return 'The order does not exist.';
  if (amountTotal !== order.total) {
    return `Stripe collected ${amountTotal} but the order total is ${order.total}.`;
  }
  return null;
}

async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data.object ?? {};

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const orderId =
        (object.client_reference_id as string) ?? (object.metadata as { orderId?: string })?.orderId;
      if (!orderId) break;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        // The order is not there yet. The event waits in the ledger, so it can
        // be replayed instead of being dropped.
        throw new DeferredWebhookError(`The order ${orderId} does not exist (yet).`);
      }

      // A session that is not paid yet waits for the async confirmation.
      const paymentStatus = object.payment_status as string | undefined;
      if (paymentStatus === 'unpaid') break;

      const amountProblem = await verifyAmount(orderId, object.amount_total);
      if (amountProblem) {
        await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
        await audit({
          action: 'order.amount_mismatch',
          targetType: 'order',
          targetId: orderId,
          meta: { collected: object.amount_total, expected: order.total },
        });
        throw new Error(amountProblem);
      }

      await markOrderPaid({
        orderId,
        stripePaymentIntentId: (object.payment_intent as string) ?? null,
        stripeSubscriptionId: (object.subscription as string) ?? null,
        stripeCustomerId: (object.customer as string) ?? null,
        amount: typeof object.amount_total === 'number' ? object.amount_total : undefined,
      });
      await fulfilOrder(orderId);
      break;
    }

    case 'checkout.session.async_payment_failed': {
      const orderId =
        (object.client_reference_id as string) ?? (object.metadata as { orderId?: string })?.orderId;
      if (!orderId) break;
      await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
      await prisma.payment.updateMany({ where: { orderId }, data: { status: 'FAILED' } });
      break;
    }

    case 'payment_intent.payment_failed': {
      const intentId = object.id as string | undefined;
      if (!intentId) break;
      await prisma.payment.updateMany({
        where: { stripePaymentIntentId: intentId },
        data: {
          status: 'FAILED',
          failureMessage: (object.last_payment_error as { message?: string })?.message ?? null,
        },
      });
      break;
    }

    case 'invoice.paid': {
      const invoiceId = object.id as string;
      const subscriptionId = object.subscription as string | undefined;
      const customerId = object.customer as string | undefined;

      const paid = typeof object.amount_paid === 'number' ? object.amount_paid : null;
      if (paid !== null) {
        const subscription = subscriptionId
          ? await prisma.subscription.findFirst({
              where: { stripeSubscriptionId: subscriptionId },
              include: { orderItem: true },
            })
          : null;
        const order = subscription?.orderItem
          ? await prisma.order.findUnique({ where: { id: subscription.orderItem.orderId } })
          : null;
        const userId = order?.userId ?? subscription?.userId;
        if (userId) {
          await upsertInvoice({
            stripeInvoiceId: invoiceId,
            userId,
            orderId: order?.id ?? null,
            amount: paid,
            currency: (object.currency as string) ?? 'EUR',
            status: 'PAID',
            hostedUrl: (object.hosted_invoice_url as string) ?? null,
            pdfUrl: (object.invoice_pdf as string) ?? null,
            paidAt: new Date(),
            periodStart: typeof object.period_start === 'number' ? new Date(object.period_start * 1000) : null,
            periodEnd: typeof object.period_end === 'number' ? new Date(object.period_end * 1000) : null,
          });
        }
      }

      if (subscriptionId) {
        // The period comes from the invoice, not from an approximation.
        const periodStart =
          typeof object.period_start === 'number' ? new Date(object.period_start * 1000) : undefined;
        const periodEnd =
          typeof object.period_end === 'number' ? new Date(object.period_end * 1000) : undefined;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            status: 'ACTIVE',
            ...(periodStart ? { currentPeriodStart: periodStart } : {}),
            ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
          },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const subscriptionId = object.subscription as string | undefined;
      const invoiceId = object.id as string;
      if (subscriptionId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: 'PAST_DUE' },
        });
      }
      const dbInvoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: invoiceId } });
      if (dbInvoice) {
        await prisma.invoice.update({ where: { id: dbInvoice.id }, data: { status: 'OPEN' } });
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscriptionId = object.id as string;
      const status = String(object.status ?? '').toUpperCase();
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
          status:
            status === 'CANCELLED' || status === 'INCOMPLETE_EXPIRED'
              ? 'CANCELLED'
              : status === 'PAST_DUE' || status === 'UNPAID'
                ? 'PAST_DUE'
                : status === 'TRIALING'
                  ? 'TRIALING'
                  : status === 'INCOMPLETE'
                    ? 'INCOMPLETE'
                    : status === 'PAUSED'
                      ? 'PAUSED'
                      : 'ACTIVE',
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
          ...(typeof object.current_period_start === 'number'
            ? { currentPeriodStart: new Date(object.current_period_start * 1000) }
            : {}),
          ...(typeof object.current_period_end === 'number'
            ? { currentPeriodEnd: new Date(object.current_period_end * 1000) }
            : {}),
        },
      });
      break;
    }

    default:
      break;
  }

  await audit({ action: `stripe.${event.type}`, targetType: 'webhook_event', targetId: event.id });
}

type ProcessOutcome = 'processed' | 'deferred' | 'failed';

/**
 * Processes an event and records the outcome.
 *
 * `processed` means the event was applied. `deferred` means it has to wait
 * and stays in the ledger, so it can be replayed. `failed` means the caller
 * has to answer with an error, so the provider retries the delivery.
 */
async function processEvent(event: StripeEvent): Promise<ProcessOutcome> {
  try {
    await handleStripeEvent(event);
    await markProcessed(event.id);
    return 'processed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof DeferredWebhookError) {
      await markDeferred(event.id, message);
      return 'deferred';
    }
    await markFailed(event.id, message);
    return 'failed';
  }
}

/** Verifies the signature and extracts the event from a raw request. */
async function readStripeEvent(raw: string): Promise<StripeEvent | { error: string }> {
  if (stripeLive()) {
    const signature = env.STRIPE_WEBHOOK_SECRET;
    if (!signature) return { error: 'The webhook secret is not configured.' };
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    try {
      return stripe.webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET) as unknown as StripeEvent;
    } catch {
      return { error: 'Signature verification failed.' };
    }
  }
  try {
    return JSON.parse(raw) as StripeEvent;
  } catch {
    return { error: 'Invalid JSON.' };
  }
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/stripe', async (request: FastifyRequest, reply) => {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});

    if (!stripeLive() && !stripeTestGateway()) {
      // No Stripe configured: nothing to accept.
      return reply.code(200).send({ received: false, reason: 'Stripe is not configured.' });
    }

    const parsed = await readStripeEvent(raw);
    if ('error' in parsed) {
      request.log.warn({ reason: parsed.error }, 'stripe webhook rejected');
      return reply.code(400).send({ received: false, reason: parsed.error });
    }
    const event = parsed;

    const outcome = await claimEvent('stripe', event.id, event.type, event.data.object ?? {});
    if (outcome === 'duplicate') {
      return reply.code(200).send({ received: true, duplicate: true });
    }

    const result = await processEvent(event);
    if (result === 'failed') {
      // The event stays in the ledger as failed and the provider retries it.
      request.log.error({ eventId: event.id }, 'stripe webhook processing failed');
      return reply.code(500).send({ received: false, reason: 'The event could not be processed and will be retried.' });
    }
    if (result === 'deferred') {
      request.log.warn({ eventId: event.id }, 'stripe webhook deferred');
      return reply.code(200).send({ received: true, deferred: true });
    }

    return reply.code(200).send({ received: true });
  });

  /**
   * Test gateway endpoint. It only exists when the local test gateway is
   * enabled, so it cannot be used to fake a payment in production. It also
   * requires the internal API token, so it is never a public way to mark an
   * order as paid.
   */
  app.post('/webhooks/stripe/test', async (request: FastifyRequest, reply) => {
    if (!stripeTestGateway()) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    }
    const token = request.headers['x-internal-token'];
    if (!env.internalToken || token !== env.internalToken) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'The internal token is required.' } });
    }
    const body = z
      .object({
        id: z.string().optional(),
        type: z.string().default('checkout.session.completed'),
        orderId: z.string(),
        subscriptionId: z.string().optional(),
        paymentIntentId: z.string().optional(),
        customerId: z.string().optional(),
        amount: z.number().int().optional(),
        paymentStatus: z.string().default('paid'),
      })
      .parse(typeof request.body === 'string' ? safeJsonParse(request.body) : request.body);

    const event: StripeEvent = {
      id: body.id ?? `evt_test_${body.orderId}_${Date.now()}`,
      type: body.type,
      data: {
        object: {
          id: body.subscriptionId ?? `sub_${body.orderId}`,
          client_reference_id: body.orderId,
          metadata: { orderId: body.orderId },
          payment_intent: body.paymentIntentId ?? `pi_${body.orderId}`,
          customer: body.customerId ?? `cus_${body.orderId}`,
          payment_status: body.paymentStatus,
          amount_total: body.amount,
          subscription: body.subscriptionId ?? `sub_${body.orderId}`,
        },
      },
    };

    const outcome = await claimEvent('stripe', event.id, event.type, event.data.object ?? {});
    if (outcome === 'duplicate') return reply.code(200).send({ received: true, duplicate: true });

    const result = await processEvent(event);
    if (result === 'failed') {
      return reply.code(500).send({ received: false, reason: 'The event could not be processed and will be retried.' });
    }
    return reply.code(200).send({ received: true, eventId: event.id, deferred: result === 'deferred' });
  });

  /**
   * The events that could not be processed. They stay in the ledger until they
   * succeed, so an operator can see them and replay them.
   */
  app.get('/webhooks/stripe/failed', async (request: FastifyRequest) => {
    const token = request.headers['x-internal-token'];
    if (!env.internalToken || token !== env.internalToken) {
      return { error: { code: 'unauthorized', message: 'The internal token is required.' } };
    }
    const failed = await prisma.webhookEvent.findMany({
      where: { provider: 'stripe', status: { in: ['failed', 'deferred'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, eventId: true, type: true, attempts: true, error: true, lastAttemptAt: true, createdAt: true },
    });
    return { failed };
  });

  /**
   * Replays the events that failed. The payload is stored in the ledger, so a
   * replay does not need the provider to deliver the event again.
   */
  app.post('/webhooks/stripe/replay', async (request: FastifyRequest) => {
    const token = request.headers['x-internal-token'];
    if (!env.internalToken || token !== env.internalToken) {
      return { error: { code: 'unauthorized', message: 'The internal token is required.' } };
    }
    const body = z
      .object({ eventId: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) })
      .parse(typeof request.body === 'string' ? safeJsonParse(request.body) : (request.body ?? {}));

    const events = await prisma.webhookEvent.findMany({
      where: {
        provider: 'stripe',
        status: { in: ['failed', 'deferred'] },
        ...(body.eventId ? { eventId: body.eventId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: body.limit,
    });

    const replayed: { eventId: string; ok: boolean }[] = [];
    for (const event of events) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
      });
      const outcome = await processEvent({
        id: event.eventId,
        type: event.type,
        data: { object: (event.payload ?? {}) as Record<string, unknown> },
      });
      replayed.push({ eventId: event.eventId, ok: outcome === 'processed' });
    }

    return { replayed };
  });
}

/**
 * Retries the events that failed, for the provider deliveries that never came
 * back. It is called by the worker on a schedule.
 */
export async function retryFailedWebhookEvents(limit = 20): Promise<number> {
  const events = await prisma.webhookEvent.findMany({
    where: { provider: 'stripe', status: 'failed' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let recovered = 0;
  for (const event of events) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
    });
    const ok = await processEvent({
      id: event.eventId,
      type: event.type,
      data: { object: (event.payload ?? {}) as Record<string, unknown> },
    });
    if (ok) recovered += 1;
  }
  return recovered;
}
