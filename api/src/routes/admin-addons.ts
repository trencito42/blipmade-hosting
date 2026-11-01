import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';

/**
 * The add-ons of the catalogue (the extras a customer picks at the order, such as the dedicated
 * IPv4 address of a VPS) and the history of every price change.
 *
 * An add-on is priced when it is picked, so a change of its amount reaches new orders only: an
 * order that was placed and a subscription that exists keep the amount they were sold at. The
 * code of an add-on is its reference and never changes, and an add-on is retired, not deleted.
 */

const code = z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes.');
const amount = z.number().int().min(0).max(10_000_000);

const view = (option: { id: string; code: string; name: string; description: string | null; amount: number; currency: string; recurring: boolean; active: boolean; productId: string | null; product?: { slug: string; name: string } | null }) => ({
  id: option.id,
  code: option.code,
  name: option.name,
  description: option.description,
  amount: option.amount,
  currency: option.currency,
  recurring: option.recurring,
  active: option.active,
  productId: option.productId,
  product: option.product ?? null,
});

export async function registerAdminAddonRoutes(app: FastifyInstance): Promise<void> {
  const limited = { config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } } };

  app.get('/admin/options', { preHandler: requirePermission('pricing.read') }, async () => {
    const options = await prisma.productOption.findMany({ include: { product: { select: { slug: true, name: true } } }, orderBy: [{ active: 'desc' }, { code: 'asc' }] });
    return {
      options: options.map(view),
      note: 'A change of the amount reaches new orders. Orders in progress and subscriptions that exist keep the amount they were sold at.',
    };
  });

  app.post('/admin/options', { ...limited, preHandler: [requirePermission('pricing.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const body = z
      .object({
        code,
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(500).nullable().optional(),
        amount,
        recurring: z.boolean().default(true),
        productId: z.string().nullable().optional(),
        active: z.boolean().default(true),
      })
      .strict()
      .parse(request.body);
    if (await prisma.productOption.findUnique({ where: { code: body.code } })) throw conflict('An add-on with this code already exists.');
    if (body.productId && !(await prisma.product.findUnique({ where: { id: body.productId } }))) throw notFound('Product not found.');
    const option = await prisma.productOption.create({
      data: { code: body.code, name: body.name, description: body.description ?? null, amount: body.amount, recurring: body.recurring, productId: body.productId ?? null, active: body.active, currency: 'EUR' },
      include: { product: { select: { slug: true, name: true } } },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'option.created', targetType: 'product_option', targetId: option.id, meta: { code: option.code, amount: option.amount, active: option.active }, ip: request.ip });
    return reply.code(201).send({ option: view(option) });
  });

  app.patch('/admin/options/:id', { ...limited, preHandler: [requirePermission('pricing.write'), customerLimit(app, LIMITS.adminWrite)] }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    // The code is the reference of the add-on; it is not in the list, so a request that names it is refused.
    const body = z
      .object({
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(500).nullable(),
        amount,
        recurring: z.boolean(),
        productId: z.string().nullable(),
        active: z.boolean(),
      })
      .partial()
      .strict()
      .parse(request.body);
    const before = await prisma.productOption.findUnique({ where: { id } });
    if (!before) throw notFound('Add-on not found.');
    if (body.productId && !(await prisma.product.findUnique({ where: { id: body.productId } }))) throw notFound('Product not found.');
    if (Object.keys(body).length === 0) throw badRequest('Nothing to change.');
    const option = await prisma.productOption.update({ where: { id }, data: body, include: { product: { select: { slug: true, name: true } } } });
    const changes = Object.entries(body)
      .filter(([key, value]) => (before as Record<string, unknown>)[key] !== value)
      .map(([field, to]) => ({ field, from: (before as Record<string, unknown>)[field], to }));
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'option.updated', targetType: 'product_option', targetId: id, meta: { code: before.code, changes }, ip: request.ip });
    return { option: view(option), changes };
  });

  /** Every change of a price, an add-on or the rate card, newest first, with the values before and after. */
  app.get('/admin/pricing/history', { preHandler: requirePermission('pricing.read') }, async () => {
    const entries = await prisma.auditLog.findMany({
      where: { OR: [{ action: { startsWith: 'pricing.' } }, { action: { startsWith: 'option.' } }, { action: 'settings.updated', meta: { path: ['keys'], array_contains: 'billing.tax_rate' } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: { id: true, action: true, actorEmail: true, targetType: true, targetId: true, meta: true, createdAt: true },
    });
    return { history: entries };
  });
}
