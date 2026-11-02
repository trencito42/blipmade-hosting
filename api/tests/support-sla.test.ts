import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { hoursSchema } from '../src/services/support-hours.js';
import { clocksOf, median, type Policy, type TicketTimes } from '../src/services/support-sla.js';
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
  await prisma.setting.deleteMany({ where: { key: { in: ['support.hours', 'support.sla'] } } });
});

const policy: Policy = { priority: 'NORMAL', firstResponseMinutes: 60, nextResponseMinutes: 30, resolutionMinutes: 480 };
const base = (over: Partial<TicketTimes> = {}): TicketTimes => ({ priority: 'NORMAL', status: 'OPEN', createdAt: new Date('2026-11-02T08:00:00Z'), closedAt: null, firstHumanResponseAt: null, lastCustomerAt: new Date('2026-11-02T08:00:00Z'), lastStaffAt: null, ...over });

describe('the clocks', () => {
  it('judges the first answer: running, at risk, late, met, missed', () => {
    const at = (iso: string) => new Date(iso);
    expect(clocksOf(base(), [policy], null, at('2026-11-02T08:20:00Z')).first.state).toBe('ok');
    expect(clocksOf(base(), [policy], null, at('2026-11-02T08:50:00Z')).first.state).toBe('at_risk');
    expect(clocksOf(base(), [policy], null, at('2026-11-02T09:30:00Z')).first.state).toBe('breached');
    expect(clocksOf(base({ firstHumanResponseAt: at('2026-11-02T08:40:00Z') }), [policy], null, at('2026-11-03T00:00:00Z')).first.state).toBe('met');
    expect(clocksOf(base({ firstHumanResponseAt: at('2026-11-02T10:00:00Z') }), [policy], null, at('2026-11-03T00:00:00Z')).first.state).toBe('breached');
  });

  it('says nothing when no policy covers the priority', () => {
    expect(clocksOf(base({ priority: 'URGENT' }), [policy], null).first.state).toBe('none');
  });

  it('runs the next answer from the last message of the customer, only while they wait', () => {
    const answered = base({ firstHumanResponseAt: new Date('2026-11-02T08:10:00Z'), lastStaffAt: new Date('2026-11-02T08:10:00Z'), lastCustomerAt: new Date('2026-11-02T09:00:00Z') });
    const waiting = clocksOf(answered, [policy], null, new Date('2026-11-02T09:40:00Z'));
    expect(waiting.next.state).toBe('breached');
    expect(waiting.next.dueAt?.toISOString()).toBe('2026-11-02T09:30:00.000Z');
    const staffAnswered = base({ firstHumanResponseAt: new Date('2026-11-02T08:10:00Z'), lastCustomerAt: new Date('2026-11-02T09:00:00Z'), lastStaffAt: new Date('2026-11-02T09:05:00Z') });
    expect(clocksOf(staffAnswered, [policy], null, new Date('2026-11-02T09:40:00Z')).next.state).toBe('none');
  });

  it('counts business minutes when hours are set: a night does not run the clock', () => {
    const hours = hoursSchema.parse({ timezone: 'UTC', days: { mon: [{ from: '09:00', to: '17:00' }], tue: [{ from: '09:00', to: '17:00' }] }, holidays: [] });
    // Written Monday 16:30; 60 business minutes: 30 on Monday, 30 on Tuesday morning.
    const ticket = base({ createdAt: new Date('2026-11-02T16:30:00Z') });
    const clock = clocksOf(ticket, [policy], hours, new Date('2026-11-03T09:10:00Z')).first;
    expect(clock.dueAt?.toISOString()).toBe('2026-11-03T09:30:00.000Z');
    expect(clock.state).toBe('ok');
  });

  it('takes the median of an even and an odd list', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe('the API of the numbers', () => {
  it('saves the policies with settings.write and refuses two for one priority', async () => {
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('PUT', '/api/admin/support/sla', { policies: [{ priority: 'NORMAL', firstResponseMinutes: 60 }, { priority: 'NORMAL', firstResponseMinutes: 30 }] })).status).toBe(400);
    expect((await admin.request('PUT', '/api/admin/support/sla', { policies: [{ priority: 'NORMAL', firstResponseMinutes: 60, resolutionMinutes: 600 }] })).status).toBe(200);
    expect((await admin.request('GET', '/api/admin/support/sla')).body.policies).toHaveLength(1);
    const { client: customer } = await registerAndLogin(app, 'plain@example.com');
    expect((await customer.request('GET', '/api/admin/support/analytics')).status).toBe(403);
  });

  it('counts what is there with the strict definitions', async () => {
    const { client: admin } = await createAdmin(app);
    await admin.request('PUT', '/api/admin/support/sla', { policies: [{ priority: 'NORMAL', firstResponseMinutes: 60 }] });
    const { client, userId } = await registerAndLogin(app, 'numbers@example.com');
    const one = (await client.request('POST', '/api/tickets', { subject: 'One', body: 'Hello.' })).body.ticket.id as string;
    const two = (await client.request('POST', '/api/tickets', { subject: 'Two', body: 'Hello.' })).body.ticket.id as string;
    await admin.request('POST', `/api/tickets/${one}/replies`, { body: 'An answer from a person.' });
    // The other conversation was created three hours ago and nobody answered: late.
    await prisma.ticket.update({ where: { id: two }, data: { createdAt: new Date(Date.now() - 3 * 3_600_000) } });
    // A greeting of a bot in a conversation is not a first response.
    await prisma.ticket.update({ where: { id: two }, data: { lastReplyAt: new Date() } });
    await client.request('POST', `/api/support/chat/${one}/rating`, { rating: 4 });
    await prisma.supportBotSession.create({ data: { bot: { create: { name: 'B', draft: {} } }, version: { create: { bot: { create: { name: 'V', draft: {} } }, version: 1, flow: {} } }, user: { connect: { id: userId } }, state: 'ENDED', variables: { _skipped: 'true' }, transcript: [] } });

    const result = (await admin.request('GET', '/api/admin/support/analytics?days=7')).body;
    expect(result.volume.created).toBe(2);
    expect(result.volume.byChannel).toEqual({ ticket: 2 });
    expect(result.firstResponse.count).toBe(1);
    expect(result.sla).toMatchObject({ judged: 2, met: 1, compliance: 50 });
    expect(result.open.total).toBe(2);
    expect(result.open.slaAtRisk).toBe(1);
    expect(result.satisfaction).toEqual({ count: 1, average: 4 });
    // A conversation with a bot that the customer skipped is not "completed".
    expect(result.bots).toMatchObject({ started: 1, completed: 0, handedOff: 0 });
    expect(result.definitions.botCompleted).toContain('reached an end');
    // The view of the conversations at risk lists the late one only.
    const risky = (await admin.request('GET', '/api/admin/support/conversations?view=sla_at_risk')).body.conversations as { id: string; sla: string }[];
    expect(risky.map((row) => row.id)).toEqual([two]);
    expect(risky[0]?.sla).toBe('breached');
  });
});
