import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { visibleTo } from '../src/services/support-events.js';
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

async function staffHere(departmentId?: string, ago = 0) {
  const { client, userId } = await createAdmin(app, `agent${Math.random().toString(36).slice(2, 7)}@blipmade.test`);
  await prisma.supportPresence.upsert({
    where: { userId },
    create: { userId, status: 'AVAILABLE', lastSeenAt: new Date(Date.now() - ago) },
    update: { status: 'AVAILABLE', lastSeenAt: new Date(Date.now() - ago) },
  });
  if (departmentId) await prisma.supportDepartmentMember.create({ data: { departmentId, userId } });
  return { client, userId };
}

describe('starting a chat', () => {
  it('saves a ticket and says so when nobody is here', async () => {
    const { client } = await registerAndLogin(app, 'nobody@example.com');
    expect((await client.request('GET', '/api/support/availability')).body.available).toBe(false);
    const started = await client.request('POST', '/api/support/chat', { message: 'Anybody there?' });
    expect(started.status).toBe(201);
    expect(started.body.mode).toBe('ticket');
    const ticket = await prisma.ticket.findUnique({ where: { id: started.body.conversation.id }, include: { messages: true } });
    expect(ticket?.channel).toBe('TICKET');
    expect(ticket?.messages).toHaveLength(1);
  });

  it('opens a chat when a person is connected, and a second message joins the same chat', async () => {
    await staffHere();
    const { client } = await registerAndLogin(app, 'chat@example.com');
    expect((await client.request('GET', '/api/support/availability')).body.available).toBe(true);
    const first = await client.request('POST', '/api/support/chat', { message: 'Hello.' });
    expect(first.body.mode).toBe('chat');
    const second = await client.request('POST', '/api/support/chat', { message: 'Are you there?' });
    expect(second.status).toBe(200);
    expect(second.body.resumed).toBe(true);
    expect(second.body.conversation.id).toBe(first.body.conversation.id);
    expect(await prisma.ticketMessage.count({ where: { ticketId: first.body.conversation.id } })).toBe(2);
    expect((await client.request('GET', '/api/support/chat/current')).body.conversation.id).toBe(first.body.conversation.id);
  });

  it('does not count a person whose connection went quiet', async () => {
    await staffHere(undefined, 5 * 60_000);
    const { client } = await registerAndLogin(app, 'quiet@example.com');
    expect((await client.request('GET', '/api/support/availability')).body.available).toBe(false);
  });

  it('asks the department that was chosen', async () => {
    const { client: admin } = await createAdmin(app);
    const billing = (await admin.request('POST', '/api/admin/support/departments', { name: 'Billing' })).body.department;
    const technical = (await admin.request('POST', '/api/admin/support/departments', { name: 'Technical' })).body.department;
    await staffHere(technical.id);
    const { client } = await registerAndLogin(app, 'dept@example.com');
    expect((await client.request('GET', `/api/support/availability?departmentId=${technical.id}`)).body.available).toBe(true);
    expect((await client.request('GET', `/api/support/availability?departmentId=${billing.id}`)).body.available).toBe(false);
  });

  it('refuses a department that is hidden or does not exist', async () => {
    const { client: admin } = await createAdmin(app);
    const hidden = (await admin.request('POST', '/api/admin/support/departments', { name: 'Hidden', visible: false })).body.department;
    const { client } = await registerAndLogin(app, 'hid@example.com');
    expect((await client.request('POST', '/api/support/chat', { message: 'Hi', departmentId: hidden.id })).status).toBe(400);
  });

  it('is closed to a visitor without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/support/availability' });
    expect(response.statusCode).toBe(401);
  });
});

