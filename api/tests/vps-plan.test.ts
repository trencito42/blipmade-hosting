import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';

const proxmox = { configured: [] as unknown[], resized: [] as unknown[], fail: false };
const stripe = { amounts: [] as number[], failOn: -1 };

vi.mock('../src/services/proxmox.js', () => ({
  proxmoxConfigured: () => true,
  configureVm: async (vmid: number, config: unknown) => {
    if (proxmox.fail) throw new Error('Proxmox said no');
    proxmox.configured.push({ vmid, config });
  },
  resizeDisk: async (vmid: number, gb: number) => void proxmox.resized.push({ vmid, gb }),
  vmExists: async () => true,
  vmConfig: async () => ({}),
  poolMembers: async () => [],
}));
vi.mock('../src/services/stripe.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/stripe.js')>()),
  updateSubscriptionAmount: async (_subscription: unknown, amount: number) => {
    if (stripe.failOn === stripe.amounts.length) {
      stripe.amounts.push(-1);
      throw new Error('Stripe said no');
    }
    stripe.amounts.push(amount);
  },
}));

let app: FastifyInstance;

async function seed(dedicatedIp = false, subscriptionAmount = 249) {
  const user = await prisma.user.create({
    data: { email: `c${Date.now()}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'C', lastName: 'C', emailVerifiedAt: new Date() },
  });
  const make = (slug: string, ram: number, cpu: number, disk: number, amount: number) =>
    prisma.product.create({
      data: { slug, name: slug, category: 'VPS', fulfilment: 'VPS', description: 'x', icon: 'server', defaultRam: ram, defaultCpu: cpu, defaultDisk: disk, minRam: ram, maxRam: ram, minCpu: cpu, maxCpu: cpu, minDisk: disk, maxDisk: disk, prices: { create: { period: 'MONTHLY', baseAmount: amount, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' } } },
    });
  const small = await make('vps-start', 1024, 1, 20, 249);
  await make('vps-plus', 2048, 2, 30, 349);
  await make('vps-tiny', 512, 1, 10, 149);
  await prisma.productOption.create({ data: { code: 'dedicated-ipv4', name: 'ip', description: 'ip', amount: 399, productId: null, recurring: true } });
  const order = await prisma.order.create({ data: { number: `P-${Date.now()}`, userId: user.id, total: 249 } });
  const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: small.id, name: 'VPS', unitAmount: 249, total: 249 } });
  const subscription = await prisma.subscription.create({ data: { userId: user.id, orderItemId: item.id, status: 'ACTIVE', amount: subscriptionAmount, stripeSubscriptionId: 'sub_x', stripeSubscriptionItemId: 'si_x' } });
  const service = await prisma.vpsService.create({
    data: { userId: user.id, productId: small.id, orderItemId: item.id, subscriptionId: subscription.id, name: 'box', status: 'ACTIVE', slot: 1, vmid: 1001, privateIp: '10.78.0.101', ram: 1024, cpu: 1, disk: 20, sshPublicKey: 'k', dedicatedIp },
  });
  return { service, subscription };
}

async function staff(permissions: string[]) {
  const user = await prisma.user.create({ data: { email: `s${Date.now()}${Math.random()}@blipmade.test`, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'S', lastName: 'S', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  await client.request('POST', '/api/auth/login', { email: user.email, password: VALID_PASSWORD });
  return client;
}

beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  proxmox.configured = [];
  proxmox.resized = [];
  proxmox.fail = false;
  stripe.amounts = [];
  stripe.failOn = -1;
});

describe('the commercial change of plan', () => {
  it('quotes the difference without writing anything', async () => {
    const { service } = await seed();
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('GET', `/api/admin/vps/${service.id}/plan-quote?slug=vps-plus`);
    expect(response.status).toBe(200);
    expect(response.body.quote).toMatchObject({ delta: 100, billedNow: 249, blocked: null, from: { amount: 249 }, to: { amount: 349, cpu: 2, ram: 2048, disk: 30 } });
    expect(stripe.amounts).toEqual([]);
    expect(proxmox.configured).toEqual([]);
  });

  it('adds the dedicated address to both sides of the quote', async () => {
    const { service } = await seed(true, 648);
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('GET', `/api/admin/vps/${service.id}/plan-quote?slug=vps-plus`);
    expect(response.body.quote).toMatchObject({ from: { amount: 648 }, to: { amount: 748 }, delta: 100 });
  });

  it('changes the resources and the subscription together, and records both', async () => {
    const { service, subscription } = await seed();
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-plus', expectedAmount: 349 });
    expect(response.status).toBe(200);
    expect(stripe.amounts).toEqual([349]);
    expect(proxmox.configured).toEqual([{ vmid: 1001, config: { cores: 2, memory: 2048 } }]);
    expect(proxmox.resized).toEqual([{ vmid: 1001, gb: 30 }]);
    const after = await prisma.vpsService.findUniqueOrThrow({ where: { id: service.id }, include: { product: true } });
    expect(after).toMatchObject({ ram: 2048, cpu: 2, disk: 30 });
    expect(after.product.slug).toBe('vps-plus');
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).amount).toBe(349);
    expect(await prisma.auditLog.count({ where: { action: 'admin.vps.plan' } })).toBe(1);
  });

  it('refuses a stale quote and changes nothing', async () => {
    const { service } = await seed();
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-plus', expectedAmount: 300 });
    expect(response.status).toBe(400);
    expect(stripe.amounts).toEqual([]);
    expect((await prisma.vpsService.findUniqueOrThrow({ where: { id: service.id } })).cpu).toBe(1);
  });

  it('puts the old price back when the hypervisor fails', async () => {
    const { service, subscription } = await seed();
    proxmox.fail = true;
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-plus', expectedAmount: 349 });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(stripe.amounts).toEqual([349, 249]);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).amount).toBe(249);
    expect((await prisma.vpsService.findUniqueOrThrow({ where: { id: service.id } })).cpu).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'admin.vps.plan_failed' } })).toBe(1);
  });

  it('says so in the audit log when the old price cannot be put back either', async () => {
    const { service } = await seed();
    proxmox.fail = true;
    stripe.failOn = 1;
    const { client: admin } = await createAdmin(app);
    await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-plus', expectedAmount: 349 });
    expect(await prisma.auditLog.count({ where: { action: 'admin.vps.plan_inconsistent' } })).toBe(1);
  });

  it('refuses a disk that would shrink, a plan that is the same, and a subscription that ends', async () => {
    const { service, subscription } = await seed();
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-tiny', expectedAmount: 149 })).status).toBe(400);
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-start', expectedAmount: 249 })).status).toBe(400);
    await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } });
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-plus', expectedAmount: 349 })).status).toBe(400);
    expect(stripe.amounts).toEqual([]);
  });

  it('needs both services.write and pricing.write', async () => {
    const { service } = await seed();
    const onlyServices = await staff(['services.write', 'services.read']);
    expect((await onlyServices.request('POST', `/api/admin/vps/${service.id}/plan`, { slug: 'vps-plus', expectedAmount: 349 })).status).toBe(403);
    expect((await onlyServices.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 4096, reason: 'a gift for the customer', freeOverride: true })).status).toBe(403);
    expect(proxmox.configured).toEqual([]);
  });
});

describe('the administrative adjustment', () => {
  it('needs the explicit free override and a reason', async () => {
    const { service } = await seed();
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 2048, reason: 'a gift for the customer' })).status).toBe(400);
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 2048, freeOverride: true })).status).toBe(400);
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 2048, reason: 'short', freeOverride: true })).status).toBe(400);
    expect(proxmox.configured).toEqual([]);
  });

  it('changes the resources, never the bill, and records the decision', async () => {
    const { service, subscription } = await seed();
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 2048, disk: 40, reason: 'Compensation for the outage of 3 November', freeOverride: true });
    expect(response.status).toBe(200);
    expect(stripe.amounts).toEqual([]);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).amount).toBe(249);
    const after = await prisma.vpsService.findUniqueOrThrow({ where: { id: service.id } });
    expect(after).toMatchObject({ ram: 2048, disk: 40, cpu: 1 });
    expect(after.resourceOverride).toMatchObject({ reason: expect.stringContaining('outage'), from: { ram: 1024, cpu: 1, disk: 20 }, to: { ram: 2048, cpu: 1, disk: 40 } });
    expect(await prisma.auditLog.count({ where: { action: 'admin.vps.resources' } })).toBe(1);
  });

  it('keeps the first plan size through a second adjustment', async () => {
    const { service } = await seed();
    const { client: admin } = await createAdmin(app);
    await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 2048, reason: 'first reason for it', freeOverride: true });
    await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { ram: 4096, reason: 'second reason for it', freeOverride: true });
    const after = await prisma.vpsService.findUniqueOrThrow({ where: { id: service.id } });
    expect(after.resourceOverride).toMatchObject({ from: { ram: 1024 }, to: { ram: 4096 } });
  });

  it('refuses a disk that would shrink', async () => {
    const { service } = await seed();
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('POST', `/api/admin/vps/${service.id}/resources`, { disk: 10, reason: 'trying to shrink it', freeOverride: true })).status).toBe(400);
  });
});

describe('the billing check', () => {
  it('lists a server whose size does not follow its plan, and leaves out a recorded override', async () => {
    const { service } = await seed();
    const { client: admin } = await createAdmin(app);
    await prisma.vpsService.update({ where: { id: service.id }, data: { ram: 4096 } });
    const listed = await admin.request('GET', '/api/admin/vps-billing-check');
    expect(listed.body.mismatches.map((m: { kind: string }) => m.kind)).toEqual(['SIZE_DIFFERS_FROM_PLAN']);

    await prisma.vpsService.update({ where: { id: service.id }, data: { resourceOverride: { reason: 'gift' } } });
    expect((await admin.request('GET', '/api/admin/vps-billing-check')).body.mismatches).toEqual([]);
  });

  it('lists a server without a subscription and a billed amount that is not the plan', async () => {
    const { service, subscription } = await seed(false, 100);
    const { client: admin } = await createAdmin(app);
    expect((await admin.request('GET', '/api/admin/vps-billing-check')).body.mismatches.map((m: { kind: string }) => m.kind)).toEqual(['AMOUNT_DIFFERS']);
    await prisma.vpsService.update({ where: { id: service.id }, data: { subscriptionId: null } });
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED' } });
    expect((await admin.request('GET', '/api/admin/vps-billing-check')).body.mismatches.map((m: { kind: string }) => m.kind)).toEqual(['NO_SUBSCRIPTION']);
  });
});
