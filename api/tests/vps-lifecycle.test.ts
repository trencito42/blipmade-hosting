import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, resetDatabase, VALID_PASSWORD } from './helpers.js';

const running = new Map<number, string>();
const deleted: number[] = [];

vi.mock('../src/services/proxmox.js', () => ({
  proxmoxConfigured: () => true,
  vmExists: async (vmid: number) => running.has(vmid),
  vmConfig: async (vmid: number) => ({ tags: 'bmvps', description: `Blipmade VPS ${vmid}`, name: `vps-${vmid - 1000}-x` }),
  vmStatus: async (vmid: number) => ({ status: running.get(vmid) ?? 'stopped', uptime: 0, cpu: 0, mem: 0, maxmem: 0 }),
  power: async (vmid: number, action: string) => void running.set(vmid, action === 'start' ? 'running' : 'stopped'),
  deleteVm: async (vmid: number) => {
    deleted.push(vmid);
    running.delete(vmid);
  },
  poolMembers: async () => [],
}));

const { sweepVps, vpsLifecyclePolicy } = await import('../src/services/vps.js');
let app: FastifyInstance;
const DAY = 24 * 60 * 60 * 1000;

async function server(slot: number, subscription: { status: 'PAST_DUE' | 'ACTIVE' | 'CANCELLED'; endedDaysAgo: number }, service: { status?: 'ACTIVE' | 'SUSPENDED'; suspendedDaysAgo?: number } = {}) {
  const user = await prisma.user.create({ data: { email: `l${slot}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'L', lastName: 'C', emailVerifiedAt: new Date() } });
  const product = await prisma.product.upsert({ where: { slug: 'vps-l' }, update: {}, create: { slug: 'vps-l', name: 'l', category: 'VPS', fulfilment: 'VPS', description: 'x', icon: 'server' } });
  const order = await prisma.order.create({ data: { number: `L-${slot}`, userId: user.id, total: 1 } });
  const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, name: 'v', unitAmount: 1, total: 1 } });
  const sub = await prisma.subscription.create({ data: { userId: user.id, orderItemId: item.id, status: subscription.status, amount: 1, currentPeriodEnd: new Date(Date.now() - subscription.endedDaysAgo * DAY) } });
  const row = await prisma.vpsService.create({
    data: {
      userId: user.id, productId: product.id, orderItemId: item.id, subscriptionId: sub.id, name: `n${slot}`, slot, vmid: 1000 + slot, privateIp: `10.78.0.${100 + slot}`, ram: 512, cpu: 1, disk: 5, sshPublicKey: 'k',
      status: service.status ?? 'ACTIVE',
      suspendedAt: service.suspendedDaysAgo !== undefined ? new Date(Date.now() - service.suspendedDaysAgo * DAY) : null,
    },
  });
  running.set(row.vmid!, 'running');
  return row;
}

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  running.clear();
  deleted.length = 0;
});

describe('the lifecycle of a VPS whose subscription is not paid', () => {
  it('walks past the first page', async () => {
    for (let slot = 1; slot <= 5; slot += 1) await server(slot, { status: 'CANCELLED', endedDaysAgo: 1 });
    const result = await sweepVps(2);
    expect(result.suspended).toBe(5);
    expect(await prisma.vpsService.count({ where: { status: 'SUSPENDED' } })).toBe(5);
  });

  it('waits for the grace of the payment, three days unless the operator said another number', async () => {
    const late = await server(1, { status: 'PAST_DUE', endedDaysAgo: 2 });
    await sweepVps();
    expect((await prisma.vpsService.findUniqueOrThrow({ where: { id: late.id } })).status).toBe('ACTIVE');

    const { client: admin } = await createAdmin(app);
    expect((await admin.request('PUT', '/api/admin/settings', { 'vps.payment_grace_days': 1 })).status).toBe(200);
    expect((await vpsLifecyclePolicy()).graceDays).toBe(1);
    await sweepVps();
    expect((await prisma.vpsService.findUniqueOrThrow({ where: { id: late.id } })).status).toBe('SUSPENDED');
  });

  it('keeps a stopped machine for 14 days at least, and the operator can only lengthen it', async () => {
    const old = await server(1, { status: 'CANCELLED', endedDaysAgo: 30 }, { status: 'SUSPENDED', suspendedDaysAgo: 10 });
    await sweepVps();
    expect(deleted).toEqual([]);

    const { client: admin } = await createAdmin(app);
    expect((await admin.request('PUT', '/api/admin/settings', { 'vps.retention_days': 3 })).status).toBe(400);
    expect((await admin.request('PUT', '/api/admin/settings', { 'vps.retention_days': 30 })).status).toBe(200);
    await sweepVps();
    expect(deleted).toEqual([]);

    await prisma.vpsService.update({ where: { id: old.id }, data: { suspendedAt: new Date(Date.now() - 40 * DAY) } });
    await sweepVps();
    expect(deleted).toEqual([1001]);
  });

  it('ignores a setting that is not a whole number in range', async () => {
    await prisma.setting.create({ data: { key: 'vps.retention_days', value: 1 } });
    await prisma.setting.create({ data: { key: 'vps.payment_grace_days', value: 'soon' } });
    expect(await vpsLifecyclePolicy()).toEqual({ retentionDays: 14, graceDays: 3 });
  });

  it('puts a paid machine back on', async () => {
    const row = await server(1, { status: 'ACTIVE', endedDaysAgo: -5 }, { status: 'SUSPENDED', suspendedDaysAgo: 1 });
    running.set(row.vmid!, 'stopped');
    const result = await sweepVps();
    expect(result.resumed).toBe(1);
    expect(running.get(row.vmid!)).toBe('running');
  });
});
