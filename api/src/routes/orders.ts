import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { billingAddressSchema } from '../lib/billing-address.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { requireAuth, addressRateLimitKey } from '../plugins/auth.js';
import { buildQuote, releasePromotionReservation, reservePromotion } from '../services/pricing.js';
import { nextOrderNumber } from '../services/order-numbers.js';
import { createCheckout, markOrderPaid, stripeTestGateway } from '../services/stripe.js';
import { fulfilOrder } from './webhooks.js';
import { audit } from '../lib/audit.js';
import { enqueueProvisioning } from '../services/queue.js';
import { notifyOrderCanceled, notifyOrderCreated, notifyPaymentRequired } from '../services/notifications.js';
import { MAX_OPTION_CODES, MAX_ORDER_LINES } from '../lib/bounded.js';

/**
 * The routes of an order that has no limit of their own.
 *
 * The checkout, the confirmation and the cancellation only write rows
 * in the database of the platform, so they carry the limit of the
 * account: the limit is counted for the account of the customer and for
 * the address of the caller.
 */

const orderItemSchema = z.object({
  productSlug: z.string().min(1),
  // A line of servers carries its resources. A line of mail carries the
  // domain it wants and no resources: the plan of the line is the whole
  // configuration. What a line means is decided by the product, on the
  // server, and never by the customer.
  ram: z.number().int().positive().optional(),
  cpu: z.number().int().positive().optional(),
  disk: z.number().int().positive().optional(),
  optionCodes: z.array(z.string()).max(MAX_OPTION_CODES).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
  mailDomain: z.string().trim().max(253).optional(),
  // The values of the variables the product asks the customer for, such as
  // the licence of a game. They are checked and sealed before they are
  // written anywhere.
  variables: z.record(z.string().max(400)).optional(),
});

function serializeOrder(order: {
  id: string;
  number: string;
  status: string;
  total: number;
  discount: number;
  currency: string;
  createdAt: Date;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitAmount: number;
    total: number;
    config: unknown;
    fulfillmentStatus: string;
    fulfillmentError: string | null;
    product: { slug: string };
  }[];
}) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    total: order.total,
    discount: order.discount,
    currency: order.currency,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      productSlug: item.product.slug,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      total: item.total,
      // The state of the delivery of this line, on its own: a line of mail
      // and a line of server do not progress together.
      fulfillmentStatus: item.fulfillmentStatus,
      fulfillmentError: item.fulfillmentError,
      config: item.config as {
        ram: number;
        cpu: number;
        disk: number;
        optionCodes: string[];
        fulfilment?: string;
        mailDomain?: string | null;
      } | null,
    })),
  };
}



