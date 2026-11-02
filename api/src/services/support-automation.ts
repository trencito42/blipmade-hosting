import type { Prisma, SupportAutomation } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { businessMinutesBetween, hoursSchema, isOpenAt, type Hours } from './support-hours.js';
import { PRESENCE_WINDOW_MS } from './support-availability.js';
import { publishSupportEvent } from './support-events.js';

/**
 * The rules of the support: when something happens in a conversation and the conditions hold, do these things.
 *
 * What a rule can do is a short list of actions on the conversation, each of them one that a member of the staff can do by
 * hand. A rule never runs code, and it cannot make a rule run without limit: one event is handled once by one rule (the
 * pair is unique in the database), a change made by a rule may start other rules only three levels deep, and one rule runs
 * at most a few times an hour on the same conversation. Every run is written down with what it did, and a run that fails
 * is tried again and then kept as dead for the operator to read.
 */

export const TRIGGERS = ['conversation_created', 'customer_replied', 'staff_replied', 'status_changed', 'reopened', 'customer_inactive', 'staff_unanswered'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const SCHEDULED: Trigger[] = ['customer_inactive', 'staff_unanswered'];

export const MAX_DEPTH = 3;
export const MAX_RUNS_PER_HOUR = 5;
export const MAX_ATTEMPTS = 3;

const STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'AWAITING_STAFF', 'ON_HOLD', 'CLOSED'] as const;
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const text = z.string().trim().min(1).max(2000);

export const conditionsSchema = z
  .object({
    departmentId: z.string().max(40).optional(),
    channel: z.enum(['TICKET', 'CHAT', 'EMAIL']).optional(),
    priority: z.array(z.enum(PRIORITIES)).max(4).optional(),
    status: z.array(z.enum(STATUSES)).max(5).optional(),
    productSlug: z.string().max(60).optional(),
    assigned: z.enum(['any', 'none', 'someone']).optional(),
    businessHours: z.enum(['open', 'closed']).optional(),
  })
  .strict();

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_priority'), priority: z.enum(PRIORITIES) }),
  z.object({ type: z.literal('set_department'), departmentId: z.string().min(1).max(40) }),
  z.object({ type: z.literal('assign'), userId: z.string().min(1).max(40).or(z.literal('round_robin')) }),
  z.object({ type: z.literal('set_status'), status: z.enum(STATUSES) }),
  z.object({ type: z.literal('add_note'), text }),
  z.object({ type: z.literal('reply'), text }),
]);
export const actionsSchema = z.array(actionSchema).min(1).max(8);

export type Conditions = z.infer<typeof conditionsSchema>;
export type Action = z.infer<typeof actionSchema>;

type TicketForRules = Prisma.TicketGetPayload<{ include: { instance: { select: { product: { select: { slug: true } }; name: true } }; user: { select: { firstName: true } }; department: { select: { name: true } } } }>;

const include = { instance: { select: { name: true, product: { select: { slug: true } } } }, user: { select: { firstName: true } }, department: { select: { name: true } } } as const;

export async function loadTicket(ticketId: string): Promise<TicketForRules | null> {
  return prisma.ticket.findUnique({ where: { id: ticketId }, include });
}

export async function readHours(): Promise<Hours | null> {
  const row = await prisma.setting.findUnique({ where: { key: 'support.hours' } });
  const parsed = hoursSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

/** Whether the conditions of a rule hold for a conversation, and which one did not. */
export function matches(conditions: Conditions, ticket: TicketForRules, hours: Hours | null, now = new Date()): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (conditions.departmentId && ticket.departmentId !== conditions.departmentId) failed.push('department');
  if (conditions.channel && ticket.channel !== conditions.channel) failed.push('channel');
  if (conditions.priority && !conditions.priority.includes(ticket.priority)) failed.push('priority');
  if (conditions.status && !conditions.status.includes(ticket.status)) failed.push('status');
  if (conditions.productSlug && ticket.instance?.product.slug !== conditions.productSlug) failed.push('product');
  if (conditions.assigned === 'none' && ticket.assignedToId) failed.push('assigned');
  if (conditions.assigned === 'someone' && !ticket.assignedToId) failed.push('assigned');
  if (conditions.businessHours && isOpenAt(hours, now) !== (conditions.businessHours === 'open')) failed.push('business hours');
  return { ok: failed.length === 0, failed };
}

/** `{{name}}` of the few values a message may use; nothing else is read. */
export function fill(template: string, ticket: TicketForRules): string {
  const values: Record<string, string> = {
    customer_first_name: ticket.user.firstName,
    ticket_number: String(ticket.number),
    service_name: ticket.instance?.name ?? '',
    department: ticket.department?.name ?? '',
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, name: string) => (Object.hasOwn(values, name) ? values[name]! : ''));
}

