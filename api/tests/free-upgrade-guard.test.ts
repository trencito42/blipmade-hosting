import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { settleFreeUpgradeOrder } from '../src/services/upgrades.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

async function fixture() {
  const { userId } = await registerAndLogin(app, 'free-upgrade@example.com');
  const actor = { id: userId, email: 'free-upgrade@example.com' };
  const product = await prisma.product.create({ data: { slug: 'free-upgrade-guard-test', name: 'Upgrade guard', category: 'BOTS', description: 'For test.', icon: 'cpu', minRam: 512, minCpu: 1, minDisk: 5, eggId: 1, deployable: true } });
  const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'A bot', status: 'ONLINE', ram: 1024, cpu: 1, disk: 10, price: 300, currency: 'EUR' } });
  return { actor, instance };
}

async function makeOrder(actorId: string, instanceId: string, overrides: { status?: 'PENDING' | 'CANCELLED' | 'REFUNDED'; kind?: 'UPGRADE' | 'NEW'; total?: number } = {}) {
  return prisma.order.create({ data: { number: `UPGRADE-${Math.random().toString(36).slice(2)}`, userId: actorId, kind: overrides.kind ?? 'UPGRADE', instanceId, status: overrides.status ?? 'PENDING', total: overrides.total ?? 0, currency: 'EUR' } });
}

describe('zero-cost resource settlement', () => {
  it('settles a legitimate free upgrade exactly once', async () => {
    const { actor, instance } = await fixture();
    const order = await makeOrder(actor.id, instance.id);
    await settleFreeUpgradeOrder(order.id, actor);
    await settleFreeUpgradeOrder(order.id, actor);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
    expect(await prisma.auditLog.count({ where: { action: 'instance.upgrade_credited', targetId: order.id } })).toBe(1);
  });

  it('never revives terminal or ineligible orders', async () => {
    const { actor, instance } = await fixture();
    for (const order of [
      await makeOrder(actor.id, instance.id, { status: 'CANCELLED' }),
      await makeOrder(actor.id, instance.id, { status: 'REFUNDED' }),
      await makeOrder(actor.id, instance.id, { total: 500 }),
      await makeOrder(actor.id, instance.id, { kind: 'NEW' }),
    ]) {
      await expect(settleFreeUpgradeOrder(order.id, actor)).rejects.toThrow();
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(order.status);
    }
  });
});
