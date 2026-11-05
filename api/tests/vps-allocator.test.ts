import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, resetDatabase, VALID_PASSWORD } from './helpers.js';

/**
 * Proxmox is replaced by a small fake that holds machines in memory, so the
 * test can place a machine of somebody else at an id of ours and check that it
 * is never configured, cloned onto or deleted.
 */
const machines = new Map<number, { name: string; tags: string; description: string; status: string }>();
const calls: string[] = [];
const pool = { denied: false };

vi.mock('../src/services/proxmox.js', () => ({
  proxmoxConfigured: () => true,
  vmExists: async (vmid: number) => machines.has(vmid),
  vmConfig: async (vmid: number) => ({ ...machines.get(vmid) }),
  vmStatus: async (vmid: number) => ({ status: machines.get(vmid)?.status ?? 'stopped', uptime: 0, cpu: 0, mem: 0, maxmem: 0 }),
  power: async (vmid: number, action: string) => {
    calls.push(`power:${vmid}:${action}`);
    const machine = machines.get(vmid);
    if (machine) machine.status = action === 'start' ? 'running' : 'stopped';
  },
  deleteVm: async (vmid: number) => {
    calls.push(`delete:${vmid}`);
    machines.delete(vmid);
  },
  cloneTemplate: async (vmid: number, name: string) => {
    calls.push(`clone:${vmid}`);
    machines.set(vmid, { name, tags: '', description: '', status: 'stopped' });
  },
  configureVm: async (vmid: number, config: Record<string, string>) => {
    calls.push(`configure:${vmid}`);
    const machine = machines.get(vmid);
    if (machine) Object.assign(machine, { tags: config.tags ?? machine.tags, description: config.description ?? machine.description });
  },
  resizeDisk: async () => undefined,
  poolMembers: async () => {
    if (pool.denied) throw new Error('Proxmox GET /pools/vps answered 403: Permission check failed (/pool/vps, Pool.Audit)');
    return [...machines.entries()].map(([vmid, machine]) => ({ vmid, name: machine.name, tags: machine.tags }));
  },
}));

const { createVpsService, provisionVps, destroyVps, machineOwnership, vpsAllocationReport, applyAllocationReport, vmidOfSlot, maxSlot } = await import('../src/services/vps.js');