/** The words that describe what an action would do, for the history and for the dry run. */
export function describe(action: Action): string {
  switch (action.type) {
    case 'set_priority':
      return `priority ${action.priority.toLowerCase()}`;
    case 'set_department':
      return `moved to department ${action.departmentId}`;
    case 'assign':
      return action.userId === 'round_robin' ? 'assigned to the available person with the fewest open conversations' : `assigned to ${action.userId}`;
    case 'set_status':
      return `status ${action.status.toLowerCase().replace('_', ' ')}`;
    case 'add_note':
      return 'internal note added';
    case 'reply':
      return 'reply sent to the customer';
  }
}

async function pickRoundRobin(departmentId: string | null): Promise<string | null> {
  const alive = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const present = await prisma.supportPresence.findMany({
    where: { status: 'AVAILABLE', lastSeenAt: { gte: alive }, ...(departmentId ? { staff: { departments: { some: { departmentId } } } } : {}) },
    select: { userId: true },
  });
  if (present.length === 0) return null;
  const loads = await Promise.all(present.map(async (row) => ({ userId: row.userId, load: await prisma.ticket.count({ where: { assignedToId: row.userId, status: { not: 'CLOSED' } } }) })));
  loads.sort((a, b) => a.load - b.load || a.userId.localeCompare(b.userId));
  return loads[0]!.userId;
}

/** Does one action on the conversation. Returns the words for the history. */
async function perform(action: Action, ticket: TicketForRules, rule: SupportAutomation, depth: number): Promise<string> {
  const note = (message: string) => prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'automation', message: `${rule.name}: ${message}`, actorId: null } });
  switch (action.type) {
    case 'set_priority':
      await prisma.ticket.update({ where: { id: ticket.id }, data: { priority: action.priority } });
      await note(describe(action));
      return describe(action);
    case 'set_department': {
      if (!(await prisma.supportDepartment.findUnique({ where: { id: action.departmentId } }))) throw new Error(`The department ${action.departmentId} does not exist.`);
      await prisma.ticket.update({ where: { id: ticket.id }, data: { departmentId: action.departmentId } });
      await note(describe(action));
      return describe(action);
    }
    case 'assign': {
      const userId = action.userId === 'round_robin' ? await pickRoundRobin(ticket.departmentId) : action.userId;
      if (!userId) return 'nobody was available to take it';
      if (!(await prisma.staffMember.findUnique({ where: { userId } }))) throw new Error('That person is not a staff member.');
      await prisma.ticket.update({ where: { id: ticket.id }, data: { assignedToId: userId } });
      await note(`assigned to ${userId}`);
      await publishSupportEvent({ type: 'assigned', ticketId: ticket.id, ownerId: ticket.userId, internal: true });
      return `assigned to ${userId}`;
    }
    case 'set_status': {
      const closing = action.status === 'CLOSED';
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: action.status, closedAt: closing ? new Date() : null } });
      // The customer reads what happened to the conversation; which rule did it is for the staff.
      const event = await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: 'status', message: `Status changed to ${action.status}.`, actorId: null } });
      await note(describe(action));
      await publishSupportEvent({ type: 'status', ticketId: ticket.id, ownerId: ticket.userId, internal: false });
      // The change may start other rules, a few levels deep at most.
      if (depth + 1 <= MAX_DEPTH) await fireAutomations('status_changed', ticket.id, event.id, depth + 1);
      return describe(action);
    }
    case 'add_note': {
      if (!rule.actorId) throw new Error('This rule has no staff member to write as.');
      await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: rule.actorId, body: fill(action.text, ticket), internal: true } });
      return describe(action);
    }
    case 'reply': {
      if (!rule.actorId) throw new Error('This rule has no staff member to write as.');
      const now = new Date();
      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.ticketMessage.create({ data: { ticketId: ticket.id, authorId: rule.actorId!, body: fill(action.text, ticket), internal: false } });
        await tx.ticket.update({ where: { id: ticket.id }, data: { lastReplyAt: now, lastStaffAt: now, status: 'AWAITING_CUSTOMER' } });
        await tx.ticketEvent.create({ data: { ticketId: ticket.id, type: 'automation', message: `${rule.name}: reply sent.`, actorId: null } });
        return created;
      });
      await publishSupportEvent({ type: 'message', ticketId: ticket.id, ownerId: ticket.userId, internal: false, seq: String(message.seq) });
      // An automatic reply is not the answer of a person: it does not stop the first response clock.
      return describe(action);
    }
  }
}

