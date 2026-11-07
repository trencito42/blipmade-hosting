import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

let app: FastifyInstance;

async function product(slug: string) {
  return prisma.product.create({
    data: {
      slug,
      name: slug,
      category: 'GAMES',
      description: 'Capability route fixture.',
      icon: 'box',
      deployable: true,
      eggId: 1,
    },
  });
}

describe('the effective instance capability manifest', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('comes from the stored product and deployment state, not from the browser', async () => {
    const owner = await registerAndLogin(app, 'capability-owner@example.test');
    const paper = await product('minecraft-paper');
    const instance = await prisma.instance.create({
      data: {
        userId: owner.userId,
        productId: paper.id,
        name: 'Paper test',
        status: 'ONLINE',
        ram: 2048,
        cpu: 1,
        disk: 10,
        price: 900,
        pterodactylServerId: 1901,
        pterodactylUuid: 'capability-paper',
      },
    });

    const answer = await owner.client.request('GET', `/api/instances/${instance.id}/game-capabilities`);
    expect(answer.status).toBe(200);
    expect(answer.body.manifest).toMatchObject({
      productSlug: 'minecraft-paper',
      family: 'minecraft-java',
      features: { plugins: { supported: true, available: true } },
    });
  });

  it('reports viewer restrictions and does not disclose an unshared instance', async () => {
    const owner = await registerAndLogin(app, 'capability-owner2@example.test');
    const viewer = await registerAndLogin(app, 'capability-viewer@example.test');
    const stranger = await registerAndLogin(app, 'capability-stranger@example.test');
    const node = await product('nodejs');
    const instance = await prisma.instance.create({
      data: {
        userId: owner.userId,
        productId: node.id,
        name: 'Node test',
        status: 'ONLINE',
        ram: 1024,
        cpu: 1,
        disk: 10,
        price: 500,
        pterodactylServerId: 1902,
        pterodactylUuid: 'capability-node',
      },
    });
    await prisma.instanceShare.create({
      data: {
        instanceId: instance.id,
        userId: viewer.userId,
        role: 'viewer',
        codeHash: 'capability-viewer-code',
        expiresAt: new Date(Date.now() + 60_000),
        redeemedAt: new Date(),
      },
    });

    const shared = await viewer.client.request('GET', `/api/instances/${instance.id}/game-capabilities`);
    expect(shared.status).toBe(200);
    expect(shared.body.manifest.features.git).toMatchObject({
      supported: true,
      available: false,
      reason: 'Your shared access is read-only.',
    });
    expect((await stranger.client.request('GET', `/api/instances/${instance.id}/game-capabilities`)).status).toBe(404);
  });
});
