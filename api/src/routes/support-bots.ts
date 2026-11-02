import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth, requirePermission } from '../plugins/auth.js';
import { notifyTicketOpenedForStaff } from '../services/notifications.js';
import { fullName } from '../lib/people.js';
import { humanAvailable } from '../services/support-availability.js';
import { publishSupportEvent } from '../services/support-events.js';
import { advance, flowSchema, promptFor, startFlow, templateFlow, validateFlow, type BotSession, type Flow, type Hooks, type Out } from '../services/support-bot.js';

/**
 * The bots of the support: the editor's API for the staff and the conversation API for the customer.
 *
 * Reading the bots needs `tickets.read`, trying one `tickets.write`, and changing, publishing or switching one on
 * `settings.write`: a bot speaks for the company, so it is configuration and not a daily task of the queue.
 */

const write = (app: FastifyInstance) => ({
  config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
  preHandler: [requirePermission('settings.write'), customerLimit(app, LIMITS.adminWrite)],
});

const blankFlow = (): Flow => ({
  start: 'hello',
  welcome: 'Hello!',
  nodes: { hello: { type: 'message', text: 'How can we help?', next: 'bye' }, bye: { type: 'end', text: 'Write again if you need us.' } },
});

const botMeta = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(240).nullable().optional() });

/** What the customer reads of a block that was shown. */
function plain(out: Out): string {
  switch (out.kind) {
    case 'text':
    case 'ask':
      return out.text;
    case 'buttons':
      return `${out.text} [${out.options.map((option) => option.label).join(' / ')}]`;
    case 'articles':
      return `Suggested: ${out.articles.map((article) => article.title).join('; ')}`;
  }
}

/** Departments named by the blocks of a flow must exist when it is published. */
async function missingDepartments(flow: Flow): Promise<string[]> {
  const ids = new Set<string>();
  for (const node of Object.values(flow.nodes)) if ((node.type === 'assign_department' || node.type === 'transfer') && node.departmentId) ids.add(node.departmentId);
  if (ids.size === 0) return [];
  const found = await prisma.supportDepartment.findMany({ where: { id: { in: [...ids] } }, select: { id: true } });
  const have = new Set(found.map((row) => row.id));
  return [...ids].filter((id) => !have.has(id)).map((id) => `The department "${id}" does not exist.`);
}

type Entry = { from: 'bot' | 'customer'; text: string; at: string };

