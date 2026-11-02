import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { isAutomatic, stripQuoted } from '../src/routes/internal-support-email.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
const TOKEN = 'test-inbound-token-123456';
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
});

async function verified(email: string) {
  const result = await registerAndLogin(app, email);
  await prisma.user.update({ where: { id: result.userId }, data: { emailVerifiedAt: new Date() } });
  return result;
}

async function inbound(body: Record<string, unknown>, token: string | null = TOKEN) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/internal/support/inbound',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    payload: { subject: 'Hello', text: 'Please help.', auth: { dkim: 'pass' }, ...body },
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

const mail = (email: string, id: string, extra: Record<string, unknown> = {}) => ({ from: { email }, messageId: `<${id}@mail.example.com>`, ...extra });

describe('who may hand mail to the support', () => {
  it('needs the secret of the mail system', async () => {
    expect((await inbound(mail('a@example.com', 'm1'), null)).status).toBe(401);
    expect((await inbound(mail('a@example.com', 'm1'), 'wrong-token-of-the-same-size-xx')).status).toBe(401);
  });
});

describe('a new email', () => {
  it('opens a conversation of the channel email for a verified customer', async () => {
    await verified('writer@example.com');
    const result = await inbound(mail('Writer@Example.com', 'new1', { subject: 'Re: My server is down', text: 'It stopped an hour ago.' }));
    expect(result.status).toBe(201);
    expect(result.body.created).toBe(true);
    const ticket = await prisma.ticket.findFirst({ include: { messages: true } });
    expect(ticket?.channel).toBe('EMAIL');
    expect(ticket?.subject).toBe('My server is down');
    expect(ticket?.messages[0]?.externalId).toBe('new1@mail.example.com');
    expect(ticket?.lastCustomerAt).not.toBeNull();
  });

  it('takes a message in once, whatever the number of times it is handed over', async () => {
    await verified('twice@example.com');
    expect((await inbound(mail('twice@example.com', 'dup'))).status).toBe(201);
    const again = await inbound(mail('twice@example.com', 'dup'));
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await prisma.ticket.count()).toBe(1);
    expect(await prisma.ticketMessage.count()).toBe(1);
  });

  it('refuses a sender the mail system did not vouch for, an unknown one and an unverified one', async () => {
    await verified('known@example.com');
    expect((await inbound(mail('known@example.com', 'spoof', { auth: {} }))).body.reason).toBe('sender_not_authenticated');
    expect((await inbound(mail('stranger@example.com', 's1'))).body.reason).toBe('unknown_sender');
    await registerAndLogin(app, 'unverified@example.com');
    expect((await inbound(mail('unverified@example.com', 'u1'))).body.reason).toBe('sender_not_verified');
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'support.email_ignored' } })).toBe(3);
  });

  it('does not answer programs: automatic messages and bounces open nothing', async () => {
    await verified('robot@example.com');
    expect((await inbound(mail('robot@example.com', 'a1', { headers: { 'Auto-Submitted': 'auto-replied' } }))).body.reason).toBe('automatic_message');
    expect((await inbound(mail('robot@example.com', 'a2', { headers: { Precedence: 'bulk' } }))).body.reason).toBe('automatic_message');
    expect((await inbound(mail('noreply@example.com', 'a3'))).body.reason).toBe('automatic_message');
    expect((await inbound(mail('mailer-daemon@example.com', 'a4', { subject: 'Undelivered Mail Returned to Sender' }))).body.reason).toBe('bounce');
    expect(await prisma.ticket.count()).toBe(0);
  });
});

describe('a reply by email', () => {
  it('joins the conversation named by the message it answers, and reopens a closed one', async () => {
    const { client, userId } = await verified('reply@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Thread', body: 'First.' })).body.ticket.id as string;
    // The platform's own message carries the Message-ID the mail client will answer to.
    await prisma.ticketMessage.create({ data: { ticketId: id, authorId: userId, body: 'A staff mail', internal: true, externalId: 'sent1@blipmade.com' } });
    await prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });

    const result = await inbound(mail('reply@example.com', 'r1', { inReplyTo: '<sent1@blipmade.com>', text: 'It works again, thanks.\n\nOn Mon, 2 Nov 2026, Support wrote:\n> quoted text' }));
    expect(result.status).toBe(201);
    expect(result.body.created).toBe(false);
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { messages: { orderBy: { seq: 'asc' } } } });
    expect(ticket?.status).toBe('AWAITING_STAFF');
    expect(ticket?.closedAt).toBeNull();
    expect(ticket?.messages.at(-1)?.body).toBe('It works again, thanks.');
    expect(await prisma.ticket.count()).toBe(1);
    expect(await prisma.ticketEvent.count({ where: { ticketId: id, type: 'reopened' } })).toBe(1);
  });

  it('finds the conversation by the reference in the subject, for its owner only', async () => {
    const { client } = await verified('owner@example.com');
    await verified('thief@example.com');
    const ticket = (await client.request('POST', '/api/tickets', { subject: 'Mine', body: 'First.' })).body.ticket as { id: string; number: number };
    const mine = await inbound(mail('owner@example.com', 's1', { subject: `Re: [Ticket #${ticket.number}] Mine` }));
    expect(mine.body.created).toBe(false);
    // Somebody else who knows the number does not get into it: it becomes a conversation of their own.
    const other = await inbound(mail('thief@example.com', 's2', { subject: `Re: [#${ticket.number}] Mine` }));
    expect(other.body.created).toBe(true);
    expect(await prisma.ticketMessage.count({ where: { ticketId: ticket.id } })).toBe(2);
  });

  it('shows the staff an email that could not be delivered, and nobody else', async () => {
    const { client, userId } = await verified('bounce@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Bounce', body: 'First.' })).body.ticket.id as string;
    await prisma.ticketMessage.create({ data: { ticketId: id, authorId: userId, body: 'staff mail', internal: true, externalId: 'sent2@blipmade.com' } });
    await inbound(mail('mailer-daemon@example.com', 'b1', { subject: 'Undelivered Mail Returned to Sender', inReplyTo: '<sent2@blipmade.com>' }));
    expect(await prisma.ticketEvent.count({ where: { ticketId: id, type: 'bounce' } })).toBe(1);
    expect((await client.request('GET', `/api/tickets/${id}`)).body.ticket.events.some((event: { type: string }) => event.type === 'bounce')).toBe(false);
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('GET', `/api/tickets/${id}`)).body.ticket.events.some((event: { type: string }) => event.type === 'bounce')).toBe(true);
  });
});

