import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AbuseReport, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { assertMayActOnAccount, requirePermission, requireStaff, type AuthUser } from '../plugins/auth.js';
import {
  ENFORCEMENT_SERVICE_SUSPENDED,
  actionAllowed,
  actionTargetState,
  allowedActions,
  abuseAuditAction,
  enforcementLabel,
  filterStates,
  isStatusFilter,
  normalizeState,
  refusal,
  requiresReason,
  stateLabel,
  storedStates,
} from '../services/abuse-lifecycle.js';
import { getEmailQueue, getMailProvisionQueue, getQueue, getVpsProvisionQueue } from '../services/queue.js';
import * as ptero from '../services/pterodactyl/application.js';
import { assessCustomer } from '../services/risk.js';
import { replayStripeEvents } from './webhooks.js';
import { notifyPaymentRefunded } from '../services/notifications.js';
import { customerBalance, findPaymentIntentForSubscription, giveBalanceCredit, refundPartOfPayment, stripeLive } from '../services/stripe.js';
import { backupCoverage, backupHistory } from '../services/ops-backups.js';
import { glitchtipStatus } from '../services/glitchtip.js';
import { initErrorReporting, reportError } from '../lib/sentry.js';
import { env, paymentsAreEnabled } from '../env.js';
import { emailTemplateCatalog, emailTemplateDefaults } from '../lib/email-design.js';
import { emailOverrideOf, loadEmailOverrides, saveEmailOverride } from '../lib/email-overrides.js';
import { assertValidWording } from './admin-email.js';

/**
 * The service a report is about, as the staff desk reads it.
 */
interface AbuseServiceView {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  suspendedAt: string | null;
  customer: {
    id: string;
    email: string;
    name: string;
    role: string;
    suspendedAt: string | null;
  };
  product: { name: string; slug: string } | null;
}

/**
 * The services of a set of reports, read once.
 *
 * A report is about a service of the platform, and the staff needs to know
 * which one and who owns it. The services are read in one go, so a list of
 * reports does not ask the database once per row.
 */
async function servicesOf(instanceIds: Array<string | null>): Promise<Map<string, AbuseServiceView>> {
  const ids = instanceIds.filter((id): id is string => Boolean(id));
  if (!ids.length) return new Map();
  const rows = await prisma.instance.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      suspendedAt: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, suspendedAt: true } },
      product: { select: { name: true, slug: true } },
    },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        customer: {
          id: row.user.id,
          email: row.user.email,
          name: [row.user.firstName, row.user.lastName].filter(Boolean).join(' '),
          role: row.user.role,
          suspendedAt: row.user.suspendedAt?.toISOString() ?? null,
        },
        product: row.product,
      },
    ]),
  );
}

/**
 * The moment of the last entry of the journal for every report of a list.
 *
 * The last activity of a report is what was done with it, so it comes from the
 * journal and not from the row of the report, which only knows when it was
 * written.
 */
async function lastActivityOf(reportIds: string[]): Promise<Map<string, Date>> {
  if (!reportIds.length) return new Map();
  const rows = await prisma.auditLog.groupBy({
    by: ['targetId'],
    where: { targetType: 'abuse', targetId: { in: reportIds } },
    _max: { createdAt: true },
  });
  const out = new Map<string, Date>();
  for (const row of rows) {
    if (row.targetId && row._max.createdAt) out.set(row.targetId, row._max.createdAt);
  }
  return out;
}

/**
 * A report of abuse, as the staff desk reads it.
 *
 * The state of the case and the enforcement are two facts and they are told
 * apart: the state says where the case is, the enforcement says what was done
 * to the service of the report.
 */
function reportView(
  row: AbuseReport,
  service: AbuseServiceView | null,
  maySuspend: boolean,
): Record<string, unknown> {
  const state = normalizeState(row.status);
  return {
    id: row.id,
    category: row.category,
    target: row.target,
    details: row.details,
    evidenceUrl: row.evidenceUrl,
    reporterName: row.reporterName,
    reporterEmail: row.reporterEmail,
    status: state,
    statusLabel: stateLabel(state),
    resolution: row.resolution,
    instanceId: row.instanceId,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    enforcement: row.enforcement,
    enforcementLabel: enforcementLabel(row.enforcement),
    enforcementAt: row.enforcementAt?.toISOString() ?? null,
    enforcedBy: row.enforcedBy,
    service,
    allowedActions: allowedActions(state, { canSuspend: maySuspend, hasService: Boolean(row.instanceId) }),
  };
}

/**
 * What the staff needs to run the business: notes and tags on customers, the reports (income,
 * customers, churn), the queues of jobs with their failures, and the reports of abuse.
 */
