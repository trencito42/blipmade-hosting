import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../plugins/auth.js';
import { cancelSubscription, createBillingPortal, paymentState, resumeSubscription } from '../services/stripe.js';
import { notFound } from '../lib/errors.js';
import {
  formatAmount,
  formatDate,
  invoiceFailedTemplate,
  invoicePaidTemplate,
  subscriptionChangedTemplate,
  type EmailTemplate,
} from '../lib/email-templates.js';
import { dispatchEmail } from '../services/queue.js';

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
    const [instances, subscriptions, invoices, payments] = await Promise.all([
      prisma.instance.findMany({ where: { userId: user.id, cancelledAt: null }, select: { id: true, name: true, price: true, currency: true, status: true } }),
      prisma.subscription.findMany({ where: { userId: user.id }, include: { instance: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.invoice.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 1 }),
    ]);

    const currency = subscriptions[0]?.currency ?? instances[0]?.currency ?? 'EUR';
    const monthlyEstimate = instances.reduce((sum, instance) => sum + instance.price, 0);
    const currentPeriodEnd = subscriptions
      .map((subscription) => subscription.currentPeriodEnd)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const paymentMethod = payments.length
      ? { status: payments[0]!.status, lastPaidAt: payments[0]!.createdAt, currency: payments[0]!.currency }
      : null;

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
    };
  });

  app.get('/billing/invoices', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      invoices: invoices.map((invoice) => ({
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
