import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The queue of the support desk: GET /api/admin/tickets
 *
 * The inbox of the staff filters the queue with the search, the state, the
 * category, the priority and the owner of the ticket, and it walks the pages
 * with the cursor of the server.
 */

let app: FastifyInstance;

/** The customer of the tickets of the test. */
let customerId = '';

/** The member of the staff that owns one of the tickets. */
let staffUserId = '';

/** The tickets of the test, from the oldest activity to the newest. */
let technical: { id: string; number: number } = { id: '', number: 0 };
let billing: { id: string; number: number } = { id: '', number: 0 };
let urgent: { id: string; number: number } = { id: '', number: 0 };

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();

  const customer = await prisma.user.create({
    data: {
      email: 'ada@example.com',
      passwordHash: 'not-used-here',
      role: 'CUSTOMER',
      firstName: 'Ada',
      lastName: 'Lovelace',
      emailVerifiedAt: new Date(),
    },
  });
  customerId = customer.id;

  const staff = await prisma.user.create({
    data: {
      email: 'grace@example.com',
      passwordHash: 'not-used-here',
      role: 'STAFF',
      firstName: 'Grace',
      lastName: 'Hopper',
      emailVerifiedAt: new Date(),
    },
  });
  staffUserId = staff.id;
  await prisma.staffMember.create({ data: { userId: staff.id, permissions: [] } });

  const first = await prisma.ticket.create({
    data: {
      userId: customer.id,
      subject: 'The container will not start',
      category: 'TECHNICAL',
      priority: 'NORMAL',
      status: 'OPEN',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      updatedAt: new Date('2026-10-01T08:00:00.000Z'),
      messages: { create: { authorId: customer.id, body: 'It stops after a few seconds.' } },
    },
  });
  technical = { id: first.id, number: first.number };

  const second = await prisma.ticket.create({
    data: {
      userId: customer.id,
      subject: 'The invoice of October is wrong',
      category: 'BILLING',
      priority: 'NORMAL',
      status: 'AWAITING_STAFF',
      createdAt: new Date('2026-10-02T08:00:00.000Z'),
      updatedAt: new Date('2026-10-02T08:00:00.000Z'),
      messages: { create: { authorId: customer.id, body: 'I was charged twice.' } },
    },
  });
  billing = { id: second.id, number: second.number };

  const third = await prisma.ticket.create({
    data: {
      userId: customer.id,
      subject: 'The server was attacked',
      category: 'ABUSE',
      priority: 'URGENT',
      status: 'OPEN',
      assignedToId: staff.id,
      createdAt: new Date('2026-10-03T08:00:00.000Z'),
      updatedAt: new Date('2026-10-03T08:00:00.000Z'),
      messages: { create: { authorId: customer.id, body: 'Someone logged in.' } },
    },
  });
  urgent = { id: third.id, number: third.number };
});

