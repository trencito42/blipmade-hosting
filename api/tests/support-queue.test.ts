import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { viewFilter } from '../src/routes/admin-support.js';
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
});

async function staffWith(email: string, permissions: string[]): Promise<{ client: TestClient; userId: string }> {
  const { hashPassword } = await import('../src/lib/password.js');
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'Staff', lastName: 'Member', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  return { client, userId: user.id };
}

const open = async (client: TestClient, subject: string) =>
  (await client.request('POST', '/api/tickets', { subject, body: 'Text of the question.' })).body.ticket as { id: string; number: number };

describe('support departments', () => {
  it('lets only settings.write change the departments, and tickets.read list them', async () => {
    const { client: support } = await staffWith('support@example.com', ['tickets.read', 'tickets.write']);
    expect((await support.request('POST', '/api/admin/support/departments', { name: 'Billing' })).status).toBe(403);
    expect((await support.request('GET', '/api/admin/support/departments')).status).toBe(200);

    const { client: admin } = await createAdmin(app);
    const created = await admin.request('POST', '/api/admin/support/departments', { name: 'Billing', description: 'Invoices' });
    expect(created.status).toBe(201);
    expect(created.body.department.slug).toBe('billing');
    expect((await admin.request('POST', '/api/admin/support/departments', { name: 'Billing' })).status).toBe(409);
  });

  it('shows a customer only the departments that are visible', async () => {
    const { client: admin } = await createAdmin(app);
    await admin.request('POST', '/api/admin/support/departments', { name: 'Technical' });
    await admin.request('POST', '/api/admin/support/departments', { name: 'Internal only', visible: false });
    const { client } = await registerAndLogin(app, 'asker@example.com');
    const list = await client.request('GET', '/api/support/departments');
    expect(list.body.departments.map((department: { name: string }) => department.name)).toEqual(['Technical']);
  });

  it('keeps a department with conversations: it cannot be deleted', async () => {
    const { client: admin } = await createAdmin(app);
    const department = (await admin.request('POST', '/api/admin/support/departments', { name: 'Abuse' })).body.department;
    const { client } = await registerAndLogin(app, 'a@example.com');
    const ticket = await open(client, 'Report');
    expect((await admin.request('PUT', `/api/admin/support/conversations/${ticket.id}/department`, { departmentId: department.id })).status).toBe(200);
    expect((await admin.request('DELETE', `/api/admin/support/departments/${department.id}`)).status).toBe(409);
    // The customer is not told how the staff sorts the conversations.
    const view = await client.request('GET', `/api/tickets/${ticket.id}`);
    expect(view.body.ticket.events.some((event: { type: string }) => event.type === 'department')).toBe(false);
  });

  it('refuses a member that is not staff, and sets the members of a department', async () => {
    const { client: admin, userId } = await createAdmin(app);
    const department = (await admin.request('POST', '/api/admin/support/departments', { name: 'General' })).body.department;
    const { userId: customerId } = await registerAndLogin(app, 'c@example.com');
    expect((await admin.request('PUT', `/api/admin/support/departments/${department.id}/members`, { userIds: [customerId] })).status).toBe(400);
    expect((await admin.request('PUT', `/api/admin/support/departments/${department.id}/members`, { userIds: [userId] })).status).toBe(200);
    expect(await prisma.supportDepartmentMember.count({ where: { departmentId: department.id } })).toBe(1);
  });
});

describe('the unified queue', () => {
  it('sorts the conversations into the views of the console', async () => {
    const { client: admin, userId } = await createAdmin(app);
    const { client } = await registerAndLogin(app, 'queue@example.com');
    const one = await open(client, 'Mine one');
    const two = await open(client, 'Nobody has it');
    const three = await open(client, 'Closed one');
    await prisma.ticket.update({ where: { id: one.id }, data: { assignedToId: userId } });
    await prisma.ticket.update({ where: { id: three.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await prisma.ticket.update({ where: { id: two.id }, data: { status: 'AWAITING_CUSTOMER' } });

    const ids = async (view: string) => (await admin.request('GET', `/api/admin/support/conversations?view=${view}`)).body.conversations.map((row: { id: string }) => row.id).sort();
    expect(await ids('all')).toHaveLength(3);
    expect(await ids('mine')).toEqual([one.id]);
    expect(await ids('unassigned')).toEqual([two.id]);
    expect(await ids('closed')).toEqual([three.id]);
    expect(await ids('waiting_customer')).toEqual([two.id]);
    expect(await ids('chat')).toEqual([]);

    const counts = (await admin.request('GET', '/api/admin/support/counts')).body.counts;
    expect(counts).toMatchObject({ all: 3, mine: 1, unassigned: 1, closed: 1, waiting_customer: 1, chat: 0 });
  });

  it('searches by subject, email and number', async () => {
    const { client: admin } = await createAdmin(app);
    const { client } = await registerAndLogin(app, 'findme@example.com');
    const ticket = await open(client, 'The container will not start');
    await open(client, 'Something else');
    const find = async (q: string) => (await admin.request('GET', `/api/admin/support/conversations?q=${encodeURIComponent(q)}`)).body.conversations.length;
    expect(await find('container')).toBe(1);
    expect(await find('findme@')).toBe(2);
    expect(await find(String(ticket.number))).toBe(1);
  });

  it('is closed to a customer and to staff without tickets.read', async () => {
    const { client } = await registerAndLogin(app, 'nope@example.com');
    expect((await client.request('GET', '/api/admin/support/conversations')).status).toBe(403);
    const { client: other } = await staffWith('other@example.com', ['customers.read']);
    expect((await other.request('GET', '/api/admin/support/conversations')).status).toBe(403);
  });

  it('knows every view', () => {
    for (const view of ['all', 'mine', 'unassigned', 'chat', 'tickets', 'email', 'waiting_customer', 'waiting_staff', 'closed'] as const) {
      expect(viewFilter(view, 'u1')).toBeTypeOf('object');
    }
  });
});

describe('the department of a ticket in the admin list', () => {
  it('is returned by the list the ticket page reads, and follows a move', async () => {
    const { client: admin } = await createAdmin(app);
    const department = (await admin.request('POST', '/api/admin/support/departments', { name: 'Billing' })).body.department;
    const { client } = await registerAndLogin(app, 'dept-list@example.com');
    const ticket = await open(client, 'Which department');
    const before = (await admin.request('GET', `/api/admin/tickets?id=${ticket.id}`)).body.tickets[0];
    expect(before.departmentId).toBeNull();
    expect(before.channel).toBe('ticket');
    await admin.request('PUT', `/api/admin/support/conversations/${ticket.id}/department`, { departmentId: department.id });
    expect((await admin.request('GET', `/api/admin/tickets?id=${ticket.id}`)).body.tickets[0].departmentId).toBe(department.id);
    await admin.request('PUT', `/api/admin/support/conversations/${ticket.id}/department`, { departmentId: null });
    expect((await admin.request('GET', `/api/admin/tickets?id=${ticket.id}`)).body.tickets[0].departmentId).toBeNull();
  });
});
