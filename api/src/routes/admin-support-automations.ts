import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission } from '../plugins/auth.js';
import { actionsSchema, conditionsSchema, dryRun, runRule, SCHEDULED, TRIGGERS } from '../services/support-automation.js';
import { hoursSchema } from '../services/support-hours.js';

/**
 * The editor's API of the automation rules, the history of their runs and the business hours.
 *
 * A rule acts on conversations by itself, so changing one is configuration: `settings.write`. Reading the rules and
 * the history, and trying a rule on a conversation without running it, needs the support permissions.
 */

const write = (app: FastifyInstance) => ({
  config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
  preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)],
});

const ruleBody = z.object({
  name: z.string().trim().min(2).max(80),
  trigger: z.enum(TRIGGERS),
  priority: z.number().int().min(1).max(1000).default(100),
  afterMinutes: z.number().int().min(1).max(43_200).nullable().optional(),
  conditions: conditionsSchema.default({}),
  actions: actionsSchema,
  actorId: z.string().max(40).nullable().optional(),
});

/** What cannot be seen from the shape alone: the departments and the people the rule names must exist. */
async function checkReferences(rule: z.infer<typeof ruleBody>, enabledActor: string | null): Promise<string | null> {
  const scheduled = SCHEDULED.includes(rule.trigger);
  if (scheduled && !rule.afterMinutes) return 'A rule that looks at waiting time needs the minutes to wait.';
  if (!scheduled && rule.afterMinutes) return 'Only a rule that looks at waiting time takes minutes to wait.';
  for (const action of rule.actions) {
    if (action.type === 'set_department' && !(await prisma.supportDepartment.findUnique({ where: { id: action.departmentId } }))) return `The department "${action.departmentId}" does not exist.`;
    if (action.type === 'assign' && action.userId !== 'round_robin' && !(await prisma.staffMember.findUnique({ where: { userId: action.userId } }))) return 'The person to assign to is not a staff member.';
    if ((action.type === 'reply' || action.type === 'add_note') && !enabledActor) return 'A rule that writes a message needs the staff member it writes as.';
  }
  if (rule.conditions.departmentId && !(await prisma.supportDepartment.findUnique({ where: { id: rule.conditions.departmentId } }))) return 'The department of the condition does not exist.';
  if (enabledActor && !(await prisma.staffMember.findUnique({ where: { userId: enabledActor } }))) return 'The staff member to write as does not exist.';
  return null;
}

const serialize = (row: { id: string; name: string; enabled: boolean; priority: number; trigger: string; afterMinutes: number | null; conditions: unknown; actions: unknown; actorId: string | null }) => ({
  id: row.id, name: row.name, enabled: row.enabled, priority: row.priority, trigger: row.trigger, afterMinutes: row.afterMinutes, conditions: row.conditions, actions: row.actions, actorId: row.actorId,
});

