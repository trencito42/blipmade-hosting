import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { billingAddressSchema } from '../lib/billing-address.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { requireAuth, addressRateLimitKey } from '../plugins/auth.js';
import { platformSubdomainStatus } from '../services/provisioning.js';
import { recordDeviceSignal } from '../services/device-signal.js';
import { assertSponsoredShape, decideSponsoredOrder, heldForReview, verifyTurnstile } from '../services/promotion-policy.js';
import { buildQuote, releasePromotionReservation, reservePromotion } from '../services/pricing.js';
import { nextOrderNumber } from '../services/order-numbers.js';
import { createCheckout, createSponsoredSubscriptionCheckout, markOrderPaid, stripeTestGateway } from '../services/stripe.js';
import { fulfilOrder } from './webhooks.js';
import { audit } from '../lib/audit.js';
import { enqueueProvisioning } from '../services/queue.js';
import { notifyOrderCanceled, notifyOrderCreated, notifyPaymentRequired } from '../services/notifications.js';
import { MAX_OPTION_CODES, MAX_ORDER_LINES } from '../lib/bounded.js';
import { catalogSelectionSchema, resolveCatalogSelection } from '../services/catalog-projection.js';
import { importPresetKind } from '../services/catalog-install.js';
import { missingCompanions, quoteItemsForImport } from '../services/project-links.js';
import { companionProduct } from '../services/import-dependencies.js';
import type { PricedItem } from '../services/pricing.js';

