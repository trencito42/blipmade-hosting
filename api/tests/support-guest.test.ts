import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { sweepGuests } from '../src/services/support-guest.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD, type TestClient } from './helpers.js';
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
  await prisma.setting.deleteMany({ where: { key: 'support.guest' } });
});

async function enable(admin: TestClient, extra: Record<string, unknown> = {}) {
  expect((await admin.request('PUT', '/api/admin/support/guest', { enabled: true, retentionDays: 30, ...extra })).status).toBe(200);
}
const start = (client: TestClient, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  client.request('POST', '/api/support/guest/start', { name: 'Visitor', message: 'Is the node in Frankfurt?', consent: true, ...extra }, { headers });

describe('the switch', () => {
  it('is off until an operator turns it on', async () => {
    const guest = makeClient(app);
    expect((await guest.request('GET', '/api/support/guest/config')).body).toEqual({ enabled: false, notice: null });
    expect((await start(guest)).status).toBe(404);
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const config = (await guest.request('GET', '/api/support/guest/config')).body;
    expect(config.enabled).toBe(true);
    expect(config.notice).toContain('do not write passwords');
  });

  it('lets only settings.write change it', async () => {
    const { client } = await registerAndLogin(app, 'plain@example.com');
    expect((await client.request('PUT', '/api/admin/support/guest', { enabled: true })).status).toBe(403);
  });
});

describe('a visitor starts a chat', () => {
  it('needs the consent, and stores nothing without it', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    expect((await start(guest, { consent: false })).status).toBe(400);
    expect((await guest.request('POST', '/api/support/guest/start', { name: 'V', message: 'Hi' })).status).toBe(400);
    expect(await prisma.user.count({ where: { isGuest: true } })).toBe(0);
  });

  it('makes a guest and a conversation, and takes the next message into the same one', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    const first = await start(guest, { contact: 'visitor@example.org' });
    expect(first.status).toBe(201);
    expect(first.body.mode).toBe('ticket'); // nobody is connected
    const user = await prisma.user.findFirstOrThrow({ where: { isGuest: true } });
    expect(user.email.endsWith('@guest.invalid')).toBe(true);
    expect(user.emailVerifiedAt).toBeNull();
    const ticket = await prisma.ticket.findFirstOrThrow({ include: { messages: true } });
    expect(ticket.messages[0]!.body).toContain('(not verified): visitor@example.org');

    const again = await start(guest, { message: 'And in Helsinki?' });
    expect(again.status).toBe(200);
    expect(again.body.resumed).toBe(true);
    expect(await prisma.user.count({ where: { isGuest: true } })).toBe(1);
    expect(await prisma.ticketMessage.count({ where: { ticketId: ticket.id } })).toBe(2);
  });

  it('opens a live chat when a person is connected', async () => {
    const { client: admin, userId } = await createAdmin(app);
    await enable(admin);
    await prisma.supportPresence.upsert({ where: { userId }, create: { userId, status: 'AVAILABLE' }, update: { status: 'AVAILABLE', lastSeenAt: new Date() } });
    const guest = makeClient(app);
    const started = await start(guest);
    expect(started.body.mode).toBe('chat');
    expect((await prisma.ticket.findFirstOrThrow()).channel).toBe('CHAT');
  });

  it('refuses a request from another site, and the start past the limit of one address in an hour (a refused one counts)', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    expect((await start(guest, {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect(await prisma.user.count({ where: { isGuest: true } })).toBe(0);
    for (let i = 0; i < 4; i++) expect((await start(makeClient(app), { name: `V${i}` })).status).toBe(201);
    expect((await start(makeClient(app))).status).toBe(429);
  });
});

describe('the conversation of a guest', () => {
  it('shows the guest what the staff says in public, and never a note', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    const ticket = await prisma.ticket.findFirstOrThrow();
    await admin.request('POST', `/api/tickets/${ticket.id}/replies`, { body: 'Yes, Frankfurt.' });
    await admin.request('POST', `/api/tickets/${ticket.id}/replies`, { body: 'Staff note.', internal: true });
    const thread = (await guest.request('GET', '/api/support/guest/thread')).body;
    expect(thread.messages.map((m: { from: string; body: string }) => `${m.from}:${m.body}`)).toEqual(['you:Is the node in Frankfurt?', 'support:Yes, Frankfurt.']);
    // No email is ever written for a guest.
    const guestUser = await prisma.user.findFirstOrThrow({ where: { isGuest: true } });
    expect(await prisma.notification.count({ where: { userId: guestUser.id } })).toBe(0);
  });

  it('lets a guest write until the chat is closed, and then not', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    expect((await guest.request('POST', '/api/support/guest/messages', { body: 'One more thing.' })).status).toBe(201);
    expect((await guest.request('POST', '/api/support/guest/end')).status).toBe(200);
    expect((await guest.request('POST', '/api/support/guest/messages', { body: 'Hello?' })).status).toBe(409);
  });

  it('is the chat and nothing else: a guest is not a customer of the platform', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    const ticket = await prisma.ticket.findFirstOrThrow();
    expect((await guest.request('GET', `/api/tickets/${ticket.id}`)).status).toBe(401);
    expect((await guest.request('GET', '/api/support/chat/current')).status).toBe(401);
    expect((await guest.request('GET', '/api/instances')).status).toBe(401);
    // A signed in customer without the credential of a guest is not a guest.
    const { client: customer } = await registerAndLogin(app, 'customer@example.com');
    expect((await customer.request('GET', '/api/support/guest/thread')).status).toBe(401);
  });

  it('keeps one guest out of the chat of another', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const one = makeClient(app);
    const two = makeClient(app);
    await start(one, { name: 'One', message: 'I am one.' });
    await start(two, { name: 'Two', message: 'I am two.' });
    const thread = (await two.request('GET', '/api/support/guest/thread')).body;
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].body).toBe('I am two.');
  });

  it('stops working when the credential expires, and after a week whatever the use', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    expect((await guest.request('GET', '/api/support/guest/thread')).status).toBe(200);
    await prisma.supportGuestToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await guest.request('GET', '/api/support/guest/thread')).status).toBe(401);
    await prisma.supportGuestToken.updateMany({ data: { expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect((await guest.request('GET', '/api/support/guest/thread')).status).toBe(401);
  });

  it('stores only the hash of the credential', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    const cookie = guest.cookies.get('bm_guest')!;
    const row = await prisma.supportGuestToken.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(cookie);
    expect(row.tokenHash).toHaveLength(64);
  });
});

