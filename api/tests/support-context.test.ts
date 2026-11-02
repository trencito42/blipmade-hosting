import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
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

async function staffWith(email: string, permissions: string[]) {
  const { hashPassword } = await import('../src/lib/password.js');
  const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'Staff', lastName: 'Member', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  return client;
}

describe('the context of a conversation', () => {
  it('summarises the customer, and leaves the money out for a role that may not read orders', async () => {
    const { client, userId } = await registerAndLogin(app, 'ctx@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Context', body: 'Hello.' })).body.ticket.id as string;
    await client.request('POST', '/api/tickets', { subject: 'Earlier', body: 'Hello.' });
    await prisma.invoice.create({ data: { number: 'INV-CTX-1', userId, status: 'PAID', amount: 1000, tax: 0, total: 1000, currency: 'EUR' } });

    const support = await staffWith('support@example.com', ['tickets.read']);
    const view = (await support.request('GET', `/api/admin/support/conversations/${id}/context`)).body;
    expect(view.customer.email).toBe('ctx@example.com');
    expect(view.recent).toHaveLength(1);
    expect(view.billing).toBeNull();
    // Nothing that opens an account is in it.
    expect(JSON.stringify(view)).not.toMatch(/password|token|secret|apiKey|pterodactyl/i);

    const finance = await staffWith('finance@example.com', ['tickets.read', 'orders.read']);
    const money = (await finance.request('GET', `/api/admin/support/conversations/${id}/context`)).body;
    expect(money.billing[0]).toMatchObject({ number: 'INV-CTX-1', status: 'paid', total: 1000 });
  });

  it('is closed to a customer and to staff without tickets.read', async () => {
    const { client } = await registerAndLogin(app, 'closed@example.com');
    const id = (await client.request('POST', '/api/tickets', { subject: 'Closed', body: 'Hello.' })).body.ticket.id as string;
    expect((await client.request('GET', `/api/admin/support/conversations/${id}/context`)).status).toBe(403);
    const other = await staffWith('other@example.com', ['customers.read']);
    expect((await other.request('GET', `/api/admin/support/conversations/${id}/context`)).status).toBe(403);
  });
});

describe('articles', () => {
  it('shows a customer the public documentation only', async () => {
    const { client: admin } = await createAdmin(app);
    await admin.request('PUT', '/api/admin/support/knowledge', { articles: [{ id: 'k1', title: 'Secret refund rule', body: 'internal refund rule text', tags: [] }] });
    const { client } = await registerAndLogin(app, 'reader@example.com');
    const suggested = await client.request('GET', '/api/support/suggest?q=refund rule sign in account');
    expect(suggested.status).toBe(200);
    expect(JSON.stringify(suggested.body)).not.toContain('internal refund rule text');
    expect(JSON.stringify(suggested.body)).not.toContain('Secret refund rule');
    expect((await app.inject({ method: 'GET', url: '/api/support/suggest?q=sign in' })).statusCode).toBe(401);
  });

  it('gives the staff the notes of the team too', async () => {
    const { client: admin } = await createAdmin(app);
    await admin.request('PUT', '/api/admin/support/knowledge', { articles: [{ id: 'k1', title: 'Refund rule', body: 'internal refund rule text', tags: [] }] });
    const found = (await admin.request('GET', '/api/admin/support/articles?q=refund')).body;
    expect(found.team[0].title).toBe('Refund rule');
    expect(Array.isArray(found.public)).toBe(true);
  });
});