function importSourceIdForOrderLine(bodyItem: { importSourceId?: string } | undefined, priced: PricedItem): string | undefined {
  const fromBody = bodyItem?.importSourceId?.trim();
  if (fromBody) return fromBody;
  return priced.importSourceId;
}

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
  // The name of the service and the subdomain it gets under the base of the platform.
  name: z.string().trim().min(1).max(60).optional(),
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3 to 40 letters, numbers or dashes.').optional(),
  // A virtual private server carries the public key that opens it and its name.
  sshPublicKey: z.string().trim().max(1000).optional(),
  vpsName: z.string().trim().max(60).optional(),
  // The values of the variables the product asks the customer for, such as
  // the licence of a game. They are checked and sealed before they are
  // written anywhere.
  variables: z.record(z.string(), z.string().max(400)).optional(),
  catalog: catalogSelectionSchema.optional(),
  importSourceId: z.string().max(40).optional(),
  managedImport: z.boolean().optional(),
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
          importSourceId: z.string().max(40).optional(),
          // The customer accepted the Minecraft EULA. Required for a Minecraft server: the customer agrees, not us.
          acceptEula: z.boolean().optional(),
        })
        .parse(request.body);

      let orderItems = body.items;
      if (body.importSourceId) {
        const source = await prisma.importSource.findFirst({
          where: { id: body.importSourceId, userId: user.id, appliedAt: null },
          select: { confirmedServices: true, productSlug: true },
        });
        if (!source) throw badRequest('That import was not found.');
        orderItems = orderItems.map((item) => (
          item.productSlug === source.productSlug
            ? { ...item, importSourceId: body.importSourceId, managedImport: true as const }
            : item
        ));
        const companions = (await Promise.all(source.confirmedServices.filter((slug) => companionProduct(slug)).map(async (slug) => {
          const row = await prisma.product.findUnique({ where: { slug }, select: { slug: true, defaultRam: true, defaultCpu: true, defaultDisk: true, visible: true, deployable: true } });
          return row?.visible && row.deployable ? { slug: row.slug, ram: row.defaultRam, cpu: row.defaultCpu, disk: row.defaultDisk } : null;
        }))).filter((row) => row !== null);
        orderItems = quoteItemsForImport(orderItems, companions);
      }

      for (const item of orderItems) {
        if (!item.importSourceId) continue;
        const source = await prisma.importSource.findFirst({ where: { id: item.importSourceId, userId: user.id, appliedAt: null } });
        if (!source) throw badRequest('That import does not match this product.');
        if (source.productSlug !== item.productSlug) {
          throw badRequest(`This project was prepared for ${source.productSlug}. Check it again for ${item.productSlug}. The order was not changed.`);
        }
        const missing = missingCompanions(source.confirmedServices, orderItems.map((line) => line.productSlug));
        if (missing.length) throw badRequest(`Confirm the order includes ${missing.join(', ')}. They were selected with this project.`);
      }

      const quote = await buildQuote(orderItems, body.promotionCode, user.id, body.period, { requireCredentials: true });

      for (let index = 0; index < quote.items.length; index += 1) {
        const priced = quote.items[index];
        if (!priced?.managedImport) continue;
        if (!importSourceIdForOrderLine(orderItems[index], priced)) {
          throw badRequest('This order included an imported project, but the import link was lost. Open deploy again from your import review.');
        }
      }

      // A Minecraft server runs under the EULA of Mojang. The platform never accepts it on a customer's behalf.
      const minecraft = quote.items.some((item) => item.productSlug.startsWith('minecraft-'));
      if (minecraft && body.acceptEula !== true) {
        throw badRequest('Accept the Minecraft EULA to order a Minecraft server.', { acceptEula: 'Required.' });
      }

      // A fully sponsored service provisions real compute without ever going
      // through the payment provider. Require control of the account's email
      // before reserving that capacity, otherwise disposable unverified
      // accounts could each consume one LAUNCH redemption.
      if (quote.promotionRecord && quote.total === 0 && !user.emailVerified) {
        throw badRequest('Verify your email address before using a promotion that covers the whole order.');
      }
      // The shape and the risk of a free order are decided here, on the server,
      // before anything is reserved or provisioned.
      if (quote.promotionRecord && quote.total === 0) {
        assertSponsoredShape(quote.items);
        const verdict = await decideSponsoredOrder(user, null);
        if (verdict.decision === 'review') heldForReview();
      }

      // The subdomain the customer picked must be free now. The provisioning checks again, so
      // two orders that race for the same name never share it.
      for (const item of quote.items) {
        if (!item.subdomain) continue;
        const status = await platformSubdomainStatus(item.subdomain);
        if (!status.available) throw conflict(status.reason ?? 'That address is not available.');
      }

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

      const catalogInputs = body.items.some((item) => item.catalog)
        ? await Promise.all(body.items.map((item) => (item.catalog ? resolveCatalogSelection(item.productSlug, item.optionCodes ?? [], item.catalog) : Promise.resolve(null))))
        : [];
      if (catalogInputs.length > quote.items.length) {
        throw badRequest('The catalogue choice could not be attached to this order.');
      }
      const catalogByLine = quote.items.map((_, index) => catalogInputs[index] ?? null);
      for (let index = 0; index < catalogByLine.length; index += 1) {
        const presetSlug = catalogByLine[index]?.preset?.slug;
        const kind = presetSlug ? importPresetKind(presetSlug) : null;
        if (!kind) continue;
        const importId = importSourceIdForOrderLine(orderItems[index], quote.items[index]!);
        const source = importId
          ? await prisma.importSource.findFirst({ where: { id: importId, userId: user.id, appliedAt: null } })
          : null;
        if (!source || source.kind !== kind || source.productSlug !== quote.items[index]!.productSlug) {
          throw badRequest('This preset deploys a project. Add a matching repository or archive before checkout.');
        }
      }
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
            create: quote.items.map((item, index) => ({
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
                instanceName: item.instanceName ?? null,
                eulaAcceptedAt: item.productSlug.startsWith('minecraft-') ? new Date().toISOString() : null,
                subdomain: item.subdomain ?? null,
                vps: item.vps ?? null,
                // The values the customer gave for the variables of the
                // product, sealed. They are the secrets of the customer, and
                // they travel with the line until the instance is built.
                sealedVariables: item.sealedVariables ?? null,
                ...(catalogByLine[index] ? { catalog: catalogByLine[index] } : {}),
                ...((): Record<string, string> => {
                  const importSourceId = importSourceIdForOrderLine(orderItems[index], item);
                  return importSourceId ? { importSourceId } : {};
                })(),
              } as unknown as Prisma.InputJsonValue,
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
            free: quote.total === 0,
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
      if (minecraft) {
        await audit({ actorId: user.id, actorEmail: user.email, action: 'order.minecraft_eula_accepted', targetType: 'order', targetId: order.id, meta: { eula: 'https://www.minecraft.net/en-us/eula' }, ip: request.ip });
      }

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

    // A fully sponsored order can still be required to prove one real card.
    // Stripe creates the subscription with a one-use 100% discount, collects
    // the card for renewal, and the signed webhook performs fulfilment only
    // after the card fingerprint has passed the campaign-wide uniqueness gate.
    if (order.total === 0) {
      // The decision is made again at the moment of activation: the risk can
      // have changed since the order was created, and nothing is provisioned
      // before it is confirmed.
      let cardRequired = env.PROMOTION_CARD_CHECK_ENABLED;
      if (order.promotionId) {
        const extra = z.object({ turnstileToken: z.string().max(4096).optional(), deviceId: z.string().max(100).optional() }).parse(request.body ?? {});
        await verifyTurnstile(extra.turnstileToken, request.ip);
        // The browser identifier is optional and untrusted; a missing one changes nothing.
        await recordDeviceSignal(user.id, extra.deviceId).catch(() => undefined);
        const verdict = await decideSponsoredOrder(user, order.id);
        if (verdict.decision === 'review') heldForReview();
        cardRequired = cardRequired || verdict.cardCheck;
      }
      if (cardRequired && order.promotionId) {
        const checkout = await createSponsoredSubscriptionCheckout(order, user.email);
        await prisma.order.update({ where: { id: order.id }, data: { status: 'AWAITING_PAYMENT' } });
        await audit({
          actorId: user.id,
          actorEmail: user.email,
          action: 'order.promotion_card_check_started',
          targetType: 'order',
          targetId: order.id,
        });
        return {
          url: checkout.url,
          sessionId: checkout.sessionId,
          message: 'No charge is due today. Stripe verifies and saves the card for renewal.',
          free: true,
          cardCheck: true,
          testGateway: false,
        };
      }

      // Local/test installations can keep the original no-provider flow.
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
    if (order.status === 'CANCELLED') return reply.code(204).send();
    if (order.status === 'FULFILLED') throw badRequest('This order has already been fulfilled.');
    if (order.status === 'PAID') throw badRequest('A paid order cannot be cancelled. Cancel the subscription instead.');
    // A refunded order keeps the trace of the refund. Cancelling it again
    // would erase the state that says the money was returned, and the guard
    // that refuses a dead order reads that state.
    if (order.status === 'REFUNDED') throw badRequest('This order was refunded and cannot be cancelled.');
    if (order.status === 'FAILED') throw conflict('This failed order requires payment reconciliation before it can be cancelled.');

    const cancelled = await prisma.order.updateMany({
      where: { id: order.id, userId: user.id, status: { in: ['PENDING', 'AWAITING_PAYMENT'] } },
      data: { status: 'CANCELLED' },
    });
    if (cancelled.count !== 1) throw conflict('The order changed while cancellation was requested. Reload its status.');
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
