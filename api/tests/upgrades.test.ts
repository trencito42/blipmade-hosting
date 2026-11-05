import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A resource change is a paid product. The tests cover the whole path: the
 * quote, the order, the payment and the moment the limits are applied.
 */
const panelState = { buildError: null as string | null, builds: 0, diskUsed: 1024 };

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

vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async () => ({
    token: 'ptlc_testtoken',
    panelUserId: 1,
    externalId: 'ext',
    source: 'issued',
  })),
}));

vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => false),
  clientToken: vi.fn(() => 'test-client-token'),
  sendPower: vi.fn(async () => undefined),
  sendCommand: vi.fn(async () => undefined),
  // The application of the product is written into the container before it
  // starts, so the files of the container are written here as well.
  writeFile: vi.fn(async () => undefined),
  getResources: vi.fn(async () => ({
    state: 'running',
    is_suspended: false,
    cpu_absolute: 0,
    memory_bytes: 0,
    network: { rx: 0, tx: 0 },
    disk: { used: panelState.diskUsed },
    uptime: 0,
  })),
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
const { prorateRemaining } = await import('../src/services/upgrades.js');
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
  panelState.diskUsed = 1024;
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
      // The price the server calculates for this configuration: the fee of
      // the instance and the price of the resources, with the rate card of the
      // platform: a gigabyte of memory, one processor and ten gigabytes of
      // disk.
      price: 374,
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
    // Two gigabytes of memory, one processor and ten gigabytes of disk, with
    // the fee of the instance.
    expect(response.body.quote.newPrice).toBe(574);
    expect(response.body.quote.priceDelta).toBe(200);
    expect(response.body.quote.requiresPayment).toBe(true);

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.price).toBe(374);
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
    expect(response.body.priceDelta).toBe(200);
    expect(response.body.checkoutUrl).toBeTruthy();

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.price).toBe(374);
    expect(panelState.builds).toBe(0);

    // The change waits as an order that was not paid for.
    const order = await prisma.order.findFirst({ where: { instanceId: instance.id } });
    expect(order?.kind).toBe('UPGRADE');
    expect(order?.status).toBe('AWAITING_PAYMENT');
    expect(order?.total).toBe(200);
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
      { id: 'evt_upgrade_paid', type: 'checkout.session.completed', orderId, amount: 200 },
      { headers: { 'x-internal-token': env.internalToken } },
    );
    expect(payment.status).toBe(200);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.ram).toBe(2048);
    expect(updated?.price).toBe(574);
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
      { id: 'evt_upgrade_rejected', type: 'checkout.session.completed', orderId, amount: 200 },
      { headers: { 'x-internal-token': env.internalToken } },
    );

    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.price).toBe(374);

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
    // The fee of the instance, half a gigabyte of memory, one processor and
    // five gigabytes of disk.
    expect(updated?.price).toBe(249);
    expect(panelState.builds).toBe(1);
  });

  it('refuses a disk reduction that is smaller than the files already stored', async () => {
    const { client, instance } = await seedInstance();
    panelState.diskUsed = 6 * 1024 * 1024 * 1024;

    const response = await client.request('PUT', `/api/instances/${instance.id}/resources`, {
      ram: 512,
      cpu: 1,
      disk: 5,
    });

    expect(response.status).toBe(400);
    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.disk).toBe(10);
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

  it('charges only the days left in the paid period', () => {
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-12-01T00:00:00.000Z');
    const now = new Date('2026-11-16T00:00:00.000Z');
    const half = prorateRemaining(200, start, end, now);
    expect(half.dueNow).toBe(100);
    expect(half.remainingDays).toBe(15);
    expect(prorateRemaining(200, null, null, now)).toEqual({ dueNow: 200, remainingDays: null });
  });

  it('prorates at the edges of the period, in a leap year and across a change of clock', () => {
    const start = new Date('2028-02-01T00:00:00.000Z');
    const end = new Date('2028-03-01T00:00:00.000Z'); // February 2028 has 29 days
    expect(prorateRemaining(290, start, end, start)).toEqual({ dueNow: 290, remainingDays: 29 });
    // The last second: almost nothing is left to pay for, and the rounding is to the cent, never below zero for a rise.
    const lastSecond = new Date(end.getTime() - 1000);
    expect(prorateRemaining(290, start, end, lastSecond).dueNow).toBe(0);
    expect(prorateRemaining(290, start, end, lastSecond).remainingDays).toBe(1);
    // After the end of the period the whole difference is for the next one.
    expect(prorateRemaining(290, start, end, new Date(end.getTime() + 1000))).toEqual({ dueNow: 290, remainingDays: null });
    // The change of the clock does not matter: the period is measured in UTC time.
    const dstStart = new Date('2026-03-01T00:00:00.000Z');
    const dstEnd = new Date('2026-04-01T00:00:00.000Z');
    expect(prorateRemaining(310, dstStart, dstEnd, new Date('2026-03-16T12:00:00.000Z')).dueNow).toBe(155);
    // A decrease gives back a negative amount in the same proportion.
    expect(prorateRemaining(-200, new Date('2026-11-01T00:00:00.000Z'), new Date('2026-12-01T00:00:00.000Z'), new Date('2026-11-16T00:00:00.000Z')).dueNow).toBe(-100);
    // A yearly period: half of the year left is half of the difference (the example of the issue: 120 to 180 EUR a year).
    expect(prorateRemaining(6000, new Date('2026-01-01T00:00:00.000Z'), new Date('2027-01-01T00:00:00.000Z'), new Date('2026-07-02T12:00:00.000Z')).dueNow).toBe(3000);
  });

  it('gives no credit for a period that was not paid, and never asks for a negative payment', async () => {
    const { client, instance } = await seedInstance();
    await prisma.subscription.create({
      data: {
        userId: instance.userId,
        instanceId: instance.id,
        status: 'PAST_DUE',
        amount: 374,
        currency: 'EUR',
        currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    const quote = await client.request('GET', `/api/instances/${instance.id}/resources/quote?ram=512&cpu=1&disk=5`);
    expect(quote.status).toBe(200);
    expect(quote.body.quote.requiresPayment).toBe(false);
    expect(quote.body.quote.priceDelta).toBe(0);
    expect(quote.body.quote.creditWithheld).toMatch(/not paid/);
    // The same decrease on a paid period is credited in proportion.
    await prisma.subscription.update({ where: { instanceId: instance.id }, data: { status: 'ACTIVE' } });
    const paid = await client.request('GET', `/api/instances/${instance.id}/resources/quote?ram=512&cpu=1&disk=5`);
    expect(paid.body.quote.priceDelta).toBeLessThan(0);
    expect(paid.body.quote.creditWithheld).toBeNull();
  });

  it('never lets four changes at once pass the limit of two', async () => {
    const { client, instance } = await seedInstance();
    const sizes = [[2048, 1, 10], [3072, 1, 10], [4096, 1, 10], [5120, 1, 10]];
    const answers = await Promise.all(sizes.map(([ram, cpu, disk]) => client.request('PUT', `/api/instances/${instance.id}/resources`, { ram, cpu, disk })));
    const orders = await prisma.order.count({ where: { instanceId: instance.id, kind: 'UPGRADE', status: { in: ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'FULFILLED'] } } });
    expect(orders).toBeLessThanOrEqual(2);
    expect(answers.filter((answer) => answer.status >= 400).length).toBeGreaterThanOrEqual(2);
  });

  it('lists the credits of the account, and only its own', async () => {
    const { client, instance } = await seedInstance();
    const other = await prisma.user.create({ data: { email: 'someone-else@example.com', passwordHash: 'x', firstName: 'S', lastName: 'E' } });
    await prisma.moneyAdjustment.createMany({
      data: [
        { userId: instance.userId, kind: 'credit', amount: 120, currency: 'EUR', reason: 'Unused time after a resource decrease' },
        { userId: instance.userId, kind: 'refund', amount: 999, currency: 'EUR', reason: 'A refund is not a credit' },
        { userId: other.id, kind: 'credit', amount: 555, currency: 'EUR', reason: 'Somebody else' },
      ],
    });
    const answer = await client.request('GET', '/api/billing/credit/history');
    expect(answer.status).toBe(200);
    expect(answer.body.credits).toHaveLength(1);
    expect(answer.body.credits[0]).toMatchObject({ amount: 120, currency: 'EUR', reason: 'Unused time after a resource decrease', orderNumber: null });
  });
});
