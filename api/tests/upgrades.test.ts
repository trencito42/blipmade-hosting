import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A resource change is a paid product. The tests cover the whole path: the
 * quote, the order, the payment and the moment the limits are applied.
 */
const panelState = { buildError: null as string | null, builds: 0 };

vi.mock('../src/services/pterodactyl/application.js', () => ({
  updateServerBuild: vi.fn(async () => {
    panelState.builds += 1;
    if (panelState.buildError) throw new Error(panelState.buildError);
    return {};
  }),
  updateServerDetails: vi.fn(async () => ({})),
  updateServerStartup: vi.fn(async () => ({})),
  setServerEnvironment: vi.fn(async () => undefined),
  deleteServer: vi.fn(async () => undefined),
}));

vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => false),
  clientToken: vi.fn(() => 'test-client-token'),
  sendPower: vi.fn(async () => undefined),
  sendCommand: vi.fn(async () => undefined),
  // The application of the product is written into the container before it
  // starts, so the files of the container are written here as well.
  writeFile: vi.fn(async () => undefined),
  // The error the panel raises when the key of the customer is refused.
  ClientApiError: class ClientApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
const { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  panelState.buildError = null;
  panelState.builds = 0;
});

async function seedInstance() {
  const { client, userId } = await registerAndLogin(await getApp(), 'upgrade@example.com');
  const product = await prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 1024,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });

  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'wordpress',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      // The price the server calculates for this configuration:
      // 149 base + 30 for the extra half GB of RAM + 10 for the extra disk.
      price: 189,
      currency: 'EUR',
      pterodactylServerId: 42,
      pterodactylUuid: 'uuid-42',
    },
  });

  return { client, instance };
}

describe('resource changes', () => {
  it('quotes a change without touching the instance', async () => {
    const { client, instance } = await seedInstance();

    const response = await client.request(
      'GET',
      `/api/instances/${instance.id}/resources/quote?ram=2048&cpu=1&disk=10`,
    );

    expect(response.status).toBe(200);
    expect(response.body.quote.newPrice).toBe(249);
    expect(response.body.quote.priceDelta).toBe(60);
    expect(response.body.quote.requiresPayment).toBe(true);

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.price).toBe(189);
    expect(panelState.builds).toBe(0);
  });

  it('does not change the instance before the payment', async () => {
    const { client, instance } = await seedInstance();

    const response = await client.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 2048,
      cpu: 1,
      disk: 10,
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('requires_payment');
    expect(response.body.priceDelta).toBe(60);
    expect(response.body.checkoutUrl).toBeTruthy();

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.price).toBe(189);
    expect(panelState.builds).toBe(0);

    // The change waits as an order that was not paid for.
    const order = await prisma.order.findFirst({ where: { instanceId: instance.id } });
    expect(order?.kind).toBe('UPGRADE');
    expect(order?.status).toBe('AWAITING_PAYMENT');
    expect(order?.total).toBe(60);
  });

  it('applies the change once the payment is confirmed', async () => {
    const { client, instance } = await seedInstance();

    const response = await client.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 2048,
      cpu: 1,
      disk: 10,
    });
    const orderId = response.body.order.id as string;

    const webhook = makeClient(await getApp());
    const payment = await webhook.request(
      'POST',
      '/api/webhooks/stripe/test',
      { id: 'evt_upgrade_paid', type: 'checkout.session.completed', orderId, amount: 60 },
      { headers: { 'x-internal-token': env.internalToken } },
    );
    expect(payment.status).toBe(200);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.ram).toBe(2048);
    expect(updated?.price).toBe(249);
    expect(panelState.builds).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('FULFILLED');
  });

  it('leaves the instance alone when the panel refuses the new limits', async () => {
    const { client, instance } = await seedInstance();

    const response = await client.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 2048,
      cpu: 1,
      disk: 10,
    });
    const orderId = response.body.order.id as string;

    panelState.buildError = 'the panel rejected the limits';

    const webhook = makeClient(await getApp());
    await webhook.request(
      'POST',
      '/api/webhooks/stripe/test',
      { id: 'evt_upgrade_rejected', type: 'checkout.session.completed', orderId, amount: 60 },
      { headers: { 'x-internal-token': env.internalToken } },
    );

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.price).toBe(189);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.fulfillmentStatus).toBe('FAILED');

    // The customer is told what happened.
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    expect(events.some((event) => event.message.includes('could not be applied'))).toBe(true);
  });

  it('applies a change that costs less right away', async () => {
    const { client, instance } = await seedInstance();

    const response = await client.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 512,
      cpu: 1,
      disk: 5,
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('applied');
    expect(response.body.priceDelta).toBeLessThan(0);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.ram).toBe(512);
    expect(updated?.price).toBe(149);
    expect(panelState.builds).toBe(1);
  });

  it('refuses a change outside the limits of the product', async () => {
    const { client, instance } = await seedInstance();

    const response = await client.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 999999,
      cpu: 1,
      disk: 10,
    });

    expect(response.status).toBe(400);
    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
  });
});
