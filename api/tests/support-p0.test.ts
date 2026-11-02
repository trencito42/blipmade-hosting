import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase, type TestClient } from './helpers.js';
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

async function openTicket(client: TestClient): Promise<string> {
  const created = await client.request('POST', '/api/tickets', { subject: 'Support P0 check', body: 'First message.' });
  return created.body.ticket.id as string;
}

function multipart(filename: string, type: string, content: Buffer) {
  const boundary = '----p0boundary';
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, content, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('support P0: replies', () => {
  it('reopens a closed ticket when the customer replies (F1)', async () => {
    const { client } = await registerAndLogin(app, 'reopen@example.com');
    const id = await openTicket(client);
    await client.request('POST', `/api/tickets/${id}/close`);
    expect((await prisma.ticket.findUnique({ where: { id } }))?.closedAt).not.toBeNull();

    const reply = await client.request('POST', `/api/tickets/${id}/replies`, { body: 'It happened again.' });
    expect(reply.status).toBe(201);

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    expect(ticket?.status).toBe('AWAITING_STAFF');
    expect(ticket?.closedAt).toBeNull();
    expect(await prisma.ticketEvent.count({ where: { ticketId: id, type: 'reopened' } })).toBe(1);
  });

  it('keeps a closed ticket closed when staff add an internal note', async () => {
    const { client } = await registerAndLogin(app, 'noteclosed@example.com');
    const id = await openTicket(client);
    await client.request('POST', `/api/tickets/${id}/close`);
    const { client: admin } = await createAdmin(app);
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Staff only.', internal: true });
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    expect(ticket?.status).toBe('CLOSED');
    expect(ticket?.closedAt).not.toBeNull();
  });

  it('writes one message for a retried reply with the same key (F3)', async () => {
    const { client } = await registerAndLogin(app, 'retry@example.com');
    const id = await openTicket(client);
    const headers = { 'idempotency-key': 'retry-key-0001' };
    const first = await client.request('POST', `/api/tickets/${id}/replies`, { body: 'Once.' }, { headers });
    const second = await client.request('POST', `/api/tickets/${id}/replies`, { body: 'Once.' }, { headers });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.message.id).toBe(first.body.message.id);
    expect(await prisma.ticketMessage.count({ where: { ticketId: id } })).toBe(2);
  });

  it('refuses a malformed idempotency key', async () => {
    const { client } = await registerAndLogin(app, 'badkey@example.com');
    const id = await openTicket(client);
    const response = await client.request('POST', `/api/tickets/${id}/replies`, { body: 'x' }, { headers: { 'idempotency-key': 'no spaces allowed' } });
    expect(response.status).toBe(400);
  });
});

describe('support P0: what the customer sees', () => {
  it('hides the internal events from the customer and shows them to staff (F5)', async () => {
    const { client } = await registerAndLogin(app, 'events@example.com');
    const id = await openTicket(client);
    const { client: admin } = await createAdmin(app);
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Staff only.', internal: true });

    const types = (view: { body: { ticket: { events: { type: string }[] } } }) => view.body.ticket.events.map((event) => event.type);
    expect(types(await client.request('GET', `/api/tickets/${id}`))).not.toContain('note');
    expect(types(await admin.request('GET', `/api/tickets/${id}`))).toContain('note');
  });

  it('hides the old internal-note events that have the type "reply" too', async () => {
    const { client } = await registerAndLogin(app, 'oldevents@example.com');
    const id = await openTicket(client);
    await prisma.ticketEvent.create({ data: { ticketId: id, type: 'reply', message: 'Internal note added.' } });
    const view = await client.request('GET', `/api/tickets/${id}`);
    expect(view.body.ticket.events.some((event: { message: string }) => event.message === 'Internal note added.')).toBe(false);
  });

  it('sends the newest messages and says there are older ones (F8)', async () => {
    const { client, userId } = await registerAndLogin(app, 'long@example.com');
    const id = await openTicket(client);
    const base = Date.now();
    await prisma.ticketMessage.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({ ticketId: id, authorId: userId, body: `m${index}`, createdAt: new Date(base + (index + 1) * 1000) })),
    });
    const first = await client.request('GET', `/api/tickets/${id}`);
    expect(first.body.ticket.messages).toHaveLength(200);
    expect(first.body.ticket.hasMoreMessages).toBe(true);
    expect(first.body.ticket.messages.at(-1).body).toBe('m204');

    const oldest = first.body.ticket.messages[0].id as string;
    const older = await client.request('GET', `/api/tickets/${id}?before=${oldest}`);
    expect(older.body.ticket.messages).toHaveLength(6);
    expect(older.body.ticket.hasMoreMessages).toBe(false);
  });

  it('does not count an internal note in the messages of a customer', async () => {
    const { client } = await registerAndLogin(app, 'count@example.com');
    const id = await openTicket(client);
    const { client: admin } = await createAdmin(app);
    await admin.request('POST', `/api/tickets/${id}/replies`, { body: 'Hidden.', internal: true });
    const view = await client.request('GET', `/api/tickets/${id}`);
    expect(view.body.ticket.messages).toHaveLength(1);
  });
});

