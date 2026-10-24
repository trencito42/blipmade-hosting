import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { requireAuth } from '../plugins/auth.js';
import { cancelSubscription, createBillingPortal, paymentState, resumeSubscription, stripeLive } from '../services/stripe.js';
import { notFound, unavailable } from '../lib/errors.js';
import {
  buildInstanceExport,
  companyDetails,
  createLocalRenewal,
  instanceRetention,
  instanceRetentions,
} from '../services/billing.js';
import { applyPromotion, priceItems, resolvePromotion } from '../services/pricing.js';
import {
  formatAmount,
  formatDate,
  invoiceFailedTemplate,
  invoicePaidTemplate,
  subscriptionChangedTemplate,
  type EmailTemplate,
} from '../lib/email-templates.js';
import { dispatchEmail } from '../services/queue.js';
import { MAX_OPTION_CODES } from '../lib/bounded.js';

/**
 * Sends a message about the billing.
 *
 * The message goes through the queue, so the request is never held up by the
 * relay. A message that cannot be sent never breaks the request that
 * triggered it.
 */
async function sendBillingMail(kind: string, key: string, to: string, template: EmailTemplate): Promise<void> {
  try {
    await dispatchEmail({
      key,
      kind,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  } catch (error) {
    console.error('[mail] the billing message could not be sent', (error as Error).message);
  }
}

/**
 * Tells the customer that an invoice was paid.
 *
 * The function is exported so the webhook of the payment provider can call it
 * when an invoice changes.
 */
export async function notifyInvoicePaid(input: {
  key: string;
  email: string;
  number: string;
  /** The amount in the smallest unit, the way the platform stores money. */
  amount: number;
  currency: string;
  periodEnd?: Date | null;
}): Promise<void> {
  const template = invoicePaidTemplate({
    number: input.number,
    amount: formatAmount(input.amount, input.currency),
    periodEnd: formatDate(input.periodEnd),
  });
  await sendBillingMail('invoice-paid', input.key, input.email, template);
}

/**
 * Tells the customer that an invoice could not be paid.
 *
 * The function is exported so the webhook of the payment provider can call it
 * when an invoice changes.
 */
export async function notifyInvoiceFailed(input: {
  key: string;
  email: string;
  number: string;
  /** The amount in the smallest unit, the way the platform stores money. */
  amount: number;
  currency: string;
  periodEnd?: Date | null;
  reason?: string | null;
}): Promise<void> {
  const template = invoiceFailedTemplate({
    number: input.number,
    amount: formatAmount(input.amount, input.currency),
    periodEnd: formatDate(input.periodEnd),
    reason: input.reason ?? null,
  });
  await sendBillingMail('invoice-failed', input.key, input.email, template);
}

/** Tells the customer that the subscription of a service changed. */
export async function notifySubscriptionChange(input: {
  key: string;
  email: string;
  instanceName: string;
  status: string;
  periodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  const template = subscriptionChangedTemplate({
    instanceName: input.instanceName,
    status: input.status,
    periodEnd: formatDate(input.periodEnd),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  });
  await sendBillingMail('subscription', input.key, input.email, template);
}

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
      prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 1 }),
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

    const paymentMethod = payments.length
      ? { status: payments[0]!.status, lastPaidAt: payments[0]!.createdAt, currency: payments[0]!.currency }
      : null;

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
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
      }));

    return {
      currency,
      monthlyEstimate,
      currentPeriodEnd,
      paymentMethod,
      instances: instances.map((instance) => ({ id: instance.id, name: instance.name, price: instance.price, status: instance.status.toLowerCase() })),
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
  app.post('/billing/quote', async (request: FastifyRequest) => {
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
  app.post('/billing/subscriptions/:id/renew', async (request: FastifyRequest) => {
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

  app.post('/billing/subscriptions/:id/cancel', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const subscription = await prisma.subscription.findFirst({
      where: { id, userId: user.id },
      include: { user: { select: { email: true } }, instance: { select: { name: true } } },
    });
    if (!subscription) throw notFound('Subscription not found.');

    const updated = await cancelSubscription(subscription);
    await notifySubscriptionChange({
      key: `subscription-${subscription.id}-${updated.updatedAt.getTime()}`,
      email: subscription.user.email,
      instanceName: subscription.instance?.name ?? 'your service',
      status: 'cancelled at the end of the paid period',
      periodEnd: updated.currentPeriodEnd,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
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

  app.post('/billing/subscriptions/:id/resume', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const subscription = await prisma.subscription.findFirst({
      where: { id, userId: user.id },
      include: { user: { select: { email: true } }, instance: { select: { name: true } } },
    });
    if (!subscription) throw notFound('Subscription not found.');

    const updated = await resumeSubscription(subscription);
    await notifySubscriptionChange({
      key: `subscription-${subscription.id}-${updated.updatedAt.getTime()}`,
      email: subscription.user.email,
      instanceName: subscription.instance?.name ?? 'your service',
      status: 'active',
      periodEnd: updated.currentPeriodEnd,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
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

  app.post('/billing/payment-method', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const portal = await createBillingPortal(user.id);
    return { url: portal.url, message: portal.reason };
  });
}
