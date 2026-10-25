import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission, requireStaff } from '../plugins/auth.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { deploymentAvailability, type DeploymentAvailability } from '../services/availability.js';
import {
  cancelMailService,
  effectivePlanLimits,
  limitsOfService,
  mailServiceStatusLabel,
  platformLimits,
  rateLimitFrame,
  rateLimitValue,
  reactivateMailService,
  resumeMailService,
  suspendMailService,
  type MailPlanLimits,
} from '../services/mail-commerce.js';
import * as mailcow from '../services/mailcow.js';
import { enqueueMailProvisioning } from '../services/queue.js';

/**
 * The back office of the sale of hosted mail.
 *
 * Two things are sold here and both are the work of the operator:
 *
 *   - the plans, with their limits and their prices. The operator owns the
 *     prices: the back office writes them and it never makes one up;
 *   - the mail services of the customers, with their state, their use and
 *     their life.
 *
 * The limits of the platform are the ceiling of what the mail system can
 * really hold. A draft may ask for more than the ceiling: the draft records
 * the intent, and the limits that are really applied are the smaller of the
 * two. What the ceiling forbids is putting on sale a plan that promises more
 * than the platform can hold, and such a plan is refused with a message that
 * names the ceiling.
 *
 * Nothing here writes the DNS of a customer and nothing here shows a
 * password, a token of a mailbox or a key of the mail system.
 */

/** A limit of a plan. It is a whole number and it is never negative. */
const limitSchema = z.number().int().min(0);

/** The window in which the limit of sending is counted. */
const intervalSchema = z.enum(['MINUTELY', 'HOURLY', 'DAILY']);

/** The currency of a price: three letters, like EUR. */
const currencySchema = z
  .string()
  .trim()
  .min(3)
  .max(3)
  .regex(/^[A-Za-z]{3}$/, 'Use a three letter currency, like EUR.');

/**
 * The body of a plan that is created.
 *
 * Every limit is optional and falls back to the limit of the platform, so the
 * operator writes down only what is different from the ceiling. A draft may
 * ask for more than the ceiling: the draft records the intent, and the
 * limits that are really applied are the smaller of the two. What the ceiling
 * forbids is selling more than the platform can hold.
 *
 * The prices are optional too: a draft without a price is normal.
 */
const createPlanSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes.'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(2000),
  icon: z.string().trim().max(40).default('mail'),
  maxDomains: limitSchema.optional(),
  maxMailboxes: limitSchema.optional(),
  maxAliases: limitSchema.optional(),
  maxForwarding: limitSchema.optional(),
  totalStorageMb: limitSchema.optional(),
  mailboxQuotaMb: limitSchema.optional(),
  sendLimit: limitSchema.optional(),
  sendInterval: intervalSchema.optional(),
  prices: z
    .array(
      z.object({
        period: z.enum(['MONTHLY', 'YEARLY']),
        amount: z.number().int().min(0),
        currency: currencySchema.default('EUR'),
      }),
    )
    .max(4)
    .optional(),
  visible: z.boolean().default(true),
  deployable: z.boolean().default(false),
});

/**
 * The body of a plan that is changed.
 *
 * A price of a period that is not in the body is left alone, so the operator
 * changes the price of the month without touching the price of the year.
 */
const patchPlanSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(10).max(2000).optional(),
  visible: z.boolean().optional(),
  deployable: z.boolean().optional(),
  maxDomains: limitSchema.optional(),
  maxMailboxes: limitSchema.optional(),
  maxAliases: limitSchema.optional(),
  maxForwarding: limitSchema.optional(),
  totalStorageMb: limitSchema.optional(),
  mailboxQuotaMb: limitSchema.optional(),
  sendLimit: limitSchema.optional(),
  sendInterval: intervalSchema.optional(),
  prices: z
    .array(
      z.object({
        period: z.enum(['MONTHLY', 'YEARLY']),
        amount: z.number().int().min(0),
        currency: currencySchema.optional(),
        active: z.boolean().optional(),
      }),
    )
    .max(4)
    .optional(),
});

/** The limits of a plan, as they are written on the product. */
interface CatalogLimits {
  maxDomains: number | null;
  maxMailboxes: number | null;
  maxAliases: number | null;
  maxForwarding: number | null;
  totalStorageMb: number | null;
  mailboxQuotaMb: number | null;
  sendLimit: number | null;
  sendInterval: string | null;
}