export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/orders', {
    config: { rateLimit: { max: 30, timeWindow: '10 minutes', keyGenerator: addressRateLimitKey } },
    handler: async (request: FastifyRequest, reply) => {
      const user = await requireAuth(request);
      const body = z
        .object({
          items: z.array(orderItemSchema).min(1, 'Choose at least one app.').max(MAX_ORDER_LINES),
          promotionCode: z.string().trim().optional(),
          billingAddress: billingAddressSchema.optional(),
          // The period of the price that is ordered. It has to be the same
          // period as the one that was quoted, otherwise the order would be
          // priced with another period than the one the customer was shown.
          period: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
        })
        .parse(request.body);

      const quote = await buildQuote(body.items, body.promotionCode, user.id, body.period);

      // A domain that another customer already hosts is refused here, before
      // the customer is charged for it. The platform would refuse it later
      // anyway, at the moment of the provisioning, and a customer that paid
      // for a domain that cannot be hosted would have to be refunded.
      for (const item of quote.items) {
        if (item.fulfilment !== 'EMAIL' || !item.mailDomain) continue;
        const taken = await prisma.mailDomain.findFirst({
          where: { name: item.mailDomain, userId: { not: user.id } },
          select: { id: true },
        });
        if (taken) {
          throw conflict('This domain is already hosted for another customer.');
        }
      }

      const savedAddress = await prisma.user.findUnique({ where: { id: user.id }, select: { billingAddress: true } });
      const billingAddress = body.billingAddress ?? savedAddress?.billingAddress ?? null;

      const order = await prisma.order.create({
        data: {
          number: await nextOrderNumber(),
          userId: user.id,
          billingAddress: billingAddress as never,
          status: 'PENDING',
          total: quote.total,
          discount: quote.discount,
          currency: quote.currency,
          promotionId: quote.promotionRecord?.id ?? null,
          items: {
            create: quote.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity ?? 1,
              unitAmount: item.unitAmount,
              total: item.total,
              currency: item.currency,
              config: {
                ram: item.ram,
                cpu: item.cpu,
                disk: item.disk,
                optionCodes: item.optionCodes,
                // The period of the price travels with the line, so the
                // payment provider is asked for the right interval.
                period: item.price.period,
                // What the line delivers and the domain it brings. The line
                // of a mail is delivered by the mail system and not by the
                // panel, so it has to know which of the two it is.
                fulfilment: item.fulfilment,
                mailDomain: item.mailDomain ?? null,
                // The values the customer gave for the variables of the
                // product, sealed. They are the secrets of the customer, and
                // they travel with the line until the instance is built.
                sealedVariables: item.sealedVariables ?? null,
              },
            })),
          },
        },
        include: { items: { include: { product: { select: { slug: true } } } } },
      });

      // The promotion is reserved, not consumed. The campaign slot is only
      // used when the payment is confirmed, so unpaid orders cannot exhaust a
      // campaign. The reservation expires on its own if the order is abandoned.
      if (quote.promotionRecord) {
        try {
          await reservePromotion({
            promotionId: quote.promotionRecord.id,
            userId: user.id,
            orderId: order.id,
            amount: quote.discount,
          });
        } catch (error) {
          // The order was created a moment ago and nothing points at it yet,
          // so it is removed. An order that did not get a campaign slot must
          // not keep the price of a campaign it never reserved.
          await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
          throw error;
        }
      }

      if (body.billingAddress) await prisma.user.update({ where: { id: user.id }, data: { billingAddress: body.billingAddress } });
      await audit({ actorId: user.id, actorEmail: user.email, action: 'order.created', targetType: 'order', targetId: order.id, meta: { total: order.total } });

      // The customer is told that the order exists. The payment demand is a
      // second event, published when the customer is really sent to the
      // checkout, so an order that is never paid is never nagged about.
      await notifyOrderCreated({
        userId: user.id,
        number: order.number,
        total: order.total,
        currency: order.currency,
      });
      return reply.code(201).send({ order: serializeOrder(order) });
    },
  });

  app.get('/orders', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 100, maxSize: 200 });
    const rows = await prisma.order.findMany({
      where: withCursor({ userId: user.id }, cursor, 'createdAt'),
      include: { items: { include: { product: { select: { slug: true } } } } },
      orderBy: pageOrder('createdAt'),
      take: limit + 1,
    });
    const page = pageOf(rows, limit, 'createdAt');
    return { orders: page.rows.map(serializeOrder), pagination: page.pagination };
  });

  app.get('/orders/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const order = await prisma.order.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });
    if (!order) throw notFound('Order not found.');
    return { order: serializeOrder(order) };
  });

  app.post('/orders/:id/checkout', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const order = await prisma.order.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });
    if (!order) throw notFound('Order not found.');
    if (order.status === 'PAID' || order.status === 'FULFILLED') {
      throw badRequest('This order has already been paid.');
    }

    // A cancelled or refunded order is dead: it cannot be sent to a checkout
    // again, because the checkout would bring it back to life as an order
    // waiting for a payment, and the payment would make it a paid order with
    // its infrastructure. The order that failed is not dead: a payment that
    // failed can be tried again, and that is the way back for the operator.
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      throw conflict(`This order cannot be paid: its status is ${order.status.toLowerCase()}.`);
    }

    // An order that a promotion covers completely costs nothing, so there is
    // no amount to collect. The order is confirmed and provisioned without a
    // payment provider, instead of sending the customer to a checkout of zero.
    if (order.total === 0) {
      await markOrderPaid({ orderId: order.id, amount: 0 });
      await fulfilOrder(order.id);
      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'order.checkout_completed',
        targetType: 'order',
        targetId: order.id,
        meta: { total: 0, free: true },
      });
      return {
        url: null,
        sessionId: null,
        message: 'This order is covered by the promotion, so no payment was due.',
        free: true,
        testGateway: stripeTestGateway(),
      };
    }

    const checkout = await createCheckout(order, user.email);
    if (!checkout.url) {
      return { url: null, sessionId: checkout.sessionId, message: checkout.reason ?? 'Checkout is unavailable.' };
    }

    await prisma.order.update({ where: { id: order.id }, data: { status: 'AWAITING_PAYMENT' } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'order.checkout_started', targetType: 'order', targetId: order.id });

    // The customer is sent to the checkout, so the order is really waiting
    // for its payment. This is the moment the demand for payment belongs
    // to.
    await notifyPaymentRequired({
      userId: user.id,
      number: order.number,
      total: order.total,
      currency: order.currency,
    });

    return { url: checkout.url, sessionId: checkout.sessionId, message: null, testGateway: stripeTestGateway() };
  });

  /**
   * Confirms the payment of an order through the local test gateway.
   *
   * The local gateway stands in for the payment provider, so the browser
   * comes back to the billing page with the session in the address and
   * nothing else happens: the order would wait for a payment that never
   * arrives. This route is the way back: the customer confirms, the order is
   * marked as paid through the same function the webhook uses, and the
   * services are provisioned.
   *
   * The route exists only while the local gateway is in use. On a live site
   * the payment provider confirms the payment through its own webhook, and
   * this route refuses, so nobody can mark an order paid from the browser.
   */
  app.post('/orders/:id/confirm', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!stripeTestGateway()) {
      throw notFound('This order cannot be confirmed here.');
    }
    const order = await prisma.order.findFirst({ where: { id, userId: user.id } });
    if (!order) throw notFound('Order not found.');
    if (order.status === 'PAID' || order.status === 'FULFILLED') {
      // The order is already paid: the answer is the state of the order, so
      // the page can show it. Nothing is confirmed twice.
      return { order: { id: order.id, status: order.status, total: order.total }, alreadyPaid: true };
    }
    if (order.status !== 'PENDING' && order.status !== 'AWAITING_PAYMENT') {
      throw conflict(`This order is ${order.status} and cannot be confirmed.`);
    }

    await markOrderPaid({ orderId: order.id, amount: order.total });
    await fulfilOrder(order.id);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'order.checkout_completed',
      targetType: 'order',
      targetId: order.id,
      meta: { total: order.total, testGateway: true },
    });

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    return { order: { id: order.id, status: updated?.status ?? 'PAID', total: order.total }, alreadyPaid: false };
  });

  app.post('/orders/:id/cancel', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const order = await prisma.order.findFirst({ where: { id, userId: user.id } });
    if (!order) throw notFound('Order not found.');
    if (order.status === 'FULFILLED') throw badRequest('This order has already been fulfilled.');
    if (order.status === 'PAID') throw badRequest('A paid order cannot be cancelled. Cancel the subscription instead.');
    // A refunded order keeps the trace of the refund. Cancelling it again
    // would erase the state that says the money was returned, and the guard
    // that refuses a dead order reads that state.
    if (order.status === 'REFUNDED') throw badRequest('This order was refunded and cannot be cancelled.');

    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    // The campaign slot goes back into the pool.
    await releasePromotionReservation(order.id);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'order.cancelled', targetType: 'order', targetId: order.id });
    await notifyOrderCanceled({ userId: user.id, number: order.number });
    return reply.code(204).send();
  });
}

// The helper lives in a service, so every place that creates an order takes
// its number from the same counter.
export { nextOrderNumber };
