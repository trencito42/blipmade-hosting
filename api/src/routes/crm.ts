import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireAuth, requirePermission } from '../plugins/auth.js';
import {
  campaignMayDeliver,
  campaignTransition,
  compileSegmentWhere,
  explainMatch,
  factDefinition,
  marketingDeliveryEnabled,
  monthlyRecurringCents,
  opportunityFromFacts,
  parseSegmentFilter,
  validateTemplate,
} from '../services/crm.js';
import { parseGraph, stepAutomation, AUTOMATION_TRIGGERS, type AutoGraph, type AutoState } from '../services/crm-automation.js';
import { deriveCustomerFacts, recomputeFactsPage } from '../services/crm-facts.js';
import { assessCustomer } from '../services/risk.js';

const filterSchema = z.record(z.string(), z.unknown());

function maskEmail(email: string, maySee: boolean): string {
  if (maySee) return email;
  const [name, domain] = email.split('@');
  return `${(name ?? '').slice(0, 1)}***@${domain ?? ''}`;
}

export async function registerCrmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/crm/overview', { preHandler: requirePermission('customers.read') }, async () => {
    const [customers, campaigns, segments, tasks, automations] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.marketingCampaign.count(),
      prisma.customerSegment.count(),
      prisma.crmTask.count({ where: { status: 'open' } }),
      prisma.marketingAutomation.count(),
    ]);
    return {
      customers,
      campaigns,
      segments,
      openTasks: tasks,
      automations,
      delivery: marketingDeliveryEnabled(),
    };
  });

  app.get('/admin/crm/segments', { preHandler: requirePermission('customers.read') }, async () => {
    const segments = await prisma.customerSegment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { segments, delivery: marketingDeliveryEnabled() };
  });

  app.post('/admin/crm/segments', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({
      name: z.string().trim().min(2).max(80),
      filter: filterSchema,
      kind: z.enum(['dynamic', 'manual']).default('dynamic'),
      memberIds: z.array(z.string()).max(10_000).optional(),
    }).parse(request.body ?? {});
    try { parseSegmentFilter(body.filter); } catch (error) { throw badRequest(error instanceof Error ? error.message : 'The segment filter is not valid.'); }
    const segment = await prisma.customerSegment.create({
      data: { name: body.name, filter: body.filter as object, kind: body.kind, memberIds: body.memberIds ?? [], createdBy: staff.id },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.segment.created', targetType: 'customer_segment', targetId: segment.id });
    return { segment };
  });

  app.put('/admin/crm/segments/:id', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().trim().min(2).max(80).optional(),
      filter: filterSchema.optional(),
      kind: z.enum(['dynamic', 'manual']).optional(),
      memberIds: z.array(z.string()).max(10_000).optional(),
    }).parse(request.body ?? {});
    const current = await prisma.customerSegment.findUnique({ where: { id } });
    if (!current) throw notFound('Segment not found.');
    if (body.filter) {
      try { parseSegmentFilter(body.filter); } catch (error) { throw badRequest(error instanceof Error ? error.message : 'The segment filter is not valid.'); }
    }
    const history = Array.isArray(current.history) ? current.history : [];
    const segment = await prisma.customerSegment.update({
      where: { id },
      data: {
        name: body.name ?? current.name,
        filter: (body.filter as object) ?? current.filter,
        kind: body.kind ?? current.kind,
        memberIds: body.memberIds ?? current.memberIds,
        version: { increment: 1 },
        history: [...history, { version: current.version, filter: current.filter, at: new Date().toISOString(), by: staff.id }] as object,
      },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.segment.updated', targetType: 'customer_segment', targetId: id });
    return { segment };
  });

  app.post('/admin/crm/segments/:id/preview', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const segment = await prisma.customerSegment.findUnique({ where: { id } });
    if (!segment) throw notFound('Segment not found.');
    const where = compileSegmentWhere(segment.filter);
    const [count, sample] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, tags: true, createdAt: true, customerFacts: { select: { key: true, value: true } } },
      }),
    ]);
    return {
      count,
      sample: sample.map((user) => ({
        id: user.id,
        email: maskEmail(user.email, true),
        tags: user.tags,
        createdAt: user.createdAt,
        why: explainMatch(
          {
            facts: user.customerFacts,
            tags: user.tags,
            marketing: true,
            createdAt: user.createdAt,
            userId: user.id,
          },
          segment.filter,
        ),
      })),
      actor: staff.id,
    };
  });

  app.get('/admin/crm/campaigns', { preHandler: requirePermission('promotions.read') }, async () => {
    const campaigns = await prisma.marketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { segment: { select: { id: true, name: true } }, _count: { select: { sends: true } } },
    });
    return { campaigns, delivery: marketingDeliveryEnabled() };
  });

  app.post('/admin/crm/campaigns', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({
      name: z.string().trim().min(2).max(80),
      body: z.string().trim().min(2).max(5000),
      segmentId: z.string().nullable().optional(),
      objective: z.string().min(2).max(40).optional(),
      channel: z.enum(['email', 'in_app', 'discord']).default('email'),
      templateId: z.string().nullable().optional(),
      promotionId: z.string().nullable().optional(),
      scheduledAt: z.string().datetime().nullable().optional(),
      budgetCents: z.number().int().min(0).nullable().optional(),
      frequencyHours: z.number().int().min(1).nullable().optional(),
      eligibility: filterSchema.optional(),
    }).parse(request.body ?? {});
    const templateCheck = validateTemplate(body.body);
    if (!templateCheck.ok) throw badRequest(templateCheck.reason);
    if (body.channel === 'discord') throw badRequest('Discord DMs are not used for marketing.');
    const campaign = await prisma.marketingCampaign.create({
      data: {
        name: body.name,
        body: body.body,
        segmentId: body.segmentId ?? null,
        createdBy: staff.id,
        objective: body.objective ?? 'retain',
        channel: body.channel,
        templateId: body.templateId ?? null,
        promotionId: body.promotionId ?? null,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        budgetCents: body.budgetCents ?? null,
        frequencyHours: body.frequencyHours ?? null,
        eligibility: body.eligibility as object ?? undefined,
      },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.campaign.created', targetType: 'marketing_campaign', targetId: campaign.id });
    return { campaign };
  });

  app.post('/admin/crm/campaigns/:id/:event', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id, event } = z.object({
      id: z.string(),
      event: z.enum(['submit', 'approve', 'reject', 'suppress', 'pause', 'resume', 'cancel']),
    }).parse(request.params);
    const campaign = await prisma.marketingCampaign.findUnique({ where: { id } });
    if (!campaign) throw notFound('Campaign not found.');
    const next = campaignTransition(campaign.status, event);
    if ('error' in next) throw badRequest(next.error);
    const updated = await prisma.marketingCampaign.update({
      where: { id },
      data: {
        status: next.status,
        suppressed: next.status === 'suppressed',
        pausedAt: next.status === 'paused' ? new Date() : next.status === 'approved' ? null : campaign.pausedAt,
        approvedAt: event === 'approve' ? new Date() : campaign.approvedAt,
        approvedBy: event === 'approve' ? staff.id : campaign.approvedBy,
      },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: `crm.campaign.${event}`, targetType: 'marketing_campaign', targetId: id });
    return {
      campaign: updated,
      gate: campaignMayDeliver({
        status: updated.status,
        suppressed: updated.suppressed,
        marketingConsent: false,
        pausedAt: updated.pausedAt,
        scheduledAt: updated.scheduledAt,
      }),
    };
  });

  app.post('/admin/crm/campaigns/:id/queue', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ testEmails: z.array(z.string().email()).max(5).optional() }).parse(request.body ?? {});
    const campaign = await prisma.marketingCampaign.findUnique({ where: { id } });
    if (!campaign) throw notFound('Campaign not found.');
    if (campaign.status !== 'approved') throw badRequest('Only an approved campaign can be queued.');
    if (!campaign.segmentId && !body.testEmails?.length) throw badRequest('Choose a segment or a test recipient list.');
    const cursor = z.object({ cursor: z.string().optional() }).parse(request.query ?? {});
    let where: Record<string, unknown> = { role: 'CUSTOMER' };
    if (campaign.segmentId) {
      const segment = await prisma.customerSegment.findUnique({ where: { id: campaign.segmentId } });
      if (!segment) throw badRequest('The campaign segment was deleted.');
      where = compileSegmentWhere(segment.filter);
    }
    if (campaign.eligibility) where = compileSegmentWhere(campaign.eligibility, where);
    if (body.testEmails?.length) where = { AND: [where, { email: { in: body.testEmails } }] };
    const users = await prisma.user.findMany({
      where,
      select: { id: true, email: true, notificationPreference: { select: { marketing: true } } },
      take: 200,
      orderBy: { id: 'asc' },
      ...(cursor.cursor ? { skip: 1, cursor: { id: cursor.cursor } } : {}),
    });
    let planned = 0;
    let skipped = 0;
    const since = campaign.frequencyHours ? new Date(Date.now() - campaign.frequencyHours * 3_600_000) : null;
    for (const user of users) {
      const consent = user.notificationPreference?.marketing === true;
      const gate = campaignMayDeliver({
        status: campaign.status,
        suppressed: campaign.suppressed,
        marketingConsent: consent,
        pausedAt: campaign.pausedAt,
        scheduledAt: campaign.scheduledAt,
      });
      let status = 'skipped';
      let skipReason = gate.reason;
      if (gate.ok && consent) {
        if (since) {
          const recent = await prisma.campaignSend.count({ where: { userId: user.id, createdAt: { gte: since }, status: { in: ['planned', 'queued'] } } });
          if (recent > 0) {
            skipped += 1;
            skipReason = 'Frequency cap.';
            await prisma.campaignSend.upsert({
              where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
              create: { campaignId: campaign.id, userId: user.id, status: 'skipped', consent, skipReason },
              update: { status: 'skipped', consent, skipReason },
            });
            continue;
          }
        }
        status = gate.deliver ? 'queued' : 'planned';
        skipReason = gate.deliver ? '' : gate.reason;
        planned += 1;
      } else skipped += 1;
      await prisma.campaignSend.upsert({
        where: { campaignId_userId: { campaignId: campaign.id, userId: user.id } },
        create: { campaignId: campaign.id, userId: user.id, status, consent, skipReason },
        update: { status, consent, skipReason },
      });
    }
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.campaign.queue', targetType: 'marketing_campaign', targetId: id, meta: { planned, skipped, test: Boolean(body.testEmails?.length) } });
    return {
      planned,
      skipped,
      nextCursor: users.at(-1)?.id ?? null,
      delivery: marketingDeliveryEnabled(),
      note: marketingDeliveryEnabled() ? null : 'Rows were planned. No message was sent.',
    };
  });

  app.get('/admin/crm/templates', { preHandler: requirePermission('promotions.read') }, async () => {
    const templates = await prisma.marketingTemplate.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { templates };
  });

  app.post('/admin/crm/templates', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({
      name: z.string().trim().min(2).max(80),
      channel: z.enum(['email', 'in_app']).default('email'),
      subject: z.string().max(160).optional(),
      body: z.string().trim().min(2).max(5000),
    }).parse(request.body ?? {});
    const check = validateTemplate(body.body);
    if (!check.ok) throw badRequest(check.reason);
    const template = await prisma.marketingTemplate.create({
      data: { name: body.name, channel: body.channel, subject: body.subject ?? null, body: body.body, createdBy: staff.id },
    });
    return { template };
  });

  app.get('/admin/crm/automations', { preHandler: requirePermission('promotions.read') }, async () => {
    const automations = await prisma.marketingAutomation.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { automations, triggers: AUTOMATION_TRIGGERS, delivery: marketingDeliveryEnabled() };
  });

  app.post('/admin/crm/automations', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({
      name: z.string().trim().min(2).max(80),
      trigger: z.enum(AUTOMATION_TRIGGERS),
      graph: z.unknown(),
      segmentId: z.string().nullable().optional(),
    }).parse(request.body ?? {});
    const graph = parseGraph(body.graph);
    if ('error' in graph) throw badRequest(graph.error);
    const automation = await prisma.marketingAutomation.create({
      data: { name: body.name, trigger: body.trigger, graph: graph as object, segmentId: body.segmentId ?? null, createdBy: staff.id },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.automation.created', targetType: 'marketing_automation', targetId: automation.id });
    return { automation };
  });

  app.post('/admin/crm/automations/:id/activate', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const graph = parseGraph((await prisma.marketingAutomation.findUnique({ where: { id } }))?.graph);
    if (!graph || 'error' in graph) throw badRequest(graph && 'error' in graph ? graph.error : 'Automation not found.');
    const automation = await prisma.marketingAutomation.update({ where: { id }, data: { status: 'active', paused: false } });
    return { automation };
  });

  app.post('/admin/crm/automations/:id/simulate', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ userId: z.string(), consent: z.boolean() }).parse(request.body ?? {});
    const automation = await prisma.marketingAutomation.findUnique({ where: { id } });
    if (!automation) throw notFound('Automation not found.');
    const graph = parseGraph(automation.graph);
    if ('error' in graph) throw badRequest(graph.error);
    await deriveCustomerFacts(body.userId);
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, tags: true, createdAt: true, notificationPreference: { select: { marketing: true } }, customerFacts: true },
    });
    if (!user) throw notFound('Customer not found.');
    const stepped = stepAutomation({
      graph: graph as AutoGraph,
      state: { nodeId: (graph as AutoGraph).start, status: 'running', waitUntil: null, attempts: 0, lastError: null, applied: [], steps: 0 },
      ctx: {
        facts: user.customerFacts,
        tags: user.tags,
        marketing: user.notificationPreference?.marketing ?? false,
        createdAt: user.createdAt,
        userId: user.id,
      },
      consent: body.consent && (user.notificationPreference?.marketing ?? false),
    });
    return { effects: stepped.effects, state: stepped.state, persisted: false, delivery: marketingDeliveryEnabled() };
  });

  app.post('/admin/crm/automations/:id/cancel-runs', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const result = await prisma.automationRun.updateMany({
      where: { automationId: id, status: { in: ['waiting', 'running', 'failed'] } },
      data: { status: 'cancelled', waitUntil: null },
    });
    return { cancelled: result.count };
  });

  app.post('/admin/crm/automations/:id/run', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ userId: z.string(), eventId: z.string().min(8).max(80), consent: z.boolean() }).parse(request.body ?? {});
    const automation = await prisma.marketingAutomation.findUnique({ where: { id } });
    if (!automation) throw notFound('Automation not found.');
    if (automation.paused || automation.status === 'paused') throw badRequest('This automation is paused.');
    const graph = parseGraph(automation.graph);
    if ('error' in graph) throw badRequest(graph.error);
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, tags: true, createdAt: true, notificationPreference: { select: { marketing: true } }, customerFacts: true },
    });
    if (!user) throw notFound('Customer not found.');
    const existing = await prisma.automationRun.findUnique({
      where: { automationId_userId_eventId: { automationId: id, userId: body.userId, eventId: body.eventId } },
    });
    if (existing && existing.status !== 'failed') return { run: existing, replayed: true };
    const started = existing
      ? await prisma.automationRun.update({ where: { id: existing.id }, data: { status: 'running', attempts: { increment: 1 }, lastError: null } })
      : await prisma.automationRun.create({
        data: { automationId: id, userId: body.userId, eventId: body.eventId, nodeId: (graph as AutoGraph).start, status: 'running' },
      });
    const stepped = stepAutomation({
      graph: graph as AutoGraph,
      state: { nodeId: started.nodeId, status: 'running', waitUntil: started.waitUntil, attempts: started.attempts, lastError: started.lastError, applied: started.appliedNodes, steps: 0 } as AutoState,
      ctx: {
        facts: user.customerFacts,
        tags: user.tags,
        marketing: user.notificationPreference?.marketing ?? false,
        createdAt: user.createdAt,
        userId: user.id,
      },
      consent: body.consent && (user.notificationPreference?.marketing ?? false),
    });
    for (const effect of stepped.effects) {
      if (effect.type === 'tag' && effect.payload && typeof effect.payload === 'object') {
        const payload = effect.payload as { add?: string[]; remove?: string[] };
        const tags = [...new Set([...user.tags.filter((tag) => !(payload.remove ?? []).includes(tag)), ...(payload.add ?? [])])];
        await prisma.user.update({ where: { id: user.id }, data: { tags } });
      }
      if (effect.type === 'task' && effect.payload && typeof effect.payload === 'object' && 'title' in effect.payload) {
        const title = String((effect.payload as { title: string }).title);
        const exists = await prisma.crmTask.findFirst({ where: { userId: user.id, title, status: 'open' } });
        if (!exists) await prisma.crmTask.create({ data: { userId: user.id, title } });
      }
    }
    const run = await prisma.automationRun.update({
      where: { id: started.id },
      data: {
        nodeId: stepped.state.nodeId,
        status: stepped.state.status,
        waitUntil: stepped.state.waitUntil,
        lastError: stepped.state.lastError,
        appliedNodes: stepped.state.applied,
      },
    });
    return { run, effects: stepped.effects, delivery: marketingDeliveryEnabled() };
  });

  app.post('/admin/crm/automations/:id/pause', { preHandler: requirePermission('promotions.write') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const automation = await prisma.marketingAutomation.update({ where: { id }, data: { paused: true, status: 'paused' } });
    return { automation };
  });

  app.get('/admin/crm/tasks', { preHandler: requirePermission('customers.read') }, async () => {
    const tasks = await prisma.crmTask.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { tasks };
  });

  app.post('/admin/crm/tasks', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const body = z.object({
      userId: z.string(),
      title: z.string().trim().min(2).max(160),
      assigneeId: z.string().nullable().optional(),
      dueAt: z.string().datetime().nullable().optional(),
    }).parse(request.body ?? {});
    const task = await prisma.crmTask.create({
      data: { userId: body.userId, title: body.title, assigneeId: body.assigneeId ?? null, dueAt: body.dueAt ? new Date(body.dueAt) : null },
    });
    return { task };
  });

  app.post('/admin/crm/tasks/:id/complete', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const task = await prisma.crmTask.update({ where: { id }, data: { status: 'done' } });
    return { task };
  });

  app.get('/admin/crm/opportunities', { preHandler: requirePermission('customers.read') }, async () => {
    const opportunities = await prisma.crmOpportunity.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { opportunities };
  });

  app.get('/admin/crm/analytics', { preHandler: requirePermission('promotions.read') }, async (request: FastifyRequest) => {
    const query = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(request.query ?? {});
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = query.to ? new Date(query.to) : new Date();
    const range = { gte: from, lte: to };
    const [registered, paid, collected, refunds, tax, churned, redemptions, sends, optIn, optOut, subs] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER', createdAt: range } }),
      prisma.order.count({ where: { status: { in: ['PAID', 'FULFILLED'] }, paidAt: range } }),
      prisma.payment.aggregate({ where: { status: 'SUCCEEDED', createdAt: range }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'REFUNDED', createdAt: range }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { status: 'PAID', paidAt: range }, _sum: { tax: true } }),
      prisma.subscription.count({ where: { status: 'CANCELLED', cancelledAt: range } }),
      prisma.promotionRedemption.count({ where: { createdAt: range } }),
      prisma.campaignSend.groupBy({ by: ['status'], _count: true }),
      prisma.notificationPreference.count({ where: { marketing: true } }),
      prisma.notificationPreference.count({ where: { marketing: false } }),
      prisma.subscription.findMany({ where: { status: 'ACTIVE' }, select: { amount: true, orderItem: { select: { config: true } } } }),
    ]);
    const mrrCents = subs.reduce((sum, row) => {
      const period = row.orderItem?.config && typeof row.orderItem.config === 'object' && 'period' in row.orderItem.config
        ? String((row.orderItem.config as { period?: string }).period)
        : 'MONTHLY';
      return sum + monthlyRecurringCents(row.amount, period);
    }, 0);
    return {
      from, to, snapshotAt: new Date(),
      period: { acquisition: registered, paidOrders: paid, collectedCents: collected._sum.amount ?? 0, refundedCents: refunds._sum.amount ?? 0, taxCents: tax._sum.tax ?? 0, churnedSubscriptions: churned, promotionRedemptions: redemptions },
      snapshot: { mrrCents, marketingOptIn: optIn, marketingOptOut: optOut, campaignSends: sends },
      invented: false,
    };
  });

  app.get('/admin/crm/risk', { preHandler: requirePermission('risk.read') }, async () => {
    const rows = await prisma.riskEvaluation.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return { evaluations: rows, shadow: true, autoReject: false };
  });

  app.post('/admin/crm/risk/:userId/evaluate', { preHandler: requirePermission('risk.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const risk = await assessCustomer(userId);
    if (!risk) throw notFound('Customer not found.');
    const row = await prisma.riskEvaluation.create({
      data: { userId, score: risk.score, level: risk.level, signals: risk.signals as object, shadow: true },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.risk.evaluate', targetType: 'user', targetId: userId, meta: { score: risk.score, level: risk.level } });
    return { evaluation: row, risk, autoReject: false };
  });

  app.post('/admin/crm/risk/:userId/override', { preHandler: requirePermission('risk.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const body = z.object({ signalId: z.string().min(2).max(40), decision: z.enum(['dismiss', 'confirm']), note: z.string().trim().min(4).max(500) }).parse(request.body ?? {});
    const row = await prisma.riskOverride.create({
      data: { userId, signalId: body.signalId, decision: body.decision, note: body.note, staffId: staff.id },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.risk.override', targetType: 'user', targetId: userId, meta: { signalId: body.signalId, decision: body.decision } });
    return { override: row };
  });

  app.post('/admin/crm/facts/recompute', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const body = z.object({ cursor: z.string().optional(), take: z.number().int().min(1).max(500).optional() }).parse(request.body ?? {});
    return recomputeFactsPage(body.take ?? 200, body.cursor);
  });

  app.get('/admin/customers/:id/crm', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await deriveCustomerFacts(id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, tags: true, createdAt: true, firstName: true, lastName: true,
        notificationPreference: { select: { marketing: true, marketingOptInAt: true } },
        customerFacts: true,
        discordCommunityLinks: { select: { discordUserId: true } },
        connectedIdentities: { select: { provider: true } },
        tickets: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, subject: true, status: true, createdAt: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 10, select: { amount: true, status: true, createdAt: true } },
        orders: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, status: true, total: true, createdAt: true } },
        notes: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, body: true, authorEmail: true, createdAt: true } },
      },
    });
    if (!user) throw notFound('Customer not found.');
    const [tasks, opportunities, spent] = await Promise.all([
      prisma.crmTask.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.crmOpportunity.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.payment.aggregate({ where: { userId: id, status: 'SUCCEEDED' }, _sum: { amount: true } }),
    ]);
    const cents = spent._sum.amount ?? 0;
    const suggested = opportunityFromFacts({
      lifecycle: user.customerFacts.find((row) => row.key === 'core.lifecycle')?.value ?? 'lead',
      planFamily: user.customerFacts.find((row) => row.key === 'core.plan_family')?.value ?? null,
      spendCents: cents,
    });
    if (suggested && !opportunities.some((row) => row.title === suggested.title && row.status === 'open')) {
      await prisma.crmOpportunity.create({ data: { userId: id, title: suggested.title, family: suggested.family, reason: suggested.reason } });
    }
    const timeline = [
      ...user.orders.map((row) => ({ at: row.createdAt, kind: 'order', label: `Order ${row.number} ${row.status}` })),
      ...user.tickets.map((row) => ({ at: row.createdAt, kind: 'ticket', label: `Ticket #${row.number} ${row.subject}` })),
      ...user.payments.map((row) => ({ at: row.createdAt, kind: 'payment', label: `Payment ${row.status} ${row.amount}` })),
      ...user.notes.map((row) => ({ at: row.createdAt, kind: 'note', label: row.body.slice(0, 80) })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 40);
    return {
      facts: user.customerFacts.filter((row) => factDefinition(row.key)?.classification !== 'security'),
      tags: user.tags,
      marketing: user.notificationPreference,
      discord: user.discordCommunityLinks,
      oauth: user.connectedIdentities,
      tasks,
      opportunities: await prisma.crmOpportunity.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      notes: user.notes,
      timeline,
      lifetimeRevenueCents: cents,
    };
  });

  app.put('/admin/customers/:id/facts/:key', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const { id, key } = z.object({ id: z.string(), key: z.string().min(2).max(40) }).parse(request.params);
    const { value } = z.object({ value: z.string().min(1).max(80) }).parse(request.body ?? {});
    const def = factDefinition(key);
    if (!def) throw badRequest('Unknown fact.');
    if (def.classification === 'security') throw badRequest('Security facts cannot be written from CRM.');
    const fact = await prisma.customerFact.upsert({
      where: { userId_key: { userId: id, key: def.key } },
      create: { userId: id, key: def.key, value, source: 'staff', classification: def.classification, provenance: staff.id },
      update: { value, source: 'staff', classification: def.classification, provenance: staff.id, version: { increment: 1 } },
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.fact.upsert', targetType: 'user', targetId: id, meta: { key: def.key } });
    return { fact };
  });

  app.post('/admin/customers/bulk/tags', { preHandler: requirePermission('customers.write') }, async (request: FastifyRequest) => {
    const staff = await requireAuth(request);
    const body = z.object({ userIds: z.array(z.string()).min(1).max(100), add: z.array(z.string().min(1).max(32)).max(10).optional(), remove: z.array(z.string()).max(10).optional() }).parse(request.body ?? {});
    for (const userId of body.userIds) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { tags: true } });
      if (!user) continue;
      const tags = [...new Set([...user.tags.filter((tag) => !(body.remove ?? []).includes(tag)), ...(body.add ?? [])])];
      await prisma.user.update({ where: { id: userId }, data: { tags } });
    }
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.bulk.tags', targetType: 'user', targetId: staff.id, meta: { count: body.userIds.length } });
    return { updated: body.userIds.length };
  });

  app.get('/admin/crm/export/segment/:id', { preHandler: requirePermission('customers.read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ cursor: z.string().optional(), format: z.enum(['json', 'csv']).default('csv') }).parse(request.query ?? {});
    const segment = await prisma.customerSegment.findUnique({ where: { id } });
    if (!segment) throw notFound('Segment not found.');
    const users = await prisma.user.findMany({
      where: compileSegmentWhere(segment.filter),
      select: { id: true, email: true, createdAt: true, tags: true },
      take: 500,
      orderBy: { id: 'asc' },
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });
    await audit({ actorId: staff.id, actorEmail: staff.email, action: 'crm.segment.export', targetType: 'customer_segment', targetId: id, meta: { count: users.length, format: query.format } });
    const nextCursor = users.at(-1)?.id ?? null;
    if (query.format === 'json') return { rows: users, nextCursor };
    const cell = (value: string) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const lines = ['id,email,created_at,tags', ...users.map((user) => [user.id, user.email, user.createdAt.toISOString(), user.tags.join('|')].map(cell).join(','))];
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="segment-${id}.csv"`);
    reply.header('x-next-cursor', nextCursor ?? '');
    return lines.join('\n') + '\n';
  });
}