export async function registerAdminSupportAutomationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/support/automations', { preHandler: requirePermission('tickets.read') }, async () => {
    const rows = await prisma.supportAutomation.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { runs: true } } } });
    const dead = await prisma.supportAutomationRun.groupBy({ by: ['automationId'], where: { status: { in: ['DEAD', 'FAILED'] } }, _count: true });
    const byId = new Map(dead.map((entry) => [entry.automationId, entry._count]));
    return { automations: rows.map((row) => ({ ...serialize(row), runs: row._count.runs, failing: byId.get(row.id) ?? 0 })) };
  });

  app.post('/admin/support/automations', write(app), async (request: FastifyRequest, reply) => {
    const actor = await requirePermission('settings.write')(request);
    const body = ruleBody.parse(request.body);
    const actorId = body.actorId ?? actor.id;
    const problem = await checkReferences(body, actorId);
    if (problem) throw badRequest(problem);
    const row = await prisma.supportAutomation.create({
      data: { name: body.name, trigger: body.trigger, priority: body.priority, afterMinutes: body.afterMinutes ?? null, conditions: body.conditions as Prisma.InputJsonValue, actions: body.actions as unknown as Prisma.InputJsonValue, actorId },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.automation_created', targetType: 'support_automation', targetId: row.id, meta: { trigger: body.trigger }, ip: request.ip });
    return reply.code(201).send({ automation: serialize(row) });
  });

  app.put('/admin/support/automations/:id', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.supportAutomation.findUnique({ where: { id } });
    if (!existing) throw notFound('Rule not found.');
    const body = ruleBody.partial().extend({ enabled: z.boolean().optional() }).parse(request.body);
    const merged = ruleBody.parse({
      name: body.name ?? existing.name,
      trigger: body.trigger ?? existing.trigger,
      priority: body.priority ?? existing.priority,
      afterMinutes: body.afterMinutes === undefined ? existing.afterMinutes : body.afterMinutes,
      conditions: body.conditions ?? existing.conditions,
      actions: body.actions ?? existing.actions,
      actorId: body.actorId === undefined ? existing.actorId : body.actorId,
    });
    const problem = await checkReferences(merged, merged.actorId ?? null);
    if (problem) throw badRequest(problem);
    const row = await prisma.supportAutomation.update({
      where: { id },
      data: { name: merged.name, trigger: merged.trigger, priority: merged.priority, afterMinutes: merged.afterMinutes ?? null, conditions: merged.conditions as Prisma.InputJsonValue, actions: merged.actions as unknown as Prisma.InputJsonValue, actorId: merged.actorId ?? null, enabled: body.enabled },
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.automation_updated', targetType: 'support_automation', targetId: id, meta: { enabled: body.enabled }, ip: request.ip });
    return { automation: serialize(row) };
  });

  app.delete('/admin/support/automations/:id', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (!(await prisma.supportAutomation.findUnique({ where: { id } }))) throw notFound('Rule not found.');
    await prisma.supportAutomation.delete({ where: { id } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.automation_deleted', targetType: 'support_automation', targetId: id, ip: request.ip });
    return { deleted: true };
  });

  app.get('/admin/support/automations/:id/runs', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const rows = await prisma.supportAutomationRun.findMany({ where: { automationId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { runs: rows.map((run) => ({ id: run.id, ticketId: run.ticketId, status: run.status.toLowerCase(), attempts: run.attempts, done: run.done, error: run.error, createdAt: run.createdAt })) };
  });

  /** What a rule would do to one conversation, without doing it. Takes a rule as it is written, saved or not. */
  app.post('/admin/support/automations/dry-run', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('tickets.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    await requirePermission('tickets.write')(request);
    const body = z.object({ conditions: conditionsSchema.default({}), actions: actionsSchema, ticketNumber: z.number().int().min(1) }).parse(request.body);
    const ticket = await prisma.ticket.findUnique({ where: { number: body.ticketNumber }, select: { id: true } });
    if (!ticket) throw notFound('No conversation has that number.');
    return { result: await dryRun(body, ticket.id) };
  });

  /** A run that died is tried once more by hand. */
  app.post('/admin/support/automation-runs/:id/retry', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const run = await prisma.supportAutomationRun.findUnique({ where: { id }, include: { automation: true } });
    if (!run) throw notFound('Run not found.');
    if (run.status === 'OK') throw badRequest('This run did not fail.');
    await prisma.supportAutomationRun.update({ where: { id }, data: { status: 'FAILED', attempts: 0 } });
    const outcome = await runRule(run.automation, run.ticketId, run.eventKey, run.depth);
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.automation_retried', targetType: 'support_automation', targetId: run.automationId, meta: { outcome }, ip: request.ip });
    return { outcome };
  });

  // --- business hours ---------------------------------------------------------

  app.get('/admin/support/hours', { preHandler: requirePermission('tickets.read') }, async () => {
    const row = await prisma.setting.findUnique({ where: { key: 'support.hours' } });
    const parsed = hoursSchema.safeParse(row?.value);
    return { hours: parsed.success ? parsed.data : null };
  });

  app.put('/admin/support/hours', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { hours } = z.object({ hours: hoursSchema.nullable() }).parse(request.body);
    if (hours === null) await prisma.setting.deleteMany({ where: { key: 'support.hours' } });
    else await prisma.setting.upsert({ where: { key: 'support.hours' }, create: { key: 'support.hours', value: hours as unknown as Prisma.InputJsonValue }, update: { value: hours as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.hours_saved', meta: { set: hours !== null }, ip: request.ip });
    return { hours };
  });
}
