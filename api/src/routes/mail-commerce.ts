import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { BillingPeriod, Prisma, ProductPrice } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { deploymentAvailability, type DeploymentAvailability } from '../services/availability.js';
import * as mailCommerce from '../services/mail-commerce.js';
import * as mail from '../services/mail.js';
import { nextOrderNumber } from '../services/order-numbers.js';
import { buildQuote } from '../services/pricing.js';

/**
 * The API of the customer of hosted mail.
 *
 * A mail service is bought on its own: it has no server and no instance, so
 * it has its own life here, with its own list, its own domains and its own
 * plan.
 *
 * The rules that hold everywhere in this file:
 *
 *   - every read and every write is bound to the customer that asked. A
 *     service of another customer is not found, so nothing of it travels
 *     through these routes;
 *   - the platform never writes the DNS of a customer. It tells the customer
 *     which records to publish and it checks what is really published;
 *   - the sale of the mail is closed unless the operator opens it, and the
 *     reason of a refusal is always said in words;
 *   - the password of a mailbox is never stored, logged or put in an answer
 *     of these routes.
 */

/** One price of a plan of mail. */
export interface MailPlanPriceView {
  period: BillingPeriod;
  /** The amount, in minor units. */
  amount: number;
  currency: string;
}

/** A plan of mail, as the shop shows it. */
export interface MailPlanView {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: 'EMAIL_HOSTING';
  /** The limits that are really applied: the limits of the plan under the ceiling of the platform. */
  limits: mailCommerce.MailPlanLimits;
  /** The price of the month, or nothing when the plan has no price yet. */
  price: { amount: number; currency: string; period: BillingPeriod } | null;
  /** Every active price of the plan, the monthly one first. */
  prices: MailPlanPriceView[];
  /** Why the plan can or cannot be ordered. */
  availability: DeploymentAvailability;
  /** True when the plan can be bought right now. */
  onSale: boolean;
}

/**
 * The active prices of a plan, the monthly one first.
 *
 * When two rows of the same period are active, the newest one wins, the same
 * way the order prices the plan. The rows that are not active are not shown:
 * a price that was withdrawn is not a price.
 */
function pricesOfPlan(prices: ProductPrice[]): MailPlanPriceView[] {
  const byPeriod = new Map<BillingPeriod, ProductPrice>();
  for (const price of prices) {
    if (!price.active) continue;
    const current = byPeriod.get(price.period);
    if (!current || newerPrice(price, current)) byPeriod.set(price.period, price);
  }
  const periods: BillingPeriod[] = ['MONTHLY', 'YEARLY'];
  return periods
    .map((period) => byPeriod.get(period))
    .filter((price): price is ProductPrice => Boolean(price))
    .map((price) => ({ period: price.period, amount: price.baseAmount, currency: price.currency }));
}

/** True when the first price is the newer one. */
function newerPrice(candidate: ProductPrice, current: ProductPrice): boolean {
  const byDate = candidate.createdAt.getTime() - current.createdAt.getTime();
  if (byDate !== 0) return byDate > 0;
  // Two rows of the same date: the identifier breaks the tie, the same way
  // on both sides, so the shop and the order cannot disagree.
  return candidate.id.localeCompare(current.id) < 0;
}

/** The plan of mail, as the shop shows it. */
function planView(
  product: mailCommerce.MailPlanProduct & {
    id: string;
    slug: string;
    name: string;
    description: string;
    icon: string;
    deployable: boolean;
    eggId: number | null;
    visible: boolean;
    fulfilment: string;
    prices: ProductPrice[];
  },
): MailPlanView {
  const prices = pricesOfPlan(product.prices);
  const monthly = prices.find((price) => price.period === 'MONTHLY') ?? null;
  // The availability is derived from the product itself and from the switch
  // of the sale of the mail, so the shop, the quote and the order always
  // answer the same way.
  const availability = deploymentAvailability(
    {
      name: product.name,
      deployable: product.deployable,
      eggId: product.eggId,
      visible: product.visible,
      fulfilment: product.fulfilment as never,
    },
    { emailSalesEnabled: env.MAIL_SALES_ENABLED },
  );
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    icon: product.icon,
    category: 'EMAIL_HOSTING',
    limits: mailCommerce.effectivePlanLimits(product),
    price: monthly ? { amount: monthly.amount, currency: monthly.currency, period: monthly.period } : null,
    prices,
    availability,
    // A plan without a price is not for sale, and a plan of mail is not for
    // sale while the sale of the mail is closed.
    onSale: Boolean(monthly) && availability.orderable,
  };
}

