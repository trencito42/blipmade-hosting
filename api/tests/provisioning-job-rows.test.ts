import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The history of the provisioning of an instance.
 *
 * Every step of a run writes a row of its own, so an operator can read what
 * the platform did and when. A row that says "running" for a step that is
 * not the one that is running says something that never happened, and the
 * rows of the steps are closed by the step that finishes, never by the step
 * that fails.
 */

vi.mock('../src/services/pterodactyl/application.js', () => ({
  getServer: vi.fn(async () => {
    throw new Error('the panel is not asked in this test');
  }),
  reinstallServer: vi.fn(async () => undefined),
  waitForServerInstalled: vi.fn(async () => true),
}));

vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => true),
  clientToken: vi.fn((token: string) => token),
  sendPower: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  listFiles: vi.fn(async () => []),
  readFile: vi.fn(async () => ({ content: '' })),
  ClientApiError: class ClientApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async () => ({
    token: `ptlc_${'a'.repeat(44)}`,
    panelUserId: 4,
    externalId: 'blipmade_acc_test',
    source: 'bridge',
  })),
  hasCustomerCredential: vi.fn(async () => true),
  storeCustomerCredential: vi.fn(async () => undefined),
  forgetCustomerCredential: vi.fn(async () => undefined),
}));

const { prisma } = await import('../src/db.js');
const { completeStep, failProvisioning } = await import('../src/services/provisioning.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

/**
 * An instance with a paid order, the way the platform makes it when the money
 * of the order arrived.
 */
async function seedInstance() {
  const { userId } = await registerAndLogin(await getApp(), 'owner@example.com');
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
      deployable: true,
      eggId: 15,
      dockerImage: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  const order = await prisma.order.create({
    data: {
      number: 'BM-00001',
      userId,
      status: 'PAID',
      total: 149,
      currency: 'EUR',
      fulfillmentStatus: 'PROVISIONING',
      items: {
        create: {
          productId: product.id,
          name: 'WordPress',
          quantity: 1,
          unitAmount: 149,
          total: 149,
          currency: 'EUR',
          config: { ram: 1024, cpu: 1, disk: 10, optionCodes: [] },
        },
      },
    },
  });
  const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      orderId: order.id,
      orderItemId: item!.id,
      name: 'wordpress',
      status: 'PROVISIONING',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      provisioningKey: `test-${order.id}`,
    },
  });
  return instance;
}

/** The rows of the history of an instance, in the order they were written. */
async function jobRows(instanceId: string) {
  return prisma.provisioningJob.findMany({
    where: { instanceId },
    orderBy: { createdAt: 'asc' },
    select: { step: true, status: true, error: true },
  });
}

describe('the history of the provisioning', () => {
  it('closes only the rows of the step that finished', async () => {
    const instance = await seedInstance();

    // Two steps are running at the same time: the run that is going on and a
    // row that an earlier attempt left behind.
    await prisma.provisioningJob.create({
      data: { instanceId: instance.id, step: 'installed', status: 'running', attempts: 1 },
    });
    await prisma.provisioningJob.create({
      data: { instanceId: instance.id, step: 'started', status: 'running', attempts: 1 },
    });

    await completeStep(instance.id, 'started');

    const rows = await jobRows(instance.id);
    // The step that finished is closed.
    expect(rows.find((row) => row.step === 'started')?.status).toBe('completed');
    // The row of the other step says that the other step is still running,
    // because it is.
    expect(rows.find((row) => row.step === 'installed')?.status).toBe('running');
  });

  it('fails only the rows of the step that failed', async () => {
    const instance = await seedInstance();

    await prisma.provisioningJob.create({
      data: { instanceId: instance.id, step: 'installed', status: 'running', attempts: 1 },
    });
    await prisma.provisioningJob.create({
      data: { instanceId: instance.id, step: 'started', status: 'running', attempts: 1 },
    });

    await failProvisioning(instance.id, 'installed', 'the install did not finish in time');

    const rows = await jobRows(instance.id);
    const failed = rows.find((row) => row.step === 'installed');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('the install did not finish in time');
    // The step that did not fail is not written down as a step that failed.
    expect(rows.find((row) => row.step === 'started')?.status).toBe('running');
  });

  it('closes the row of an earlier attempt of the same step', async () => {
    const instance = await seedInstance();
    const { beginProvisioning } = await import('../src/services/provisioning.js');

    // A run that started the step and never finished leaves its row behind.
    await prisma.provisioningJob.create({
      data: { instanceId: instance.id, step: 'installed', status: 'running', attempts: 1 },
    });

    await beginProvisioning(instance, 'installed');

    const rows = await jobRows(instance.id);
    // The row of the attempt that was taken over is closed, and the new
    // attempt has a row of its own.
    expect(rows.filter((row) => row.step === 'installed')).toHaveLength(2);
    expect(rows.filter((row) => row.status === 'running')).toHaveLength(1);
  });
});
