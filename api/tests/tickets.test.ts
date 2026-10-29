import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
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

describe('support tickets', () => {
  it('creates a ticket with a first message', async () => {
    const { client } = await registerAndLogin(app, 'asker@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'The container will not start',
      category: 'TECHNICAL',
      priority: 'NORMAL',
      body: 'It stops after a few seconds.',
    });

    expect(response.status).toBe(201);
    expect(response.body.ticket.subject).toBe('The container will not start');
    expect(response.body.ticket.status).toBe('OPEN');
    expect(response.body.ticket.messageCount).toBe(1);
  });

  it('adds a customer reply and moves the ticket to the staff queue', async () => {
    const { client } = await registerAndLogin(app, 'asker2@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about billing',
      body: 'How is this billed?',
    });
    const ticketId = created.body.ticket.id as string;

    const reply = await client.request('POST', `/api/tickets/${ticketId}/replies`, {
      body: 'One more detail: I was charged twice.',
    });
    expect(reply.status).toBe(201);

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(ticket?.status).toBe('AWAITING_STAFF');
    expect(await prisma.ticketMessage.count({ where: { ticketId } })).toBe(2);
  });

  it('keeps an internal note away from the customer', async () => {
    const { client: customer } = await registerAndLogin(app, 'asker3@example.com');
    const created = await customer.request('POST', '/api/tickets', {
      subject: 'Internal note test',
      body: 'Visible message.',
    });
    const ticketId = created.body.ticket.id as string;

    const { client: admin } = await createAdmin(app);
    const note = await admin.request('POST', `/api/tickets/${ticketId}/replies`, {
      body: 'This note is for staff only.',
      internal: true,
    });
    expect(note.status).toBe(201);

    const customerView = await customer.request('GET', `/api/tickets/${ticketId}`);
    const bodies = customerView.body.ticket.messages.map((message: { body: string }) => message.body);
    expect(bodies).toContain('Visible message.');
    expect(bodies).not.toContain('This note is for staff only.');

    const adminView = await admin.request('GET', `/api/tickets/${ticketId}`);
    const adminBodies = adminView.body.ticket.messages.map((message: { body: string }) => message.body);
    expect(adminBodies).toContain('This note is for staff only.');
  });

  it('refuses an internal note from a customer', async () => {
    const { client } = await registerAndLogin(app, 'asker4@example.com');
    const created = await client.request('POST', '/api/tickets', { subject: 'Note attempt', body: 'Hello' });
    const ticketId = created.body.ticket.id as string;

    const response = await client.request('POST', `/api/tickets/${ticketId}/replies`, {
      body: 'Trying to hide something.',
      internal: true,
    });
    expect(response.status).toBe(403);
  });

  it('records a status change in the ticket history', async () => {
    const { client: customer } = await registerAndLogin(app, 'asker5@example.com');
    const created = await customer.request('POST', '/api/tickets', { subject: 'Status test', body: 'Hello' });
    const ticketId = created.body.ticket.id as string;

    const { client: admin } = await createAdmin(app);
    const response = await admin.request('POST', `/api/tickets/${ticketId}/status`, { status: 'ON_HOLD' });
    expect(response.status).toBe(200);
    expect(response.body.ticket.status).toBe('ON_HOLD');

    const events = await prisma.ticketEvent.findMany({ where: { ticketId } });
    expect(events.some((event) => event.type === 'status')).toBe(true);
  });

  it('lets the owner close a ticket but refuses another customer', async () => {
    const { client: owner } = await registerAndLogin(app, 'closer@example.com');
    const { client: stranger } = await registerAndLogin(app, 'stranger@example.com');
    const created = await owner.request('POST', '/api/tickets', { subject: 'Resolved issue', body: 'It works now.' });
    const ticketId = created.body.ticket.id as string;

    expect((await stranger.request('POST', `/api/tickets/${ticketId}/close`)).status).toBe(404);
    expect((await owner.request('POST', `/api/tickets/${ticketId}/status`, { status: 'CLOSED' })).status).toBe(403);
    const closed = await owner.request('POST', `/api/tickets/${ticketId}/close`);
    expect(closed.status).toBe(200);
    expect((await prisma.ticket.findUnique({ where: { id: ticketId } }))?.status).toBe('CLOSED');
    expect((await owner.request('POST', `/api/tickets/${ticketId}/close`)).status).toBe(200);
    expect(await prisma.ticketEvent.count({ where: { ticketId, type: 'closed' } })).toBe(1);
  });

  it('rejects an attachment with a file type that is not allowed', async () => {
    const { client } = await registerAndLogin(app, 'asker6@example.com');
    const response = await client.request('POST', '/api/tickets', {
      subject: 'Bad attachment',
      body: 'Hello',
      attachments: [{ name: 'payload.exe', size: 10, type: 'application/x-msdownload' }],
    });
    expect(response.status).toBe(400);
  });

  it('rejects an attachment that is too large', async () => {
    const { client } = await registerAndLogin(app, 'asker7@example.com');
    const response = await client.request('POST', '/api/tickets', {
      subject: 'Big attachment',
      body: 'Hello',
      attachments: [{ name: 'huge.zip', size: 50 * 1024 * 1024, type: 'application/zip' }],
    });
    expect(response.status).toBe(400);
  });
});