describe('the queue of the support desk', () => {
  it('keeps the shape the list always had', async () => {
    const { client } = await createAdmin(app);
    const response = await client.request('GET', '/api/admin/tickets');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.tickets)).toBe(true);
    expect(response.body.total).toBe(3);
    expect(response.body.pagination).toBeTruthy();

    const ticket = response.body.tickets.find((entry: { id: string }) => entry.id === technical.id);
    // Every field the list always sent is still there.
    for (const field of [
      'id',
      'number',
      'subject',
      'category',
      'priority',
      'status',
      'createdAt',
      'updatedAt',
      'messageCount',
      'customer',
      'instance',
      'assignedTo',
    ]) {
      expect(ticket).toHaveProperty(field);
    }
    expect(ticket.customer).toMatchObject({ id: customerId, email: 'ada@example.com', name: 'Ada Lovelace' });
    expect(ticket.category).toBe('technical');
    expect(ticket.status).toBe('open');
    expect(ticket.messageCount).toBe(1);
    // The owner of the ticket is sent with its id, so the page of the
    // conversation can show the owner it really has.
    expect(ticket.assignedToId).toBeNull();
  });

  it('filters the queue by the state', async () => {
    const { client } = await createAdmin(app);

    const open = await client.request('GET', '/api/admin/tickets?status=OPEN');
    expect(open.status).toBe(200);
    expect(open.body.total).toBe(2);
    expect(open.body.tickets.every((entry: { status: string }) => entry.status === 'open')).toBe(true);

    // The staff write the state in small letters.
    const lower = await client.request('GET', '/api/admin/tickets?status=awaiting_staff');
    expect(lower.status).toBe(200);
    expect(lower.body.total).toBe(1);
    expect(lower.body.tickets[0].id).toBe(billing.id);
  });

  it('filters the queue by the category and by the priority', async () => {
    const { client } = await createAdmin(app);

    const category = await client.request('GET', '/api/admin/tickets?category=billing');
    expect(category.status).toBe(200);
    expect(category.body.total).toBe(1);
    expect(category.body.tickets[0].id).toBe(billing.id);

    const priority = await client.request('GET', '/api/admin/tickets?priority=urgent');
    expect(priority.status).toBe(200);
    expect(priority.body.total).toBe(1);
    expect(priority.body.tickets[0].id).toBe(urgent.id);
  });

  it('filters the queue by the owner of the ticket', async () => {
    const { client } = await createAdmin(app);

    const assigned = await client.request('GET', '/api/admin/tickets?assigned=assigned');
    expect(assigned.status).toBe(200);
    expect(assigned.body.total).toBe(1);
    expect(assigned.body.tickets[0].id).toBe(urgent.id);
    expect(assigned.body.tickets[0].assignedTo).toBe('Grace Hopper');
    expect(assigned.body.tickets[0].assignedToId).toBe(staffUserId);

    const unassigned = await client.request('GET', '/api/admin/tickets?assigned=unassigned');
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.total).toBe(2);
    expect(unassigned.body.tickets.every((entry: { assignedTo: string | null }) => entry.assignedTo === null)).toBe(true);
  });

  it('searches the number, the subject and the customer of a ticket', async () => {
    const { client } = await createAdmin(app);

    const byNumber = await client.request('GET', `/api/admin/tickets?search=${technical.number}`);
    expect(byNumber.status).toBe(200);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.tickets[0].id).toBe(technical.id);

    // The number of a ticket is written with a number sign as well.
    const byHash = await client.request('GET', `/api/admin/tickets?search=%23${technical.number}`);
    expect(byHash.status).toBe(200);
    expect(byHash.body.tickets[0].id).toBe(technical.id);

    const bySubject = await client.request('GET', '/api/admin/tickets?search=invoice');
    expect(bySubject.status).toBe(200);
    expect(bySubject.body.total).toBe(1);
    expect(bySubject.body.tickets[0].id).toBe(billing.id);

    const byEmail = await client.request('GET', '/api/admin/tickets?search=ada@example.com');
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.total).toBe(3);

    const byName = await client.request('GET', '/api/admin/tickets?search=Lovelace');
    expect(byName.status).toBe(200);
    expect(byName.body.total).toBe(3);
  });

  it('walks the pages of the queue with the cursor', async () => {
    const { client } = await createAdmin(app);

    const first = await client.request('GET', '/api/admin/tickets?limit=1');
    expect(first.status).toBe(200);
    expect(first.body.tickets).toHaveLength(1);
    expect(first.body.pagination.hasMore).toBe(true);
    expect(typeof first.body.pagination.nextCursor).toBe('string');
    // The newest activity comes first.
    expect(first.body.tickets[0].id).toBe(urgent.id);

    const second = await client.request('GET', `/api/admin/tickets?limit=1&cursor=${first.body.pagination.nextCursor}`);
    expect(second.status).toBe(200);
    expect(second.body.tickets).toHaveLength(1);
    expect(second.body.tickets[0].id).toBe(billing.id);

    const third = await client.request('GET', `/api/admin/tickets?limit=1&cursor=${second.body.pagination.nextCursor}`);
    expect(third.status).toBe(200);
    expect(third.body.tickets[0].id).toBe(technical.id);
    expect(third.body.pagination.hasMore).toBe(false);
    expect(third.body.pagination.nextCursor).toBeNull();

    // The oldest queue is walked with the cursor as well.
    const oldest = await client.request('GET', '/api/admin/tickets?sort=oldest&limit=1');
    expect(oldest.status).toBe(200);
    expect(oldest.body.tickets[0].id).toBe(technical.id);
    expect(oldest.body.pagination.hasMore).toBe(true);

    const nextOldest = await client.request('GET', `/api/admin/tickets?sort=oldest&limit=1&cursor=${oldest.body.pagination.nextCursor}`);
    expect(nextOldest.status).toBe(200);
    expect(nextOldest.body.tickets[0].id).toBe(billing.id);
  });

  it('sorts the queue by the activity in both directions', async () => {
    const { client } = await createAdmin(app);

    const oldest = await client.request('GET', '/api/admin/tickets?sort=oldest');
    expect(oldest.status).toBe(200);
    expect(oldest.body.tickets[0].id).toBe(technical.id);
    expect(oldest.body.tickets[2].id).toBe(urgent.id);

    const recent = await client.request('GET', '/api/admin/tickets');
    expect(recent.body.tickets[0].id).toBe(urgent.id);
    expect(recent.body.tickets[2].id).toBe(technical.id);
  });

  it('reads the one ticket of the address', async () => {
    const { client } = await createAdmin(app);
    const response = await client.request('GET', `/api/admin/tickets?id=${billing.id}`);

    expect(response.status).toBe(200);
    expect(response.body.tickets).toHaveLength(1);
    expect(response.body.tickets[0].id).toBe(billing.id);
    expect(response.body.tickets[0].customer.email).toBe('ada@example.com');
  });

  it('refuses a filter it does not know', async () => {
    const { client } = await createAdmin(app);
    const response = await client.request('GET', '/api/admin/tickets?status=nonsense');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('reads an empty filter as no filter at all', async () => {
    const { client } = await createAdmin(app);
    // The old page of the queue sent an empty state when every state was
    // wanted, and the answer was the whole queue.
    const response = await client.request('GET', '/api/admin/tickets?status=&category=');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
  });

  it('keeps the queue away from the customers', async () => {
    const { client } = await registerAndLogin(app, 'stranger@example.com');
    const response = await client.request('GET', '/api/admin/tickets');
    expect(response.status).toBe(403);
  });
});