/** The price of a plan, as the operator sees it. */
interface AdminPlanPrice {
  id: string;
  period: string;
  amount: number;
  currency: string;
  active: boolean;
}

/** A plan of hosted mail, as the operator sees it. */
interface AdminPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  visible: boolean;
  deployable: boolean;
  category: string;
  fulfilment: string;
  /** The limits that are really applied to a service that buys this plan. */
  limits: MailPlanLimits;
  /** The limits that are written on the product, the catalog as it is. */
  catalogLimits: CatalogLimits;
  /** The ceiling of the platform: what the mail system can really hold. */
  ceiling: MailPlanLimits;
  /** True when a written limit is above the ceiling and is therefore capped. */
  cappedByPlatform: boolean;
  prices: AdminPlanPrice[];
  /** How many customers bought the plan. */
  customers: number;
  /** How many mail services point at the plan. */
  services: number;
  /** Why the plan can or cannot be ordered, in words. */
  availability: DeploymentAvailability;
}

/** The life of a mail service: the moments that decide what happens to it. */
interface AdminServiceLife {
  graceUntil: string | null;
  suspendedAt: string | null;
  cancelledAt: string | null;
  retentionUntil: string | null;
}

/** A mail service, as the operator sees it. */
interface AdminService {
  id: string;
  customer: { id: string; email: string };
  plan: { id: string; slug: string; name: string };
  status: string;
  /** The state, in the words of the customer. */
  statusLabel: string;
  limits: MailPlanLimits;
  usage: { domains: number; mailboxes: number; storageMb: number; storageLimitMb: number };
  life: AdminServiceLife;
  lastError: string | null;
  createdAt: string;
}

/** A domain of a mail service. The token of the proof is never shown. */
interface AdminServiceDomain {
  id: string;
  name: string;
  status: string;
  ownershipStatus: string;
  verificationHost: string | null;
  verifiedAt: string | null;
  quotaMb: number;
  usedMb: number;
  mailboxes: number;
  aliases: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  lastError: string | null;
}

type PlanWithPrices = Prisma.ProductGetPayload<{ include: { prices: true } }>;

const serviceInclude = {
  user: { select: { id: true, email: true } },
  product: { select: { id: true, slug: true, name: true } },
  domains: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      ownershipStatus: true,
      verificationHost: true,
      verifiedAt: true,
      quotaMb: true,
      usedMb: true,
      maxMailboxes: true,
      maxAliases: true,
      maxForwarding: true,
      lastError: true,
      _count: { select: { mailboxes: true, aliases: true } },
    },
  },
} as const;

type ServiceRow = Prisma.MailServiceGetPayload<{ include: typeof serviceInclude }>;

/** A date as a text, or nothing when the date is not there. */
function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * The limits of the platform, and the words that name them.
 *
 * The ceiling is the limit of the environment, so the operator can lower it
 * without touching the catalog.
 */
const CEILING_LABELS: Array<{ key: keyof MailPlanLimits; label: string }> = [
  { key: 'maxDomains', label: 'domains' },
  { key: 'maxMailboxes', label: 'mailboxes per domain' },
  { key: 'maxAliases', label: 'aliases per domain' },
  { key: 'maxForwarding', label: 'forwarding rules per domain' },
  { key: 'totalStorageMb', label: 'megabytes of space' },
  { key: 'mailboxQuotaMb', label: 'megabytes per mailbox' },
  { key: 'sendLimit', label: 'messages per window' },
];

/**
 * Refuses a limit that is above the ceiling of the platform.
 *
 * The ceiling is what the mail system can really hold, so a plan that is on
 * sale may not ask for more: the customer would be promised something the
 * platform cannot keep. A draft is not checked here: a draft records the
 * intent, and the limits that are really applied are the smaller of the two.
 *
 * The message names the limit and the ceiling, so the operator knows what to
 * write down instead of guessing.
 */
