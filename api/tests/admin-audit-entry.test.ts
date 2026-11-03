import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';

let app: FastifyInstance;

describe('one entry of the audit log', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('answers with the entry and the other entries about the same target', async () => {
    const { client } = await createAdmin(app, 'staff@example.test');
    const first = await prisma.auditLog.create({ data: { action: 'order.refunded', targetType: 'order', targetId: 'o-1', actorEmail: 'staff@example.test', meta: { reason: 'x' } } });
    await prisma.auditLog.create({ data: { action: 'order.retry', targetType: 'order', targetId: 'o-1' } });
    await prisma.auditLog.create({ data: { action: 'order.other', targetType: 'order', targetId: 'o-2' } });
    const res = await client.request('GET', `/api/admin/audit/${first.id}`);
    expect(res.status).toBe(200);
    expect(res.body.log).toMatchObject({ id: first.id, action: 'order.refunded', targetId: 'o-1', meta: { reason: 'x' } });
    expect(res.body.related.map((row: { action: string }) => row.action)).toEqual(['order.retry']);
  });

  it('is 404 for an entry that is not there and closed to a customer', async () => {
    const admin = await createAdmin(app, 'staff2@example.test');
    expect((await admin.client.request('GET', '/api/admin/audit/missing')).status).toBe(404);
    const customer = await registerAndLogin(app, 'regular2@example.test');
    expect([401, 403]).toContain((await customer.client.request('GET', '/api/admin/audit/anything')).status);
  });
});