describe('reading a message', () => {
  it('drops the quoted part and keeps what was written', () => {
    expect(stripQuoted('Thanks!\n\n> old text\n> more\n')).toBe('Thanks!');
    expect(stripQuoted('Answer here\nOn Tue, 3 Nov 2026 at 10:00, Support <s@x.com> wrote:\n> q')).toBe('Answer here');
  });

  it('knows a program from a person', () => {
    const base = { from: { email: 'p@example.com' }, subject: 'Hi', messageId: '<a@b>', references: [], text: 'x', attachments: [], headers: {}, auth: {} };
    expect(isAutomatic(base)).toBeNull();
    expect(isAutomatic({ ...base, headers: { 'Auto-Submitted': 'no' } })).toBeNull();
    expect(isAutomatic({ ...base, headers: { 'Auto-Submitted': 'auto-generated' } })).toBe('automatic');
    expect(isAutomatic({ ...base, from: { email: 'postmaster@example.com' } })).toBe('bounce');
  });
});

describe('files that come with an email', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest of the picture')]);

  it('stores an allowed file on the message, and the owner can download it', async () => {
    const { client } = await verified('files@example.com');
    const result = await inbound(mail('files@example.com', 'f1', { attachments: [{ filename: 'screen.png', contentType: 'image/png', contentBase64: png.toString('base64') }] }));
    expect(result.status).toBe(201);
    const file = await prisma.attachment.findFirst();
    expect(file).toMatchObject({ filename: 'screen.png', contentType: 'image/png', size: png.byteLength });
    const download = await client.request('GET', `/api/tickets/${file!.ticketId}/attachments/${file!.id}`);
    expect(download.status).toBe(200);
  });

  it('refuses a program that says it is a picture, a type that is not allowed and a file that is too large, and says so', async () => {
    const { client } = await verified('badfiles@example.com');
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1);
    const result = await inbound(mail('badfiles@example.com', 'f2', {
      attachments: [
        { filename: 'cat.png', contentType: 'image/png', contentBase64: Buffer.from('MZ not a png').toString('base64') },
        { filename: 'run.exe', contentType: 'application/x-msdownload', contentBase64: Buffer.from('MZ').toString('base64') },
        { filename: 'huge.zip', contentType: 'application/zip', contentBase64: Buffer.concat([Buffer.from('PK'), big]).toString('base64') },
      ],
    }));
    expect(result.status).toBe(201);
    expect(await prisma.attachment.count()).toBe(0);
    const ticket = await prisma.ticket.findFirstOrThrow();
    const events = (await client.request('GET', `/api/tickets/${ticket.id}`)).body.ticket.events as { message: string }[];
    expect(events.filter((event) => event.message.startsWith('An attachment was not accepted'))).toHaveLength(3);
  });

  it('adds the file of a reply to that reply', async () => {
    const { client } = await verified('replyfile@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Thread files', body: 'First.' })).body.ticket.id as string;
    const number = (await prisma.ticket.findUniqueOrThrow({ where: { id } })).number;
    await inbound(mail('replyfile@example.com', 'f3', { subject: `Re: [#${number}] Thread files`, attachments: [{ filename: 'log.txt', contentType: 'text/plain', contentBase64: Buffer.from('the log').toString('base64') }] }));
    const file = await prisma.attachment.findFirstOrThrow();
    const message = await prisma.ticketMessage.findUniqueOrThrow({ where: { id: file.ticketMessageId } });
    expect(message.externalId).toBe('f3@mail.example.com');
    expect(file.ticketId).toBe(id);
  });
});
