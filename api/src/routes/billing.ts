import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { cancelSubscription, createBillingPortal, paymentState, resumeSubscription, stripeLive } from '../services/stripe.js';
import { notFound, unavailable } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import {
  buildInstanceExport,
  companyDetails,
  createLocalRenewal,
  instanceRetention,
  instanceRetentions,
} from '../services/billing.js';
import { applyPromotion, priceItems, resolvePromotion } from '../services/pricing.js';
import {
  notifySubscriptionCancellationScheduled,
  notifySubscriptionReactivated,
} from '../services/notifications.js';
import { MAX_OPTION_CODES } from '../lib/bounded.js';

/**
 * The routes of the billing carry a limit.
 *
 * The quote, the renewal and the payment method only write rows in the
 * database of the platform, so they may be used the most. The
 * cancellation and the return of a subscription send a message to the
 * customer, so they carry the limit of the mail: an account that may
 * send ten messages in a quarter of an hour cannot turn the platform
 * into a relay.
 */

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Whether a payment can be taken at the moment, and why not.
   *
   * The interface asks before it offers a payment, so an action that cannot
   * work is never shown as if it worked.
   */
  app.get('/billing/payment-state', async (request: FastifyRequest) => {
    await requireAuth(request);
    return { payments: paymentState() };
  });

  app.get('/billing/summary', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    // The lists of the summary are bounded. The two numbers that are read
    // from them are read from the database with an aggregate, so they stay
    // the real numbers even when a customer has more rows than the list shows.
    const [instances, subscriptions, invoices, payments, cancellations, instanceSum, periodEnd] = await Promise.all([
      prisma.instance.findMany({
        where: { userId: user.id, cancelledAt: null },
        select: { id: true, name: true, price: true, currency: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.subscription.findMany({
        where: { userId: user.id },
        include: { instance: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.invoice.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.payment.findMany({ where: { userId: user.id, stripeCustomerId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1 }),
      prisma.instance.findMany({
        where: { userId: user.id, cancelledAt: { not: null } },
        select: { id: true, name: true, cancelledAt: true },
        orderBy: { cancelledAt: 'desc' },
        take: 50,
      }),
      prisma.instance.aggregate({ where: { userId: user.id, cancelledAt: null }, _sum: { price: true } }),
      prisma.subscription.aggregate({ where: { userId: user.id }, _max: { currentPeriodEnd: true } }),
    ]);

    const currency = subscriptions[0]?.currency ?? instances[0]?.currency ?? 'EUR';
    const monthlyEstimate = instanceSum._sum.price ?? 0;
    const currentPeriodEnd = periodEnd._max.currentPeriodEnd ?? null;

    // A payment row is a ledger entry, not evidence that a card is on file.
    // In particular a free promotion writes a zero-amount row without ever
    // contacting Stripe. Card details are not stored locally.
    const paymentMethod = null;
    const hasStripeCustomer = payments.length > 0;

    // The services that were cancelled are kept for a term, and the export of
    // the data stays available after the deletion.
    const retentions = await instanceRetentions();
    const pendingRenewals = invoices
      .filter((invoice) => invoice.status === 'OPEN' && invoice.periodStart !== null)
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amount: invoice.amount,
        tax: invoice.tax,
        total: invoice.total,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        orderId: invoice.orderId,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
      }));

    return {
      currency,
      monthlyEstimate,
      currentPeriodEnd,
      paymentMethod,
      hasStripeCustomer,
      instances: instances.map((instance) => ({ id: instance.id, name: instance.name, price: instance.price, status: instance.status.toLowerCase() })),
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        instanceId: subscription.instanceId,
        instanceName: subscription.instance?.name ?? null,
        status: subscription.status.toLowerCase(),
        amount: subscription.amount,
        currency: subscription.currency,
        currentPeriodEnd: subscription.currentPeriodEnd,
        stripeManaged: Boolean(subscription.stripeSubscriptionId),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      })),
      cancellations: cancellations.map((instance) => ({
        id: instance.id,
        name: instance.name,
        cancelledAt: instance.cancelledAt,
        deletionScheduledFor: retentions[instance.id]?.scheduledFor ?? null,
        exportAvailable: Boolean(retentions[instance.id]),
        deletedAt: retentions[instance.id]?.deletedAt ?? null,
      })),
      pendingRenewals,
    };
  });

  /**
   * Quotes a configuration for a period.
   *
   * The quote uses the same function that prices an order, so a yearly plan
   * is priced with the yearly prices of the catalogue.
   */
  app.post('/billing/quote', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const body = z
      .object({
        items: z
          .array(
            z.object({
              productSlug: z.string().min(1),
              ram: z.number().int().positive(),
              cpu: z.number().int().positive(),
              disk: z.number().int().positive(),
              optionCodes: z.array(z.string()).max(MAX_OPTION_CODES).optional(),
              quantity: z.number().int().min(1).max(20).optional(),
            }),
          )
          .min(1),
        period: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
        promotionCode: z.string().trim().optional(),
      })
      .parse(request.body ?? {});

    const priced = await priceItems(body.items, body.period);
    const subtotal = priced.reduce((sum, item) => sum + item.total, 0);
    const quoteCurrency = priced[0]?.currency ?? 'EUR';

    const resolved = await resolvePromotion(body.promotionCode, user.id);
    let discount = 0;
    if (resolved.valid && resolved.code) {
      const promotion = await prisma.promotion.findUnique({ where: { code: resolved.code } });
      if (promotion) discount = applyPromotion(subtotal, promotion);
    }

    return {
      period: body.period,
      items: priced.map((item) => ({
        productSlug: item.productSlug,
        name: item.name,
        ram: item.ram,
        cpu: item.cpu,
        disk: item.disk,
        optionCodes: item.optionCodes,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        total: item.total,
        currency: item.currency,
      })),
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      currency: quoteCurrency,
      promotion: resolved.code
        ? { code: resolved.code, valid: resolved.valid, ...(resolved.reason ? { reason: resolved.reason } : {}) }
        : null,
    };
  });

  /**
   * Renews a subscription without a payment provider.
   *
   * The renewal is explicit: it writes the invoice that is due and the period
   * is only extended when the collection is confirmed. Nothing is paid for
   * here, so nothing is claimed to be paid.
   */
  app.post('/billing/subscriptions/:id/renew', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ period: z.enum(['MONTHLY', 'YEARLY']).optional() }).parse(request.body ?? {});

    const subscription = await prisma.subscription.findFirst({ where: { id, userId: user.id } });
    if (!subscription) throw notFound('Subscription not found.');
    if (stripeLive()) {
      throw unavailable('Payments are collected by the payment provider on this environment, so the subscription is renewed by the provider.');
    }

    const renewal = await createLocalRenewal(subscription.id, {
      interval: body.period,
      actorId: user.id,
      actorEmail: user.email,
    });
    return {
      renewal: {
        invoiceId: renewal.invoiceId,
        number: renewal.number,
        orderId: renewal.orderId,
        amount: renewal.amount,
        currency: renewal.currency,
        interval: renewal.interval,
        periodStart: renewal.periodStart,
        periodEnd: renewal.periodEnd,
      },
    };
  });

  /**
   * The data of the customer of a service.
   *
   * The export is written when the service is cancelled and it stays
   * available after the service is deleted.
   */
  app.get('/billing/instances/:id/export', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await prisma.instance.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!instance) throw notFound('Instance not found.');

    const retention = await instanceRetention(instance.id);
    if (retention) {
      return {
        export: retention.export,
        createdAt: retention.exportCreatedAt,
        deletionScheduledFor: retention.scheduledFor,
        deletedAt: retention.deletedAt,
      };
    }

    return {
      export: await buildInstanceExport(instance.id),
      createdAt: null,
      deletionScheduledFor: null,
      deletedAt: null,
    };
  });

  app.get('/billing/invoices', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 100, maxSize: 200 });
    const [rows, company] = await Promise.all([
      prisma.invoice.findMany({
        where: withCursor({ userId: user.id }, cursor, 'createdAt'),
        orderBy: pageOrder('createdAt'),
        take: limit + 1,
      }),
      companyDetails(),
    ]);
    const page = pageOf(rows, limit, 'createdAt');
    return {
      // The company that issues the invoice. The values are the ones the
      // operator wrote in the settings of the platform: a value that is
      // missing is empty, it is never invented.
      company: {
        name: company.name,
        registration: company.registration,
        taxId: company.taxId,
        taxRate: company.taxRate,
        address: company.address,
        supportEmail: company.supportEmail,
        taxApplies: company.taxApplies,
        taxNote: company.taxNote,
      },
      invoices: page.rows.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status.toLowerCase(),
        amount: invoice.amount,
        tax: invoice.tax,
        total: invoice.total,
        currency: invoice.currency,
        hostedUrl: invoice.hostedUrl,
        pdfUrl: invoice.pdfUrl,
        billingAddress: invoice.billingAddress,
        createdAt: invoice.createdAt,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
      })),
      pagination: page.pagination,
    };
  });

  app.get('/billing/subscriptions', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      include: { instance: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        instanceId: subscription.instanceId,
        instanceName: subscription.instance?.name ?? null,
        status: subscription.status.toLowerCase(),
        amount: subscription.amount,
        currency: subscription.currency,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      })),
    };
  });

  app.post('/billing/subscriptions/:id/cancel', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const subscription = await prisma.subscription.findFirst({
      where: { id, userId: user.id },
      include: { user: { select: { email: true } }, instance: { select: { name: true } } },
    });
    if (!subscription) throw notFound('Subscription not found.');

    const updated = await cancelSubscription(subscription);
    await notifySubscriptionCancellationScheduled({
      userId: subscription.userId,
      service: subscription.instance?.name ?? 'your service',
      periodEnd: updated.currentPeriodEnd,
      // The moment of the change is what makes the occurrence unique: the
      // same subscription can be canceled and resumed as many times as the
      // customer wants, and every step has its own message.
      occurrence: updated.updatedAt,
    });
    return {
      subscription: {
        id: updated.id,
        status: updated.status.toLowerCase(),
        currentPeriodEnd: updated.currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      },
    };
  });

  app.post('/billing/subscriptions/:id/resume', {
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.mail),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const subscription = await prisma.subscription.findFirst({
      where: { id, userId: user.id },
      include: { user: { select: { email: true } }, instance: { select: { name: true } } },
    });
    if (!subscription) throw notFound('Subscription not found.');

    const updated = await resumeSubscription(subscription);
    await notifySubscriptionReactivated({
      userId: subscription.userId,
      service: subscription.instance?.name ?? 'your service',
      occurrence: updated.updatedAt,
    });
    return {
      subscription: {
        id: updated.id,
        status: updated.status.toLowerCase(),
        currentPeriodEnd: updated.currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      },
    };
  });

  app.post('/billing/payment-method', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const portal = await createBillingPortal(user.id);
    return { url: portal.url, message: portal.reason };
  });
}
