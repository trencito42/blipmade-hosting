import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requirePermission } from '../plugins/auth.js';
import { readHours } from '../services/support-automation.js';
import { businessMinutesBetween } from '../services/support-hours.js';
import { clocksOf, median, readPolicies, slaSchema, worstOpenState } from '../services/support-sla.js';

/**
 * The numbers of the support, with their definitions written next to them.
 *
 * Nothing here is computed on the path of a conversation: the page asks, and the numbers are read from the history that is
 * already stored, over a period, and they can be narrowed by department, channel and person. The definitions are strict:
 * a greeting of a bot is not a first response, and a conversation of the bot is "completed" only when the flow reached its
 * end; a customer who stopped writing is not counted as helped.
 */

export const DEFINITIONS = {
  firstResponse: 'Minutes (business minutes when hours are set) from the creation of a conversation to the first public reply of a person of the staff. Bots, rules and internal notes do not count.',
  resolution: 'Minutes from creation to closing, over the conversations closed in the period. The time a conversation waits for the customer is included.',
  backlogAge: 'Age in hours of the conversations that are not closed now.',
  slaCompliance: 'Of the conversations created in the period under a policy, the share whose first answer came within the deadline of the policy.',
  botCompleted: 'Conversations with a bot whose flow reached an end. A conversation that was left, skipped or handed to a person is not completed.',
  handoff: 'Conversations with a bot that were handed over to a person, over all the conversations with a bot started in the period.',
  satisfaction: 'The average of the ratings the customers gave, one to five, and how many gave one.',
} as const;

const query = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  departmentId: z.string().optional(),
  channel: z.enum(['TICKET', 'CHAT', 'EMAIL']).optional(),
  agentId: z.string().optional(),
});

export async function registerAdminSupportAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/support/sla', { preHandler: requirePermission('tickets.read') }, async () => ({ policies: await readPolicies() }));

  app.put('/admin/support/sla', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const body = slaSchema.parse(request.body);
    await prisma.setting.upsert({ where: { key: 'support.sla' }, create: { key: 'support.sla', value: body as unknown as Prisma.InputJsonValue }, update: { value: body as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.sla_saved', meta: { policies: body.policies.length }, ip: request.ip });
    return body;
  });

  app.get('/admin/support/analytics', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const q = query.parse(request.query ?? {});
    const now = new Date();
    const since = new Date(now.getTime() - q.days * 86_400_000);
    const hours = await readHours();
    const policies = await readPolicies();
    const scope: Prisma.TicketWhereInput = { ...(q.departmentId ? { departmentId: q.departmentId } : {}), ...(q.channel ? { channel: q.channel } : {}), ...(q.agentId ? { assignedToId: q.agentId } : {}) };

    const [created, closed, open] = await Promise.all([
      prisma.ticket.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { id: true, channel: true, priority: true, status: true, createdAt: true, closedAt: true, firstHumanResponseAt: true, lastCustomerAt: true, lastStaffAt: true }, take: 5000 }),
      prisma.ticket.findMany({ where: { ...scope, closedAt: { gte: since } }, select: { createdAt: true, closedAt: true }, take: 5000 }),
      prisma.ticket.findMany({ where: { ...scope, status: { not: 'CLOSED' } }, select: { id: true, assignedToId: true, createdAt: true, priority: true, status: true, closedAt: true, firstHumanResponseAt: true, lastCustomerAt: true, lastStaffAt: true }, take: 5000 }),
    ]);

    const firstResponses = created.filter((t) => t.firstHumanResponseAt).map((t) => businessMinutesBetween(hours, t.createdAt, t.firstHumanResponseAt!));
    const resolutions = closed.filter((t) => t.closedAt).map((t) => businessMinutesBetween(hours, t.createdAt, t.closedAt!));
    const ages = open.map((t) => Math.floor((now.getTime() - t.createdAt.getTime()) / 3_600_000));

    const byChannel: Record<string, number> = {};
    for (const t of created) byChannel[t.channel.toLowerCase()] = (byChannel[t.channel.toLowerCase()] ?? 0) + 1;

    let covered = 0;
    let met = 0;
    for (const t of created) {
      const clock = clocksOf(t, policies, hours, now).first;
      if (clock.state === 'none') continue;
      if (clock.state === 'ok' || clock.state === 'at_risk') continue; // still running: not counted either way
      covered += 1;
      if (clock.state === 'met') met += 1;
    }

    const load = new Map<string, number>();
    for (const t of open) if (t.assignedToId) load.set(t.assignedToId, (load.get(t.assignedToId) ?? 0) + 1);

    const atRisk = open.filter((t) => ['at_risk', 'breached'].includes(worstOpenState(clocksOf(t, policies, hours, now)))).length;

    // The bots.
    const sessions = await prisma.supportBotSession.findMany({ where: { createdAt: { gte: since } }, select: { state: true, variables: true, transcript: true, ticketId: true }, take: 5000 });
    const skipped = (variables: unknown) => Boolean((variables as Record<string, string>)?._skipped);
    const handedOff = sessions.filter((s) => s.state === 'HANDED_OFF').length;
    const completed = sessions.filter((s) => s.state === 'ENDED' && !skipped(s.variables)).length;
    const deflected = sessions.filter((s) => s.state === 'ENDED' && !skipped(s.variables) && !s.ticketId && JSON.stringify(s.transcript).includes('Suggested:')).length;

    // The ratings.
    const ratings = await prisma.ticketEvent.findMany({ where: { type: 'rating', createdAt: { gte: since } }, select: { message: true }, take: 5000 });
    const values = ratings.map((r) => Number(/^Rated (\d)\/5/.exec(r.message)?.[1])).filter((n) => n >= 1 && n <= 5);

    const staff = await prisma.user.findMany({ where: { id: { in: [...load.keys()] } }, select: { id: true, firstName: true, lastName: true, email: true } });
    return {
      period: { days: q.days, from: since, to: now },
      definitions: DEFINITIONS,
      open: { total: open.length, unassigned: open.filter((t) => !t.assignedToId).length, slaAtRisk: atRisk, oldestHours: ages.length ? Math.max(...ages) : null, medianAgeHours: median(ages) },
      volume: { created: created.length, byChannel },
      firstResponse: { count: firstResponses.length, averageMinutes: firstResponses.length ? Math.round(firstResponses.reduce((a, b) => a + b, 0) / firstResponses.length) : null, medianMinutes: median(firstResponses) },
      resolution: { count: resolutions.length, medianMinutes: median(resolutions) },
      sla: { policies: policies.length, judged: covered, met, compliance: covered ? Math.round((met / covered) * 100) : null },
      workload: staff.map((person) => ({ userId: person.id, name: `${person.firstName} ${person.lastName}`.trim() || person.email, open: load.get(person.id) ?? 0 })),
      bots: { started: sessions.length, completed, handedOff, handoffRate: sessions.length ? Math.round((handedOff / sessions.length) * 100) : null, completedRate: sessions.length ? Math.round((completed / sessions.length) * 100) : null, deflectedByArticles: deflected },
      satisfaction: { count: values.length, average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null },
    };
  });
}
