import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The environment of the platform is replaced, so the suite does not depend
 * on the addresses of the machine it runs on.
 *
 * The address of the operator is the inbox of the alarms of the platform, and
 * it is the one that is told when nobody of the staff may read the queue. The
 * file of the tests leaves it empty, which is the default of the environment,
 * so the address of the support is the one that receives the messages of the
 * queue. The case in which the operator is the one who is told is covered by
 * `tests/notification-operator-fallback.test.ts`.
 *
 * The address of the support is fixed here as well. On a machine that carries
 * a real configuration the address is different, and the test would then
 * expect an address that the machine never sends to.
 */
vi.mock('../src/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      MAIL_OPERATOR_EMAIL: '',
      MAIL_SUPPORT_EMAIL: 'support@example.test',
    },
  };
});

import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import { dispatchPendingEvents } from '../src/services/notification-dispatch.js';
import type { FastifyInstance } from 'fastify';

/**
 * The events of the support.
 *
 * The rule of the platform is simple: the author of a message is never told
 * about their own message. A customer who writes a reply does not get a
 * message about that reply; the staff that works the queue does. A staff
 * member who answers does not get a message about their own answer; the
 * customer does.
 *
 * The test was written after a real defect: the answer of a customer was
 * sent back to that customer, with a subject that said "Re: ...".
 */

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

/** The events of a kind, in the order they were written. */
async function eventsOfType(type: string) {
  return prisma.notificationEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } });
}

describe('the events of the support', () => {
  it('tells the customer that the ticket is in the queue, and the staff that it arrived', async () => {
    const { client, userId } = await registerAndLogin(app, 'ticket-opened@example.com');

    await client.request('POST', '/api/tickets', {
      subject: 'The container will not start',
      body: 'It stops after a few seconds.',
    });

    const forTheCustomer = await eventsOfType('ticket.created');
    const forTheStaff = await eventsOfType('ticket.opened_for_staff');

    expect(forTheCustomer).toHaveLength(1);
    expect(forTheCustomer[0]?.userId).toBe(userId);
    expect(forTheStaff).toHaveLength(1);
    expect(forTheStaff[0]?.userId).toBe(userId);
  });

  it('never tells the customer about the reply the customer wrote', async () => {
    const { client } = await registerAndLogin(app, 'ticket-author@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });

    const reply = await client.request('POST', `/api/tickets/${created.body.ticket.id}/replies`, {
      body: 'I have tried again and it still fails.',
    });
    expect(reply.status).toBe(201);

    // The message about the reply of the customer is not one for the
    // customer: it is one for the staff.
    const forTheCustomer = await eventsOfType('ticket.reply_created');
    const forTheStaff = await eventsOfType('ticket.customer_replied');

    expect(forTheCustomer).toHaveLength(0);
    expect(forTheStaff).toHaveLength(1);
  });

  it('tells the customer about the answer of the staff', async () => {
    const { client } = await registerAndLogin(app, 'ticket-answered@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });
    const { client: admin } = await createAdmin(app);

    const answer = await admin.request('POST', `/api/tickets/${created.body.ticket.id}/replies`, {
      body: 'We have reset the session of your account.',
    });
    expect(answer.status).toBe(201);

    const forTheCustomer = await eventsOfType('ticket.reply_created');
    const forTheStaff = await eventsOfType('ticket.customer_replied');

    expect(forTheCustomer).toHaveLength(1);
    expect(forTheStaff).toHaveLength(0);
  });

  it('sends the answer of the staff to the customer and never back to the staff', async () => {
    const { client, userId } = await registerAndLogin(app, 'ticket-send@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });
    const { client: admin, userId: adminId } = await createAdmin(app);
    await admin.request('POST', `/api/tickets/${created.body.ticket.id}/replies`, {
      body: 'We have reset the session of your account.',
    });

    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({ where: { kind: 'ticket.reply_created' } });
    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries) {
      expect(delivery.to).toBe('ticket-send@example.com');
      expect(delivery.to).not.toBe('admin@blipmade.test');
    }

    // The centre of the notifications of the customer holds the opening of
    // the ticket and the answer, and the centre of the staff holds nothing
    // about their own answer.
    const forTheCustomer = await prisma.notification.count({ where: { userId, category: 'support' } });
    const forTheStaff = await prisma.notification.count({ where: { userId: adminId } });
    expect(forTheCustomer).toBe(2);
    expect(forTheStaff).toBe(0);
  });

  it('sends the reply of the customer to the staff and never back to the customer', async () => {
    const { client, userId } = await registerAndLogin(app, 'ticket-staff@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });
    await client.request('POST', `/api/tickets/${created.body.ticket.id}/replies`, {
      body: 'I have tried again and it still fails.',
    });

    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({ where: { kind: 'ticket.customer_replied' } });
    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries) {
      expect(delivery.to).not.toBe('customer@example.com');
      expect(delivery.to).toBe('support@example.test');
    }

    // Nothing about the reply of the customer waits in the centre of the
    // customer: he wrote it.
    const forTheCustomer = await prisma.notification.count({ where: { userId, category: 'support' } });
    expect(forTheCustomer).toBe(1);
  });

  it('names the state of a ticket, and the closing and the reopening apart', async () => {
    const { client } = await registerAndLogin(app, 'ticket-state@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });
    const { client: admin } = await createAdmin(app);

    await admin.request('POST', `/api/tickets/${created.body.ticket.id}/status`, { status: 'ON_HOLD' });
    await admin.request('POST', `/api/tickets/${created.body.ticket.id}/status`, { status: 'CLOSED' });
    await admin.request('POST', `/api/tickets/${created.body.ticket.id}/status`, { status: 'OPEN' });

    expect(await eventsOfType('ticket.status_changed')).toHaveLength(1);
    expect(await eventsOfType('ticket.closed')).toHaveLength(1);
    expect(await eventsOfType('ticket.reopened')).toHaveLength(1);
  });

  it('tells the staff member that takes a ticket that it is theirs', async () => {
    const { client } = await registerAndLogin(app, 'ticket-assign@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });
    const { client: admin, userId: adminId } = await createAdmin(app);

    const assigned = await admin.request('POST', `/api/admin/tickets/${created.body.ticket.id}/assign`, {
      userId: adminId,
    });
    expect(assigned.status).toBe(200);

    const events = await eventsOfType('ticket.assigned');
    expect(events).toHaveLength(1);
    const payload = events[0]?.payload as { staffId?: string };
    expect(payload.staffId).toBe(adminId);
  });
});