let seq = 0;
async function fixture(productId?: string) {
  // Taken before the first await: orders built at the same moment must not share a number.
  const n = (seq += 1);
  const user = await prisma.user.create({
    data: { email: `vps${n}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'V', lastName: 'P', emailVerifiedAt: new Date() },
  });
  // Eight orders are created together. Each one upserting the same product
  // races on the unique slug, so the product is created once and reused.
  const product = productId
    ? { id: productId }
    : await prisma.product.upsert({
        where: { slug: 'vps-test' },
        update: {},
        create: { slug: 'vps-test', name: 'VPS test', category: 'DEVELOPER_TOOLS', description: 'x', icon: 'server' },
      });
  const order = await prisma.order.create({ data: { number: `T-${n}-${Date.now()}`, userId: user.id, total: 100 } });
  const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, name: 'VPS', unitAmount: 100, total: 100 } });
  return { user, product, item };
}

async function service(options: { dedicatedIp?: boolean } = {}) {
  const { user, product, item } = await fixture();
  return createVpsService({
    userId: user.id,
    productId: product.id,
    orderItemId: item.id,
    subscriptionId: null,
    name: `box${seq}`,
    ram: 1024,
    cpu: 1,
    disk: 10,
    sshPublicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA test',
    dedicatedIp: options.dedicatedIp ?? false,
  });
}

beforeAll(async () => {
  await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  machines.clear();
  calls.length = 0;
});

describe('the allocator of the slots', () => {
  it('hands out different slots, vmids, addresses and ports to orders at the same moment', async () => {
    const product = await prisma.product.upsert({
      where: { slug: 'vps-test' },
      update: {},
      create: { slug: 'vps-test', name: 'VPS test', category: 'DEVELOPER_TOOLS', description: 'x', icon: 'server' },
    });
    const fixtures = await Promise.all(Array.from({ length: 8 }, () => fixture(product.id)));
    const created = await Promise.all(
      fixtures.map(({ user, product, item }, index) =>
        createVpsService({ userId: user.id, productId: product.id, orderItemId: item.id, subscriptionId: null, name: `c${index}`, ram: 512, cpu: 1, disk: 5, sshPublicKey: 'k', dedicatedIp: false }),
      ),
    );
    expect(new Set(created.map((row) => row.slot)).size).toBe(8);
    expect(new Set(created.map((row) => row.vmid)).size).toBe(8);
    expect(new Set(created.map((row) => row.privateIp)).size).toBe(8);
    const ledger = await prisma.vpsSlot.findMany();
    expect(ledger.map((row) => row.slot).sort((a, b) => a - b)).toEqual(created.map((row) => row.slot).sort((a, b) => a - b));
    expect(ledger.every((row) => row.serviceId !== null)).toBe(true);
  });

  it('returns the same service when the same order line is fulfilled twice at once', async () => {
    const { user, product, item } = await fixture();
    const input = { userId: user.id, productId: product.id, orderItemId: item.id, subscriptionId: null, name: 'twice', ram: 512, cpu: 1, disk: 5, sshPublicKey: 'k', dedicatedIp: false };
    const [a, b] = await Promise.all([createVpsService(input), createVpsService(input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.vpsSlot.count()).toBe(1);
  });

  it('never hands out a slot again after the row of its service is gone', async () => {
    const first = await service();
    await prisma.vpsService.delete({ where: { id: first.id } });
    const second = await service();
    expect(second.slot).toBeGreaterThan(first.slot);
  });

  it('refuses to go past the size of the private network', async () => {
    await prisma.vpsSlot.create({ data: { slot: maxSlot(), state: 'RETIRED' } });
    await expect(service()).rejects.toThrow(/full/);
  });
});

describe('a machine that is not ours', () => {
  it('is recognised by its tag and the id of the service', async () => {
    const row = await service();
    expect(await machineOwnership(row)).toBe('absent');
    machines.set(row.vmid!, { name: 'someone', tags: 'prod', description: 'database of the company', status: 'running' });
    expect(await machineOwnership(row)).toBe('foreign');
    machines.set(row.vmid!, { name: 'x', tags: 'bmvps;pub1', description: `Blipmade VPS ${row.id}`, status: 'running' });
    expect(await machineOwnership(row)).toBe('ours');
  });

  it('is never touched by the provisioning, and the service moves to a fresh slot', async () => {
    const row = await service();
    machines.set(row.vmid!, { name: 'billing-db', tags: 'prod', description: 'not ours', status: 'running' });
    process.env.VPS_SHARED_IP = '203.0.113.9';
    const { env } = await import('../src/env.js');
    (env as { VPS_SHARED_IP: string }).VPS_SHARED_IP = '203.0.113.9';

    await provisionVps(row.id);

    const moved = await prisma.vpsService.findUniqueOrThrow({ where: { id: row.id } });
    expect(moved.slot).toBeGreaterThan(row.slot);
    expect(moved.vmid).toBe(vmidOfSlot(moved.slot));
    expect(moved.status).toBe('ACTIVE');
    // The machine of somebody else is exactly as it was.
    expect(machines.get(row.vmid!)).toEqual({ name: 'billing-db', tags: 'prod', description: 'not ours', status: 'running' });
    expect(calls.filter((call) => call.endsWith(`:${row.vmid}`) || call.includes(`:${row.vmid}:`))).toEqual([]);
    const quarantined = await prisma.vpsSlot.findUniqueOrThrow({ where: { slot: row.slot } });
    expect(quarantined.state).toBe('QUARANTINED');
  });

  it('is never deleted when the service is cancelled', async () => {
    const row = await service();
    machines.set(row.vmid!, { name: 'billing-db', tags: 'prod', description: 'not ours', status: 'running' });
    await destroyVps(row.id);
    expect(machines.has(row.vmid!)).toBe(true);
    expect(calls).toEqual([]);
    expect((await prisma.vpsService.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('CANCELLED');
    expect((await prisma.vpsSlot.findUniqueOrThrow({ where: { slot: row.slot } })).state).toBe('QUARANTINED');
  });

  it('deletes our own machine and retires the slot', async () => {
    const row = await service();
    machines.set(row.vmid!, { name: `vps-${row.slot}-x`, tags: 'bmvps', description: `Blipmade VPS ${row.id}`, status: 'running' });
    await destroyVps(row.id);
    expect(machines.has(row.vmid!)).toBe(false);
    expect((await prisma.vpsSlot.findUniqueOrThrow({ where: { slot: row.slot } })).state).toBe('RETIRED');
  });
});

describe('the reconciliation without the right to list the pool', () => {
  it('says so and still checks the machines of the services', async () => {
    const live = await service();
    await prisma.vpsService.update({ where: { id: live.id }, data: { status: 'ACTIVE' } });
    pool.denied = true;
    const report = await vpsAllocationReport();
    expect(report.poolUnavailable).toMatch(/Pool\.Audit/);
    expect(report.orphans).toEqual([]);
    expect(report.missing.map((row) => row.id)).toEqual([live.id]);
    pool.denied = false;
  });
});

describe('the reconciliation', () => {
  it('finds the orphans, the strangers and the missing machines, and writes only the ledger', async () => {
    const live = await service();
    await prisma.vpsService.update({ where: { id: live.id }, data: { status: 'ACTIVE' } });
    // The machine of the service is gone from Proxmox. An orphan and a stranger sit in our range.
    machines.set(vmidOfSlot(40), { name: 'orphan', tags: 'bmvps', description: 'old', status: 'stopped' });
    machines.set(vmidOfSlot(41), { name: 'stranger', tags: 'prod', description: 'x', status: 'running' });

    const report = await vpsAllocationReport();
    expect(report.missing.map((row) => row.id)).toEqual([live.id]);
    expect(report.orphans.map((row) => row.vmid)).toEqual([vmidOfSlot(40)]);
    expect(report.foreignInRange.map((row) => row.vmid)).toEqual([vmidOfSlot(41)]);

    const result = await applyAllocationReport(report);
    expect(result.quarantined.sort()).toEqual([40, 41]);
    expect(machines.size).toBe(2);
    expect(calls).toEqual([]);

    // The next order skips the quarantined slots.
    const next = await service();
    expect(next.slot).toBe(42);
  });
});
