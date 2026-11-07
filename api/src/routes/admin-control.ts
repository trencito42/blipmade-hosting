import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requirePermission, requireStaff } from '../plugins/auth.js';
import { assessCustomer } from '../services/risk.js';
import * as ptero from '../services/pterodactyl/application.js';
import { audit } from '../lib/audit.js';
import { enqueueMailProvisioning, enqueueProvisioning, enqueueVpsProvisioning } from '../services/queue.js';
import { fulfilOrder } from './webhooks.js';
import { requestProfileRecovery } from '../services/profile-activation.js';

function lower(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function containsAny(value: unknown, needles: string[]): boolean {
  const text = JSON.stringify(value ?? {});
  return needles.some((needle) => needle.length > 0 && text.includes(needle));
}

/** Read models for the operator control centre. They deliberately contain no secrets. */
export async function registerAdminControlRoutes(app: FastifyInstance): Promise<void> {
  /**
   * One lookup for the whole back office. Provider identifiers are deliberately
   * searchable here: during an incident the operator usually has an id from a
   * Stripe or infrastructure log, not the customer's email address.
   */
  app.get('/admin/search', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(160) }).parse(request.query ?? {});
    const text = q.trim();
    const number = /^\d+$/.test(text) ? Number(text) : null;
    const [customers, orders, instances, invoices, payments, domains, vps] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'CUSTOMER', OR: [
          { email: { contains: text, mode: 'insensitive' } },
          { firstName: { contains: text, mode: 'insensitive' } },
          { lastName: { contains: text, mode: 'insensitive' } },
          { id: text },
          { pterodactylUserId: text },
          { pterodactylExternalId: text },
        ] },
        select: { id: true, email: true, firstName: true, lastName: true }, take: 6,
      }),
      prisma.order.findMany({
        where: { OR: [
          { id: text }, { number: { contains: text, mode: 'insensitive' } },
          { stripeCheckoutSessionId: text }, { stripePaymentIntentId: text },
        ] },
        select: { id: true, number: true, status: true, user: { select: { email: true } } }, take: 6,
      }),
      prisma.instance.findMany({
        where: { OR: [
          { id: text }, { name: { contains: text, mode: 'insensitive' } },
          { pterodactylUuid: text }, ...(number === null ? [] : [{ pterodactylServerId: number }]),
        ] },
        select: { id: true, name: true, status: true, user: { select: { email: true } } }, take: 6,
      }),
      prisma.invoice.findMany({
        where: { OR: [{ id: text }, { number: { contains: text, mode: 'insensitive' } }, { stripeInvoiceId: text }] },
        select: { id: true, number: true, status: true, orderId: true, user: { select: { id: true, email: true } } }, take: 6,
      }),
      prisma.payment.findMany({
        where: { OR: [{ id: text }, { stripePaymentIntentId: text }, { stripeChargeId: text }, { stripeCustomerId: text }, { stripeSubscriptionId: text }, { stripeInvoiceId: text }] },
        select: { id: true, status: true, orderId: true, user: { select: { id: true, email: true } } }, take: 6,
      }),
      prisma.instanceDomain.findMany({
        where: { OR: [{ id: text }, { hostname: { contains: text, mode: 'insensitive' } }] },
        select: { id: true, hostname: true, status: true, instanceId: true }, take: 6,
      }),
      prisma.vpsService.findMany({
        where: { OR: [{ id: text }, { name: { contains: text, mode: 'insensitive' } }, ...(number === null ? [] : [{ vmid: number }, { sshPort: number }])] },
        select: { id: true, name: true, status: true, vmid: true, user: { select: { email: true } } }, take: 6,
      }),
    ]);

    return { results: [
      ...customers.map((row) => ({ id: `customer:${row.id}`, type: 'Customer', label: `${row.firstName} ${row.lastName}`.trim() || row.email, hint: row.email, to: `/admin/customers/${row.id}` })),
      ...orders.map((row) => ({ id: `order:${row.id}`, type: 'Order', label: row.number, hint: `${row.status.toLowerCase()} · ${row.user.email}`, to: `/admin/orders/${row.id}` })),
      ...instances.map((row) => ({ id: `service:${row.id}`, type: 'Service', label: row.name, hint: `${row.status.toLowerCase()} · ${row.user.email}`, to: `/admin/services/${row.id}` })),
      ...invoices.map((row) => ({ id: `invoice:${row.id}`, type: 'Invoice', label: row.number, hint: `${row.status.toLowerCase()} · ${row.user.email}`, to: row.orderId ? `/admin/orders/${row.orderId}` : `/admin/customers/${row.user.id}` })),
      ...payments.map((row) => ({ id: `payment:${row.id}`, type: 'Payment', label: row.id, hint: `${row.status.toLowerCase()} · ${row.user.email}`, to: row.orderId ? `/admin/orders/${row.orderId}` : `/admin/customers/${row.user.id}` })),
      ...domains.map((row) => ({ id: `domain:${row.id}`, type: 'Domain', label: row.hostname, hint: row.status.toLowerCase(), to: `/admin/services/${row.instanceId}` })),
      ...vps.map((row) => ({ id: `vps:${row.id}`, type: 'VPS', label: row.name, hint: `VM ${row.vmid ?? 'pending'} · ${row.user.email}`, to: '/admin/vps' })),
    ].slice(0, 30) };
  });

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

    const [audit, abuse, risk, profileActivations] = await Promise.all([
      prisma.auditLog.findMany({ where: { targetType: 'instance', targetId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.abuseReport.findMany({ where: { instanceId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      assessCustomer(service.userId),
      prisma.serverProfileActivationJob.findMany({ where: { instanceId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
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
        profileActivations,
      },
    };
  });

  app.post('/admin/services/:id/profile-activations/:jobId/recover', { preHandler: requirePermission('services.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id, jobId } = z.object({ id: z.string(), jobId: z.string() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body ?? {});
    const job = await requestProfileRecovery({ instanceId: id, jobId });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'instance.profile_recovery_requested', targetType: 'instance', targetId: id, meta: { jobId, reason } });
    return { job };
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

  /** Repairs only missing or failed fulfilment work; every queue has its own idempotency key. */
  app.post('/admin/orders/:id/retry-fulfilment', { preHandler: requirePermission('orders.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body ?? {});
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { include: { instances: true, mailService: true, vpsService: true } } },
    });
    if (!order) throw notFound('Order not found.');
    if (!['PAID', 'FULFILLED'].includes(order.status)) throw conflict(`Only a paid order can be delivered. This order is ${order.status.toLowerCase()}.`);

    let queued = 0;
    await fulfilOrder(order.id);
    for (const item of order.items) {
      if (item.fulfillmentStatus === 'FULFILLED') continue;
      await prisma.orderItem.update({ where: { id: item.id }, data: { fulfillmentStatus: 'PROVISIONING', fulfillmentError: null } });
      for (const instance of item.instances) {
        if (instance.status === 'CANCELLED') continue;
        await enqueueProvisioning(instance.id, { reason: `order recovery: ${reason}`, requestedBy: actor.id });
        queued += 1;
      }
      if (item.mailService && item.mailService.status !== 'CANCELLED') {
        await enqueueMailProvisioning(item.mailService.id, { reason: `order recovery: ${reason}` });
        queued += 1;
      }
      if (item.vpsService && item.vpsService.status !== 'CANCELLED') {
        await enqueueVpsProvisioning(item.vpsService.id, { reason: `order recovery: ${reason}` });
        queued += 1;
      }
    }
    if (queued === 0 && order.items.every((item) => item.fulfillmentStatus === 'FULFILLED')) throw badRequest('Every order line is already fulfilled.');
    await prisma.order.update({ where: { id: order.id }, data: { fulfillmentStatus: 'PROVISIONING' } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.order.retry_fulfilment', targetType: 'order', targetId: order.id, meta: { reason, queued }, ip: request.ip });
    return { queued };
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