describe('what the staff sees', () => {
  it('"Guest", not an address, in the queue and the context; and guests are not listed as customers', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    const ticket = await prisma.ticket.findFirstOrThrow();
    const queue = (await admin.request('GET', '/api/admin/support/conversations')).body.conversations[0];
    expect(queue.customer.email).toBe('Guest (not signed in)');
    expect(JSON.stringify(queue)).not.toContain('guest.invalid');
    const context = (await admin.request('GET', `/api/admin/support/conversations/${ticket.id}/context`)).body;
    expect(JSON.stringify(context)).not.toContain('guest.invalid');
    const customers = (await admin.request('GET', '/api/admin/customers')).body;
    expect(JSON.stringify(customers)).not.toContain('guest.invalid');
  });
});

describe('signing in afterwards', () => {
  it('moves the conversation to the account, and the guest ceases to exist', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const visitor = makeClient(app);
    await start(visitor);
    // The same browser then registers and signs in.
    const registered = await visitor.request('POST', '/api/auth/register', { email: 'joined@example.com', password: VALID_PASSWORD, firstName: 'Joined', lastName: 'Visitor' });
    expect(registered.status).toBe(201);
    const claimed = await visitor.request('POST', '/api/support/guest/claim');
    expect(claimed.status).toBe(200);
    expect(claimed.body.claimed).toBe(1);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'joined@example.com' } });
    expect((await prisma.ticket.findFirstOrThrow()).userId).toBe(owner.id);
    expect(await prisma.user.count({ where: { isGuest: true } })).toBe(0);
    // The conversation is now an ordinary one of the account.
    const list = (await visitor.request('GET', '/api/tickets')).body.tickets;
    expect(list).toHaveLength(1);
  });

  it('needs both the session and the credential of a guest', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin);
    const guest = makeClient(app);
    await start(guest);
    expect((await guest.request('POST', '/api/support/guest/claim')).status).toBe(401); // no session
    const { client: customer } = await registerAndLogin(app, 'nocookie@example.com');
    expect((await customer.request('POST', '/api/support/guest/claim')).status).toBe(401); // no credential of a guest
  });
});

describe('retention', () => {
  it('removes the guests that did not come back, with what they wrote, and keeps the ones that did', async () => {
    const { client: admin } = await createAdmin(app);
    await enable(admin, { retentionDays: 30 });
    const gone = makeClient(app);
    const stays = makeClient(app);
    await start(gone, { name: 'Gone' });
    await start(stays, { name: 'Stays' });
    const goneUser = await prisma.user.findFirstOrThrow({ where: { firstName: 'Gone' } });
    const old = new Date(Date.now() - 45 * 86_400_000);
    await prisma.supportGuestToken.deleteMany({ where: { userId: goneUser.id } });
    await prisma.user.update({ where: { id: goneUser.id }, data: { updatedAt: old } });
    await prisma.ticket.updateMany({ where: { userId: goneUser.id }, data: { updatedAt: old } });
    const result = await sweepGuests();
    expect(result.guests).toBe(1);
    expect(await prisma.user.count({ where: { isGuest: true } })).toBe(1);
    expect(await prisma.ticket.count({ where: { userId: goneUser.id } })).toBe(0);
    expect((await stays.request('GET', '/api/support/guest/thread')).status).toBe(200);
  });
});
