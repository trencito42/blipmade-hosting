import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { repurposeConfirmed, repurposeVerdict, type RepurposeFacts } from '../src/services/repurpose-gate.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

const ok: RepurposeFacts = { sameProduct: false, targetSellable: true, bothInCatalogue: true, sameFamily: true, belowMinimum: false, priceEqual: true, sameEgg: false };

describe('the rules of a switch of variant', () => {
  it('lets a server move inside its family at the same price, and says whether the program is replaced', () => {
    expect(repurposeVerdict(ok)).toEqual({ eligible: true, reasons: [], kind: 'cross_egg', billing: 'unchanged' });
    expect(repurposeVerdict({ ...ok, sameEgg: true }).kind).toBe('same_egg');
  });

  it('refuses each thing that makes a switch unsafe, with the reason', () => {
    const cases: [Partial<RepurposeFacts>, RegExp][] = [
      [{ sameProduct: true }, /already runs/],
      [{ targetSellable: false }, /cannot replace/],
      [{ bothInCatalogue: false }, /in the catalogue/],
      [{ sameFamily: false }, /same family/],
      [{ belowMinimum: true }, /below the minimum/],
      [{ priceEqual: false }, /different price/],
    ];
    for (const [change, text] of cases) {
      const verdict = repurposeVerdict({ ...ok, ...change });
      expect(verdict.eligible).toBe(false);
      expect(verdict.reasons.join(' ')).toMatch(text);
    }
    expect(repurposeVerdict({ ...ok, priceEqual: false }).billing).toBe('different_price');
  });

  it('wants the target named on purpose, not a bare true', () => {
    expect(repurposeConfirmed({ confirm: true, confirmSlug: 'minecraft-folia' }, 'minecraft-folia')).toBe(true);
    expect(repurposeConfirmed({ confirm: true }, 'minecraft-folia')).toBe(false);
    expect(repurposeConfirmed({ confirm: true, confirmSlug: 'minecraft-paper' }, 'minecraft-folia')).toBe(false);
    expect(repurposeConfirmed({ confirmSlug: 'minecraft-folia' }, 'minecraft-folia')).toBe(false);
  });
});

describe('the routes of a switch', () => {
  beforeAll(async () => { await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  async function seed() {
    const { client, userId } = await registerAndLogin(await getApp(), 'repurpose@example.com');
    const product = (slug: string) => prisma.product.create({ data: { slug, name: slug, category: 'GAMES', description: 'A game server.', icon: 'box', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, maxRam: 8192, maxCpu: 4, maxDisk: 100, deployable: true, visible: true, eggId: slug === 'game-a' ? 1 : 2, prices: { create: { period: 'MONTHLY', baseAmount: 500, currency: 'EUR' } } } });
    const a = await product('game-a');
    const b = await product('game-b');
    const instance = await prisma.instance.create({ data: { userId, productId: a.id, name: 'game', status: 'ONLINE', ram: 1024, cpu: 1, disk: 10, price: 900, currency: 'EUR', pterodactylServerId: 7, pterodactylUuid: 'uuid-7' } });
    return { client, instance, b };
  }

  it('previews a switch without touching anything, and refuses a product outside the catalogue', async () => {
    const { client, instance } = await seed();
    const before = await prisma.repurposeJob.count();
    const answer = await client.request('GET', `/api/instances/${instance.id}/repurpose/preview?productSlug=game-b`);
    expect(answer.status).toBe(200);
    expect(answer.body.eligible).toBe(false);
    expect(answer.body.reasons.join(' ')).toMatch(/in the catalogue/);
    expect(await prisma.repurposeJob.count()).toBe(before);
  });

  it('does not start a switch that was not confirmed by name', async () => {
    const { client, instance } = await seed();
    const bare = await client.request('POST', `/api/instances/${instance.id}/repurpose`, { productSlug: 'game-b' });
    expect(bare.status).toBe(400);
    const wrong = await client.request('POST', `/api/instances/${instance.id}/repurpose`, { productSlug: 'game-b', confirm: true, confirmSlug: 'game-a' });
    expect(wrong.status).toBe(400);
    expect(await prisma.repurposeJob.count()).toBe(0);
  });
});
