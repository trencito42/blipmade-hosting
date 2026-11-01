import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { assertBoundedFields, MAX_STARTUP_VARIABLES } from '../lib/bounded.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { deploymentAvailability } from '../services/availability.js';
import { lifecycleOf, planProductChange, productPatchSchema, readinessOf, usageOf, type ProductPatch } from '../services/product-editor.js';

/**
 * The editor of a product: one record with every field the operator owns, a
 * preview of a change before it is written, and the history of the changes.
 * A change reaches new orders only; no running service is touched from here.
 */

const withPrices = { prices: true, options: true } as const;

async function load(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: withPrices });
  if (!product) throw notFound('Product not found.');
  return product;
}

/** Splits the control fields from the fields of the product, and checks the product fields. */
function parseChange(body: unknown): { patch: ProductPatch; confirmRisky: boolean; expectedUpdatedAt: string | null } {
  assertBoundedFields(body, { startup: { max: MAX_STARTUP_VARIABLES, label: 'The startup variables' } });
  const { confirmRisky, expectedUpdatedAt, ...rest } = (body ?? {}) as Record<string, unknown>;
  const parsed = productPatchSchema.safeParse(rest);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(`${issue?.path.join('.') || 'The request'}: ${issue?.message ?? 'is not valid'}`);
  }
  return {
    patch: parsed.data,
    confirmRisky: confirmRisky === true,
    expectedUpdatedAt: typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : null,
  };
}

const short = (value: unknown) => {
  const text = JSON.stringify(value ?? null);
  return text.length > 500 ? `${text.slice(0, 500)}…` : value;
};

export async function registerAdminProductRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
  };

  /** Every field of the product that the editor shows, with its state, its use and its readiness. */
  app.get('/admin/products/:id', { preHandler: requirePermission('products.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const product = await load(id);
    const [usage, readiness] = await Promise.all([usageOf(id), readinessOf(product)]);
    return {
      product: { ...product, lifecycle: lifecycleOf(product), availability: deploymentAvailability(product, { emailSalesEnabled: env.MAIL_SALES_ENABLED }) },
      usage,
      readiness,
      note: 'Changes reach new orders. Services that exist keep the size and the settings they were built with.',
    };
  });

  app.get('/admin/products/:id/readiness', { preHandler: requirePermission('products.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const checks = await readinessOf(await load(id));
    return { checks, ready: checks.every((check) => check.level !== 'blocker' || check.ok) };
  });

  /** What a change would do. It writes nothing. */
  app.post('/admin/products/:id/change-preview', { preHandler: requirePermission('products.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { patch } = parseChange(request.body);
    const { data: _data, ...plan } = await planProductChange(await load(id), patch);
    return { plan };
  });

  app.patch('/admin/products/:id', {
    ...limited,
    preHandler: [requirePermission('products.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { patch, confirmRisky, expectedUpdatedAt } = parseChange(request.body);
    const product = await load(id);

    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== product.updatedAt.getTime()) {
      throw conflict('The product was changed by someone else since you opened it. Reload it and make the change again.');
    }
    const plan = await planProductChange(product, patch);
    if (plan.errors.length) throw badRequest(plan.errors.join(' '));
    if (!plan.changes.length) return { product: { ...product, lifecycle: lifecycleOf(product) }, changes: [], unchanged: true };
    if (plan.requiresConfirmation && !confirmRisky) {
      throw new AppError(
        409,
        'confirmation_required',
        'This change touches how the product is built or sold and the product has customers or is published. Review the changes and confirm.',
        Object.fromEntries(plan.changes.filter((change) => change.risk === 'risky').map((change) => [change.field, change.note])),
      );
    }

    const updated = await prisma.product.update({ where: { id }, data: plan.data, include: withPrices });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'product.updated',
      targetType: 'product',
      targetId: id,
      meta: { slug: product.slug, confirmed: confirmRisky, usage: plan.usage, changes: plan.changes.map((change) => ({ field: change.field, risk: change.risk, from: short(change.from), to: short(change.to) })) },
      ip: request.ip,
    });
    return { product: { ...updated, lifecycle: lifecycleOf(updated) }, changes: plan.changes, usage: plan.usage };
  });

  /** The changes made to the product, newest first. */
  app.get('/admin/products/:id/history', { preHandler: requirePermission('products.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await load(id);
    const entries = await prisma.auditLog.findMany({
      where: { targetType: 'product', targetId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { id: true, action: true, actorEmail: true, meta: true, createdAt: true },
    });
    return { history: entries };
  });

  /** The product as a customer meets it: the card, what can be ordered, what is asked at the order. */
  app.get('/admin/products/:id/preview', { preHandler: requirePermission('products.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const product = await load(id);
    const availability = deploymentAvailability(product, { emailSalesEnabled: env.MAIL_SALES_ENABLED });
    const fields = Object.entries((product.customerVariables ?? {}) as Record<string, { label?: string; required?: boolean; type?: string; description?: string }>).map(([name, field]) => ({ name, label: field.label ?? name, required: field.required === true, type: field.type ?? 'text', description: field.description ?? null }));
    return {
      preview: {
        card: { slug: product.slug, name: product.name, category: product.category, description: product.description, icon: product.icon, docsUrl: product.docsUrl },
        lifecycle: lifecycleOf(product),
        orderable: availability.orderable,
        visibleInCatalogue: availability.visible,
        blockers: availability.blockers,
        sizes: { ram: [product.minRam, product.defaultRam, product.maxRam], cpu: [product.minCpu, product.defaultCpu, product.maxCpu], disk: [product.minDisk, product.defaultDisk, product.maxDisk] },
        prices: product.prices.filter((price) => price.active).map((price) => ({ period: price.period, baseAmount: price.baseAmount, currency: price.currency })),
        askedAtOrder: fields,
        installGuide: product.installGuide,
      },
    };
  });
}
