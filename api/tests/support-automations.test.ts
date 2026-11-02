import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { fireAutomations, MAX_DEPTH, sweepAutomations } from '../src/services/support-automation.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  await prisma.setting.deleteMany({ where: { key: 'support.hours' } });
});

const rule = (client: Awaited<ReturnType<typeof createAdmin>>['client'], body: Record<string, unknown>) =>
  client.request('POST', '/api/admin/support/automations', { name: 'Rule', trigger: 'conversation_created', actions: [{ type: 'set_priority', priority: 'HIGH' }], ...body });

async function enable(client: Awaited<ReturnType<typeof createAdmin>>['client'], id: string) {
  expect((await client.request('PUT', `/api/admin/support/automations/${id}`, { enabled: true })).status).toBe(200);
}

describe('writing a rule', () => {
  it('lets only settings.write write, and checks what the rule names', async () => {
    const { client: customer } = await registerAndLogin(app, 'plain@example.com');
    expect((await customer.request('GET', '/api/admin/support/automations')).status).toBe(403);
    const { client: admin } = await createAdmin(app);
    expect((await rule(admin, { trigger: 'customer_inactive' })).status).toBe(400); // needs the minutes
    expect((await rule(admin, { afterMinutes: 30 })).status).toBe(400); // only a waiting rule takes minutes
    expect((await rule(admin, { actions: [{ type: 'set_department', departmentId: 'ghost' }] })).status).toBe(400);
    expect((await rule(admin, { actions: [{ type: 'script', code: 'x' }] })).status).toBe(400);
    expect((await rule(admin, {})).status).toBe(201);
  });
});

