import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeSupportEvents, visibleTo, type SupportEvent } from '../src/services/support-events.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD, type TestClient } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let base = '';

beforeAll(async () => {
  app = await getApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterAll(async () => {
  await closeSupportEvents();
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
});

const cookieOf = (client: TestClient) => [...client.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');

/** Opens a stream and collects what arrives for a while. */
async function listen(client: TestClient, path: string, ms: number, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const response = await fetch(`${base}${path}`, { headers: { cookie: cookieOf(client), ...headers }, signal: controller.signal });
  let text = '';
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
  } catch {
    /* the timer ended the stream */
  }
  clearTimeout(timer);
  return { status: response.status, text };
}

const event = (overrides: Partial<SupportEvent> = {}): SupportEvent => ({ type: 'message', ticketId: 't1', ownerId: 'u1', internal: false, at: new Date().toISOString(), ...overrides });

describe('support stream: who hears what', () => {
  it('lets a customer hear their own public events only', () => {
    const me = { userId: 'u1', staff: false };
    expect(visibleTo(event(), me)).toBe(true);
    expect(visibleTo(event({ internal: true }), me)).toBe(false);
    expect(visibleTo(event({ ownerId: 'u2' }), me)).toBe(false);
  });

  it('lets staff hear everything', () => {
    expect(visibleTo(event({ internal: true, ownerId: 'u9' }), { userId: 's1', staff: true })).toBe(true);
  });
});

describe('support stream: over HTTP', () => {
  it('refuses a visitor without a session and a customer on the staff stream', async () => {
    const anonymous = await fetch(`${base}/api/support/stream`);
    expect(anonymous.status).toBe(401);
    const { client } = await registerAndLogin(app, 'plain@example.com');
    const asCustomer = await fetch(`${base}/api/admin/support/stream`, { headers: { cookie: cookieOf(client) } });
    expect(asCustomer.status).toBe(403);
  });

  it('delivers a staff reply to the customer and an internal note only to staff', async () => {
    const { client } = await registerAndLogin(app, 'live@example.com');
    const created = await client.request('POST', '/api/tickets', { subject: 'Live check', body: 'Hello.' });
    const id = created.body.ticket.id as string;
    const { client: admin } = await createAdmin(app);

    const customerStream = listen(client, '/api/support/stream', 1500);
    const staffStream = listen(admin, '/api/admin/support/stream', 1500);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Public answer.' });
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Staff only.', internal: true });

    const [customer, staff] = await Promise.all([customerStream, staffStream]);
    expect(customer.text).toContain('event: hello');
    expect(customer.text.match(/event: message/g)?.length).toBe(1);
    expect(staff.text.match(/event: message/g)?.length).toBe(2);
    expect(customer.text).not.toContain('"internal"');
  });

  it('does not tell a customer about the conversation of another customer', async () => {
    const { client: owner } = await registerAndLogin(app, 'owner@example.com');
    const { client: stranger } = await registerAndLogin(app, 'stranger@example.com');
    const id = (await owner.request('POST', '/api/tickets', { subject: 'Mine', body: 'Private.' })).body.ticket.id as string;
    const strangerStream = listen(stranger, '/api/support/stream', 1200);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await owner.request('POST', `/api/tickets/${id}/replies`, { body: 'More.' });
    const heard = await strangerStream;
    expect(heard.text).not.toContain(id);
    expect(heard.text).not.toContain('event: message');
  });

  it('sends the messages written while the connection was down (Last-Event-ID)', async () => {
    const { client } = await registerAndLogin(app, 'resume@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Resume', body: 'First.' })).body.ticket.id as string;
    const { client: admin } = await createAdmin(app);
    const first = await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'One.' });
    expect(first.status).toBe(201);
    const last = (await prisma.ticketMessage.findFirst({ where: { ticketId: id }, orderBy: { seq: 'asc' } }))!.seq;
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Two.' });
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Hidden.', internal: true });

    const resumed = await listen(client, '/api/support/stream', 900, { 'last-event-id': String(last) });
    // "One." and "Two." were written after the first message; the internal note is not for the customer.
    expect(resumed.text.match(/event: message/g)?.length).toBe(2);
    expect(resumed.text).toContain(`id: ${last + 1n}`);
  });

  it('shows a staff member as present only while a connection is alive', async () => {
    const { client: admin } = await createAdmin(app);
    await listen(admin, '/api/admin/support/stream', 600);
    const row = await prisma.supportPresence.findFirst();
    expect(row?.status).toBe('AVAILABLE');
    const list = await admin.request('GET', '/api/admin/support/presence');
    expect(list.body.staff).toHaveLength(1);
    await prisma.supportPresence.updateMany({ data: { lastSeenAt: new Date(Date.now() - 5 * 60_000) } });
    const stale = await admin.request('GET', '/api/admin/support/presence');
    expect(stale.body.staff[0].status).toBe('OFFLINE');
    expect(stale.body.staff[0].chosen).toBe('AVAILABLE');
  });
});

describe('support stream: the order of the greeting', () => {
  it('records the staff member as present before it says hello', async () => {
    const { client: admin } = await createAdmin(app);
    const heard = await listen(admin, '/api/admin/support/stream', 700);
    expect(heard.text).toContain('event: hello');
    // The row exists by the time the greeting went out: a client that reads the presence after "hello" sees itself.
    const row = await prisma.supportPresence.findFirst();
    expect(row?.status).toBe('AVAILABLE');
  });
});

describe('support stream: an administrator without a row of staff', () => {
  it('is recorded as present too: an administrator holds every permission without a row of their own', async () => {
    const { hashPassword } = await import('../src/lib/password.js');
    const user = await prisma.user.create({ data: { email: 'bare-admin@blipmade.test', passwordHash: await hashPassword(VALID_PASSWORD), role: 'ADMIN', firstName: 'Bare', lastName: 'Admin', emailVerifiedAt: new Date() } });
    expect(await prisma.staffMember.count({ where: { userId: user.id } })).toBe(0);
    const client = makeClient(app);
    expect((await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD })).status).toBe(200);
    await listen(client, '/api/admin/support/stream', 600);
    expect((await prisma.supportPresence.findUnique({ where: { userId: user.id } }))?.status).toBe('AVAILABLE');
    // And the choice of a state works for them as well.
    expect((await client.request('PUT', '/api/admin/support/presence', { status: 'BUSY' })).status).toBe(200);
    const list = (await client.request('GET', '/api/admin/support/presence')).body.staff as { userId: string; chosen: string }[];
    expect(list.find((row) => row.userId === user.id)?.chosen).toBe('BUSY');
  });
});