function assertUnderCeiling(limits: Partial<Record<keyof MailPlanLimits, number | string>>): void {
  const cap = platformLimits();
  for (const { key, label } of CEILING_LABELS) {
    const value = limits[key];
    if (typeof value !== 'number') continue;
    const ceiling = cap[key] as unknown as number;
    if (value > ceiling) {
      throw badRequest(
        `The plan is on sale, so it cannot ask for more than the platform holds: it asks for ${value} ${label}, but the platform holds at most ${ceiling}. Lower the limit to ${ceiling} or less.`,
      );
    }
  }
}

/**
 * Refuses a plan that is on sale and has no price.
 *
 * A draft without a price is normal: the operator writes the price when the
 * plan is ready. A plan that is on sale without a price cannot be ordered.
 */
function assertPriced(priceCount: number): void {
  if (priceCount > 0) return;
  throw badRequest(
    'The plan is on sale, so it needs a price. Add the price of the month or of the year before it can be sold.',
  );
}

/** The limits of a plan, with the limit of the platform for what is missing. */
function limitsOfPlan(input: {
  maxDomains?: number;
  maxMailboxes?: number;
  maxAliases?: number;
  maxForwarding?: number;
  totalStorageMb?: number;
  mailboxQuotaMb?: number;
  sendLimit?: number;
  sendInterval?: string;
}): MailPlanLimits {
  const cap = platformLimits();
  return {
    maxDomains: input.maxDomains ?? cap.maxDomains,
    maxMailboxes: input.maxMailboxes ?? cap.maxMailboxes,
    maxAliases: input.maxAliases ?? cap.maxAliases,
    maxForwarding: input.maxForwarding ?? cap.maxForwarding,
    totalStorageMb: input.totalStorageMb ?? cap.totalStorageMb,
    mailboxQuotaMb: input.mailboxQuotaMb ?? cap.mailboxQuotaMb,
    sendLimit: input.sendLimit ?? cap.sendLimit,
    sendInterval: (input.sendInterval as MailPlanLimits['sendInterval']) ?? cap.sendInterval,
  };
}

/**
 * How many customers bought each plan and how many services point at it.
 *
 * The customers are counted apart: a customer that bought the plan twice is
 * one customer and two services, and the operator sees both numbers.
 */
async function planCounts(
  productIds: string[],
): Promise<Map<string, { services: number; customers: number }>> {
  const counts = new Map<string, { services: number; customers: number }>();
  if (!productIds.length) return counts;
  const rows = await prisma.$queryRaw<Array<{ productId: string; services: bigint; customers: bigint }>>(
    Prisma.sql`
      SELECT "productId",
             COUNT(*)::bigint AS "services",
             COUNT(DISTINCT "userId")::bigint AS "customers"
      FROM "MailService"
      WHERE "productId" IN (${Prisma.join(productIds)})
      GROUP BY "productId"
    `,
  );
  for (const row of rows) {
    counts.set(row.productId, { services: Number(row.services), customers: Number(row.customers) });
  }
  return counts;
}

/** A plan of hosted mail, as the operator sees it. */
function planView(product: PlanWithPrices, counts: { services: number; customers: number }): AdminPlan {
  const cap = platformLimits();
  const catalogLimits: CatalogLimits = {
    maxDomains: product.mailMaxDomains,
    maxMailboxes: product.mailMaxMailboxes,
    maxAliases: product.mailMaxAliases,
    maxForwarding: product.mailMaxForwarding,
    totalStorageMb: product.mailTotalStorageMb,
    mailboxQuotaMb: product.mailMailboxQuotaMb,
    sendLimit: product.mailSendLimit,
    sendInterval: product.mailSendInterval,
  };
  // A written limit that is above the ceiling is capped when it is applied,
  // and the operator is told so.
  const capped = CEILING_LABELS.some(({ key }) => {
    const value = catalogLimits[key];
    if (typeof value !== 'number') return false;
    return value > (cap[key] as unknown as number);
  });

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    icon: product.icon,
    visible: product.visible,
    deployable: product.deployable,
    category: product.category,
    fulfilment: product.fulfilment,
    limits: effectivePlanLimits(product),
    catalogLimits,
    ceiling: cap,
    cappedByPlatform: capped,
    prices: product.prices.map((price) => ({
      id: price.id,
      period: price.period,
      amount: price.baseAmount,
      currency: price.currency,
      active: price.active,
    })),
    customers: counts.customers,
    services: counts.services,
    availability: deploymentAvailability(
      {
        name: product.name,
        deployable: product.deployable,
        eggId: product.eggId,
        visible: product.visible,
        fulfilment: product.fulfilment,
      },
      { emailSalesEnabled: env.MAIL_SALES_ENABLED },
    ),
  };
}

