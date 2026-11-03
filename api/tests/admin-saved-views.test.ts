import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, resetDatabase } from './helpers.js';

let app: FastifyInstance;

describe('private admin saved views', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('stores and lists only the requested scope for the current operator', async () => {
    const { client } = await createAdmin(app);
    const created = await client.request('POST', '/api/admin/saved-views', {
      scope: 'tickets', name: 'Urgent mine', query: { priority: 'URGENT', assigned: 'mine', sort: 'oldest' },
    });
    expect(created.status).toBe(200);
    const list = await client.request('GET', '/api/admin/saved-views?scope=tickets');
    expect(list.status).toBe(200);
    expect(list.body.views).toHaveLength(1);
    expect(list.body.views[0]).toMatchObject({ name: 'Urgent mine', query: { priority: 'URGENT', assigned: 'mine', sort: 'oldest' } });
    expect((await client.request('GET', '/api/admin/saved-views?scope=orders')).body.views).toEqual([]);
  });

  it('does not expose or delete another operator view', async () => {
    const first = await createAdmin(app, 'first-admin@blipmade.test');
    const second = await createAdmin(app, 'second-admin@blipmade.test');
    const created = await first.client.request('POST', '/api/admin/saved-views', {
      scope: 'customers', name: 'VIP', query: { tag: 'vip' },
    });
    expect((await second.client.request('GET', '/api/admin/saved-views?scope=customers')).body.views).toEqual([]);
    const removed = await second.client.request('DELETE', `/api/admin/saved-views?scope=customers&id=${created.body.view.id}`);
    expect(removed.status).toBe(404);
    expect(await prisma.adminSavedView.count()).toBe(1);
  });

  it('validates scopes, query shape and duplicate names', async () => {
    const { client } = await createAdmin(app);
    expect((await client.request('POST', '/api/admin/saved-views', { scope: 'billing', name: 'No', query: {} })).status).toBe(400);
    expect((await client.request('POST', '/api/admin/saved-views', { scope: 'orders', name: 'Nested', query: { unsafe: { value: true } } })).status).toBe(400);
    expect((await client.request('POST', '/api/admin/saved-views', { scope: 'orders', name: 'Paid', query: { status: 'PAID' } })).status).toBe(200);
    const duplicate = await client.request('POST', '/api/admin/saved-views', { scope: 'orders', name: 'Paid', query: { status: 'REFUNDED' } });
    expect(duplicate.status).toBe(409);
  });

  it('requires a staff session', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/saved-views?scope=orders' })).statusCode).toBe(401);
  });
});