export async function registerAdminOpsRoutes(app: FastifyInstance): Promise<void> {
  // --- free services held for review -----------------------------------------------------------

  // Free services that the automatic check did not approve, with the reasons. Clearing an account
  // lifts the hold for its next attempt (a false positive); the risk is still recorded.
  app.get('/admin/promotion-holds', { preHandler: [requirePermission('customers.read')] }, async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'promotion.free_held', createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))] } },
      select: { id: true, email: true, tags: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    const seen = new Set<string>();
    const holds = [];
    for (const row of rows) {
      if (!row.actorId || seen.has(row.actorId)) continue;
      seen.add(row.actorId);
      const user = byId.get(row.actorId);
      const meta = (row.meta ?? {}) as { level?: string; score?: number; reasons?: string[] };
      holds.push({
        id: row.id,
        at: row.createdAt,
        userId: row.actorId,
        email: user?.email ?? row.actorEmail ?? '',
        level: meta.level ?? 'high',
        score: meta.score ?? null,
        reasons: meta.reasons ?? [],
        cleared: Boolean(user?.tags.includes('promo-cleared')),
      });
    }
    return { holds };
  });

  app.post('/admin/customers/:id/promo-clearance', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    const { cleared, reason } = z.object({ cleared: z.boolean(), reason: z.string().trim().min(3).max(300) }).parse(request.body ?? {});
    const tags = cleared ? [...new Set([...customer.tags, 'promo-cleared'])] : customer.tags.filter((tag) => tag !== 'promo-cleared');
    await prisma.user.update({ where: { id: customer.id }, data: { tags } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: cleared ? 'admin.promotion.cleared' : 'admin.promotion.clearance_removed', targetType: 'user', targetId: customer.id, meta: { reason }, ip: request.ip });
    return { cleared };
  });

  // --- backup health ---------------------------------------------------------------------------

  // The disk of every node and the failures of the backups of customers' servers in the last days.
  // Backups of customers live on the node only: there is no copy outside it, and the page says so.
  app.get('/admin/backups/health', { preHandler: [requirePermission('infrastructure.read')] }, async () => {
    const day = 86_400_000;
    // A server is copied about once a week, so a copy older than nine days is a gap.
    const vpsServices = await prisma.vpsService.findMany({ where: { status: { in: ['ACTIVE', 'SUSPENDED'] }, vmid: { not: null } }, select: { id: true, name: true, vmid: true } });
    const vpsCopies = await prisma.offsiteBackup.groupBy({ by: ['sourceId'], where: { kind: 'VPS', state: 'OFFSITE_VERIFIED', sourceId: { in: vpsServices.map((service) => `vm${service.vmid}`) } }, _max: { verifiedAt: true } });
    const vpsGaps = vpsServices
      .map((service) => ({ id: service.id, name: service.name, vmid: service.vmid as number, lastCopyAt: vpsCopies.find((row) => row.sourceId === `vm${service.vmid}`)?._max.verifiedAt ?? null }))
      .filter((service) => !service.lastCopyAt || Date.now() - service.lastCopyAt.getTime() > 9 * day);
    let nodes: Awaited<ReturnType<typeof ptero.listNodes>> = [];
    let nodesError: string | null = null;
    try {
      nodes = await ptero.listNodes();
    } catch (error) {
      nodesError = (error as Error).message.slice(0, 200);
    }
    const [failures, counts, recentOffsiteFailures, latestVerified, latestByKind, restoreChecked, instances, linked, coverage] = await Promise.all([
      prisma.instanceEvent.findMany({
        where: { type: 'backups', message: { contains: 'failed' }, createdAt: { gte: new Date(Date.now() - 7 * day) } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, instanceId: true, message: true, createdAt: true, instance: { select: { name: true } } },
      }),
      prisma.offsiteBackup.groupBy({ by: ['kind', 'state'], _count: { _all: true }, _sum: { sizeBytes: true } }),
      prisma.offsiteBackup.findMany({ where: { state: 'FAILED', updatedAt: { gte: new Date(Date.now() - 7 * day) } }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, kind: true, sourceId: true, error: true, updatedAt: true } }),
      prisma.offsiteBackup.findFirst({ where: { state: 'OFFSITE_VERIFIED' }, orderBy: { verifiedAt: 'desc' }, select: { verifiedAt: true, kind: true } }),
      prisma.offsiteBackup.groupBy({ by: ['kind'], where: { state: 'OFFSITE_VERIFIED' }, _max: { verifiedAt: true } }),
      prisma.offsiteBackup.groupBy({ by: ['kind'], where: { restoreVerifiedAt: { not: null } }, _max: { restoreVerifiedAt: true } }),
      prisma.instance.findMany({ where: { pterodactylUuid: { not: null }, status: { in: ['ONLINE', 'STOPPED', 'DEGRADED', 'RESTARTING'] } }, select: { id: true, name: true } }),
      prisma.offsiteBackup.findMany({ where: { kind: 'CUSTOMER', state: 'OFFSITE_VERIFIED', instanceId: { not: null }, verifiedAt: { gte: new Date(Date.now() - 2 * day) } }, select: { instanceId: true }, distinct: ['instanceId'] }),
      backupCoverage(),
    ]);
    const covered = new Set(linked.map((row) => row.instanceId));
    // The states are told apart on purpose: a file that was uploaded is not a copy that was read back, and a copy
    // that was read back is not one that was restored.
    const byState = (kind: string, state: string) => counts.find((row) => row.kind === kind && row.state === state)?._count._all ?? 0;
    return {
      offsite: coverage.destination.state,
      destination: {
        reachable: coverage.destination.state === 'reachable',
        totalBytes: coverage.destination.totalBytes,
        usedBytes: coverage.destination.usedBytes,
        fileCount: coverage.destination.fileCount,
        error: coverage.destination.state === 'reachable' ? null : coverage.destination.reason,
        at: coverage.destination.at,
        inventory: coverage.destination.inventory,
        encrypted: coverage.destination.encrypted,
      },
      coverage: coverage.coverage,
      lastRestoreAt: coverage.lastRestoreAt,
      kinds: ['CUSTOMER', 'DATABASE', 'VPS', 'PLATFORM', 'INFRA', 'PVE'].map((kind) => ({
        kind,
        pending: byState(kind, 'OFFSITE_PENDING'),
        verified: byState(kind, 'OFFSITE_VERIFIED'),
        failed: byState(kind, 'FAILED'),
        lastVerifiedAt: latestByKind.find((row) => row.kind === kind)?._max.verifiedAt ?? null,
        lastRestoreCheckAt: restoreChecked.find((row) => row.kind === kind)?._max.restoreVerifiedAt ?? null,
      })),
      lastVerifiedAt: coverage.lastVerifiedAt ?? latestVerified?.verifiedAt ?? null,
      // Services with no verified offsite copy in the last two days.
      gaps: instances.filter((instance) => !covered.has(instance.id)).map((instance) => ({ id: instance.id, name: instance.name })),
      // Virtual servers with no verified copy in the last nine days.
      vpsGaps,
      offsiteFailures: recentOffsiteFailures.map((row) => ({ id: row.id, kind: row.kind, source: row.sourceId, error: row.error, at: row.updatedAt })),
      nodesError,
      nodes: nodes.map((node) => {
        const sellable = Math.round(node.disk * (1 + node.disk_overallocate / 100));
        return {
          id: node.id,
          name: node.name,
          diskMb: node.disk,
          allocatedMb: node.allocated_resources.disk,
          allocatedPercent: sellable > 0 ? Math.round((node.allocated_resources.disk / sellable) * 100) : null,
        };
      }),
      failures: failures.map((failure) => ({ id: failure.id, instanceId: failure.instanceId, instance: failure.instance.name, message: failure.message, at: failure.createdAt })),
      payments: {
        mode: env.stripeMode,
        paymentsEnabled: paymentsAreEnabled(),
        checkoutAvailable: paymentsAreEnabled() && env.stripeEnabled,
      },
    };
  });

  app.get('/admin/ops/backups', { preHandler: [requirePermission('infrastructure.read')] }, async (request) => {
    const query = z.object({
      kind: z.string().optional(),
      state: z.string().optional(),
      q: z.string().optional(),
      take: z.coerce.number().int().optional(),
    }).parse(request.query ?? {});
    return backupHistory(query);
  });

  app.get('/admin/ops/errors', { preHandler: [requirePermission('infrastructure.read')] }, async () => {
    const glitchtip = await glitchtipStatus();
    return {
      glitchtip,
      sdk: {
        api: Boolean(env.SENTRY_DSN),
        worker: Boolean(env.SENTRY_DSN),
        browser: 'unknown_until_build',
        environment: env.SENTRY_ENVIRONMENT,
        release: env.SENTRY_RELEASE || null,
        host: glitchtip.dsnHost,
      },
    };
  });

  app.post('/admin/ops/errors/synthetic', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    if (!env.SENTRY_DSN) {
      return { sent: false, reason: 'SENTRY_DSN is empty. The SDK is not sending exceptions.' };
    }
    initErrorReporting('api');
    reportError(new Error('blipmade.ops.synthetic'), { requestId: request.id, source: 'admin_ops_synthetic' });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'ops.glitchtip_synthetic',
      targetType: 'glitchtip',
      targetId: 'synthetic',
      ip: request.ip,
    });
    return { sent: true, reason: 'A tagged synthetic exception was handed to the SDK. Confirm it on GlitchTip; a DSN does not prove ingestion.' };
  });

  // --- saved replies for support ---------------------------------------------------------------

  // Short answers the team uses again. They are plain texts the team wrote: the platform makes no promise in them.
  const REPLIES_KEY = 'support.replies';
  const repliesSchema = z.array(z.object({ id: z.string().min(1).max(40), title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(4000) })).max(60);

  app.get('/admin/support/replies', { preHandler: [requirePermission('tickets.write')] }, async () => {
    const row = await prisma.setting.findUnique({ where: { key: REPLIES_KEY } });
    const parsed = repliesSchema.safeParse(row?.value);
    return { replies: parsed.success ? parsed.data : [] };
  });

  app.put('/admin/support/replies', { preHandler: [requirePermission('tickets.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const replies = repliesSchema.parse((request.body as { replies?: unknown } | null)?.replies ?? []);
    await prisma.setting.upsert({ where: { key: REPLIES_KEY }, create: { key: REPLIES_KEY, value: replies }, update: { value: replies } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.support_replies_saved', meta: { count: replies.length }, ip: request.ip });
    return { replies };
  });

  // --- knowledge base for the team ---------------------------------------------------------------
  const KB_KEY = 'support.knowledge';
  const kbSchema = z.array(z.object({ id: z.string().min(1).max(40), title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(20_000), tags: z.array(z.string().trim().toLowerCase().max(24)).max(8).default([]), assistant: z.boolean().default(false) })).max(300);

  app.get('/admin/support/knowledge', { preHandler: [requirePermission('tickets.read')] }, async () => {
    const row = await prisma.setting.findUnique({ where: { key: KB_KEY } });
    const parsed = kbSchema.safeParse(row?.value);
    return { articles: parsed.success ? parsed.data : [] };
  });

  app.put('/admin/support/knowledge', { preHandler: [requirePermission('tickets.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const articles = kbSchema.parse((request.body as { articles?: unknown } | null)?.articles ?? []);
    await prisma.setting.upsert({ where: { key: KB_KEY }, create: { key: KB_KEY, value: articles }, update: { value: articles } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.support_knowledge_saved', meta: { count: articles.length }, ip: request.ip });
    return { articles };
  });

  // --- accounting export -----------------------------------------------------------------------

  // One row per invoice for the accountant or an accounting program. The tax and the country of
  // each sale are the ones on the invoice, so the tax by country can be added up straight from it.
  app.get('/admin/accounting/invoices.csv', { preHandler: [requirePermission('settings.read')] }, async (request, reply) => {
    const query = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);
    const start = new Date(`${query.from}T00:00:00.000Z`);
    const end = new Date(`${query.to}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw badRequest('Choose a valid period.');
    end.setUTCDate(end.getUTCDate() + 1);
    if (end.getTime() - start.getTime() > 400 * 86_400_000) throw badRequest('Export at most 13 months at a time.');

    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' },
      take: 20_000,
      include: { user: { select: { email: true } } },
    });
    // A cell that starts with = + - @ would run as a formula in a spreadsheet.
    const cell = (value: unknown): string => {
      let text = value === null || value === undefined ? '' : String(value);
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const money = (cents: number) => (cents / 100).toFixed(2);
    const header = ['number', 'date', 'status', 'customer_email', 'customer_name', 'company', 'tax_id', 'country', 'currency', 'net', 'tax', 'total', 'paid_at', 'stripe_invoice'];
    const lines = [header.join(',')];
    for (const invoice of invoices) {
      const address = (invoice.billingAddress ?? {}) as Record<string, unknown>;
      lines.push([
        invoice.number, invoice.createdAt.toISOString().slice(0, 10), invoice.status.toLowerCase(), invoice.user.email,
        address.fullName, address.companyName, address.taxId, address.country, invoice.currency,
        money(invoice.amount), money(invoice.tax), money(invoice.total), invoice.paidAt?.toISOString().slice(0, 10), invoice.stripeInvoiceId,
      ].map(cell).join(','));
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="invoices-${query.from}-${query.to}.csv"`);
    return lines.join('\n') + '\n';
  });

  // --- notes and tags --------------------------------------------------------------------------

  const customerOf = async (request: FastifyRequest) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const customer = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, tags: true } });
    if (!customer) throw notFound('Customer not found.');
    return { actor, customer };
  };

  app.get('/admin/customers/:id/notes', { preHandler: [requirePermission('customers.read')] }, async (request) => {
    const { customer } = await customerOf(request);
    const notes = await prisma.customerNote.findMany({ where: { userId: customer.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    return { notes, tags: customer.tags };
  });

  app.post('/admin/customers/:id/notes', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(request.body ?? {});
    const note = await prisma.customerNote.create({ data: { userId: customer.id, authorId: actor.id, authorEmail: actor.email, body } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.note', targetType: 'user', targetId: customer.id, ip: request.ip });
    return { note };
  });

  app.delete('/admin/customers/:id/notes/:noteId', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    const { noteId } = z.object({ noteId: z.string() }).parse(request.params);
    const done = await prisma.customerNote.deleteMany({ where: { id: noteId, userId: customer.id } });
    if (done.count === 0) throw notFound('Note not found.');
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.note_deleted', targetType: 'user', targetId: customer.id, ip: request.ip });
    return { ok: true };
  });

  app.put('/admin/customers/:id/tags', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    const { tags } = z.object({ tags: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,23}$/, 'Tags use lowercase letters, numbers and dashes.')).max(12) }).parse(request.body ?? {});
    const unique = [...new Set(tags)];
    await prisma.user.update({ where: { id: customer.id }, data: { tags: unique } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.tags', targetType: 'user', targetId: customer.id, meta: { tags: unique }, ip: request.ip });
    return { tags: unique };
  });

  /** Every tag in use and how many accounts carry it, for the filter of the list. */
  app.get('/admin/tags', { preHandler: [requirePermission('customers.read')] }, async () => {
    const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`SELECT unnest("tags") AS tag, COUNT(*) AS count FROM "User" GROUP BY 1 ORDER BY 2 DESC LIMIT 100`;
    return { tags: rows.map((row) => ({ tag: row.tag, count: Number(row.count) })) };
  });

  // --- reports ---------------------------------------------------------------------------------

  /**
   * Income and customers over the last months, from the tables of the platform.
   * Monthly recurring revenue counts every renewing subscription at its monthly worth, per currency
   * (currencies are never added together). Revenue is what was actually paid (invoices paid).
   */
  app.get('/admin/reports', { preHandler: [requirePermission('orders.read')] }, async (request) => {
    const { months } = z.object({ months: z.coerce.number().int().min(3).max(24).default(12) }).parse(request.query ?? {});
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (months - 1));

    const [active, revenue, signups, cancellations, byProduct, topCustomers, totals] = await Promise.all([
      prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, cancelAtPeriodEnd: false },
        select: { amount: true, currency: true, currentPeriodStart: true, currentPeriodEnd: true },
      }),
      prisma.$queryRaw<{ month: Date; currency: string; total: bigint; count: bigint }[]>`
        SELECT date_trunc('month', COALESCE("paidAt", "createdAt")) AS month, "currency", SUM("total") AS total, COUNT(*) AS count
        FROM "Invoice" WHERE "status" = 'PAID' AND COALESCE("paidAt", "createdAt") >= ${since} GROUP BY 1, 2 ORDER BY 1`,
      prisma.$queryRaw<{ month: Date; count: bigint }[]>`
        SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS count FROM "User" WHERE "role" = 'CUSTOMER' AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ month: Date; count: bigint }[]>`
        SELECT date_trunc('month', "cancelledAt") AS month, COUNT(*) AS count FROM "Subscription" WHERE "cancelledAt" IS NOT NULL AND "cancelledAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ name: string; currency: string; total: bigint; count: bigint }[]>`
        SELECT oi."name" AS name, oi."currency" AS currency, SUM(oi."total") AS total, COUNT(*) AS count
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."status" IN ('PAID', 'FULFILLED') AND o."createdAt" >= ${since} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`,
      prisma.$queryRaw<{ email: string; total: bigint; currency: string }[]>`
        SELECT u."email" AS email, i."currency" AS currency, SUM(i."total") AS total
        FROM "Invoice" i JOIN "User" u ON u."id" = i."userId"
        WHERE i."status" = 'PAID' AND COALESCE(i."paidAt", i."createdAt") >= ${since} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`,
      Promise.all([
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
        prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } } }),
        prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
      ]),
    ]);

    const mrr: Record<string, number> = {};
    for (const sub of active) {
      const start = sub.currentPeriodStart?.getTime();
      const end = sub.currentPeriodEnd?.getTime();
      const months = start && end && end > start ? Math.max(1, Math.round((end - start) / (30.44 * 86_400_000))) : 1;
      mrr[sub.currency] = (mrr[sub.currency] ?? 0) + Math.round(sub.amount / months);
    }
    const key = (date: Date) => date.toISOString().slice(0, 7);
    const labels: string[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i += 1) {
      labels.push(key(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const revenueBy: Record<string, Record<string, number>> = {};
    for (const row of revenue) (revenueBy[row.currency] ??= {})[key(row.month)] = Number(row.total);
    const signupBy = Object.fromEntries(signups.map((row) => [key(row.month), Number(row.count)]));
    const cancelBy = Object.fromEntries(cancellations.map((row) => [key(row.month), Number(row.count)]));
    const [customers, activeSubscriptions, pastDue] = totals;

    return {
      generatedAt: new Date().toISOString(),
      months: labels,
      mrr,
      customers,
      activeSubscriptions,
      pastDue,
      revenue: Object.entries(revenueBy).map(([currency, byMonth]) => ({ currency, series: labels.map((label) => byMonth[label] ?? 0) })),
      signups: labels.map((label) => signupBy[label] ?? 0),
      cancellations: labels.map((label) => cancelBy[label] ?? 0),
      byProduct: byProduct.map((row) => ({ name: row.name, currency: row.currency, total: Number(row.total), orders: Number(row.count) })),
      topCustomers: topCustomers.map((row) => ({ email: row.email, currency: row.currency, total: Number(row.total) })),
    };
  });

  // --- the queues of jobs ----------------------------------------------------------------------

  const queues = () => [
    { name: 'provisioning', label: 'Provisioning', queue: getQueue() },
    { name: 'vps', label: 'Virtual servers', queue: getVpsProvisionQueue() },
    { name: 'mail', label: 'Mail provisioning', queue: getMailProvisionQueue() },
    { name: 'email', label: 'Outgoing email', queue: getEmailQueue() },
  ];

  /** The counts of each queue and its failed jobs. The data of a job is never shown: it can hold a secret. */
  app.get('/admin/queues', { preHandler: [requirePermission('infrastructure.read')] }, async () => {
    const out = [];
    for (const entry of queues()) {
      const counts = await entry.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      const failed = await entry.queue.getFailed(0, 19);
      out.push({
        name: entry.name,
        label: entry.label,
        counts,
        failed: failed.map((job) => ({ id: job.id, name: job.name, reason: (job.failedReason ?? '').slice(0, 300), attempts: job.attemptsMade, failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null })),
      });
    }
    return { queues: out };
  });

  // One job of a queue: where it stands and why it failed. The data of the job is never shown, only the names of its fields.
  app.get('/admin/queues/:name/jobs/:id', { preHandler: [requirePermission('infrastructure.read')] }, async (request) => {
    const { name, id } = z.object({ name: z.string(), id: z.string() }).parse(request.params);
    const entry = queues().find((item) => item.name === name);
    const job = entry ? await entry.queue.getJob(id) : null;
    if (!entry || !job) throw notFound('That job was not found.');
    const iso = (value?: number | null) => (value ? new Date(value).toISOString() : null);
    const data = job.data && typeof job.data === 'object' && !Array.isArray(job.data) ? Object.keys(job.data as unknown as Record<string, unknown>).slice(0, 30) : [];
    return {
      job: {
        id: job.id,
        queue: entry.name,
        queueLabel: entry.label,
        name: job.name,
        state: await job.getState(),
        attempts: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,
        createdAt: iso(job.timestamp),
        startedAt: iso(job.processedOn),
        finishedAt: iso(job.finishedOn),
        reason: (job.failedReason ?? '').slice(0, 1000),
        trace: (job.stacktrace ?? []).slice(0, 3).map((line) => line.split('\n').slice(0, 8).join('\n').slice(0, 1500)),
        dataFields: data,
      },
    };
  });

  // The events of the payment provider that failed, and the way to run them again.
  app.get('/admin/webhooks/failed', { preHandler: [requirePermission('infrastructure.read')] }, async () => {
    const failed = await prisma.webhookEvent.findMany({
      where: { provider: 'stripe', status: { in: ['failed', 'deferred'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, eventId: true, type: true, attempts: true, error: true, lastAttemptAt: true, createdAt: true },
    });
    return { failed: failed.map((event) => ({ ...event, error: (event.error ?? '').replace(/\s+/g, ' ').slice(0, 300) })) };
  });

  app.post('/admin/webhooks/replay', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const body = z.object({ eventId: z.string().optional() }).parse(request.body ?? {});
    const replayed = await replayStripeEvents(body.eventId, body.eventId ? 1 : 20);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.webhook.replay', targetType: 'webhook', targetId: body.eventId ?? 'all', meta: { replayed: replayed.length, ok: replayed.filter((entry) => entry.ok).length }, ip: request.ip });
    return { replayed };
  });

  app.post('/admin/queues/:name/jobs/:id/retry', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { name, id } = z.object({ name: z.string(), id: z.string() }).parse(request.params);
    const entry = queues().find((item) => item.name === name);
    const job = entry ? await entry.queue.getJob(id) : null;
    if (!job) throw notFound('That job was not found.');
    await job.retry();
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.queue.retry', targetType: 'job', targetId: `${name}:${id}`, ip: request.ip });
    return { ok: true };
  });

  // Clears the failed jobs of one queue, for the old failures that nobody will retry.
  app.delete('/admin/queues/:name/failed', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { name } = z.object({ name: z.string() }).parse(request.params);
    const entry = queues().find((item) => item.name === name);
    if (!entry) throw notFound('That queue was not found.');
    const removed = await entry.queue.clean(0, 1000, 'failed');
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.queue.clear_failed', targetType: 'queue', targetId: name, meta: { removed: removed.length }, ip: request.ip });
    return { removed: removed.length };
  });

  app.delete('/admin/queues/:name/jobs/:id', { preHandler: [requirePermission('infrastructure.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { name, id } = z.object({ name: z.string(), id: z.string() }).parse(request.params);
    const entry = queues().find((item) => item.name === name);
    const job = entry ? await entry.queue.getJob(id) : null;
    if (!job) throw notFound('That job was not found.');
    await job.remove();
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.queue.remove', targetType: 'job', targetId: `${name}:${id}`, ip: request.ip });
    return { ok: true };
  });

  // --- reports of abuse ------------------------------------------------------------------------

  /**
   * The queue of the reports of abuse.
   *
   * The list is read in pages and says how many reports there are in total, so
   * a page is never shown as if it were the whole of the queue. The filter of
   * the state is the one the staff desk works with: "active" is the queue that
   * is still open, and the closed cases are kept apart, so they do not crowd
   * the cases that still need a decision.
   */
  app.get('/admin/abuse', { preHandler: [requirePermission('services.read')] }, async (request) => {
    const actor = await requireStaff(request);
    const maySuspend = hasPermission(actor.role, actor.permissions, 'services.write');
    const query = z
      .object({
        status: z.string().trim().max(40).optional(),
        page: z.coerce.number().int().min(1).max(10_000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        q: z.string().trim().max(200).optional(),
      })
      .parse(request.query ?? {});

    const filter = (query.status ?? 'all').toLowerCase();
    if (!isStatusFilter(filter)) throw badRequest('Choose one of: active, open, investigating, resolved, dismissed, all.');
    const states = filterStates(filter);

    const where: Prisma.AbuseReportWhereInput = {};
    if (states) where.status = { in: states.flatMap((state) => storedStates(state)) };
    if (query.q) {
      // The search reaches the closed cases as well: the archive is where an
      // old report is found again.
      const text = query.q;
      const named = await prisma.instance.findMany({
        where: { name: { contains: text, mode: 'insensitive' } },
        select: { id: true },
        take: 100,
      });
      where.OR = [
        { target: { contains: text, mode: 'insensitive' } },
        { details: { contains: text, mode: 'insensitive' } },
        { category: { contains: text, mode: 'insensitive' } },
        { reporterName: { contains: text, mode: 'insensitive' } },
        { reporterEmail: { contains: text, mode: 'insensitive' } },
        { resolution: { contains: text, mode: 'insensitive' } },
        ...(named.length ? [{ instanceId: { in: named.map((row) => row.id) } }] : []),
      ];
    }

    const [rows, total] = await prisma.$transaction([
      prisma.abuseReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.abuseReport.count({ where }),
    ]);

    const services = await servicesOf(rows.map((row) => row.instanceId));
    const last = await lastActivityOf(rows.map((row) => row.id));

    return {
      reports: rows.map((row) => ({
        ...reportView(row, services.get(row.instanceId ?? '') ?? null, maySuspend),
        lastActivityAt: (last.get(row.id) ?? row.createdAt).toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pages: Math.ceil(total / query.pageSize),
    };
  });

  /**
   * One report of abuse, with everything the staff needs to work on it: the
   * report itself, the service it is about, the internal notes of the case and
   * the trail of what was done with it.
   *
   * The reporter is a person who wrote to the platform. Their name, their
   * address and the address they wrote from stay in the staff area: nothing of
   * it is in the answer of a customer.
   */
  app.get('/admin/abuse/:id', { preHandler: [requirePermission('services.read')] }, async (request) => {
    const actor = await requireStaff(request);
    const maySuspend = hasPermission(actor.role, actor.permissions, 'services.write');
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const report = await prisma.abuseReport.findUnique({ where: { id } });
    if (!report) throw notFound('Report not found.');

    const services = await servicesOf(report.instanceId ? [report.instanceId] : []);
    const [notes, activity, related] = await Promise.all([
      prisma.abuseReportNote.findMany({ where: { reportId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.auditLog.findMany({ where: { targetType: 'abuse', targetId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.abuseReport.findMany({
        where: {
          id: { not: id },
          OR: [...(report.instanceId ? [{ instanceId: report.instanceId }] : []), { target: report.target }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const service = services.get(report.instanceId ?? '') ?? null;
    return {
      report: { ...reportView(report, service, maySuspend), reporterIp: report.reporterIp },
      service,
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        authorId: note.authorId,
        authorEmail: note.authorEmail,
        createdAt: note.createdAt.toISOString(),
      })),
      activity: activity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorEmail: entry.actorEmail,
        meta: entry.meta,
        createdAt: entry.createdAt.toISOString(),
      })),
      related: related.map((row) => ({
        id: row.id,
        category: row.category,
        target: row.target,
        status: normalizeState(row.status),
        statusLabel: stateLabel(normalizeState(row.status)),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

  /** A note of the staff on a report. The note is never shown to a customer. */
  app.post('/admin/abuse/:id/notes', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(request.body ?? {});
    const report = await prisma.abuseReport.findUnique({ where: { id }, select: { id: true } });
    if (!report) throw notFound('Report not found.');
    const note = await prisma.abuseReportNote.create({
      data: { reportId: id, authorId: actor.id, authorEmail: actor.email, body },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.abuse.note_added', targetType: 'abuse', targetId: id, ip: request.ip });
    return { note: { ...note, createdAt: note.createdAt.toISOString() } };
  });

  /**
   * What the staff does with a report.
   *
   * The server holds the rules of the case: a closed case is read-only until
   * it is reopened with a reason, a dismissed case never suspends a service,
   * and a suspension names the service before it does anything and happens
   * once. Every change of the case and every enforcement is written to the
   * journal.
   */
  app.post('/admin/abuse/:id/action', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        action: z.enum(['investigating', 'resolve', 'dismiss', 'reopen', 'suspend']),
        reason: z.string().trim().max(1000).optional(),
        /** The older name of the reason. It is still read, so an old screen keeps working. */
        note: z.string().trim().max(1000).optional(),
        /** The name of the service the staff typed to confirm a suspension. */
        confirmService: z.string().trim().max(200).optional(),
      })
      .parse(request.body ?? {});

    const report = await prisma.abuseReport.findUnique({ where: { id } });
    if (!report) throw notFound('Report not found.');

    const state = normalizeState(report.status);
    const reason = (body.reason ?? body.note ?? '').trim();

    // The state of the case decides what may be done with it. A refusal is a
    // conflict and not a bad request: the request was well made, the case was
    // not in a state that allows it.
    if (!actionAllowed(state, body.action)) throw conflict(refusal(state, body.action));
    if (requiresReason(body.action) && reason.length < 5) {
      throw badRequest('Write a reason of at least 5 characters. It is written into the journal of the case.');
    }

    if (body.action === 'suspend') {
      await suspendServiceOfReport({ request, actor, report, reason, confirmed: body.confirmService });
    } else {
      const target = actionTargetState(body.action);
      if (!target) throw badRequest('This action changes nothing.');
      // The change is made against the state that was read, so two requests at
      // the same time cannot both carry the case forward.
      const changed = await prisma.abuseReport.updateMany({
        where: { id, status: report.status },
        data: {
          status: target,
          resolution: body.action === 'investigating' ? report.resolution : reason,
          resolvedAt: body.action === 'reopen' ? null : new Date(),
          reopenedAt: body.action === 'reopen' ? new Date() : report.reopenedAt,
        },
      });
      if (changed.count === 0) throw conflict('This report changed while you were working on it. Read it again.');
      await audit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: abuseAuditAction(body.action),
        targetType: 'abuse',
        targetId: id,
        meta: { from: state, to: target, reason },
        ip: request.ip,
      });
    }

    const updated = await prisma.abuseReport.findUnique({ where: { id } });
    if (!updated) throw notFound('Report not found.');
    const services = await servicesOf(updated.instanceId ? [updated.instanceId] : []);
    return {
      report: {
        ...reportView(updated, services.get(updated.instanceId ?? '') ?? null, true),
        lastActivityAt: new Date().toISOString(),
      },
    };
  });

  /**
   * Suspends the service of a report.
   *
   * The suspension is the heaviest thing the staff desk does from a report, so
   * it asks for three things: a case that is still open, a reason, and the
   * name of the service. The service is claimed before the panel is asked, so
   * a request that is replayed and a second request that arrives at the same
   * time cannot suspend twice. When the panel refuses, the claim is given
   * back and nothing is marked: the service is not suspended and the case is
   * not marked as taken.
   */
  const suspendServiceOfReport = async ({
    request,
    actor,
    report,
    reason,
    confirmed,
  }: {
    request: FastifyRequest;
    actor: AuthUser;
    report: AbuseReport;
    reason: string;
    confirmed?: string;
  }): Promise<void> => {
    if (!report.instanceId) {
      throw badRequest('This report is not linked to a service, so there is nothing to suspend. Link it first or act by hand.');
    }
    const instance = await prisma.instance.findUnique({
      where: { id: report.instanceId },
      select: {
        id: true,
        name: true,
        status: true,
        pterodactylServerId: true,
        userId: true,
        user: { select: { role: true } },
      },
    });
    if (!instance) throw notFound('The service of this report was not found.');
    if (!instance.pterodactylServerId) throw badRequest('The service has no server on the panel.');
    assertMayActOnAccount(actor, instance.user.role, instance.userId);

    // The staff names the service they are about to suspend, so the wrong
    // service cannot be suspended by accident.
    if (!confirmed || confirmed.trim().toLowerCase() !== instance.name.trim().toLowerCase()) {
      throw badRequest(`Type the name of the service (${instance.name}) to confirm the suspension.`);
    }
    if (instance.status === 'SUSPENDED') {
      throw conflict('This service is already suspended, so it is not suspended again.');
    }

    // The claim: one request at a time may suspend, and a request that is
    // replayed finds the report already done.
    const claim = await prisma.abuseReport.updateMany({
      where: { id: report.id, enforcement: null },
      data: { enforcement: ENFORCEMENT_SERVICE_SUSPENDED, enforcementAt: new Date(), enforcedBy: actor.email },
    });
    if (claim.count === 0) throw conflict('This report already suspended its service. It is not suspended twice.');

    try {
      await ptero.applicationRequest('POST', `/api/application/servers/${instance.pterodactylServerId}/suspend`, {});
    } catch (error) {
      // The panel refused. The service is not suspended and the case is not
      // marked as taken, and the claim is given back so the request can be
      // made again.
      await prisma.abuseReport.updateMany({
        where: { id: report.id, enforcement: ENFORCEMENT_SERVICE_SUSPENDED },
        data: { enforcement: null, enforcementAt: null, enforcedBy: null },
      });
      throw badRequest(`The panel refused the suspension: ${(error as Error).message}`);
    }

    await prisma.instance.update({ where: { id: instance.id }, data: { status: 'SUSPENDED', suspendedAt: new Date() } });
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'admin.abuse.service_suspended',
      targetType: 'abuse',
      targetId: report.id,
      meta: { instanceId: instance.id, instanceName: instance.name, reason, enforcement: ENFORCEMENT_SERVICE_SUSPENDED },
      ip: request.ip,
    });
  };

  // --- the wording of the emails ---------------------------------------------------------------

  /** Each template, its wording from the code, and what the staff changed. */
  app.get('/admin/email-templates', { preHandler: [requirePermission('settings.read')] }, async () => {
    await loadEmailOverrides();
    return {
      templates: emailTemplateCatalog().map((entry) => ({
        id: entry.id,
        category: entry.category,
        defaults: emailTemplateDefaults(entry.id),
        override: emailOverrideOf(entry.id) ?? null,
      })),
    };
  });

  /**
   * Changes the wording of a template: the subject, the heading, the line under the subject and the
   * note at the end. A word between double braces must be one the template knows, so a mistyped
   * placeholder is refused instead of arriving in a customer's inbox.
   */
  app.put('/admin/email-templates/:id', { preHandler: [requirePermission('settings.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const defaults = emailTemplateDefaults(id);
    if (!defaults) throw notFound('Template not found.');
    const body = z
      .object({
        subject: z.string().trim().max(200).optional(),
        heading: z.string().trim().max(200).optional(),
        preheader: z.string().trim().max(200).optional(),
        note: z.string().trim().max(400).optional(),
      })
      .parse(request.body ?? {});
    assertValidWording(id, body);
    const before = emailOverrideOf(id) ?? null;
    await saveEmailOverride(id, body);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.email_template.update', targetType: 'email-template', targetId: id, meta: { before, after: emailOverrideOf(id) ?? null }, ip: request.ip });
    return { override: emailOverrideOf(id) ?? null };
  });

  /** Puts a template back to the wording of the code. */
  app.delete('/admin/email-templates/:id', { preHandler: [requirePermission('settings.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!emailTemplateDefaults(id)) throw notFound('Template not found.');
    const before = emailOverrideOf(id) ?? null;
    await saveEmailOverride(id, {});
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.email_template.reset', targetType: 'email-template', targetId: id, meta: { before, after: null }, ip: request.ip });
    return { ok: true };
  });

  // --- the risk of an account, and bulk tags -----------------------------------------------------

  /** How much the team should look twice at an account, and why. It decides nothing. */
  app.get('/admin/customers/:id/risk', { preHandler: [requirePermission('customers.read')] }, async (request) => {
    const { customer } = await customerOf(request);
    const risk = await assessCustomer(customer.id);
    if (!risk) throw notFound('Customer not found.');
    const decision = customer.tags.includes('risk-blocked') ? 'blocked' : customer.tags.includes('risk-approved') ? 'approved' : customer.tags.includes('risk-review') ? 'review' : 'unreviewed';
    return { risk: { ...risk, decision } };
  });

  /** A human decision sits next to the score. Blocking also closes sessions and suspends the account. */
  app.post('/admin/customers/:id/risk-decision', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    assertMayActOnAccount(actor, customer.role, customer.id);
    const body = z.object({ decision: z.enum(['approved', 'review', 'blocked', 'clear']), reason: z.string().trim().min(5).max(1000) }).parse(request.body ?? {});
    const riskTags = new Set(['risk-approved', 'risk-review', 'risk-blocked']);
    const tags = customer.tags.filter((tag) => !riskTags.has(tag));
    if (body.decision !== 'clear') tags.push(`risk-${body.decision}`);
    await prisma.$transaction([
      prisma.user.update({ where: { id: customer.id }, data: { tags, ...(body.decision === 'blocked' ? { suspendedAt: new Date() } : {}) } }),
      prisma.customerNote.create({ data: { userId: customer.id, authorId: actor.id, authorEmail: actor.email, body: `[Risk: ${body.decision}] ${body.reason}` } }),
      ...(body.decision === 'blocked' ? [prisma.session.deleteMany({ where: { userId: customer.id } })] : []),
    ]);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: `admin.risk.${body.decision}`, targetType: 'user', targetId: customer.id, meta: { reason: body.reason }, ip: request.ip });
    return { decision: body.decision === 'clear' ? 'unreviewed' : body.decision, suspended: body.decision === 'blocked' };
  });

  /** Adds and removes tags on many accounts at once. Nothing else is changed. */
  app.post('/admin/customers/bulk-tags', { preHandler: [requirePermission('customers.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const tag = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,23}$/, 'Tags use lowercase letters, numbers and dashes.');
    const body = z.object({ ids: z.array(z.string()).min(1).max(200), add: z.array(tag).max(5).default([]), remove: z.array(tag).max(5).default([]) }).parse(request.body ?? {});
    const users = await prisma.user.findMany({ where: { id: { in: body.ids } }, select: { id: true, role: true, tags: true } });
    let changed = 0;
    for (const user of users) {
      try {
        assertMayActOnAccount(actor, user.role, user.id);
      } catch {
        continue;
      }
      const next = [...new Set([...user.tags.filter((entry) => !body.remove.includes(entry)), ...body.add])].slice(0, 12);
      if (next.join(',') !== user.tags.join(',')) {
        await prisma.user.update({ where: { id: user.id }, data: { tags: next } });
        changed += 1;
      }
    }
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.customer.bulk_tags', targetType: 'user', targetId: 'bulk', meta: { count: users.length, changed, add: body.add, remove: body.remove }, ip: request.ip });
    return { changed };
  });

  // --- money: credits and partial refunds ----------------------------------------------------------
  //
  // Both touch real money, so each is guarded: a reason, a ceiling, a record in the ledger before the
  // provider is asked, an idempotency key (the same request is never carried out twice), and the log.

  /** The most one credit may be, in the smallest unit. A bigger one needs a change of this limit. */
  const MAX_CREDIT = 50_000;

  /** What was given to a customer, and the balance the payment provider holds for them. */
  app.get('/admin/customers/:id/credit', { preHandler: [requirePermission('orders.read')] }, async (request) => {
    const { customer } = await customerOf(request);
    const [entries, payment] = await Promise.all([
      prisma.moneyAdjustment.findMany({ where: { userId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.payment.findFirst({ where: { userId: customer.id, stripeCustomerId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { stripeCustomerId: true } }),
    ]);
    const balance = stripeLive() && payment?.stripeCustomerId ? await customerBalance(payment.stripeCustomerId) : null;
    return { entries, providerBalance: balance, canCredit: Boolean(stripeLive() && payment?.stripeCustomerId) };
  });

  app.post('/admin/customers/:id/credit', { preHandler: [requirePermission('orders.write')] }, async (request) => {
    const { actor, customer } = await customerOf(request);
    assertMayActOnAccount(actor, customer.role, customer.id);
    const body = z.object({ amount: z.number().int().min(1).max(MAX_CREDIT), currency: z.string().length(3).default('EUR'), reason: z.string().trim().min(5).max(300) }).parse(request.body ?? {});
    if (!stripeLive()) throw conflict('Payments are not live on this platform, so a credit cannot be applied to an invoice.');
    const payment = await prisma.payment.findFirst({ where: { userId: customer.id, stripeCustomerId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { stripeCustomerId: true } });
    if (!payment?.stripeCustomerId) throw conflict('This customer has no account at the payment provider yet (no checkout was started), so there is no invoice to take the credit off.');

    // The row is written first: the id of the row is the idempotency key, so a retry cannot give the credit twice.
    const row = await prisma.moneyAdjustment.create({ data: { userId: customer.id, kind: 'credit', amount: body.amount, currency: body.currency.toUpperCase(), reason: body.reason, actorId: actor.id, actorEmail: actor.email } });
    try {
      const ref = await giveBalanceCredit({ customerId: payment.stripeCustomerId, amount: body.amount, currency: body.currency, description: body.reason, idempotencyKey: `blipmade-credit-${row.id}` });
      await prisma.moneyAdjustment.update({ where: { id: row.id }, data: { providerRef: ref } });
    } catch (error) {
      await prisma.moneyAdjustment.delete({ where: { id: row.id } }).catch(() => undefined);
      throw badRequest(`The payment provider refused the credit: ${(error as Error).message}`);
    }
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.credit.given', targetType: 'user', targetId: customer.id, meta: { amount: body.amount, currency: body.currency, reason: body.reason }, ip: request.ip });
    return { ok: true };
  });

  /** Refunds part of what an order paid. The order stays as it is; the ledger holds the sum of what went back. */
  app.post('/admin/orders/:id/partial-refund', { preHandler: [requirePermission('orders.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ amount: z.number().int().min(1), reason: z.string().trim().min(5).max(300) }).parse(request.body ?? {});
    if (!stripeLive()) throw conflict('Payments are not live on this platform.');
    const order = await prisma.order.findUnique({ where: { id }, include: { payments: true, user: { select: { role: true } } } });
    if (!order) throw notFound('Order not found.');
    assertMayActOnAccount(actor, order.user.role, order.userId);
    if (order.status !== 'PAID' && order.status !== 'FULFILLED') throw conflict(`Only a paid order can be refunded in part. This one is ${order.status.toLowerCase()}.`);
    if (order.payments.some((entry) => entry.status === 'REFUNDED')) throw conflict('This order was refunded in full already.');
    const paid = order.payments.find((entry) => entry.status === 'SUCCEEDED' && entry.stripePaymentIntentId) ?? null;
    let intent = order.stripePaymentIntentId ?? paid?.stripePaymentIntentId ?? null;
    if (!intent) {
      const bySubscription = order.payments.find((entry) => entry.status === 'SUCCEEDED' && entry.stripeSubscriptionId);
      if (bySubscription?.stripeSubscriptionId) {
        intent = await findPaymentIntentForSubscription(bySubscription.stripeSubscriptionId, bySubscription.amount);
        if (intent) await prisma.payment.update({ where: { id: bySubscription.id }, data: { stripePaymentIntentId: intent } });
      }
    }
    if (!intent) throw conflict('This order carries no payment at the provider, so it cannot be refunded from here.');

    const already = await prisma.moneyAdjustment.aggregate({ where: { orderId: order.id, kind: 'refund' }, _sum: { amount: true } });
    const remaining = (paid?.amount ?? order.total) - (already._sum.amount ?? 0);
    if (body.amount > remaining) throw badRequest(`At most ${remaining} can still be refunded on this order (the smallest unit of the currency).`, { amount: `At most ${remaining} can still be refunded.` });

    const row = await prisma.moneyAdjustment.create({ data: { userId: order.userId, orderId: order.id, kind: 'refund', amount: body.amount, currency: order.currency, reason: body.reason, actorId: actor.id, actorEmail: actor.email } });
    try {
      const ref = await refundPartOfPayment({ paymentIntentId: intent, amount: body.amount, orderId: order.id, reason: body.reason, idempotencyKey: `blipmade-partial-refund-${row.id}` });
      await prisma.moneyAdjustment.update({ where: { id: row.id }, data: { providerRef: ref } });
    } catch (error) {
      await prisma.moneyAdjustment.delete({ where: { id: row.id } }).catch(() => undefined);
      throw badRequest(`The payment provider refused the refund: ${(error as Error).message}`);
    }
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.refund.partial', targetType: 'order', targetId: order.id, meta: { amount: body.amount, reason: body.reason }, ip: request.ip });
    // The customer is told what went back. Each part is its own message.
    await notifyPaymentRefunded({ userId: order.userId, number: order.number, amount: body.amount, currency: order.currency, occurrence: row.id }).catch(() => undefined);
    return { ok: true, remaining: remaining - body.amount };
  });
}
