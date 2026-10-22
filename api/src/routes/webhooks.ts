import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { markOrderPaid, stripeLive, stripeTestGateway } from '../services/stripe.js';
import { enqueueProvisioning } from '../services/queue.js';
import { audit } from '../lib/audit.js';

/**
 * Stripe webhook receiver.
 *
 * Every event is recorded in the WebhookEvent ledger before it is processed, so
 * a redelivery of the same event is ignored instead of being applied twice.
 * The handler always answers 200: a provider that cannot retry a failed
 * delivery would lose the event entirely.
 */

/** Parses a JSON payload without throwing on malformed input. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function claimEvent(provider: string, eventId: string, type: string, payload: unknown): Promise<boolean> {  try {
    await prisma.webhookEvent.create({
      data: { provider, eventId, type, payload: payload as never },
    });
    return true;
  } catch {
    // Unique constraint violation: this event was already seen.
    return false;
  }
}

async function fulfilOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;

  await markOrderPaid({ orderId, stripeSubscriptionId: `sub_${order.id}` });

  // Each order item becomes an instance, provisioned by the worker.
  for (const item of order.items) {
    const config = (item.config ?? {}) as { ram?: number; cpu?: number; disk?: number };
    const existing = await prisma.instance.findFirst({ where: { orderId: order.id, productId: item.productId } });
    if (existing) continue;

    const instance = await prisma.instance.create({
      data: {
        userId: order.userId,
        productId: item.productId,
        orderId: order.id,
        name: item.name,
        status: 'PENDING',
        ram: config.ram ?? 512,
        cpu: config.cpu ?? 1,
        disk: config.disk ?? 5,
        price: item.unitAmount,
        currency: order.currency,
        // Idempotency key: one provisioning run per instance.
        provisioningKey: `order:${order.id}:item:${item.id}`,
      },
    });

    await enqueueProvisioning(instance.id, { reason: 'order paid' });
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: 'FULFILLED' } });
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/stripe', async (request: FastifyRequest, reply) => {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    let event: { id: string; type: string; data: { object: Record<string, unknown> } };

    if (stripeLive()) {
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string' || !env.STRIPE_WEBHOOK_SECRET) {
        request.log.warn('stripe webhook without a signature');
        return reply.code(400).send({ received: false, reason: 'Missing signature.' });
      }
      // Signature verification is performed by the Stripe SDK.
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      let constructed: { id: string; type: string; data: { object: Record<string, unknown> } };
      try {
        constructed = stripe.webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET) as never;
      } catch {
        return reply.code(400).send({ received: false, reason: 'Signature verification failed.' });
      }
      event = constructed;
    } else if (stripeTestGateway()) {
      try {
        event = JSON.parse(raw) as typeof event;
      } catch {
        return reply.code(400).send({ received: false, reason: 'Invalid JSON.' });
      }
    } else {
      // No Stripe configured: nothing to accept.
      return reply.code(200).send({ received: false, reason: 'Stripe is not configured.' });
    }

    const claimed = await claimEvent('stripe', event.id, event.type, event.data);
    if (!claimed) {
      // Already processed. Answering 200 keeps the provider from retrying.
      return reply.code(200).send({ received: true, duplicate: true });
    }

    try {
      await handleStripeEvent(event);
      await prisma.webhookEvent.update({ where: { provider_eventId: { provider: 'stripe', eventId: event.id } }, data: { processedAt: new Date() } });
    } catch (error) {
      request.log.error({ err: error, eventId: event.id }, 'stripe webhook processing failed');
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
        data: { error: error instanceof Error ? error.message : String(error) },
      });
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
        amount: z.number().int().optional(),
      })
      .parse(typeof request.body === 'string' ? safeJsonParse(request.body) : request.body);

    const event = {
      id: body.id ?? `evt_test_${body.orderId}_${Date.now()}`,
      type: body.type,
      data: {
        object: {
          id: body.subscriptionId ?? `sub_${body.orderId}`,
          client_reference_id: body.orderId,
          metadata: { orderId: body.orderId },
          payment_intent: body.paymentIntentId ?? `pi_${body.orderId}`,
          amount_total: body.amount,
          subscription: body.subscriptionId ?? `sub_${body.orderId}`,
        },
      },
    };

    const claimed = await claimEvent('stripe', event.id, event.type, event.data);
    if (!claimed) return reply.code(200).send({ received: true, duplicate: true });

    try {
      await handleStripeEvent(event);
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
        data: { processedAt: new Date() },
      });
    } catch (error) {
      request.log.error({ err: error, eventId: event.id }, 'stripe webhook processing failed');
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider: 'stripe', eventId: event.id } },
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
    return reply.code(200).send({ received: true, eventId: event.id });
  });
}

async function handleStripeEvent(event: { id: string; type: string; data: { object: Record<string, unknown> } }): Promise<void> {
  const object = event.data.object ?? {};

  switch (event.type) {
    case 'checkout.session.completed': {
      const orderId = (object.client_reference_id as string) ?? (object.metadata as { orderId?: string })?.orderId;
      if (!orderId) break;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) break;
      await markOrderPaid({
        orderId,
        stripePaymentIntentId: (object.payment_intent as string) ?? null,
        stripeSubscriptionId: (object.subscription as string) ?? null,
        amount: typeof object.amount_total === 'number' ? object.amount_total : undefined,
      });
      await fulfilOrder(orderId);
      break;
    }

    case 'invoice.paid': {
      const invoiceId = object.id as string;
      const subscriptionId = object.subscription as string | undefined;
      const dbInvoice = await prisma.invoice.findUnique({ where: { stripeInvoiceId: invoiceId } });
      if (dbInvoice) {
        await prisma.invoice.update({ where: { id: dbInvoice.id }, data: { status: 'PAID', paidAt: new Date() } });
      }
      if (subscriptionId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const subscriptionId = object.subscription as string | undefined;
      if (subscriptionId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: 'PAST_DUE' },
        });
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
            status === 'CANCELLED' ? 'CANCELLED' : status === 'PAST_DUE' ? 'PAST_DUE' : status === 'TRIALING' ? 'TRIALING' : 'ACTIVE',
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
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