/** A mail service, as the operator sees it. */
function serviceView(service: ServiceRow): AdminService {
  const domains = service.domains;
  return {
    id: service.id,
    customer: { id: service.user.id, email: service.user.email },
    plan: { id: service.product.id, slug: service.product.slug, name: service.product.name },
    status: service.status,
    statusLabel: mailServiceStatusLabel(service.status),
    limits: limitsOfService(service),
    usage: {
      domains: domains.length,
      mailboxes: domains.reduce((sum, domain) => sum + domain._count.mailboxes, 0),
      storageMb: domains.reduce((sum, domain) => sum + domain.usedMb, 0),
      storageLimitMb: service.totalStorageMb,
    },
    life: {
      graceUntil: iso(service.graceUntil),
      suspendedAt: iso(service.suspendedAt),
      cancelledAt: iso(service.cancelledAt),
      retentionUntil: iso(service.retentionUntil),
    },
    lastError: service.lastError,
    createdAt: service.createdAt.toISOString(),
  };
}

/** A domain of a mail service. The token of the proof is never shown. */
function domainView(domain: ServiceRow['domains'][number]): AdminServiceDomain {
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    ownershipStatus: domain.ownershipStatus,
    verificationHost: domain.verificationHost,
    verifiedAt: iso(domain.verifiedAt),
    quotaMb: domain.quotaMb,
    usedMb: domain.usedMb,
    mailboxes: domain._count.mailboxes,
    aliases: domain._count.aliases,
    maxMailboxes: domain.maxMailboxes,
    maxAliases: domain.maxAliases,
    maxForwarding: domain.maxForwarding,
    lastError: domain.lastError,
  };
}

/** The health of the mail system, in words when it does not answer. */
interface MailSystemHealth {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  disk: { used: string; total: string; usedPercent: string } | null;
  domains: number | null;
  message: string | null;
}

/**
 * Reads the health of the mail system.
 *
 * A mail system that is not configured or that does not answer is said in
 * words: a number is never invented for something that was not read.
 */
async function mailSystemHealth(): Promise<MailSystemHealth> {
  if (!mailcow.mailcowConfigured()) {
    return {
      configured: false,
      reachable: false,
      version: null,
      disk: null,
      domains: null,
      message: 'The mail system is not configured on this environment.',
    };
  }

  let failure: string | null = null;
  const version = await mailcow.mailcowVersion().catch((error: Error) => {
    failure = error.message;
    return null;
  });
  const disk = await mailcow.mailcowDisk().catch(() => null);
  const domains = await mailcow
    .mailcowDomains()
    .then((list) => list.length)
    .catch(() => null);

  if (version === null) {
    return {
      configured: true,
      reachable: false,
      version: null,
      disk,
      domains,
      message: failure ?? 'The mail system did not answer.',
    };
  }
  return { configured: true, reachable: true, version, disk, domains, message: null };
}