/** Runs one rule on one conversation for one event. Idempotent: the pair (rule, event) is written once. */
export async function runRule(rule: SupportAutomation, ticketId: string, eventKey: string, depth: number): Promise<'ran' | 'skipped' | 'failed'> {
  const existing = await prisma.supportAutomationRun.findUnique({ where: { automationId_eventKey: { automationId: rule.id, eventKey } } });
  if (existing && existing.status !== 'FAILED') return 'skipped';

  const ticket = await loadTicket(ticketId);
  if (!ticket) return 'skipped';
  const conditions = conditionsSchema.safeParse(rule.conditions);
  const actions = actionsSchema.safeParse(rule.actions);
  if (!conditions.success || !actions.success) return 'skipped';
  if (!matches(conditions.data, ticket, await readHours()).ok) return 'skipped';

  // The brake against a rule that keeps starting itself through the changes it makes.
  if (!existing) {
    const recent = await prisma.supportAutomationRun.count({ where: { automationId: rule.id, ticketId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
    if (recent >= MAX_RUNS_PER_HOUR) return 'skipped';
  }

  let run;
  try {
    run = existing ?? (await prisma.supportAutomationRun.create({ data: { automationId: rule.id, ticketId, eventKey, depth, status: 'OK' } }));
  } catch {
    // The same event was taken by another process a moment ago.
    return 'skipped';
  }

  const done: string[] = [];
  try {
    for (const action of actions.data) done.push(await perform(action, ticket, rule, depth));
    await prisma.supportAutomationRun.update({ where: { id: run.id }, data: { status: 'OK', done, error: null } });
    return 'ran';
  } catch (error) {
    const attempts = (existing?.attempts ?? 0) + 1;
    await prisma.supportAutomationRun.update({
      where: { id: run.id },
      data: { status: attempts >= MAX_ATTEMPTS ? 'DEAD' : 'FAILED', attempts, done, error: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
    });
    return 'failed';
  }
}

/** The rules of a trigger that apply to an event, in their order. Never throws: the conversation is already saved. */
export async function fireAutomations(trigger: Trigger, ticketId: string, eventKey: string, depth = 0): Promise<void> {
  if (depth > MAX_DEPTH) return;
  try {
    const rules = await prisma.supportAutomation.findMany({ where: { enabled: true, trigger }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    for (const rule of rules) await runRule(rule, ticketId, `${trigger}:${eventKey}`, depth);
  } catch (error) {
    console.error('[support-automation] the rules could not run', error);
  }
}

/** What a rule would do to a conversation now, without doing it. */
export async function dryRun(rule: { conditions: unknown; actions: unknown }, ticketId: string): Promise<{ matches: boolean; failed: string[]; would: string[] } | null> {
  const ticket = await loadTicket(ticketId);
  if (!ticket) return null;
  const conditions = conditionsSchema.parse(rule.conditions);
  const actions = actionsSchema.parse(rule.actions);
  const result = matches(conditions, ticket, await readHours());
  return { matches: result.ok, failed: result.failed, would: result.ok ? actions.map(describe) : [] };
}

/**
 * The pass over the waiting conversations, and over the runs that failed. A rule that looks at waiting time runs once for
 * one waiting period: the key of the event holds the moment the wait began, so the same wait is never handled twice and a
 * new wait is.
 */
export async function sweepAutomations(now = new Date()): Promise<{ ran: number; retried: number }> {
  let ran = 0;
  let retried = 0;
  const hours = await readHours();
  const rules = await prisma.supportAutomation.findMany({ where: { enabled: true, trigger: { in: SCHEDULED }, afterMinutes: { not: null } }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
  for (const rule of rules) {
    const waiting = rule.trigger === 'customer_inactive';
    const tickets = await prisma.ticket.findMany({
      where: waiting ? { status: 'AWAITING_CUSTOMER' } : { status: { in: ['OPEN', 'AWAITING_STAFF'] } },
      select: { id: true, createdAt: true, lastStaffAt: true, lastReplyAt: true, lastCustomerAt: true },
      take: 500,
    });
    for (const ticket of tickets) {
      const since = waiting ? ticket.lastStaffAt ?? ticket.lastReplyAt ?? ticket.createdAt : ticket.lastCustomerAt ?? ticket.createdAt;
      if (businessMinutesBetween(hours, since, now) < (rule.afterMinutes ?? 0)) continue;
      if ((await runRule(rule, ticket.id, `${rule.trigger}:${ticket.id}:${since.getTime()}`, 0)) === 'ran') ran += 1;
    }
  }
  // A run that failed is tried again, up to the limit; after it, it stays dead.
  const failed = await prisma.supportAutomationRun.findMany({ where: { status: 'FAILED' }, include: { automation: true }, take: 100 });
  for (const run of failed) {
    if (!run.automation.enabled) continue;
    if ((await runRule(run.automation, run.ticketId, run.eventKey, run.depth)) === 'ran') retried += 1;
  }
  return { ran, retried };
}
