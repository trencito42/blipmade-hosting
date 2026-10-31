import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { requirePermission } from '../plugins/auth.js';
import { assessCustomer } from '../services/risk.js';
import * as ptero from '../services/pterodactyl/application.js';

function lower(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function containsAny(value: unknown, needles: string[]): boolean {
  const text = JSON.stringify(value ?? {});
  return needles.some((needle) => needle.length > 0 && text.includes(needle));
}

/** Read models for the operator control centre. They deliberately contain no secrets. */
export async function registerAdminControlRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/services/:id', { preHandler: requirePermission('services.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const service = await prisma.instance.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, suspendedAt: true } },
        product: { select: { id: true, name: true, slug: true, category: true } },
        order: { select: { id: true, number: true, status: true, total: true, currency: true, createdAt: true } },
        orderItem: { select: { id: true, name: true, fulfillmentStatus: true, fulfillmentError: true } },
        subscription: true,
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
        checks: { orderBy: { at: 'desc' }, take: 100 },
        ticket: { select: { id: true, number: true, subject: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!service) throw notFound('Service not found.');

    const [audit, abuse, risk] = await Promise.all([
      prisma.auditLog.findMany({ where: { targetType: 'instance', targetId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.abuseReport.findMany({ where: { instanceId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      assessCustomer(service.userId),
    ]);

    let panel: { databases: number; backups: number; allocations: number; suspended: boolean } | null = null;
    let panelError: string | null = null;
    if (service.pterodactylServerId) {
      try {
        const current = await ptero.getServer(service.pterodactylServerId);
        panel = {
          databases: current.feature_limits.databases,
          backups: current.feature_limits.backups,
          allocations: current.feature_limits.allocations,
          suspended: current.suspended,
        };
      } catch (error) {
        panelError = error instanceof Error ? error.message : 'The panel did not answer.';
      }
    }

    const upChecks = service.checks.filter((check) => check.up).length;
    return {
      service: {
        ...service,
        status: service.status.toLowerCase(),
        runtimeState: lower(service.runtimeState),
        runtimeCondition: lower(service.runtimeCondition),
        order: service.order ? { ...service.order, status: service.order.status.toLowerCase() } : null,
        orderItem: service.orderItem ? { ...service.orderItem, fulfillmentStatus: service.orderItem.fulfillmentStatus.toLowerCase() } : null,
        subscription: service.subscription ? { ...service.subscription, status: service.subscription.status.toLowerCase() } : null,
        tickets: service.ticket.map((ticket) => ({ ...ticket, status: ticket.status.toLowerCase() })),
        uptime: {
          checks: service.checks.length,
          up: upChecks,
          percent: service.checks.length ? Math.round((upChecks / service.checks.length) * 10_000) / 100 : null,
        },
        panel,
        panelError,
        audit,
        abuse,
        risk,
      },
    };
  });

  app.get('/admin/orders/:id', { preHandler: requirePermission('orders.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, suspendedAt: true } },
        promotion: { select: { id: true, code: true, type: true, value: true } },
        promotionRedemption: true,
        items: {
          include: {
            product: { select: { id: true, name: true, slug: true, category: true } },
            subscription: true,
            instances: { select: { id: true, name: true, status: true, pterodactylServerId: true } },
            mailService: { select: { id: true, status: true, domains: { select: { name: true }, take: 1 } } },
            vpsService: { select: { id: true, name: true, status: true, vmid: true } },
          },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
        instances: { select: { id: true, name: true, status: true, pterodactylServerId: true } },
      },
    });
    if (!order) throw notFound('Order not found.');

    const ids = [order.id, order.number, order.stripeCheckoutSessionId ?? '', order.stripePaymentIntentId ?? '', ...order.payments.flatMap((payment) => [payment.stripeInvoiceId ?? '', payment.stripePaymentIntentId ?? '', payment.stripeSubscriptionId ?? ''])];
    const [audit, recentWebhooks, events, risk] = await Promise.all([
      prisma.auditLog.findMany({ where: { OR: [{ targetType: 'order', targetId: id }, { targetType: 'user', targetId: order.userId }] }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.webhookEvent.findMany({ where: { provider: 'stripe' }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.notificationEvent.findMany({ where: { userId: order.userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      assessCustomer(order.userId),
    ]);

    return {
      order: {
        ...order,
        status: order.status.toLowerCase(),
        fulfillmentStatus: order.fulfillmentStatus.toLowerCase(),
        items: order.items.map((item) => ({
          ...item,
          fulfillmentStatus: item.fulfillmentStatus.toLowerCase(),
          subscription: item.subscription ? { ...item.subscription, status: item.subscription.status.toLowerCase() } : null,
          instances: item.instances.map((instance) => ({ ...instance, status: instance.status.toLowerCase() })),
          mailService: item.mailService ? { ...item.mailService, status: item.mailService.status.toLowerCase() } : null,
          vpsService: item.vpsService ? { ...item.vpsService, status: item.vpsService.status.toLowerCase() } : null,
        })),
        payments: order.payments.map((payment) => ({ ...payment, status: payment.status.toLowerCase() })),
        invoices: order.invoices.map((invoice) => ({ ...invoice, status: invoice.status.toLowerCase() })),
        instances: order.instances.map((instance) => ({ ...instance, status: instance.status.toLowerCase() })),
        webhooks: recentWebhooks.filter((event) => containsAny(event.payload, ids)).slice(0, 50),
        events: events.filter((event) => containsAny(event.payload, ids)).slice(0, 50),
        audit,
        risk,
      },
    };
  });

  app.get('/admin/promotions/:id', { preHandler: requirePermission('promotions.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const promotion = await prisma.promotion.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        redemptions: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            order: { select: { id: true, number: true, status: true, total: true, currency: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
        orders: { select: { id: true, status: true, total: true, discount: true }, orderBy: { createdAt: 'desc' }, take: 500 },
      },
    });
    if (!promotion) throw notFound('Promotion not found.');
    const audit = await prisma.auditLog.findMany({ where: { targetType: 'promotion', targetId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
    const reserved = promotion.orders.filter((order) => !['CANCELLED', 'FAILED', 'REFUNDED'].includes(order.status)).length;
    return {
      promotion: {
        ...promotion,
        type: promotion.type.toLowerCase(),
        redemptions: promotion.redemptions.map((redemption) => ({ ...redemption, cardFingerprintHash: redemption.cardFingerprintHash ? 'protected' : null, order: { ...redemption.order, status: redemption.order.status.toLowerCase() } })),
        stats: {
          redemptions: promotion.redemptions.length,
          reserved,
          discountGranted: promotion.redemptions.reduce((sum, redemption) => sum + redemption.amount, 0),
          revenue: promotion.redemptions.reduce((sum, redemption) => sum + redemption.order.total, 0),
          uniqueCustomers: new Set(promotion.redemptions.map((redemption) => redemption.userId)).size,
          protectedCards: promotion.redemptions.filter((redemption) => redemption.cardFingerprintHash).length,
        },
        audit,
      },
    };
  });
}