describe('running a rule', () => {
  it('acts on a new conversation, and handles one event once', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await rule(admin, { actions: [{ type: 'set_priority', priority: 'URGENT' }, { type: 'add_note', text: 'New for {{customer_first_name}} #{{ticket_number}}' }] })).body.automation.id as string;
    await enable(admin, id);
    const { client } = await registerAndLogin(app, 'once@example.com');
    const created = await client.request('POST', '/api/tickets', { subject: 'Rule check', body: 'Hello.' });
    const ticketId = created.body.ticket.id as string;

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { messages: true } });
    expect(ticket?.priority).toBe('URGENT');
    const note = ticket?.messages.find((message) => message.internal);
    expect(note?.body).toBe(`New for Test #${ticket?.number}`);

    // The same event again: nothing is done twice.
    await fireAutomations('conversation_created', ticketId, ticketId);
    expect(await prisma.supportAutomationRun.count({ where: { automationId: id } })).toBe(1);
    expect(await prisma.ticketMessage.count({ where: { ticketId, internal: true } })).toBe(1);
    // The customer never sees the rule at work.
    const view = await client.request('GET', `/api/tickets/${ticketId}`);
    expect(view.body.ticket.messages.every((message: { internal: boolean }) => !message.internal)).toBe(true);
    expect(view.body.ticket.events.some((event: { type: string }) => event.type === 'automation')).toBe(false);
  });

  it('does not run when a condition does not hold', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await rule(admin, { conditions: { channel: 'CHAT' } })).body.automation.id as string;
    await enable(admin, id);
    const { client } = await registerAndLogin(app, 'cond@example.com');
    const ticketId = (await client.request('POST', '/api/tickets', { subject: 'Not a chat', body: 'Hello.' })).body.ticket.id as string;
    expect((await prisma.ticket.findUnique({ where: { id: ticketId } }))?.priority).toBe('NORMAL');
    expect(await prisma.supportAutomationRun.count()).toBe(0);
  });

  it('does not run a rule that is off', async () => {
    const { client: admin } = await createAdmin(app);
    await rule(admin, {});
    const { client } = await registerAndLogin(app, 'off@example.com');
    const ticketId = (await client.request('POST', '/api/tickets', { subject: 'Rule off', body: 'Hello.' })).body.ticket.id as string;
    expect((await prisma.ticket.findUnique({ where: { id: ticketId } }))?.priority).toBe('NORMAL');
  });

  it('stops a rule that keeps starting itself', async () => {
    const { client: admin } = await createAdmin(app);
    // Every change of status puts the conversation on hold, which is a change of status.
    const id = (await rule(admin, { trigger: 'status_changed', actions: [{ type: 'set_status', status: 'ON_HOLD' }] })).body.automation.id as string;
    await enable(admin, id);
    const { client } = await registerAndLogin(app, 'loop@example.com');
    const ticketId = (await client.request('POST', '/api/tickets', { subject: 'Loop', body: 'Hello.' })).body.ticket.id as string;
    const { client: staff } = await createAdmin(app, 'staff2@blipmade.test');
    expect((await staff.request('POST', `/api/tickets/${ticketId}/status`, { status: 'OPEN' })).status).toBe(200);
    const runs = await prisma.supportAutomationRun.count({ where: { automationId: id } });
    expect(runs).toBeGreaterThan(0);
    expect(runs).toBeLessThanOrEqual(MAX_DEPTH + 1);
  });

  it('tries a failed run again and keeps it as dead after the last try', async () => {
    const { client: admin, userId } = await createAdmin(app);
    const created = await prisma.supportAutomation.create({
      data: { name: 'Broken', enabled: true, trigger: 'conversation_created', conditions: {}, actions: [{ type: 'set_department', departmentId: 'ghost' }], actorId: userId },
    });
    const { client } = await registerAndLogin(app, 'dead@example.com');
    const ticketId = (await client.request('POST', '/api/tickets', { subject: 'Dead', body: 'Hello.' })).body.ticket.id as string;
    const first = await prisma.supportAutomationRun.findFirst({ where: { automationId: created.id, ticketId } });
    expect(first?.status).toBe('FAILED');
    expect(first?.attempts).toBe(1);
    await sweepAutomations();
    expect((await prisma.supportAutomationRun.findUniqueOrThrow({ where: { id: first!.id } })).attempts).toBe(2);
    await sweepAutomations();
    const last = await prisma.supportAutomationRun.findUniqueOrThrow({ where: { id: first!.id } });
    expect(last.status).toBe('DEAD');
    expect(last.error).toContain('ghost');
    await sweepAutomations();
    expect((await prisma.supportAutomationRun.findUniqueOrThrow({ where: { id: first!.id } })).attempts).toBe(3);
    // The history is readable by the staff.
    const history = await admin.request('GET', `/api/admin/support/automations/${created.id}/runs`);
    expect(history.body.runs[0].status).toBe('dead');
  });

  it('tries a rule on a conversation without doing anything', async () => {
    const { client: admin } = await createAdmin(app);
    const { client } = await registerAndLogin(app, 'dry@example.com');
    const ticket = (await client.request('POST', '/api/tickets', { subject: 'Dry run', body: 'Hello.' })).body.ticket as { id: string; number: number };
    const result = await admin.request('POST', '/api/admin/support/automations/dry-run', {
      conditions: { status: ['OPEN'] },
      actions: [{ type: 'set_priority', priority: 'URGENT' }, { type: 'set_status', status: 'CLOSED' }],
      ticketNumber: ticket.number,
    });
    expect(result.body.result.matches).toBe(true);
    expect(result.body.result.would).toEqual(['priority urgent', 'status closed']);
    const unchanged = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(unchanged?.priority).toBe('NORMAL');
    expect(unchanged?.status).toBe('OPEN');
    const other = await admin.request('POST', '/api/admin/support/automations/dry-run', { conditions: { status: ['CLOSED'] }, actions: [{ type: 'set_priority', priority: 'LOW' }], ticketNumber: ticket.number });
    expect(other.body.result.matches).toBe(false);
    expect(other.body.result.failed).toEqual(['status']);
  });
});

