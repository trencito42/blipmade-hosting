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

  it('filters the list by target id and by date', async () => {
    const { client } = await createAdmin(app, 'staff3@example.test');
    await prisma.auditLog.create({ data: { action: 'a.old', targetType: 'order', targetId: 'o-1', createdAt: new Date('2026-01-01T00:00:00Z') } });
    await prisma.auditLog.create({ data: { action: 'a.new', targetType: 'order', targetId: 'o-1', createdAt: new Date('2026-06-01T00:00:00Z') } });
    await prisma.auditLog.create({ data: { action: 'a.other', targetType: 'order', targetId: 'o-2', createdAt: new Date('2026-06-02T00:00:00Z') } });
    const byTarget = await client.request('GET', '/api/admin/audit?targetType=order&targetId=o-1');
    expect(byTarget.body.logs.map((row: { action: string }) => row.action).sort()).toEqual(['a.new', 'a.old']);
    const byDate = await client.request('GET', '/api/admin/audit?targetId=o-1&from=2026-03-01T00:00:00Z');
    expect(byDate.body.logs.map((row: { action: string }) => row.action)).toEqual(['a.new']);
  });
});

describe('infrastructure node and queue job pages', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('answers with a node and says 404 for one that is not there', async () => {
    const { client } = await createAdmin(app, 'staff4@example.test');
    const node = await prisma.node.create({ data: { pterodactylId: 7, name: 'node-7', fqdn: 'n7.example.test', memory: 8192, disk: 100000, memoryAllocated: 2048, diskAllocated: 10000 } });
    const res = await client.request('GET', `/api/admin/infrastructure/nodes/${node.id}`);
    expect(res.status).toBe(200);
    expect(res.body.node).toMatchObject({ name: 'node-7', memory: 8192 });
    expect(res.body.instances).toEqual([]);
    expect((await client.request('GET', '/api/admin/infrastructure/nodes/missing')).status).toBe(404);
  });

  it('says 404 for a queue job that is not there', async () => {
    const { client } = await createAdmin(app, 'staff5@example.test');
    expect((await client.request('GET', '/api/admin/queues/provisioning/jobs/nope')).status).toBe(404);
  });
});