describe('after the chat started', () => {
  it('turns into a ticket, only for its owner', async () => {
    await staffHere();
    const { client } = await registerAndLogin(app, 'convert@example.com');
    const { client: stranger } = await registerAndLogin(app, 'stranger2@example.com');
    const id = (await client.request('POST', '/api/support/chat', { message: 'Hello.' })).body.conversation.id as string;
    expect((await stranger.request('POST', `/api/support/chat/${id}/convert`)).status).toBe(404);
    expect((await client.request('POST', `/api/support/chat/${id}/convert`)).status).toBe(200);
    expect((await prisma.ticket.findUnique({ where: { id } }))?.channel).toBe('TICKET');
    expect((await client.request('GET', '/api/support/chat/current')).body.conversation).toBeNull();
  });

  it('takes one rating from the owner', async () => {
    const { client } = await registerAndLogin(app, 'rate@example.com');
    const { client: stranger } = await registerAndLogin(app, 'rate2@example.com');
    const id = (await client.request('POST', '/api/support/chat', { message: 'Hello.' })).body.conversation.id as string;
    expect((await stranger.request('POST', `/api/support/chat/${id}/rating`, { rating: 5 })).status).toBe(404);
    expect((await client.request('POST', `/api/support/chat/${id}/rating`, { rating: 7 })).status).toBe(400);
    expect((await client.request('POST', `/api/support/chat/${id}/rating`, { rating: 4, comment: 'Quick.' })).status).toBe(200);
    expect((await client.request('POST', `/api/support/chat/${id}/rating`, { rating: 5 })).status).toBe(400);
  });

  it('lets a person hear "typing" from the other side only', () => {
    const customerTyping = { type: 'typing' as const, ticketId: 't', ownerId: 'u1', internal: false, actor: 'customer' as const, at: '' };
    const staffTyping = { ...customerTyping, actor: 'staff' as const };
    expect(visibleTo(customerTyping, { userId: 'u1', staff: false })).toBe(false);
    expect(visibleTo(staffTyping, { userId: 'u1', staff: false })).toBe(true);
    expect(visibleTo(customerTyping, { userId: 's1', staff: true })).toBe(true);
  });
});

describe('the moments of a conversation', () => {
  it('counts the first answer of a person, not a note and not the customer', async () => {
    const { client } = await registerAndLogin(app, 'moments@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Moments', body: 'Question.' })).body.ticket.id as string;
    const { client: admin } = await createAdmin(app);
    const read = async () => (await prisma.ticket.findUnique({ where: { id } }))!;

    expect((await read()).lastCustomerAt).not.toBeNull();
    expect((await read()).firstHumanResponseAt).toBeNull();
    await client.request('POST', `/api/tickets/${id}/replies`, { body: 'More.' });
    expect((await read()).firstHumanResponseAt).toBeNull();
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Staff note.', internal: true });
    expect((await read()).firstHumanResponseAt).toBeNull();
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'An answer.' });
    const answered = await read();
    expect(answered.firstHumanResponseAt).not.toBeNull();
    expect(answered.lastStaffAt).not.toBeNull();
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'A second answer.' });
    expect((await read()).firstHumanResponseAt?.getTime()).toBe(answered.firstHumanResponseAt?.getTime());
  });
});

describe('a chat is not a ticket of the customer', () => {
  it('is left out of the list of tickets, still opens in the chat, and joins the list when it is turned into a ticket', async () => {
    await staffHere();
    const { client } = await registerAndLogin(app, 'list@example.com');
    const chat = (await client.request('POST', '/api/support/chat', { message: 'A live question.' })).body.conversation.id as string;
    expect((await client.request('GET', '/api/tickets')).body.tickets).toHaveLength(0);
    // The chat is still read through the ticket route, which the widget uses.
    expect((await client.request('GET', `/api/tickets/${chat}`)).status).toBe(200);
    await client.request('POST', `/api/support/chat/${chat}/convert`);
    expect((await client.request('GET', '/api/tickets')).body.tickets.map((t: { id: string }) => t.id)).toEqual([chat]);
  });

  it('lists a message that was left while nobody was online: that one is a ticket', async () => {
    const { client } = await registerAndLogin(app, 'left@example.com');
    await client.request('POST', '/api/support/chat', { message: 'Anybody?' });
    expect((await client.request('GET', '/api/tickets')).body.tickets).toHaveLength(1);
  });

  it('does not tell the customer that their chat was "closed" as a ticket when they end it', async () => {
    await staffHere();
    const { client, userId } = await registerAndLogin(app, 'endchat@example.com');
    const chat = (await client.request('POST', '/api/support/chat', { message: 'Hello.' })).body.conversation.id as string;
    const before = await prisma.notification.count({ where: { userId } });
    expect((await client.request('POST', `/api/tickets/${chat}/close`)).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId } })).toBe(before);
    const events = (await client.request('GET', `/api/tickets/${chat}`)).body.ticket.events as { message: string }[];
    expect(events.some((event) => event.message === 'The customer ended the chat.')).toBe(true);
  });
});