describe('support P0: attachments', () => {
  it('refuses a program that says it is a picture (F4)', async () => {
    const { client } = await registerAndLogin(app, 'fake@example.com');
    const id = await openTicket(client);
    const { payload, headers } = multipart('cat.png', 'image/png', Buffer.from('MZ\x90\x00 this is not a png'));
    const response = await client.request('POST', `/api/tickets/${id}/attachments`, payload, { headers });
    expect(response.status).toBe(400);
    expect(await prisma.attachment.count({ where: { ticketId: id } })).toBe(0);
    expect(await prisma.ticketMessage.count({ where: { ticketId: id } })).toBe(1);
  });

  it('refuses binary bytes in a text file', async () => {
    const { client } = await registerAndLogin(app, 'bin@example.com');
    const id = await openTicket(client);
    const { payload, headers } = multipart('log.txt', 'text/plain', Buffer.from([0x68, 0x69, 0x00, 0x01]));
    expect((await client.request('POST', `/api/tickets/${id}/attachments`, payload, { headers })).status).toBe(400);
  });

  it('stores a real png and lets the owner download it', async () => {
    const { client } = await registerAndLogin(app, 'png@example.com');
    const id = await openTicket(client);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
    const { payload, headers } = multipart('ok.png', 'image/png', png);
    const uploaded = await client.request('POST', `/api/tickets/${id}/attachments`, payload, { headers });
    expect(uploaded.status).toBe(201);
    const download = await client.request('GET', `/api/tickets/${id}/attachments/${uploaded.body.attachment.id}`);
    expect(download.status).toBe(200);
  });

  it('does not give the file of an internal note to the customer (F6)', async () => {
    const { client } = await registerAndLogin(app, 'internalfile@example.com');
    const id = await openTicket(client);
    const { client: admin, userId: staffId } = await createAdmin(app);
    const note = await prisma.ticketMessage.create({ data: { ticketId: id, authorId: staffId, body: 'note', internal: true } });
    const file = await prisma.attachment.create({
      data: { ticketMessageId: note.id, ticketId: id, filename: 'secret.txt', contentType: 'text/plain', size: 1, storageKey: `${id}/none/secret.txt`, sha256: 'x' },
    });
    expect((await client.request('GET', `/api/tickets/${id}/attachments/${file.id}`)).status).toBe(404);
    // Staff pass the check; the file itself was never written, so the read fails after it, not before.
    expect((await admin.request('GET', `/api/tickets/${id}/attachments/${file.id}`)).status).not.toBe(404);
  });
});

describe('support P0: two operators (F9)', () => {
  it('refuses a status change made on a ticket that moved since it was read', async () => {
    const { client } = await registerAndLogin(app, 'lock@example.com');
    const id = await openTicket(client);
    const { client: admin } = await createAdmin(app);
    const read = await admin.request('GET', `/api/tickets/${id}`);
    const readAt = read.body.ticket.updatedAt as string;

    await client.request('POST', `/api/tickets/${id}/replies`, { body: 'A new message.' });

    const stale = await admin.request('POST', `/api/tickets/${id}/status`, { status: 'ON_HOLD', ifUpdatedAt: readAt });
    expect(stale.status).toBe(409);
    expect((await prisma.ticket.findUnique({ where: { id } }))?.status).toBe('AWAITING_STAFF');

    const fresh = (await admin.request('GET', `/api/tickets/${id}`)).body.ticket.updatedAt as string;
    expect((await admin.request('POST', `/api/tickets/${id}/status`, { status: 'ON_HOLD', ifUpdatedAt: fresh })).status).toBe(200);
  });

  it('still changes the status when the client sends no moment (compatible)', async () => {
    const { client } = await registerAndLogin(app, 'nolock@example.com');
    const id = await openTicket(client);
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('POST', `/api/tickets/${id}/status`, { status: 'ON_HOLD' })).status).toBe(200);
  });
});