describe('the rules that wait', () => {
  it('closes a conversation that the customer left unanswered, once', async () => {
    const { client: admin, userId } = await createAdmin(app);
    const id = (await rule(admin, { name: 'Close after three days', trigger: 'customer_inactive', afterMinutes: 3 * 24 * 60, actions: [{ type: 'set_status', status: 'CLOSED' }] })).body.automation.id as string;
    await enable(admin, id);
    const { client } = await registerAndLogin(app, 'idle@example.com');
    const fresh = (await client.request('POST', '/api/tickets', { subject: 'Fresh', body: 'Hello.' })).body.ticket.id as string;
    const old = (await client.request('POST', '/api/tickets', { subject: 'Old', body: 'Hello.' })).body.ticket.id as string;
    const longAgo = new Date(Date.now() - 4 * 24 * 3_600_000);
    await prisma.ticket.update({ where: { id: fresh }, data: { status: 'AWAITING_CUSTOMER', lastStaffAt: new Date() } });
    await prisma.ticket.update({ where: { id: old }, data: { status: 'AWAITING_CUSTOMER', lastStaffAt: longAgo } });

    const first = await sweepAutomations();
    expect(first.ran).toBe(1);
    expect((await prisma.ticket.findUnique({ where: { id: old } }))?.status).toBe('CLOSED');
    expect((await prisma.ticket.findUnique({ where: { id: fresh } }))?.status).toBe('AWAITING_CUSTOMER');
    expect((await sweepAutomations()).ran).toBe(0);
    void userId;
  });

  it('counts business hours, not calendar time, when hours are set', async () => {
    const { client: admin } = await createAdmin(app);
    // Closed every day: no business minute ever passes, so a rule that waits for minutes never fires.
    await admin.request('PUT', '/api/admin/support/hours', { hours: { timezone: 'UTC', days: {}, holidays: [] } });
    const id = (await rule(admin, { trigger: 'staff_unanswered', afterMinutes: 10, actions: [{ type: 'set_priority', priority: 'URGENT' }] })).body.automation.id as string;
    await enable(admin, id);
    const { client } = await registerAndLogin(app, 'hours@example.com');
    const ticketId = (await client.request('POST', '/api/tickets', { subject: 'Waiting', body: 'Hello.' })).body.ticket.id as string;
    await prisma.ticket.update({ where: { id: ticketId }, data: { lastCustomerAt: new Date(Date.now() - 3_600_000) } });
    expect((await sweepAutomations()).ran).toBe(0);
    await admin.request('PUT', '/api/admin/support/hours', { hours: null });
    expect((await sweepAutomations()).ran).toBe(1);
    expect((await prisma.ticket.findUnique({ where: { id: ticketId } }))?.priority).toBe('URGENT');
  });
});

describe('assigning', () => {
  it('gives the conversation to the available person with the fewest open ones', async () => {
    const { client: admin, userId: first } = await createAdmin(app);
    const { userId: second } = await createAdmin(app, 'second@blipmade.test');
    for (const userId of [first, second]) await prisma.supportPresence.upsert({ where: { userId }, create: { userId, status: 'AVAILABLE' }, update: { status: 'AVAILABLE', lastSeenAt: new Date() } });
    const { client } = await registerAndLogin(app, 'rr@example.com');
    const busy = (await client.request('POST', '/api/tickets', { subject: 'Busy', body: 'Hello.' })).body.ticket.id as string;
    await prisma.ticket.update({ where: { id: busy }, data: { assignedToId: first } });
    const id = (await rule(admin, { actions: [{ type: 'assign', userId: 'round_robin' }] })).body.automation.id as string;
    await enable(admin, id);
    const next = (await client.request('POST', '/api/tickets', { subject: 'Next', body: 'Hello.' })).body.ticket.id as string;
    expect((await prisma.ticket.findUnique({ where: { id: next } }))?.assignedToId).toBe(second);
  });

  it('leaves it unassigned when nobody is here', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await rule(admin, { actions: [{ type: 'assign', userId: 'round_robin' }] })).body.automation.id as string;
    await enable(admin, id);
    const { client } = await registerAndLogin(app, 'nobody2@example.com');
    const ticketId = (await client.request('POST', '/api/tickets', { subject: 'Nobody', body: 'Hello.' })).body.ticket.id as string;
    expect((await prisma.ticket.findUnique({ where: { id: ticketId } }))?.assignedToId).toBeNull();
  });
});