export async function registerMailCommerceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The plans of hosted mail.
   *
   * The route is public: the shop shows the plans before anybody signs in.
   * A plan without a price is shown all the same, with its limits, so a
   * customer can read what the plan holds even when it cannot be bought yet.
   */
  app.get('/mail/plans', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async () => {
    const products = await prisma.product.findMany({
      where: { fulfilment: 'EMAIL', visible: true },
      include: { prices: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { plans: products.map((product) => planView(product)) };
  });

  /** The mail services of the customer. */
  app.get('/mail/services', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    return { services: await mailCommerce.listMailServices(user.id) };
  });

  /** One mail service of the customer. */
  app.get('/mail/services/:id', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    return { service: await mailCommerce.getMailService(user.id, id) };
  });

  /**
   * Adds a domain to a service.
   *
   * The domain is not hosted yet: it waits for the proof that the customer
   * owns it. The route answers with the record of DNS that has to be
   * published and with the token it has to hold.
   */
  app.post('/mail/services/:id/domains', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(253) }).parse(request.body ?? {});
    const domain = await mailCommerce.addMailDomainToService(user.id, id, name);
    return reply.code(201).send({ domain });
  });

  /**
   * Checks the proof of a domain.
   *
   * A proof that is not published yet is not a failure: the answer says which
   * record has to hold which token, and the customer comes back later. When
   * the proof is good, the service goes on the queue of the mail by itself.
   */
  app.post('/mail/domains/:id/verify', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const result = await mailCommerce.verifyMailDomainOwnership(user.id, id);
    return { verified: result.verified, message: result.message, domain: result.domain };
  });

  /**
   * Stops the mail of a service.
   *
   * The data stays where it is, so the service can be brought back.
   */
  app.post('/mail/services/:id/suspend', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    // The service is read through the customer, so a service of another
    // customer is not found and nothing of it is touched.
    await mailCommerce.getMailService(user.id, id);
    await mailCommerce.suspendMailService(id, 'The customer asked for this mail service to be suspended.', user.id);
    return { ok: true };
  });

  /** Brings a suspended service back to work. */
  app.post('/mail/services/:id/resume', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await mailCommerce.getMailService(user.id, id);
    await mailCommerce.resumeMailService(id, user.id);
    return { ok: true };
  });

  /**
   * Cancels a service.
   *
   * The mail keeps working until the grace ends and the data is kept until
   * the retention ends, so nothing is lost the moment a payment fails.
   */
  app.post('/mail/services/:id/cancel', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await mailCommerce.getMailService(user.id, id);
    const { graceUntil, retentionUntil } = await mailCommerce.cancelMailService(id, user.id);
    return { ok: true, graceUntil, retentionUntil };
  });

  /** Brings a service that is in the period of grace back to work. */
  app.post('/mail/services/:id/reactivate', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await mailCommerce.getMailService(user.id, id);
    await mailCommerce.reactivateMailService(id, user.id);
    return { ok: true };
  });

  /**
   * Changes the plan of a service.
   *
   * The change is not made here: the route creates the order of the new plan,
   * and the webhook of the payment is what applies it. The limits of the
   * service stay what they are until the customer has paid.
   */
  app.post('/mail/services/:id/plan', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { productSlug } = z.object({ productSlug: z.string().trim().min(1).max(120) }).parse(request.body ?? {});

    // The service is read through the customer, so a service of another
    // customer is not found.
    const service = await mailCommerce.getMailService(user.id, id);

    const product = await prisma.product.findUnique({ where: { slug: productSlug } });
    if (!product) throw notFound('This plan of hosted mail does not exist.');
    if (product.fulfilment !== 'EMAIL') throw notFound('This product is not a plan of hosted mail.');
    if (product.slug === service.plan.slug) {
      throw conflict('This mail service already has this plan.');
    }

    // A line of mail carries the domain it brings, so the price of the plan
    // is the price of the first domain of the service.
    const domain = service.domains[0];
    if (!domain) {
      throw conflict('Add a domain to this mail service before you change its plan.');
    }

    // The price is the one the ordinary order uses, so the sum that is shown
    // is the sum that is charged. A plan of mail that is not on sale is
    // refused here, in words.
    const quote = await buildQuote(
      [{ productSlug: product.slug, mailDomain: domain.name }],
      null,
      user.id,
      'MONTHLY',
    );

    // The mark travels with the order: the payment is what decides that the
    // plan changes, and not the wish of the customer.
    const marker = mailCommerce.mailPlanChangeMarker(service.id) as Prisma.InputJsonObject;

    const order = await prisma.order.create({
      data: {
        number: await nextOrderNumber(),
        userId: user.id,
        status: 'PENDING',
        kind: 'NEW',
        total: quote.total,
        discount: quote.discount,
        currency: quote.currency,
        requestedConfig: marker,
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
              // What the line delivers and the domain it brings.
              fulfilment: item.fulfilment,
              mailDomain: item.mailDomain ?? null,
              // The mark of the change of plan, so the line knows what it is.
              ...marker,
            },
          })),
        },
      },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });

    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'order.created',
      targetType: 'order',
      targetId: order.id,
      meta: { total: order.total, planChange: service.id, plan: product.slug },
    });

    return reply.code(201).send({
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        currency: order.currency,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.name,
          productSlug: item.product.slug,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          total: item.total,
          currency: item.currency,
          fulfillmentStatus: item.fulfillmentStatus,
          fulfillmentError: item.fulfillmentError,
          config: item.config,
        })),
      },
    });
  });

  /**
   * The records of DNS of the domains of a service, and what is really
   * published.
   *
   * The platform does not write these records: it tells the customer what to
   * publish and then it reads the DNS of the world to see what is there.
   */
  app.get('/mail/services/:id/dns', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const service = await mailCommerce.getMailService(user.id, id);
    const domains = [];
    for (const domain of service.domains) {
      const status = await mail.mailDnsStatus(user.id, domain.id);
      domains.push({
        id: domain.id,
        name: domain.name,
        records: status.records,
        verified: status.verified,
        missing: status.missing,
      });
    }
    return { domains };
  });
}
