import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { advance, searchDocs, startFlow, templateFlow, validateFlow, MAX_STEPS_PER_TURN, type Flow, type Hooks } from '../src/services/support-bot.js';
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
});

const hooks = (log: string[] = []): Hooks => ({
  services: async () => [{ id: 's1', name: 'My server' }],
  createTicket: async (subject) => {
    log.push(`ticket:${subject}`);
    return { number: 7 };
  },
  transfer: async () => {
    log.push('transfer');
    return { mode: 'chat', number: 8 };
  },
  setPriority: async (priority) => {
    log.push(`priority:${priority}`);
  },
  assignDepartment: async () => true,
});

describe('the validation of a flow', () => {
  it('accepts the template and a small flow', () => {
    expect(validateFlow(templateFlow()).ok).toBe(true);
    expect(validateFlow({ start: 'a', nodes: { a: { type: 'end' } } }).ok).toBe(true);
  });

  it('refuses a block that leads nowhere, and a start that does not exist', () => {
    const missing = validateFlow({ start: 'a', nodes: { a: { type: 'message', text: 'Hi', next: 'ghost' } } });
    expect(missing.ok).toBe(false);
    expect(missing.errors.join(' ')).toContain('ghost');
    expect(validateFlow({ start: 'nope', nodes: { a: { type: 'end' } } }).ok).toBe(false);
  });

  it('refuses a loop that never asks the customer anything, and allows one that does', () => {
    const endless = validateFlow({ start: 'a', nodes: { a: { type: 'message', text: 'x', next: 'b' }, b: { type: 'message', text: 'y', next: 'a' } } });
    expect(endless.ok).toBe(false);
    expect(endless.errors.join(' ')).toContain('loop');
    const asking = validateFlow({
      start: 'q',
      nodes: { q: { type: 'buttons', text: 'Again?', options: [{ id: 'yes', label: 'Yes', next: 'm' }, { id: 'no', label: 'No', next: 'e' }] }, m: { type: 'message', text: 'ok', next: 'q' }, e: { type: 'end' } },
    });
    expect(asking.ok).toBe(true);
  });

  it('refuses code and unknown block types, and long texts', () => {
    expect(validateFlow({ start: 'a', nodes: { a: { type: 'script', code: 'alert(1)' } } }).ok).toBe(false);
    expect(validateFlow({ start: 'a', nodes: { a: { type: 'message', text: 'x'.repeat(1001) } } }).ok).toBe(false);
  });

  it('warns about a block that cannot be reached', () => {
    const result = validateFlow({ start: 'a', nodes: { a: { type: 'end' }, lost: { type: 'end' } } });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toContain('lost');
  });
});

describe('running a flow', () => {
  it('answers button choices and asks the follow-up', async () => {
    const flow = validateFlow(templateFlow()).flow!;
    const first = await startFlow(flow, hooks());
    expect(first.out[0]).toEqual({ kind: 'text', text: 'Hello! How can we help?' });
    expect(first.out.at(-1)?.kind).toBe('buttons');
    const second = await advance(flow, first.session, { option: 'technical' }, hooks());
    expect(second.out.at(-1)).toMatchObject({ kind: 'ask', input: 'service' });
  });

  it('asks again when the answer is not one of the options, and when the email is not an email', async () => {
    const flow: Flow = { start: 'q', nodes: { q: { type: 'buttons', text: 'Pick', options: [{ id: 'a', label: 'A', next: 'e' }] }, e: { type: 'ask_email', text: 'Email?', variable: 'mail', next: 'bye' }, bye: { type: 'end', text: 'Thanks {{mail}}' } } };
    const start = await startFlow(flow, hooks());
    const bad = await advance(flow, start.session, { text: 'nonsense' }, hooks());
    expect(bad.session.node).toBe('q');
    const ok = await advance(flow, bad.session, { option: 'a' }, hooks());
    const wrong = await advance(flow, ok.session, { text: 'not-an-email' }, hooks());
    expect(wrong.session.node).toBe('e');
    const done = await advance(flow, wrong.session, { text: 'me@example.com' }, hooks());
    expect(done.session.state).toBe('ENDED');
    expect(done.out.at(-1)).toEqual({ kind: 'text', text: 'Thanks me@example.com' });
  });

  it('shows a variable as plain text and interprets nothing else', async () => {
    const flow: Flow = { start: 'q', nodes: { q: { type: 'ask_text', text: 'Say', variable: 'x', next: 'm' }, m: { type: 'message', text: 'You wrote: {{x}} {{constructor}} ${1+1}' } } };
    const start = await startFlow(flow, hooks());
    const done = await advance(flow, start.session, { text: '<img src=x onerror=alert(1)>' }, hooks());
    expect(done.out[0]).toEqual({ kind: 'text', text: 'You wrote: <img src=x onerror=alert(1)>  ${1+1}' });
  });

  it('branches on a variable', async () => {
    const flow: Flow = {
      start: 'q',
      nodes: { q: { type: 'ask_text', text: 'Say', variable: 'x', next: 'b' }, b: { type: 'branch', variable: 'x', cases: [{ contains: 'invoice', next: 'bill' }], else: 'other' }, bill: { type: 'end', text: 'billing' }, other: { type: 'end', text: 'other' } },
    };
    const start = await startFlow(flow, hooks());
    expect((await advance(flow, start.session, { text: 'Where is my INVOICE' }, hooks())).out[0]).toEqual({ kind: 'text', text: 'billing' });
    expect((await advance(flow, start.session, { text: 'hello' }, hooks())).out[0]).toEqual({ kind: 'text', text: 'other' });
  });

  it('runs the actions through the hooks and hands over to a person', async () => {
    const log: string[] = [];
    const flow: Flow = { start: 'p', nodes: { p: { type: 'set_priority', priority: 'HIGH', next: 't' }, t: { type: 'create_ticket', subject: 'Help', next: 'h' }, h: { type: 'transfer' } } };
    const result = await startFlow(flow, hooks(log));
    expect(log).toEqual(['priority:HIGH', 'ticket:Help', 'transfer']);
    expect(result.session.state).toBe('HANDED_OFF');
  });

  it('stops a flow that runs too long and hands the customer to a person', async () => {
    // A valid flow cannot loop without asking; a stored flow that was changed by hand still must not run away.
    const nodes: Flow['nodes'] = {};
    for (let i = 0; i < MAX_STEPS_PER_TURN + 5; i++) nodes[`n${i}`] = { type: 'message', text: 'x', next: `n${i + 1}` };
    nodes[`n${MAX_STEPS_PER_TURN + 5}`] = { type: 'end' };
    const log: string[] = [];
    const result = await startFlow({ start: 'n0', nodes }, hooks(log));
    expect(result.session.state).toBe('HANDED_OFF');
    expect(log).toContain('transfer');
  });

  it('finds the documentation that matches, and nothing for noise', () => {
    expect(searchDocs('how do I sign in to my account').length).toBeGreaterThan(0);
    expect(searchDocs('zzzzqqqq')).toEqual([]);
  });
});

