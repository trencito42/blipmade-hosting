import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireStaff, requirePermission } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import * as ptero from '../services/pterodactyl/application.js';
import { emailDeliveryReport, enqueueProvisioning } from '../services/queue.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { fullName } from '../lib/people.js';
import {
  forgetCustomerCredential,
  storeCustomerCredential,
} from '../services/panel/credentials.js';
import { externalIdFor } from '../services/panel/identity.js';
import { deploymentAvailability } from '../services/availability.js';
import { env } from '../env.js';

const money = (amount: number) => amount / 100;

/**
 * The check that says whether a deployment really works.
 *
 * "http" and "tcp" ask the application itself, "container" asks the panel
 * about the server. The last one is for a product that does not expose a
 * port, like a bot that only talks to another service.
 */
const healthProbeSchema = z.union([
  z.object({
    kind: z.literal('http'),
    path: z.string().trim().max(200).optional(),
    expectStatus: z.array(z.number().int().min(100).max(599)).max(20).optional(),
    expectBody: z.string().max(200).optional(),
    timeoutMs: z.number().int().min(500).max(60_000).optional(),
  }),
  z.object({
    kind: z.literal('tcp'),
    timeoutMs: z.number().int().min(500).max(60_000).optional(),
  }),
  z.object({
    kind: z.literal('container'),
    timeoutMs: z.number().int().min(500).max(60_000).optional(),
  }),
]);

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/overview', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      customers,
      instances,
      activeInstances,
      openTickets,
      ordersToday,
      revenueMonth,
      provisioningFailures,
      subscriptions,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.instance.count(),
      prisma.instance.count({ where: { status: { in: ['ONLINE', 'PROVISIONING', 'RESTARTING'] } } }),
      prisma.ticket.count({ where: { status: { not: 'CLOSED' } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.order.aggregate({ where: { status: { in: ['PAID', 'FULFILLED'] }, createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
      prisma.instance.count({ where: { status: 'FAILED' } }),
      prisma.subscription.findMany({ where: { status: 'ACTIVE', cancelAtPeriodEnd: false }, select: { amount: true } }),
    ]);

    // MRR is the sum of the active subscriptions that are not cancelled.
    const mrr = subscriptions.reduce((sum, subscription) => sum + subscription.amount, 0);

    return {
      overview: {
        customers,
        instances,
        activeInstances,
        openTickets,
        ordersToday,
        revenueMonth: revenueMonth._sum.total ?? 0,
        provisioningFailures,
        mrr,
        currency: 'EUR',
      },
    };
  });

  app.get('/admin/customers', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const query = z.object({ search: z.string().trim().optional() }).parse(request.query ?? {});
    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        instances: { select: { id: true, status: true, price: true, name: true, cancelledAt: true } },
        _count: { select: { orders: true, tickets: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      customers: customers.map((customer) => ({
        id: customer.id,
        email: customer.email,
        name: fullName(customer),
        createdAt: customer.createdAt,
        verified: Boolean(customer.emailVerifiedAt),
        suspended: Boolean(customer.suspendedAt),
        instanceCount: customer.instances.length,
        orderCount: customer._count.orders,
        ticketCount: customer._count.tickets,
        monthlyValue: customer.instances.filter((instance) => instance.cancelledAt === null).reduce((sum, instance) => sum + instance.price, 0),
      })),
    };
  });

  app.get('/admin/customers/:id', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const customer = await prisma.user.findUnique({
      where: { id },
      include: {
        instances: { include: { product: { select: { name: true, slug: true } }, subscription: true } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 50 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 50 },
        orders: { orderBy: { createdAt: 'desc' }, take: 50 },
        payments: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!customer) throw notFound('Customer not found.');

    const totalSpent = customer.payments.filter((payment) => payment.status === 'SUCCEEDED').reduce((sum, payment) => sum + payment.amount, 0);

    return {
      customer: {
        id: customer.id,
        email: customer.email,
        name: fullName(customer),
        role: customer.role.toLowerCase(),
        createdAt: customer.createdAt,
        emailVerified: Boolean(customer.emailVerifiedAt),
        suspendedAt: customer.suspendedAt,
        pterodactylUserId: customer.pterodactylUserId,
        totalSpent,
        instances: customer.instances.map((instance) => ({
          id: instance.id,
          name: instance.name,
          status: instance.status.toLowerCase(),
          price: instance.price,
          product: instance.product,
          node: instance.pterodactylServerId,
          createdAt: instance.createdAt,
          subscriptionStatus: instance.subscription?.status.toLowerCase() ?? null,
        })),
        invoices: customer.invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status.toLowerCase(),
          total: invoice.total,
          currency: invoice.currency,
          createdAt: invoice.createdAt,
        })),
        tickets: customer.tickets.map((ticket) => ({
          id: ticket.id,
          number: ticket.number,
          subject: ticket.subject,
          status: ticket.status.toLowerCase(),
          createdAt: ticket.createdAt,
        })),
        orders: customer.orders.map((order) => ({
          id: order.id,
          number: order.number,
          status: order.status.toLowerCase(),
          total: order.total,
          currency: order.currency,
          createdAt: order.createdAt,
        })),
      },
    };
  });

  /**
   * The panel account of a customer and the state of its client key.
   *
   * The key itself is never shown: only the fact that there is one, where it
   * came from and when it was used the last time.
   */
  app.get('/admin/customers/:id/panel', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const customer = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        pterodactylUserId: true,
        pterodactylExternalId: true,
        panelCredential: true,
      },
    });
    if (!customer) throw notFound('Customer not found.');

    return {
      panel: {
        userId: customer.pterodactylUserId,
        externalId: customer.pterodactylExternalId,
        hasCredential: Boolean(customer.panelCredential),
        credentialSource: customer.panelCredential?.source ?? null,
        credentialUsedAt: customer.panelCredential?.lastUsedAt ?? null,
        bridgeEnabled: env.panelBridgeEnabled,
      },
    };
  });

  /**
   * Stores the client key of a customer that an operator handed over.
   *
   * This is the way in when the key bridge of the panel is not installed yet:
   * the panel issues the key, the operator pastes it here, and every customer
   * operation works from that moment on. The key is stored encrypted and is
   * never sent back to the browser.
   */
  app.post('/admin/customers/:id/panel/credential', { preHandler: requirePermission('services.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ token: z.string().trim().min(20) }).parse(request.body);

    const customer = await prisma.user.findUnique({
      where: { id },
      select: { id: true, pterodactylUserId: true, pterodactylExternalId: true },
    });
    if (!customer) throw notFound('Customer not found.');
    if (!customer.pterodactylUserId) {
      throw conflict('This customer has no panel account yet. Provision a service first, so the account is created.');
    }

    await storeCustomerCredential(
      customer.id,
      body.token,
      Number(customer.pterodactylUserId),
      customer.pterodactylExternalId ?? externalIdFor(customer.id),
      'bootstrap',
    );
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'customer.panel_credential_stored',
      targetType: 'user',
      targetId: customer.id,
    });
    return { stored: true };
  });

  /** Forgets the client key of a customer. The next operation asks for a new one. */
  app.delete('/admin/customers/:id/panel/credential', { preHandler: requirePermission('services.write') }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await forgetCustomerCredential(id);
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'customer.panel_credential_forgotten',
      targetType: 'user',
      targetId: id,
    });
    return reply.code(204).send();
  });

  app.post('/admin/customers/:id/suspend', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { suspended, reason } = z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).optional() }).parse(request.body);

    const customer = await prisma.user.findUnique({ where: { id } });
    if (!customer) throw notFound('Customer not found.');

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } }),
      // Suspending an account ends its sessions immediately.
      ...(suspended ? [prisma.session.deleteMany({ where: { userId: id } })] : []),
    ]);
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: suspended ? 'customer.suspended' : 'customer.reinstated',
      targetType: 'user',
      targetId: id,
      meta: { reason },
    });

    return { customer: { id, suspended } };
  });

  app.get('/admin/orders', { preHandler: requirePermission('orders.read') }, async (request: FastifyRequest) => {
    const query = z.object({ status: z.string().optional() }).parse(request.query ?? {});
    const orders = await prisma.order.findMany({
      where: query.status ? { status: query.status as never } : {},
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: { include: { product: { select: { slug: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      orders: orders.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status.toLowerCase(),
        total: order.total,
        discount: order.discount,
        currency: order.currency,
        createdAt: order.createdAt,
        customer: { id: order.user.id, email: order.user.email, name: fullName(order.user) },
        items: order.items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, total: item.total })),
      })),
    };
  });

  app.get('/admin/services', { preHandler: requirePermission('services.read') }, async (request: FastifyRequest) => {
    const query = z.object({ status: z.string().optional(), search: z.string().trim().optional() }).parse(request.query ?? {});
    const services = await prisma.instance.findMany({
      where: {
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { user: { select: { id: true, email: true } }, product: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        status: service.status.toLowerCase(),
        ram: service.ram,
        cpu: service.cpu,
        disk: service.disk,
        price: service.price,
        currency: service.currency,
        createdAt: service.createdAt,
        pterodactylServerId: service.pterodactylServerId,
        customer: { id: service.user.id, email: service.user.email },
        product: service.product,
      })),
    };
  });

  app.get('/admin/products', { preHandler: requirePermission('products.read') }, async () => {
    const products = await prisma.product.findMany({
      include: { prices: true, options: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return {
      products: products.map((product) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        category: product.category.toLowerCase(),
        description: product.description,
        icon: product.icon,
        visible: product.visible,
        deployable: product.deployable,
        eggId: product.eggId,
        dockerImage: product.dockerImage,
        // What the catalog and the ordering will answer for this product.
        availability: deploymentAvailability(product),
        minRam: product.minRam,
        minCpu: product.minCpu,
        minDisk: product.minDisk,
        maxRam: product.maxRam,
        maxCpu: product.maxCpu,
        maxDisk: product.maxDisk,
        prices: product.prices.map((price) => ({
          id: price.id,
          period: price.period.toLowerCase(),
          baseAmount: price.baseAmount,
          ramPerGb: price.ramPerGb,
          cpuPerUnit: price.cpuPerUnit,
          diskPerGb: price.diskPerGb,
          currency: price.currency,
          active: price.active,
        })),
        options: product.options.map((option) => ({
          id: option.id,
          code: option.code,
          name: option.name,
          amount: option.amount,
          currency: option.currency,
          active: option.active,
        })),
      })),
    };
  });

  app.post('/admin/products', { preHandler: requirePermission('products.write') }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const body = z
      .object({
        slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes.'),
        name: z.string().trim().min(2).max(120),
        category: z.enum(['WEB_CMS', 'DEVELOPER_TOOLS', 'MONITORING', 'AUTOMATION', 'BOTS', 'DATABASES']),
        description: z.string().trim().min(10).max(2000),
        icon: z.string().trim().max(40).default('box'),
        eggId: z.number().int().positive().nullable().optional(),
        dockerImage: z.string().trim().max(300).nullable().optional(),
        startup: z.record(z.string()).nullable().optional(),
        startupCommand: z.string().trim().max(4000).nullable().optional(),
        minRam: z.number().int().positive().default(512),
        minCpu: z.number().int().positive().default(1),
        minDisk: z.number().int().positive().default(5),
        maxRam: z.number().int().positive().default(16384),
        maxCpu: z.number().int().positive().default(4),
        maxDisk: z.number().int().positive().default(100),
        visible: z.boolean().default(true),
        deployable: z.boolean().default(false),
        docsUrl: z.string().trim().max(300).nullable().optional(),
        baseAmount: z.number().int().min(0).default(0),
        healthProbe: healthProbeSchema.nullable().optional(),
      })
      .parse(request.body);

    const existing = await prisma.product.findUnique({ where: { slug: body.slug } });
    if (existing) throw conflict('A product with this slug already exists.');

    // A product can only be opened for ordering when the panel can build it.
    // A product without an egg mapping can never be deployed, so it must not
    // be sellable either.
    if (body.deployable && (body.eggId === null || body.eggId === undefined)) {
      throw badRequest('Set the panel egg of the product before it can be ordered. A product without an egg can never be deployed.');
    }

    const product = await prisma.product.create({
      data: {
        slug: body.slug,
        name: body.name,
        category: body.category,
        description: body.description,
        icon: body.icon,
        eggId: body.eggId ?? null,
        dockerImage: body.dockerImage ?? null,
        startup: (body.startup ?? undefined) as never,
        startupCommand: body.startupCommand ?? null,
        minRam: body.minRam,
        minCpu: body.minCpu,
        minDisk: body.minDisk,
        defaultRam: body.minRam,
        defaultCpu: body.minCpu,
        defaultDisk: body.minDisk,
        maxRam: body.maxRam,
        maxCpu: body.maxCpu,
        maxDisk: body.maxDisk,
        visible: body.visible,
        deployable: body.deployable,
        docsUrl: body.docsUrl ?? null,
        healthProbe: (body.healthProbe ?? undefined) as never,
        prices: { create: { period: 'MONTHLY', baseAmount: body.baseAmount, currency: 'EUR' } },
      },
      include: { prices: true, options: true },
    });

    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'product.created', targetType: 'product', targetId: product.id, meta: { slug: product.slug } });
    return reply.code(201).send({ product: { id: product.id, slug: product.slug, name: product.name } });
  });

  app.patch('/admin/products/:id', { preHandler: requirePermission('products.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().min(10).max(2000).optional(),
        visible: z.boolean().optional(),
        deployable: z.boolean().optional(),
        eggId: z.number().int().positive().nullable().optional(),
        dockerImage: z.string().trim().max(300).nullable().optional(),
        startupCommand: z.string().trim().max(4000).nullable().optional(),
        minRam: z.number().int().positive().optional(),
        minCpu: z.number().int().positive().optional(),
        minDisk: z.number().int().positive().optional(),
        maxRam: z.number().int().positive().optional(),
        maxCpu: z.number().int().positive().optional(),
        maxDisk: z.number().int().positive().optional(),
        docsUrl: z.string().trim().max(300).nullable().optional(),
        healthProbe: healthProbeSchema.nullable().optional(),
      })
      .parse(request.body);

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw notFound('Product not found.');

    // Opening a product for ordering needs a product the panel can build.
    // Without an egg mapping the deployment fails at the step "server_created",
    // so the flag must not be set on a product that has none.
    if (body.deployable === true) {
      const eggId = body.eggId !== undefined ? body.eggId : product.eggId;
      if (eggId === null || eggId === undefined) {
        throw badRequest('Set the panel egg of the product before it can be ordered. A product without an egg can never be deployed.');
      }
    }

    const data = { ...body } as Record<string, unknown>;
    if (body.healthProbe === null) data.healthProbe = Prisma.JsonNull;
    await prisma.product.update({ where: { id }, data: data as never });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'product.updated', targetType: 'product', targetId: id, meta: body });

    const updated = await prisma.product.findUnique({ where: { id }, include: { prices: true, options: true } });
    return { product: updated };
  });

  app.delete('/admin/products/:id', { preHandler: requirePermission('products.write') }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const product = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { instances: true } } } });
    if (!product) throw notFound('Product not found.');
    if (product._count.instances > 0) throw badRequest('This product is used by existing instances and cannot be deleted. Hide it instead.');

    await prisma.product.delete({ where: { id } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'product.deleted', targetType: 'product', targetId: id, meta: { slug: product.slug } });
    return reply.code(204).send();
  });

  app.get('/admin/pricing', { preHandler: requirePermission('pricing.read') }, async () => {
    const prices = await prisma.productPrice.findMany({
      include: { product: { select: { id: true, name: true, slug: true, minRam: true, minCpu: true, minDisk: true } } },
      orderBy: [{ product: { name: 'asc' } }, { period: 'asc' }],
    });
    return {
      prices: prices.map((price) => ({
        id: price.id,
        productId: price.productId,
        product: price.product,
        period: price.period.toLowerCase(),
        baseAmount: price.baseAmount,
        ramPerGb: price.ramPerGb,
        cpuPerUnit: price.cpuPerUnit,
        diskPerGb: price.diskPerGb,
        currency: price.currency,
        active: price.active,
      })),
    };
  });

  app.put('/admin/pricing/:id', { preHandler: requirePermission('pricing.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        baseAmount: z.number().int().min(0).optional(),
        ramPerGb: z.number().int().min(0).optional(),
        cpuPerUnit: z.number().int().min(0).optional(),
        diskPerGb: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.productPrice.findUnique({ where: { id } });
    if (!existing) throw notFound('Price not found.');

    const price = await prisma.productPrice.update({ where: { id }, data: body });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'pricing.updated', targetType: 'product_price', targetId: id, meta: body });
    return { price };
  });

  app.get('/admin/tickets', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const query = z.object({ status: z.string().optional() }).parse(request.query ?? {});
    const tickets = await prisma.ticket.findMany({
      where: query.status ? { status: query.status as never } : {},
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        instance: { select: { id: true, name: true } },
        assignedTo: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return {
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        category: ticket.category.toLowerCase(),
        priority: ticket.priority.toLowerCase(),
        status: ticket.status.toLowerCase(),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        messageCount: ticket._count.messages,
        customer: { id: ticket.user.id, email: ticket.user.email, name: fullName(ticket.user) },
        instance: ticket.instance,
        assignedTo: ticket.assignedTo
          ? fullName(ticket.assignedTo.user) || ticket.assignedTo.user.email
          : null,
      })),
    };
  });

  app.post('/admin/tickets/:id/assign', { preHandler: requirePermission('tickets.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { userId } = z.object({ userId: z.string().nullable() }).parse(request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound('Ticket not found.');

    if (userId) {
      const staff = await prisma.staffMember.findUnique({ where: { userId } });
      if (!staff) throw badRequest('That person is not a staff member.');
    }

    await prisma.ticket.update({ where: { id }, data: { assignedToId: userId } });
    await prisma.ticketEvent.create({ data: { ticketId: id, type: 'assigned', message: userId ? 'Ticket assigned.' : 'Ticket unassigned.', actorId: actor.id } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'ticket.assigned', targetType: 'ticket', targetId: id, meta: { userId } });
    return { ticket: { id, assignedToId: userId } };
  });

  app.get('/admin/promotions', { preHandler: requirePermission('promotions.read') }, async () => {
    const promotions = await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return {
      promotions: promotions.map((promotion) => ({
        id: promotion.id,
        code: promotion.code,
        type: promotion.type.toLowerCase(),
        value: promotion.value,
        maxRedemptions: promotion.maxRedemptions,
        usedCount: promotion.usedCount,
        active: promotion.active,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
        createdAt: promotion.createdAt,
      })),
    };
  });

  app.post('/admin/promotions', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const body = z
      .object({
        code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
        type: z.enum(['PERCENT', 'FIXED']),
        value: z.number().int().min(0),
        maxRedemptions: z.number().int().min(1).nullable().optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        active: z.boolean().default(true),
      })
      .parse(request.body);

    if (body.type === 'PERCENT' && body.value > 10_000) throw badRequest('A percentage promotion cannot exceed 100%.');
    const existing = await prisma.promotion.findUnique({ where: { code: body.code } });
    if (existing) throw conflict('A promotion with this code already exists.');

    const promotion = await prisma.promotion.create({
      data: {
        code: body.code,
        type: body.type,
        value: body.value,
        maxRedemptions: body.maxRedemptions ?? null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        active: body.active,
        createdById: actor.id,
      },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'promotion.created', targetType: 'promotion', targetId: promotion.id, meta: { code: promotion.code } });
    return reply.code(201).send({ promotion });
  });

  app.get('/admin/infrastructure', { preHandler: requirePermission('infrastructure.read') }, async () => {
    const [nodes, eggs] = await Promise.all([prisma.node.findMany({ orderBy: { name: 'asc' } }), prisma.egg.findMany({ orderBy: { name: 'asc' } })]);
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        pterodactylId: node.pterodactylId,
        name: node.name,
        fqdn: node.fqdn,
        memory: node.memory,
        disk: node.disk,
        memoryAllocated: node.memoryAllocated,
        diskAllocated: node.diskAllocated,
        maintenance: node.maintenance,
      })),
      eggs: eggs.map((egg) => ({
        id: egg.id,
        pterodactylId: egg.pterodactylId,
        name: egg.name,
        uuid: egg.uuid,
        dockerImage: egg.dockerImage,
        startup: egg.startup,
      })),
      stats: {
        nodes: nodes.length,
        totalMemory: nodes.reduce((sum, node) => sum + node.memory, 0),
        allocatedMemory: nodes.reduce((sum, node) => sum + node.memoryAllocated, 0),
        totalDisk: nodes.reduce((sum, node) => sum + node.disk, 0),
        allocatedDisk: nodes.reduce((sum, node) => sum + node.diskAllocated, 0),
      },
    };
  });

  app.post('/admin/infrastructure/sync', { preHandler: requirePermission('infrastructure.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const [panelNodes, nests] = await Promise.all([ptero.listNodes(), ptero.listNests()]);

    const allEggs = [];
    for (const nest of nests) {
      const eggs = await ptero.listEggs(nest.id);
      allEggs.push(...eggs);
    }

    for (const node of panelNodes) {
      await prisma.node.upsert({
        where: { pterodactylId: node.id },
        create: {
          pterodactylId: node.id,
          name: node.name,
          fqdn: node.fqdn,
          memory: node.memory,
          disk: node.disk,
          memoryAllocated: node.allocated_resources.memory,
          diskAllocated: node.allocated_resources.disk,
          maintenance: node.maintenance_mode,
        },
        update: {
          name: node.name,
          fqdn: node.fqdn,
          memory: node.memory,
          disk: node.disk,
          memoryAllocated: node.allocated_resources.memory,
          diskAllocated: node.allocated_resources.disk,
          maintenance: node.maintenance_mode,
          syncedAt: new Date(),
        },
      });
    }

    for (const egg of allEggs) {
      await prisma.egg.upsert({
        where: { pterodactylId: egg.id },
        create: {
          pterodactylId: egg.id,
          uuid: egg.uuid,
          name: egg.name,
          dockerImage: egg.docker_image,
          startup: egg.startup,
        },
        update: { uuid: egg.uuid, name: egg.name, dockerImage: egg.docker_image, startup: egg.startup, syncedAt: new Date() },
      });
    }

    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'infrastructure.synced', meta: { nodes: panelNodes.length, eggs: allEggs.length } });
    return { nodes: panelNodes.length, eggs: allEggs.length };
  });

  app.get('/admin/audit', { preHandler: requirePermission('audit.read') }, async (request: FastifyRequest) => {
    const query = z
      .object({ actor: z.string().trim().optional(), action: z.string().trim().optional(), targetType: z.string().trim().optional() })
      .parse(request.query ?? {});
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(query.actor ? { actorEmail: { contains: query.actor, mode: 'insensitive' } } : {}),
        ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return {
      logs: logs.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        actorEmail: log.actorEmail,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        meta: log.meta,
        ip: log.ip,
        createdAt: log.createdAt,
      })),
    };
  });

  app.get('/admin/staff', { preHandler: requirePermission('staff.read') }, async () => {
    const staff = await prisma.staffMember.findMany({
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
    });
    return {
      staff: staff.map((member) => ({
        userId: member.userId,
        email: member.user.email,
        name: fullName(member.user),
        role: member.user.role.toLowerCase(),
        title: member.title,
        permissions: member.permissions,
      })),
      available: PERMISSIONS,
    };
  });

  app.put('/admin/staff/:userId', { preHandler: requirePermission('staff.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const body = z
      .object({ permissions: z.array(z.enum(PERMISSIONS)).optional(), title: z.string().trim().max(120).nullable().optional() })
      .parse(request.body);

    const member = await prisma.staffMember.findUnique({ where: { userId } });
    if (!member) throw notFound('Staff member not found.');

    await prisma.staffMember.update({
      where: { userId },
      data: {
        ...(body.permissions ? { permissions: body.permissions } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
      },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'staff.permissions_updated', targetType: 'user', targetId: userId, meta: body });
    return { staff: { userId, permissions: body.permissions ?? member.permissions } };
  });

  app.get('/admin/settings', { preHandler: requirePermission('settings.read') }, async () => {
    const settings = await prisma.setting.findMany();
    const result: Record<string, unknown> = {};
    for (const setting of settings) result[setting.key] = setting.value;
    return { settings: result };
  });

  /**
   * The state of the mail.
   *
   * It shows what happened to every message the platform knows about: the
   * state, the number of attempts, the class of the last failure and when it
   * happened. It never shows the body of a message, a token or a credential,
   * and it is only readable by a member of the staff.
   */
  app.get('/admin/email/delivery', { preHandler: requirePermission('settings.read') }, async (request: FastifyRequest) => {
    const report = await emailDeliveryReport();
    return { email: report };
  });

  app.put('/admin/settings', { preHandler: requirePermission('settings.write') }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const body = z.record(z.unknown()).parse(request.body);
    for (const [key, value] of Object.entries(body)) {
      await prisma.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
    }
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'settings.updated', meta: { keys: Object.keys(body) } });
    return { settings: body };
  });

  /** Retries a failed or stuck provisioning run. The worker is idempotent. */
  app.post('/admin/instances/:id/retry', { preHandler: requirePermission('services.write') }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(request.body ?? {});

    const instance = await prisma.instance.findUnique({ where: { id } });
    if (!instance) throw notFound('Instance not found.');

    await prisma.instance.update({ where: { id }, data: { status: 'PROVISIONING', provisionError: null } });
    await enqueueProvisioning(id, { reason, requestedBy: actor.id });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'instance.retry_requested', targetType: 'instance', targetId: id, meta: { reason } });

    return reply.code(202).send({ instance: { id, status: 'provisioning' } });
  });

  /**
   * Imports an existing Pterodactyl server and assigns it to a customer.
   * Only an administrator can do this.
   */
  app.post('/admin/instances/import', { preHandler: requirePermission('services.write') }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    if (actor.role !== 'ADMIN') throw badRequest('Only an administrator can import a server.');
    const body = z
      .object({
        pterodactylServerId: z.number().int().positive(),
        userId: z.string().min(1),
        productId: z.string().min(1).optional(),
        name: z.string().trim().min(1).max(80).optional(),
      })
      .parse(request.body);

    const customer = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!customer) throw notFound('Customer not found.');

    const existing = await prisma.instance.findFirst({ where: { pterodactylServerId: body.pterodactylServerId } });
    if (existing) throw conflict('That Pterodactyl server is already imported.');

    const server = await ptero.getServer(body.pterodactylServerId);

    let product = body.productId
      ? await prisma.product.findUnique({ where: { id: body.productId } })
      : await prisma.product.findFirst({ where: { eggId: server.egg } });

    if (!product) {
      // Fall back to any product that maps to the same egg.
      product = await prisma.product.findFirst({ where: { eggId: server.egg } });
    }
    if (!product) {
      throw badRequest('No catalog product maps to this server. Map an egg to a product first.');
    }

    const price = await prisma.productPrice.findFirst({
      where: { productId: product.id, period: 'MONTHLY', active: true },
      orderBy: { createdAt: 'desc' },
    });

    const instance = await prisma.instance.create({
      data: {
        userId: customer.id,
        productId: product.id,
        name: body.name ?? server.name,
        status: 'ONLINE',
        pterodactylServerId: server.id,
        pterodactylUuid: server.uuid,
        ram: server.limits.memory,
        cpu: Math.max(1, Math.round(server.limits.cpu / 100)),
        disk: Math.max(1, Math.round(server.limits.disk / 1024)),
        price: price?.baseAmount ?? 0,
        currency: price?.currency ?? 'EUR',
        provisioningKey: `import:${server.id}`,
      },
    });

    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'imported', message: `Imported Pterodactyl server ${server.id}.` },
    });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'instance.imported',
      targetType: 'instance',
      targetId: instance.id,
      meta: { pterodactylServerId: server.id, customerId: customer.id },
    });

    return reply.code(201).send({ instance: { id: instance.id, name: instance.name, status: instance.status.toLowerCase() } });
  });

  app.get('/admin/money', { preHandler: requirePermission('pricing.read') }, async () => ({ example: { minorUnits: 312, majorUnits: money(312) } }));
}
