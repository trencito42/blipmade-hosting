import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { assertMayActOnAccount, requirePermission, requireStaff } from '../plugins/auth.js';
import { getEmailQueue, getMailProvisionQueue, getQueue, getVpsProvisionQueue } from '../services/queue.js';
import * as ptero from '../services/pterodactyl/application.js';
import { assessCustomer } from '../services/risk.js';
import { customerBalance, giveBalanceCredit, refundPartOfPayment, stripeLive } from '../services/stripe.js';
import { emailTemplateCatalog, emailTemplateDefaults } from '../lib/email-design.js';
import { emailOverrideOf, loadEmailOverrides, saveEmailOverride } from '../lib/email-overrides.js';

/**
 * What the staff needs to run the business: notes and tags on customers, the reports (income,
 * customers, churn), the queues of jobs with their failures, and the reports of abuse.
 */
export async function registerAdminOpsRoutes(app: FastifyInstance): Promise<void> {
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

  app.get('/admin/abuse', { preHandler: [requirePermission('services.read')] }, async (request) => {
    const { status } = z.object({ status: z.string().optional() }).parse(request.query ?? {});
    const rows = await prisma.abuseReport.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const ids = rows.map((row) => row.instanceId).filter((value): value is string => Boolean(value));
    const instances = ids.length ? await prisma.instance.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true, user: { select: { id: true, email: true } } } }) : [];
    return { reports: rows.map((row) => ({ ...row, instance: instances.find((instance) => instance.id === row.instanceId) ?? null })) };
  });

  /**
   * What the staff does with a report: suspend the service it is about, warn its owner, mark it
   * investigated, or dismiss it. Every action is written to the log, and the reporter's address is
   * never shown to the customer.
   */
  app.post('/admin/abuse/:id/action', { preHandler: [requirePermission('services.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ action: z.enum(['investigating', 'suspend', 'dismiss', 'resolve']), note: z.string().trim().max(1000).optional() }).parse(request.body ?? {});
    const report = await prisma.abuseReport.findUnique({ where: { id } });
    if (!report) throw notFound('Report not found.');

    if (body.action === 'suspend') {
      if (!report.instanceId) throw badRequest('This report is not linked to a service, so there is nothing to suspend. Link it first or act by hand.');
      const instance = await prisma.instance.findUnique({ where: { id: report.instanceId }, include: { user: { select: { role: true } } } });
      if (!instance || !instance.pterodactylServerId) throw badRequest('The service has no server on the panel.');
      assertMayActOnAccount(actor, instance.user.role, instance.userId);
      await ptero.applicationRequest('POST', `/api/application/servers/${instance.pterodactylServerId}/suspend`, {});
      await prisma.instance.update({ where: { id: instance.id }, data: { status: 'SUSPENDED', suspendedAt: new Date() } });
    }
    const status = body.action === 'investigating' ? 'investigating' : body.action === 'dismiss' ? 'dismissed' : 'action_taken';
    const updated = await prisma.abuseReport.update({
      where: { id },
      data: { status, resolution: body.note ?? report.resolution, resolvedAt: status === 'investigating' ? null : new Date() },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: `admin.abuse.${body.action}`, targetType: 'abuse', targetId: id, meta: { instanceId: report.instanceId }, ip: request.ip });
    return { report: updated };
  });

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
    const allowed = new Set(defaults.placeholders);
    for (const [field, text] of Object.entries(body)) {
      for (const match of (text ?? '').matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
        if (!allowed.has(match[1]!)) {
          throw badRequest(`${field}: "{{${match[1]}}}" is not a placeholder of this template. Use: ${[...allowed].map((name) => `{{${name}}}`).join(', ') || 'none'}.`, { [field]: `"{{${match[1]}}}" is not a placeholder of this template.` });
        }
      }
      if (/[<>]/.test(text ?? '')) throw badRequest(`${field}: write plain text, without < or >.`, { [field]: 'Plain text only.' });
    }
    await saveEmailOverride(id, body);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.email_template.update', targetType: 'email-template', targetId: id, ip: request.ip });
    return { override: emailOverrideOf(id) ?? null };
  });

  /** Puts a template back to the wording of the code. */
  app.delete('/admin/email-templates/:id', { preHandler: [requirePermission('settings.write')] }, async (request) => {
    const actor = await requireStaff(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!emailTemplateDefaults(id)) throw notFound('Template not found.');
    await saveEmailOverride(id, {});
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'admin.email_template.reset', targetType: 'email-template', targetId: id, ip: request.ip });
    return { ok: true };
  });

  // --- the risk of an account, and bulk tags -----------------------------------------------------

  /** How much the team should look twice at an account, and why. It decides nothing. */
  app.get('/admin/customers/:id/risk', { preHandler: [requirePermission('customers.read')] }, async (request) => {
    const { customer } = await customerOf(request);
    const risk = await assessCustomer(customer.id);
    if (!risk) throw notFound('Customer not found.');
    return { risk };
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
    const intent = order.stripePaymentIntentId ?? paid?.stripePaymentIntentId ?? null;
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
    return { ok: true, remaining: remaining - body.amount };
  });
}