describe('the bots API', () => {
  it('lets only settings.write change a bot, and tickets.read list them', async () => {
    const { client: customer } = await registerAndLogin(app, 'plain@example.com');
    expect((await customer.request('GET', '/api/admin/support/bots')).status).toBe(403);
    expect((await customer.request('POST', '/api/admin/support/bots', { name: 'Mine' })).status).toBe(403);
  });

  it('publishes a bot, switches it on and talks to a customer through it', async () => {
    const { client: admin } = await createAdmin(app);
    const created = await admin.request('POST', '/api/admin/support/bots', { name: 'Helper', template: true });
    const id = created.body.bot.id as string;

    expect((await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: true })).status).toBe(409);
    const published = await admin.request('POST', `/api/admin/support/bots/${id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.version).toBe(1);
    expect((await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: true })).status).toBe(200);

    const { client } = await registerAndLogin(app, 'talker@example.com');
    const start = await client.request('POST', '/api/support/bot/start');
    expect(start.status).toBe(201);
    expect(start.body.messages.at(-1).kind).toBe('buttons');
    const sessionId = start.body.sessionId as string;

    const billing = await client.request('POST', `/api/support/bot/${sessionId}/input`, { option: 'billing' });
    expect(billing.body.messages[0].text).toContain('Billing');
    const human = await client.request('POST', `/api/support/bot/${sessionId}/input`, { option: 'human' });
    expect(human.body.state).toBe('handed_off');
    // Nobody is connected, so the conversation is a ticket, with what was said in it.
    const ticket = await prisma.ticket.findFirst({ include: { messages: true } });
    expect(ticket?.channel).toBe('TICKET');
    expect(ticket?.messages[0]?.body).toContain('Customer: Talk to an agent');
    // A greeting of the bot is not a human answer.
    expect(ticket?.firstHumanResponseAt).toBeNull();
  });

  it('does not start a conversation when the bot is switched off, and keeps the ones that started', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Helper', template: true })).body.bot.id as string;
    await admin.request('POST', `/api/admin/support/bots/${id}/publish`);
    await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: true });
    const { client } = await registerAndLogin(app, 'late@example.com');
    const sessionId = (await client.request('POST', '/api/support/bot/start')).body.sessionId as string;
    await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: false });
    expect((await client.request('POST', '/api/support/bot/start')).status).toBe(404);
    expect((await client.request('POST', `/api/support/bot/${sessionId}/input`, { option: 'billing' })).status).toBe(200);
  });

  it('keeps a conversation on the version it started on', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Helper', template: true })).body.bot.id as string;
    await admin.request('POST', `/api/admin/support/bots/${id}/publish`);
    await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: true });
    const { client } = await registerAndLogin(app, 'version@example.com');
    const sessionId = (await client.request('POST', '/api/support/bot/start')).body.sessionId as string;

    const draft = (await admin.request('GET', `/api/admin/support/bots/${id}`)).body.draft;
    draft.nodes.billing_info.text = 'A new text.';
    await admin.request('PUT', `/api/admin/support/bots/${id}/draft`, { flow: draft });
    expect((await admin.request('POST', `/api/admin/support/bots/${id}/publish`)).body.version).toBe(2);

    const old = await client.request('POST', `/api/support/bot/${sessionId}/input`, { option: 'billing' });
    expect(old.body.messages[0].text).toContain('Invoices');
    const fresh = await client.request('POST', '/api/support/bot/start');
    const next = await client.request('POST', `/api/support/bot/${fresh.body.sessionId}/input`, { option: 'billing' });
    expect(next.body.messages[0].text).toBe('A new text.');
  });

  it('refuses to publish a flow with an error and to save something that is not a flow', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Broken' })).body.bot.id as string;
    const saved = await admin.request('PUT', `/api/admin/support/bots/${id}/draft`, { flow: { start: 'a', nodes: { a: { type: 'message', text: 'x', next: 'ghost' } } } });
    expect(saved.status).toBe(200);
    expect(saved.body.validation.ok).toBe(false);
    expect((await admin.request('POST', `/api/admin/support/bots/${id}/publish`)).status).toBe(400);
    expect((await admin.request('PUT', `/api/admin/support/bots/${id}/draft`, { flow: { start: 'a', nodes: { a: { type: 'script' } } } })).status).toBe(400);
  });

  it('refuses to publish a flow that names a department that does not exist', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Dept' })).body.bot.id as string;
    await admin.request('PUT', `/api/admin/support/bots/${id}/draft`, { flow: { start: 'a', nodes: { a: { type: 'assign_department', departmentId: 'ghost', next: 'b' }, b: { type: 'end' } } } });
    const response = await admin.request('POST', `/api/admin/support/bots/${id}/publish`);
    expect(response.status).toBe(400);
    expect(response.body.error?.message ?? response.body.message).toContain('ghost');
  });

  it('simulates a flow without saving anything or making a ticket', async () => {
    const { client: admin } = await createAdmin(app);
    const flow: Flow = { start: 't', nodes: { t: { type: 'create_ticket', subject: 'Test', next: 'e' }, e: { type: 'end', text: 'Ticket {{ticket_number}}' } } };
    const response = await admin.request('POST', '/api/admin/support/bots/simulate', { flow, inputs: [] });
    expect(response.body.ok).toBe(true);
    expect(response.body.effects).toEqual(['Would create a ticket: Test']);
    expect(response.body.turns[0].at(-1).text).toBe('Ticket 1000');
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('exports and imports a flow, as a draft that is not running', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Original', template: true })).body.bot.id as string;
    const exported = (await admin.request('GET', `/api/admin/support/bots/${id}/export`)).body;
    const imported = await admin.request('POST', '/api/admin/support/bots/import', { name: 'Copy', flow: exported.flow });
    expect(imported.status).toBe(201);
    expect(imported.body.validation.ok).toBe(true);
    const copy = await prisma.supportBot.findUnique({ where: { id: imported.body.bot.id } });
    expect(copy?.enabled).toBe(false);
    expect(copy?.publishedVersionId).toBeNull();
    expect((await admin.request('POST', '/api/admin/support/bots/import', { name: 'Bad', flow: { start: 'x' } })).status).toBe(400);
  });

  it('lets a customer reach only their own conversation', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Helper', template: true })).body.bot.id as string;
    await admin.request('POST', `/api/admin/support/bots/${id}/publish`);
    await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: true });
    const { client: owner } = await registerAndLogin(app, 'owner3@example.com');
    const { client: stranger } = await registerAndLogin(app, 'stranger3@example.com');
    const sessionId = (await owner.request('POST', '/api/support/bot/start')).body.sessionId as string;
    expect((await stranger.request('POST', `/api/support/bot/${sessionId}/input`, { option: 'billing' })).status).toBe(404);
  });

  it('finds the conversation again after a reload, with the question it waits on, and lets the customer skip it', async () => {
    const { client: admin } = await createAdmin(app);
    const id = (await admin.request('POST', '/api/admin/support/bots', { name: 'Helper', template: true })).body.bot.id as string;
    await admin.request('POST', `/api/admin/support/bots/${id}/publish`);
    await admin.request('PUT', `/api/admin/support/bots/${id}`, { enabled: true });
    const { client } = await registerAndLogin(app, 'reload@example.com');
    const sessionId = (await client.request('POST', '/api/support/bot/start')).body.sessionId as string;
    const current = await client.request('GET', '/api/support/bot/current');
    expect(current.body.session.id).toBe(sessionId);
    expect(current.body.session.prompt.kind).toBe('buttons');
    expect(current.body.session.transcript.length).toBeGreaterThan(0);
    expect((await client.request('POST', `/api/support/bot/${sessionId}/skip`)).status).toBe(200);
    expect((await client.request('GET', '/api/support/bot/current')).body.session).toBeNull();
  });
});
