import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * Opening a support ticket.
 *
 * The client writes the enums of a ticket in lower case, the API keeps the
 * form of the Prisma enums, so every answer carries the same shape.
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

describe('opening a ticket', () => {
  it('takes the enums in any case and answers in the canonical form', async () => {
    const { client } = await registerAndLogin(app, 'lower@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'The container will not start',
      category: 'billing',
      priority: 'normal',
      body: 'It stops after a few seconds.',
    });

    expect(response.status).toBe(201);
    expect(response.body.ticket.category).toBe('BILLING');
    expect(response.body.ticket.priority).toBe('NORMAL');
    expect(response.body.ticket.status).toBe('OPEN');
  });

  it('takes the enums in mixed case and with the spaces around them', async () => {
    const { client } = await registerAndLogin(app, 'mixed@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      category: ' Account ',
      priority: 'UrGeNt',
      body: 'I cannot sign in any more.',
    });

    expect(response.status).toBe(201);
    expect(response.body.ticket.category).toBe('ACCOUNT');
    expect(response.body.ticket.priority).toBe('URGENT');
  });

  it('keeps the enums of the ticket in the canonical form', async () => {
    const { client } = await registerAndLogin(app, 'stored@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'A ticket that is stored',
      category: 'technical',
      priority: 'low',
      body: 'Something is not right.',
    });

    const stored = await prisma.ticket.findUnique({ where: { id: response.body.ticket.id } });
    expect(stored?.category).toBe('TECHNICAL');
    expect(stored?.priority).toBe('LOW');
    expect(stored?.status).toBe('OPEN');
  });

  it('answers with the canonical form in the list and in the ticket itself', async () => {
    const { client } = await registerAndLogin(app, 'everywhere@example.com');

    const created = await client.request('POST', '/api/tickets', {
      subject: 'A ticket that is read back',
      category: 'abuse',
      priority: 'high',
      body: 'Something is not right.',
    });

    const list = await client.request('GET', '/api/tickets');
    const detail = await client.request('GET', `/api/tickets/${created.body.ticket.id}`);

    expect(list.body.tickets[0].category).toBe('ABUSE');
    expect(list.body.tickets[0].priority).toBe('HIGH');
    expect(list.body.tickets[0].status).toBe('OPEN');
    expect(detail.body.ticket.category).toBe('ABUSE');
    expect(detail.body.ticket.priority).toBe('HIGH');
    expect(detail.body.ticket.status).toBe('OPEN');
  });
});

describe('the validation of a ticket', () => {
  it('names the priority and the values that are allowed', async () => {
    const { client } = await registerAndLogin(app, 'badpriority@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'A ticket with a wrong priority',
      priority: 'very high',
      body: 'Something is not right.',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
    expect(response.body.error.fields.priority).toContain('priority');
    expect(response.body.error.fields.priority).toContain('LOW');
    expect(response.body.error.fields.priority).toContain('NORMAL');
    expect(response.body.error.fields.priority).toContain('HIGH');
    expect(response.body.error.fields.priority).toContain('URGENT');
    expect(response.body.error.message).toContain('priority');
  });

  it('names the category and the values that are allowed', async () => {
    const { client } = await registerAndLogin(app, 'badcategory@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'A ticket with a wrong category',
      category: 'refund',
      body: 'Something is not right.',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.category).toContain('category');
    expect(response.body.error.fields.category).toContain('TECHNICAL');
    expect(response.body.error.fields.category).toContain('BILLING');
    expect(response.body.error.fields.category).toContain('ACCOUNT');
    expect(response.body.error.fields.category).toContain('ABUSE');
    expect(response.body.error.fields.category).toContain('OTHER');
  });

  it('names the status and the values that are allowed', async () => {
    const { client: customer } = await registerAndLogin(app, 'badstatus@example.com');
    const created = await customer.request('POST', '/api/tickets', {
      subject: 'A ticket whose status is changed',
      body: 'Something is not right.',
    });
    const { client: admin } = await createAdmin(app);

    const response = await admin.request('POST', `/api/tickets/${created.body.ticket.id}/status`, {
      status: 'waiting',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.status).toContain('status');
    expect(response.body.error.fields.status).toContain('OPEN');
    expect(response.body.error.fields.status).toContain('AWAITING_CUSTOMER');
    expect(response.body.error.fields.status).toContain('AWAITING_STAFF');
    expect(response.body.error.fields.status).toContain('ON_HOLD');
    expect(response.body.error.fields.status).toContain('CLOSED');
  });

  it('names the subject and the body when they are missing', async () => {
    const { client } = await registerAndLogin(app, 'badtext@example.com');

    const response = await client.request('POST', '/api/tickets', {
      subject: 'no',
      body: '',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.subject).toContain('subject');
    expect(response.body.error.fields.body).toContain('body');
  });

  it('takes a status in any case', async () => {
    const { client: customer } = await registerAndLogin(app, 'lowerstatus@example.com');
    const created = await customer.request('POST', '/api/tickets', {
      subject: 'A ticket whose status is changed',
      body: 'Something is not right.',
    });
    const { client: admin } = await createAdmin(app);

    const response = await admin.request('POST', `/api/tickets/${created.body.ticket.id}/status`, {
      status: 'on_hold',
    });

    expect(response.status).toBe(200);
    expect(response.body.ticket.status).toBe('ON_HOLD');
  });
});
