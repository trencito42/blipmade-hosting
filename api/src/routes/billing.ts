import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../plugins/auth.js';
import { cancelSubscription, createBillingPortal, resumeSubscription } from '../services/stripe.js';
import { notFound } from '../lib/errors.js';

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
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
    const subscription = await prisma.subscription.findFirst({ where: { id, userId: user.id } });
    if (!subscription) throw notFound('Subscription not found.');

    const updated = await cancelSubscription(subscription);
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
    const subscription = await prisma.subscription.findFirst({ where: { id, userId: user.id } });
    if (!subscription) throw notFound('Subscription not found.');

    const updated = await resumeSubscription(subscription);
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