export async function registerAdminMailPlansRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Every plan of hosted mail.
   *
   * The answer carries both the limits that are really applied and the limits
   * that are written on the product, so the operator sees what the catalog
   * says and what a customer really gets.
   */
  app.get('/admin/mail/plans', {
    config: { rateLimit: { max: LIMITS.adminService.address, timeWindow: LIMITS.adminService.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const products = await prisma.product.findMany({
      where: { fulfilment: 'EMAIL' },
      include: { prices: { orderBy: [{ period: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = await planCounts(products.map((product) => product.id));
    return {
      plans: products.map((product) =>
        planView(product, counts.get(product.id) ?? { services: 0, customers: 0 }),
      ),
    };
  });

  /**
   * Creates a plan of hosted mail.
   *
   * The slug is the name of the plan in the address of the catalog, so it is
   * unique. The prices are the prices of the operator: the back office writes
   * them and it never makes one up.
   *
   * A plan that is not on sale is a draft: it may ask for more than the
   * platform holds and it may have no price at all. A plan that goes on sale
   * may not promise more than the platform can hold and it needs a price.
   */
  app.post('/admin/mail/plans', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest, reply) => {
    const actor = await requireStaff(request);
    const body = createPlanSchema.parse(request.body);

    const taken = await prisma.product.findUnique({ where: { slug: body.slug } });
    if (taken) throw conflict('A plan with this slug already exists.');

    const prices = body.prices ?? [];
    const periods = prices.map((price) => price.period);
    if (new Set(periods).size !== periods.length) {
      throw badRequest('A plan can hold one price per period. Change the prices of the body.');
    }

    const limits = limitsOfPlan(body);
    if (body.deployable) {
      assertUnderCeiling(limits);
      assertPriced(prices.length);
    }

    const product = await prisma.product.create({
      data: {
        slug: body.slug,
        name: body.name,
        description: body.description,
        icon: body.icon,
        // A plan of mail is a product of the catalog that the mail system
        // delivers: it needs no server and no panel.
        category: 'EMAIL_HOSTING',
        fulfilment: 'EMAIL',
        visible: body.visible,
        deployable: body.deployable,
        mailMaxDomains: limits.maxDomains,
        mailMaxMailboxes: limits.maxMailboxes,
        mailMaxAliases: limits.maxAliases,
        mailMaxForwarding: limits.maxForwarding,
        mailTotalStorageMb: limits.totalStorageMb,
        mailMailboxQuotaMb: limits.mailboxQuotaMb,
        mailSendLimit: limits.sendLimit,
        mailSendInterval: limits.sendInterval,
        prices: {
          create: prices.map((price) => ({
            period: price.period,
            baseAmount: price.amount,
            currency: price.currency,
          })),
        },
      },
      include: { prices: true },
    });

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'mail.plan_created',
      targetType: 'product',
      targetId: product.id,
      meta: { slug: product.slug, limits, prices: body.prices },
      ip: request.ip,
    });

    const counts = await planCounts([product.id]);
    return reply.code(201).send({ plan: planView(product, counts.get(product.id) ?? { services: 0, customers: 0 }) });
  });

  /**
   * Changes a plan of hosted mail.
   *
   * A plan can be taken off sale without being deleted: it stays visible and
   * it stops being orderable, and the availability says why in words.
   *
   * The ceiling is checked on the plan as it is after the change: a plan that
   * is on sale may not promise more than the platform can hold, and a plan
   * that is on sale needs a price.
   */
  app.patch('/admin/mail/plans/:id', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = patchPlanSchema.parse(request.body);

    const product = await prisma.product.findUnique({ where: { id }, include: { prices: true } });
    if (!product) throw notFound('This plan does not exist.');
    if (product.fulfilment !== 'EMAIL') throw badRequest('This product is not a plan of hosted mail.');

    // The plan as it is after the change: what the operator asked for, and
    // what the plan already had for everything else.
    const onSale = body.deployable ?? product.deployable;
    const limits = limitsOfPlan({
      maxDomains: body.maxDomains ?? product.mailMaxDomains ?? undefined,
      maxMailboxes: body.maxMailboxes ?? product.mailMaxMailboxes ?? undefined,
      maxAliases: body.maxAliases ?? product.mailMaxAliases ?? undefined,
      maxForwarding: body.maxForwarding ?? product.mailMaxForwarding ?? undefined,
      totalStorageMb: body.totalStorageMb ?? product.mailTotalStorageMb ?? undefined,
      mailboxQuotaMb: body.mailboxQuotaMb ?? product.mailMailboxQuotaMb ?? undefined,
      sendLimit: body.sendLimit ?? product.mailSendLimit ?? undefined,
      sendInterval: body.sendInterval ?? product.mailSendInterval ?? undefined,
    });
    if (onSale) assertUnderCeiling(limits);

    const periods = (body.prices ?? []).map((price) => price.period);
    if (new Set(periods).size !== periods.length) {
      throw badRequest('A plan can hold one price per period. Change the prices of the body.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.visible !== undefined ? { visible: body.visible } : {}),
          ...(body.deployable !== undefined ? { deployable: body.deployable } : {}),
          ...(body.maxDomains !== undefined ? { mailMaxDomains: body.maxDomains } : {}),
          ...(body.maxMailboxes !== undefined ? { mailMaxMailboxes: body.maxMailboxes } : {}),
          ...(body.maxAliases !== undefined ? { mailMaxAliases: body.maxAliases } : {}),
          ...(body.maxForwarding !== undefined ? { mailMaxForwarding: body.maxForwarding } : {}),
          ...(body.totalStorageMb !== undefined ? { mailTotalStorageMb: body.totalStorageMb } : {}),
          ...(body.mailboxQuotaMb !== undefined ? { mailMailboxQuotaMb: body.mailboxQuotaMb } : {}),
          ...(body.sendLimit !== undefined ? { mailSendLimit: body.sendLimit } : {}),
          ...(body.sendInterval !== undefined ? { mailSendInterval: body.sendInterval } : {}),
        },
      });

      for (const price of body.prices ?? []) {
        const rows = await tx.productPrice.findMany({ where: { productId: id, period: price.period } });
        if (!rows.length) {
          await tx.productPrice.create({
            data: {
              productId: id,
              period: price.period,
              baseAmount: price.amount,
              currency: price.currency ?? 'EUR',
              active: price.active ?? true,
            },
          });
          continue;
        }
        // Every row of the period gets the price, so the period has one price
        // and the catalog and the order cannot disagree about it.
        await tx.productPrice.updateMany({
          where: { productId: id, period: price.period },
          data: {
            baseAmount: price.amount,
            ...(price.currency !== undefined ? { currency: price.currency } : {}),
            ...(price.active !== undefined ? { active: price.active } : {}),
          },
        });
      }

      // A plan that is on sale needs a price. The check is inside the
      // transaction, so a refusal leaves the plan exactly as it was.
      if (onSale) {
        const priced = await tx.productPrice.count({ where: { productId: id, active: true } });
        assertPriced(priced);
      }
    });

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'mail.plan_updated',
      targetType: 'product',
      targetId: id,
      meta: { slug: product.slug, ...body },
      ip: request.ip,
    });

    const updated = await prisma.product.findUnique({ where: { id }, include: { prices: true } });
    if (!updated) throw notFound('This plan does not exist.');
    const counts = await planCounts([id]);
    return { plan: planView(updated, counts.get(id) ?? { services: 0, customers: 0 }) };
  });

  /**
   * Deletes a plan of hosted mail.
   *
   * A plan that a customer bought is never deleted: the service of that
   * customer points at it, so the plan is taken off sale instead.
   */
  app.delete('/admin/mail/plans/:id', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const product = await prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { mailServices: true } } },
    });
    if (!product) throw notFound('This plan does not exist.');
    if (product.fulfilment !== 'EMAIL') throw badRequest('This product is not a plan of hosted mail.');
    if (product._count.mailServices > 0) {
      throw conflict('A customer already bought this plan, so it cannot be deleted. Take it off sale instead.');
    }

    try {
      // The prices of the plan go with it: they are owned by the product.
      await prisma.product.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw conflict('This plan is already part of an order, so it cannot be deleted. Take it off sale instead.');
      }
      throw error;
    }

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'mail.plan_deleted',
      targetType: 'product',
      targetId: id,
      meta: { slug: product.slug },
      ip: request.ip,
    });
    return { ok: true };
  });

  /**
   * Every mail service of the platform.
   *
   * The list is read in pages, because the number of services grows with the
   * number of customers.
   */
  app.get('/admin/mail/services', {
    config: { rateLimit: { max: LIMITS.adminService.address, timeWindow: LIMITS.adminService.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.read'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const query = z
      .object({ status: z.string().optional(), search: z.string().optional() })
      .parse(request.query ?? {});
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 50, maxSize: 200 });

    const where: Prisma.MailServiceWhereInput = {};
    if (query.status?.trim()) where.status = query.status.trim().toUpperCase() as never;
    if (query.search?.trim()) {
      const search = query.search.trim().toLowerCase();
      where.OR = [
        { user: { email: { contains: search } } },
        { product: { slug: { contains: search } } },
        { product: { name: { contains: search } } },
      ];
    }

    const rows = await prisma.mailService.findMany({
      where: withCursor(where, cursor, 'createdAt'),
      include: serviceInclude,
      orderBy: pageOrder('createdAt'),
      take: limit + 1,
    });
    const page = pageOf(rows, limit, 'createdAt');

    return {
      services: page.rows.map((service) => serviceView(service as ServiceRow)),
      nextCursor: page.pagination.nextCursor,
      pagination: page.pagination,
    };
  });

  /**
   * One mail service of the platform, with its domains.
   */
  app.get('/admin/mail/services/:id', {
    config: { rateLimit: { max: LIMITS.adminService.address, timeWindow: LIMITS.adminService.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.read'), customerLimit(app, LIMITS.adminService)],
  }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const service = await prisma.mailService.findUnique({ where: { id }, include: serviceInclude });
    if (!service) throw notFound('This mail service does not exist.');
    const row = service as ServiceRow;
    return {
      service: serviceView(row),
      domains: row.domains.map((domain) => domainView(domain)),
    };
  });

  /**
   * Suspends a mail service.
   *
   * The mail stops at once and the data stays where it is, so the service can
   * be brought back.
   */
  app.post('/admin/mail/services/:id/suspend', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ reason: z.string().trim().max(500).optional() }).parse(request.body ?? {});
    await suspendMailService(id, body.reason ?? 'Suspended by the operator.', actor.id);
    return { ok: true };
  });

  /**
   * Brings a suspended mail service back.
   */
  app.post('/admin/mail/services/:id/resume', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await resumeMailService(id, actor.id);
    return { ok: true };
  });

  /**
   * Cancels a mail service.
   *
   * The mail goes into the period of grace: it keeps working until the grace
   * ends and the data is kept until the retention ends.
   */
  app.post('/admin/mail/services/:id/cancel', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const life = await cancelMailService(id, actor.id);
    return { ok: true, graceUntil: life.graceUntil, retentionUntil: life.retentionUntil };
  });

  /**
   * Brings a mail service that is in the period of grace back to work.
   */
  app.post('/admin/mail/services/:id/reactivate', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await reactivateMailService(id, actor.id);
    return { ok: true };
  });

  /**
   * Puts a mail service back on the queue of the mail.
   *
   * The work is done by the queue, so the operator does not wait for the mail
   * system and the answer is immediate.
   */
  app.post('/admin/mail/services/:id/reprovision', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const service = await prisma.mailService.findUnique({ where: { id }, select: { id: true } });
    if (!service) throw notFound('This mail service does not exist.');

    await enqueueMailProvisioning(service.id, {
      reason: 'requested by the operator',
      requestedBy: actor.id,
    });

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'mail.service_reprovisioned',
      targetType: 'mail_service',
      targetId: service.id,
      ip: request.ip,
    });
    return { ok: true };
  });

  /**
   * The use of the whole platform.
   *
   * The health of the mail system is said in words when it does not answer: a
   * number is never invented for something that was not read.
   */
  app.get('/admin/mail/usage', {
    config: { rateLimit: { max: LIMITS.adminService.address, timeWindow: LIMITS.adminService.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('mail.read'), customerLimit(app, LIMITS.adminService)],
  }, async () => {
    const [services, domains, mailboxes, storage, byState, sending] = await Promise.all([
      prisma.mailService.count(),
      prisma.mailDomain.count(),
      prisma.mailbox.count(),
      prisma.mailDomain.aggregate({ _sum: { usedMb: true } }),
      prisma.mailService.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.mailService.groupBy({ by: ['sendLimit', 'sendInterval'], _count: { _all: true } }),
    ]);

    const states: Record<string, number> = {
      PENDING: 0,
      PROVISIONING: 0,
      ACTIVE: 0,
      GRACE: 0,
      SUSPENDED: 0,
      CANCELLED: 0,
    };
    for (const row of byState) states[row.status] = row._count._all;

    const cap = platformLimits();
    return {
      services,
      domains,
      mailboxes,
      storageMb: storage._sum.usedMb ?? 0,
      byState: states,
      sending: {
        platform: {
          limit: cap.sendLimit,
          interval: cap.sendInterval,
          frame: rateLimitFrame(cap.sendInterval),
          value: rateLimitValue(cap),
        },
        inUse: sending.map((row) => ({
          sendLimit: row.sendLimit,
          sendInterval: row.sendInterval,
          services: row._count._all,
        })),
      },
      health: await mailSystemHealth(),
    };
  });
}