describe('admin area', () => {
  it('protects the admin routes from customers', async () => {
    const { client } = await registerAndLogin(app, 'regular@example.com');
    for (const url of ['/api/admin/overview', '/api/admin/customers', '/api/admin/orders', '/api/admin/products', '/api/admin/audit']) {
      const response = await client.request('GET', url);
      expect(response.status).toBe(403);
    }
  });

  it('gives an administrator real counts', async () => {
    const { client: customer } = await registerAndLogin(app, 'counted@example.com');
    await customer.request('POST', '/api/tickets', { subject: 'A ticket', body: 'Hello' });

    const { client: admin } = await createAdmin(app);
    const response = await admin.request('GET', '/api/admin/overview');

    expect(response.status).toBe(200);
    expect(response.body.overview.customers).toBe(1);
    expect(response.body.overview.openTickets).toBe(1);
    expect(typeof response.body.overview.mrr).toBe('number');
  });

  it('lists customers for staff', async () => {
    await registerAndLogin(app, 'listed@example.com');
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('GET', '/api/admin/customers');
    expect(response.status).toBe(200);
    expect(response.body.customers).toHaveLength(1);
    expect(response.body.customers[0].email).toBe('listed@example.com');
  });

  it('lets an administrator update a product', async () => {
    const product = await prisma.product.create({
      data: {
        slug: 'wordpress',
        name: 'WordPress',
        category: 'WEB_CMS',
        description: 'A website and blog platform.',
        icon: 'globe',
        minRam: 512,
        minCpu: 1,
        minDisk: 5,
        visible: true,
        deployable: false,
        eggId: 5,
      },
    });

    const { client: admin } = await createAdmin(app);
    const response = await admin.request('PATCH', `/api/admin/products/${product.id}`, { deployable: true });
    expect(response.status).toBe(200);

    const updated = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.deployable).toBe(true);
  });

  it('writes an audit entry for an administrative change', async () => {
    const product = await prisma.product.create({
      data: {
        slug: 'audited',
        name: 'Audited product',
        category: 'BOTS',
        description: 'A product used only by the tests.',
        icon: 'bot',
        minRam: 512,
        minCpu: 1,
        minDisk: 5,
      },
    });

    const { client: admin } = await createAdmin(app);
    await admin.request('PATCH', `/api/admin/products/${product.id}`, { visible: false });

    const logs = await prisma.auditLog.findMany({ where: { action: 'product.updated' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.actorId).toBeTruthy();
  });

  it('keeps a staff member without a permission from writing', async () => {
    const { hashPassword } = await import('../src/lib/password.js');
    const staff = await prisma.user.create({
      data: {
        email: 'staff@example.com',
        passwordHash: await hashPassword('CorrectHorseBattery9'),
        role: 'STAFF',
        firstName: 'Staff',
        lastName: 'Member',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.staffMember.create({ data: { userId: staff.id, permissions: ['customers.read'] } });

    const client = makeClient(app);
    const login = await client.request('POST', '/api/auth/login', {
      email: 'staff@example.com',
      password: 'CorrectHorseBattery9',
    });
    expect(login.status).toBe(200);

    // Reading customers is allowed.
    const allowed = await client.request('GET', '/api/admin/customers');
    expect(allowed.status).toBe(200);

    // Writing products is not.
    const denied = await client.request('GET', '/api/admin/products');
    expect(denied.status).toBe(403);
  });
});