export async function registerSupportBotRoutes(app: FastifyInstance): Promise<void> {
  // --- the editor -------------------------------------------------------------

  app.get('/admin/support/bots', { preHandler: requirePermission('tickets.read') }, async () => {
    const rows = await prisma.supportBot.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { sessions: true } } } });
    const versions = await prisma.supportBotVersion.findMany({ where: { id: { in: rows.flatMap((row) => (row.publishedVersionId ? [row.publishedVersionId] : [])) } }, select: { id: true, version: true } });
    const byId = new Map(versions.map((version) => [version.id, version.version]));
    return {
      bots: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: row.enabled,
        publishedVersion: row.publishedVersionId ? byId.get(row.publishedVersionId) ?? null : null,
        conversations: row._count.sessions,
        updatedAt: row.updatedAt,
      })),
    };
  });

  app.post('/admin/support/bots', write(app), async (request: FastifyRequest, reply) => {
    const actor = await requirePermission('settings.write')(request);
    const body = botMeta.extend({ template: z.boolean().optional() }).parse(request.body);
    const row = await prisma.supportBot.create({ data: { name: body.name, description: body.description ?? null, draft: (body.template ? templateFlow() : blankFlow()) as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_created', targetType: 'support_bot', targetId: row.id, meta: { template: Boolean(body.template) }, ip: request.ip });
    return reply.code(201).send({ bot: { id: row.id, name: row.name } });
  });

  app.get('/admin/support/bots/:id', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.supportBot.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, createdAt: true } } } });
    if (!row) throw notFound('Bot not found.');
    const check = validateFlow(row.draft);
    return {
      bot: { id: row.id, name: row.name, description: row.description, enabled: row.enabled, publishedVersionId: row.publishedVersionId },
      draft: row.draft,
      validation: { ok: check.ok, errors: check.errors, warnings: check.warnings },
      versions: row.versions,
    };
  });

  app.put('/admin/support/bots/:id', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = botMeta.partial().extend({ enabled: z.boolean().optional() }).parse(request.body);
    const row = await prisma.supportBot.findUnique({ where: { id } });
    if (!row) throw notFound('Bot not found.');
    if (body.enabled && !row.publishedVersionId) throw conflict('Publish the bot before switching it on.');
    const updated = await prisma.supportBot.update({ where: { id }, data: { name: body.name, description: body.description, enabled: body.enabled } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_updated', targetType: 'support_bot', targetId: id, meta: body, ip: request.ip });
    return { bot: { id: updated.id, name: updated.name, enabled: updated.enabled } };
  });

  app.delete('/admin/support/bots/:id', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.supportBot.findUnique({ where: { id }, include: { _count: { select: { sessions: true } } } });
    if (!row) throw notFound('Bot not found.');
    if (row._count.sessions > 0) throw conflict('This bot has conversations. Switch it off instead of deleting it.');
    await prisma.supportBot.delete({ where: { id } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_deleted', targetType: 'support_bot', targetId: id, ip: request.ip });
    return { deleted: true };
  });

  /** Saves the draft. A draft may have errors that block publishing; it must at least have the shape of a flow. */
  app.put('/admin/support/bots/:id/draft', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { flow } = z.object({ flow: z.unknown() }).parse(request.body);
    const shape = flowSchema.safeParse(flow);
    if (!shape.success) throw badRequest(`The flow is not valid: ${shape.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    if (!(await prisma.supportBot.findUnique({ where: { id } }))) throw notFound('Bot not found.');
    await prisma.supportBot.update({ where: { id }, data: { draft: shape.data as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_draft_saved', targetType: 'support_bot', targetId: id, ip: request.ip });
    const check = validateFlow(shape.data);
    return { saved: true, validation: { ok: check.ok, errors: check.errors, warnings: check.warnings } };
  });

  app.post('/admin/support/bots/:id/publish', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.supportBot.findUnique({ where: { id } });
    if (!row) throw notFound('Bot not found.');
    const check = validateFlow(row.draft);
    if (!check.ok || !check.flow) throw badRequest(`The flow cannot be published: ${check.errors.slice(0, 3).join(' ')}`);
    const missing = await missingDepartments(check.flow);
    if (missing.length) throw badRequest(`The flow cannot be published: ${missing[0]}`);
    const version = await prisma.$transaction(async (tx) => {
      const last = await tx.supportBotVersion.aggregate({ where: { botId: id }, _max: { version: true } });
      const created = await tx.supportBotVersion.create({ data: { botId: id, version: (last._max.version ?? 0) + 1, flow: check.flow as unknown as Prisma.InputJsonValue, publishedById: actor.id } });
      await tx.supportBot.update({ where: { id }, data: { publishedVersionId: created.id } });
      return created;
    });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_published', targetType: 'support_bot', targetId: id, meta: { version: version.version }, ip: request.ip });
    return { version: version.version, warnings: check.warnings };
  });

  /** Puts an older version back as the one that runs, and as the draft, so it can be edited from there. */
  app.post('/admin/support/bots/:id/rollback', write(app), async (request: FastifyRequest) => {
    const actor = await requirePermission('settings.write')(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { version } = z.object({ version: z.number().int().min(1) }).parse(request.body);
    const row = await prisma.supportBotVersion.findUnique({ where: { botId_version: { botId: id, version } } });
    if (!row) throw notFound('That version does not exist.');
    await prisma.supportBot.update({ where: { id }, data: { publishedVersionId: row.id, draft: row.flow as Prisma.InputJsonValue } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_rolled_back', targetType: 'support_bot', targetId: id, meta: { version }, ip: request.ip });
    return { version };
  });

  app.get('/admin/support/bots/:id/export', { preHandler: requirePermission('tickets.read') }, async (request: FastifyRequest) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.supportBot.findUnique({ where: { id } });
    if (!row) throw notFound('Bot not found.');
    return { name: row.name, flow: row.draft };
  });

  /** An imported flow is checked like any other: it must have the shape of a flow, and it becomes a draft, never a running bot. */
  app.post('/admin/support/bots/import', write(app), async (request: FastifyRequest, reply) => {
    const actor = await requirePermission('settings.write')(request);
    const body = z.object({ name: z.string().trim().min(2).max(60), flow: z.unknown() }).parse(request.body);
    const shape = flowSchema.safeParse(body.flow);
    if (!shape.success) throw badRequest(`The file is not a valid flow: ${shape.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    const row = await prisma.supportBot.create({ data: { name: body.name, draft: shape.data as unknown as Prisma.InputJsonValue } });
    await audit({ actorId: actor.id, actorEmail: actor.email, action: 'support.bot_imported', targetType: 'support_bot', targetId: row.id, ip: request.ip });
    return reply.code(201).send({ bot: { id: row.id, name: row.name }, validation: (({ ok, errors, warnings }) => ({ ok, errors, warnings }))(validateFlow(shape.data)) });
  });

  /**
   * Runs a flow with the inputs given, in memory. Nothing is saved, no ticket is made and nobody is notified: the effects
   * the flow asked for are listed instead.
   */
  app.post('/admin/support/bots/simulate', {
    config: { rateLimit: { max: LIMITS.adminWrite.address, timeWindow: LIMITS.adminWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: [requirePermission('tickets.write'), customerLimit(app, LIMITS.adminWrite)],
  }, async (request: FastifyRequest) => {
    await requirePermission('tickets.write')(request);
    const body = z.object({ flow: z.unknown(), inputs: z.array(z.object({ text: z.string().max(1000).optional(), option: z.string().max(60).optional() })).max(40) }).parse(request.body);
    const check = validateFlow(body.flow);
    if (!check.ok || !check.flow) return { ok: false, errors: check.errors, turns: [], effects: [] };
    const effects: string[] = [];
    const hooks: Hooks = {
      services: async () => [{ id: 'sample-service', name: 'A sample service' }],
      createTicket: async (subject) => {
        effects.push(`Would create a ticket: ${subject}`);
        return { number: 1000 };
      },
      transfer: async (departmentId) => {
        effects.push(`Would hand over to a person${departmentId ? ` of the department ${departmentId}` : ''}`);
        return { mode: 'chat', number: 1000 };
      },
      setPriority: async (priority) => {
        effects.push(`Would set the priority to ${priority}`);
      },
      assignDepartment: async (departmentId) => {
        effects.push(`Would move the conversation to the department ${departmentId}`);
        return true;
      },
    };
    const turns: Out[][] = [];
    let step = await startFlow(check.flow, hooks);
    turns.push(step.out);
    for (const input of body.inputs) {
      if (step.session.state !== 'ACTIVE') break;
      step = await advance(check.flow, step.session, input, hooks);
      turns.push(step.out);
    }
    return { ok: true, turns, effects, state: step.session.state, variables: step.session.variables };
  });

  // --- the customer -------------------------------------------------------------

  const customer = (a: FastifyInstance) => ({
    config: { rateLimit: { max: LIMITS.mail.address, timeWindow: LIMITS.mail.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(a, LIMITS.mail),
  });

  /** The hooks of one conversation: what the flow may do for this customer, and nothing for any other. */
  function hooksFor(user: { id: string; email: string; firstName?: string | null; lastName?: string | null }, ctx: { ticketId: string | null; priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; departmentId?: string; transcript: () => string }): Hooks {
    const makeTicket = async (subject: string, channel: 'CHAT' | 'TICKET') => {
      const ticket = await prisma.ticket.create({
        data: {
          userId: user.id,
          channel,
          subject: subject.slice(0, 160),
          category: 'OTHER',
          priority: ctx.priority ?? 'NORMAL',
          status: 'OPEN',
          departmentId: ctx.departmentId ?? null,
          lastCustomerAt: new Date(),
          messages: { create: { authorId: user.id, body: `Conversation with the assistant:\n\n${ctx.transcript()}`.slice(0, 19_000) } },
          events: { create: { type: 'created', message: channel === 'CHAT' ? 'Handed over from the assistant to a person.' : 'Opened from the assistant.', actorId: user.id } },
        },
      });
      ctx.ticketId = ticket.id;
      await notifyTicketOpenedForStaff({ userId: user.id, ticketId: ticket.id, ticketNumber: String(ticket.number), subject: ticket.subject, customer: fullName({ firstName: user.firstName ?? '', lastName: user.lastName ?? '' }) || user.email, occurrence: ticket.id }).catch(() => undefined);
      await publishSupportEvent({ type: 'created', ticketId: ticket.id, ownerId: user.id, internal: false });
      return ticket;
    };
    return {
      async services() {
        const [instances, servers] = await Promise.all([
          prisma.instance.findMany({ where: { userId: user.id, status: { not: 'CANCELLED' } }, select: { id: true, name: true }, take: 20 }),
          prisma.vpsService.findMany({ where: { userId: user.id }, select: { id: true, name: true }, take: 20 }),
        ]);
        return [...instances, ...servers];
      },
      async createTicket(subject) {
        if (ctx.ticketId) {
          const existing = await prisma.ticket.findUnique({ where: { id: ctx.ticketId }, select: { number: true } });
          if (existing) return { number: existing.number };
        }
        const ticket = await makeTicket(subject, 'TICKET');
        return { number: ticket.number };
      },
      async transfer(departmentId) {
        const dept = departmentId ?? ctx.departmentId;
        const available = await humanAvailable(dept);
        const channel = available ? 'CHAT' : 'TICKET';
        if (ctx.ticketId) {
          const ticket = await prisma.ticket.update({ where: { id: ctx.ticketId }, data: { channel, ...(dept ? { departmentId: dept } : {}) }, select: { number: true } });
          return { mode: available ? 'chat' : 'ticket', number: ticket.number };
        }
        if (dept) ctx.departmentId = dept;
        const ticket = await makeTicket('Conversation handed over from the assistant', channel);
        return { mode: available ? 'chat' : 'ticket', number: ticket.number };
      },
      async setPriority(priority) {
        ctx.priority = priority;
        if (ctx.ticketId) await prisma.ticket.update({ where: { id: ctx.ticketId }, data: { priority } });
      },
      async assignDepartment(departmentId) {
        if (!(await prisma.supportDepartment.findUnique({ where: { id: departmentId } }))) return false;
        ctx.departmentId = departmentId;
        if (ctx.ticketId) await prisma.ticket.update({ where: { id: ctx.ticketId }, data: { departmentId } });
        return true;
      },
    };
  }

  const answer = (sessionId: string, session: BotSession, out: Out[]) => ({ sessionId, state: session.state.toLowerCase(), messages: out });

  /** Starts a conversation with the bot that is switched on. 404 when there is none: the widget then offers the normal chat. */
  app.post('/support/bot/start', customer(app), async (request: FastifyRequest, response) => {
    const user = await requireAuth(request);
    const bot = await prisma.supportBot.findFirst({ where: { enabled: true, publishedVersionId: { not: null } }, orderBy: { createdAt: 'asc' } });
    if (!bot || !bot.publishedVersionId) throw notFound('No assistant is available.');
    const version = await prisma.supportBotVersion.findUnique({ where: { id: bot.publishedVersionId } });
    if (!version) throw notFound('No assistant is available.');
    const flow = flowSchema.parse(version.flow);
    const transcript: Entry[] = [];
    const ctx = { ticketId: null as string | null, transcript: () => transcript.map((entry) => `${entry.from === 'bot' ? 'Assistant' : 'Customer'}: ${entry.text}`).join('\n') };
    const result = await startFlow(flow, hooksFor(user, ctx));
    const now = new Date().toISOString();
    for (const out of result.out) transcript.push({ from: 'bot', text: plain(out), at: now });
    const row = await prisma.supportBotSession.create({
      data: { botId: bot.id, versionId: version.id, userId: user.id, state: result.session.state, node: result.session.node, variables: result.session.variables, steps: result.session.steps, transcript: transcript as unknown as Prisma.InputJsonValue, ticketId: ctx.ticketId },
    });
    return response.code(201).send(answer(row.id, result.session, result.out));
  });

  /** The conversation with the bot that is still going, so the widget picks it up again after a reload. */
  app.get('/support/bot/current', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const row = await prisma.supportBotSession.findFirst({ where: { userId: user.id, state: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, include: { version: true } });
    if (!row) return { session: null };
    const flow = flowSchema.parse(row.version.flow);
    const session: BotSession = { node: row.node, variables: row.variables as Record<string, string>, steps: row.steps, state: row.state };
    const prompt = await promptFor(flow, session, hooksFor(user, { ticketId: row.ticketId, transcript: () => '' }));
    return { session: { id: row.id, transcript: (row.transcript as unknown as Entry[]).slice(-60), prompt } };
  });

  /** The customer does not want the assistant: the conversation ends and the chat goes on with a person. */
  app.post('/support/bot/:id/skip', customer(app), async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await prisma.supportBotSession.findFirst({ where: { id, userId: user.id } });
    if (!row) throw notFound('Conversation not found.');
    await prisma.supportBotSession.update({ where: { id }, data: { state: 'ENDED', node: null } });
    return { skipped: true };
  });

  app.post('/support/bot/:id/input', customer(app), async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({ text: z.string().max(1000).optional(), option: z.string().max(60).optional() }).parse(request.body);
    const row = await prisma.supportBotSession.findFirst({ where: { id, userId: user.id }, include: { version: true } });
    if (!row) throw notFound('Conversation not found.');
    if (row.state !== 'ACTIVE') return { ...answer(row.id, { node: row.node, variables: row.variables as Record<string, string>, steps: row.steps, state: row.state }, []), messages: [] };
    const flow = flowSchema.parse(row.version.flow);
    const transcript = (row.transcript as unknown as Entry[]).slice(-90);
    const now = new Date().toISOString();
    // What the customer picked is written as the label they saw, not as the id of the button.
    const waiting = row.node ? flow.nodes[row.node] : undefined;
    const said = input.text ?? (waiting?.type === 'buttons' ? waiting.options.find((option) => option.id === input.option)?.label : undefined) ?? input.option;
    if (said) transcript.push({ from: 'customer', text: said, at: now });
    const ctx = { ticketId: row.ticketId, transcript: () => transcript.map((entry) => `${entry.from === 'bot' ? 'Assistant' : 'Customer'}: ${entry.text}`).join('\n') };
    const current: BotSession = { node: row.node, variables: row.variables as Record<string, string>, steps: row.steps, state: row.state };
    const result = await advance(flow, current, input, hooksFor(user, ctx));
    for (const out of result.out) transcript.push({ from: 'bot', text: plain(out), at: now });
    await prisma.supportBotSession.update({
      where: { id },
      data: { state: result.session.state, node: result.session.node, variables: result.session.variables, steps: result.session.steps, transcript: transcript as unknown as Prisma.InputJsonValue, ticketId: ctx.ticketId },
    });
    return { ...answer(id, result.session, result.out), ticketId: ctx.ticketId };
  });
}
