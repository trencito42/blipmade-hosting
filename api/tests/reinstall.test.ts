import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reinstall of a server.
 *
 * The panel wipes the files of the container and leaves it stopped, so a
 * reinstall that stops at the panel leaves a customer with a service that
 * does not run. These tests check the whole round trip: the panel is asked
 * to wipe the container, the platform waits for the installation to start,
 * the cursor of the provisioning goes back before the installation and the
 * worker is asked to bring the container back.
 */

/** What the fake panel remembers. */
const panel = {
  /** The calls that reached the client API of the panel. */
  clientCalls: [] as { url: string; uuid: string }[],
  /** The calls that reached the application API of the panel. */
  applicationCalls: [] as number[],
  /**
   * True when the panel marks the container as "not installed" after the
   * reinstall was asked for. A panel that does not take the reinstall keeps
   * saying "installed".
   */
  takesReinstall: true,
};

vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => true),
  clientToken: vi.fn((token: string) => token),
  reinstallServer: vi.fn(async (token: string, uuid: string) => {
    panel.clientCalls.push({ url: '/api/client/servers/uuid/settings/reinstall', uuid });
  }),
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

vi.mock('../src/services/pterodactyl/application.js', () => ({
  getServer: vi.fn(async (id: number) => ({
    id,
    uuid: 'server-uuid',
    identifier: 'server-id',
    name: 'Test instance',
    description: '',
    status: null,
    suspended: false,
    limits: { memory: 1024, swap: 0, disk: 10240, io: 500, cpu: 100 },
    feature_limits: { databases: 0, allocations: 0, backups: 0 },
    user: 4,
    node: 1,
    allocation: 73,
    nest: 5,
    egg: 15,
    container: {
      startup_command: 'npm run start',
      image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
      // The panel marks the container as not installed while the installation
      // runs, and as installed again when it is over.
      installed: panel.takesReinstall ? 0 : 1,
      environment: {},
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })),
  reinstallServer: vi.fn(async (id: number) => {
    panel.applicationCalls.push(id);
    panel.takesReinstall = true;
  }),
  waitForServerInstalled: vi.fn(async () => true),
}));

/** The jobs that were put on the queue. */
const queueMock = vi.hoisted(() => ({ calls: [] as { instanceId: string; options: Record<string, unknown> }[] }));
vi.mock('../src/services/queue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/queue.js')>();
  return {
    ...actual,
    enqueueProvisioning: async (instanceId: string, options: Record<string, unknown> = {}) => {
      queueMock.calls.push({ instanceId, options });
    },
  };
});

vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async (userId: string) => ({
    token: `ptlc_${'a'.repeat(44)}`,
    panelUserId: 4,
    externalId: `blipmade_acc_${userId}`,
    source: 'bridge',
  })),
  hasCustomerCredential: vi.fn(async () => true),
  storeCustomerCredential: vi.fn(async () => undefined),
  forgetCustomerCredential: vi.fn(async () => undefined),
}));

const { prisma } = await import('../src/db.js');
const { reinstallInstance } = await import('../src/services/reinstall.js');
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
  panel.clientCalls = [];
  panel.applicationCalls = [];
  panel.takesReinstall = true;
  queueMock.calls = [];
});

/**
 * An instance that is running on the node, the way the platform leaves it
 * after the provisioning.
 */
async function seedRunningInstance(options: { status?: 'ONLINE' | 'CANCELLED'; userId?: string } = {}) {
  const userId = options.userId ?? (await registerAndLogin(await getApp(), 'owner@example.com')).userId;
  const product = await prisma.product.create({
    data: {
      slug: 'discord-bot',
      name: 'Discord Bot',
      category: 'BOTS',
      description: 'A bot that talks in a chat.',
      icon: 'robot',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      deployable: true,
      eggId: 15,
      dockerImage: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'Discord Bot',
      status: options.status ?? 'ONLINE',
      pterodactylServerId: 20,
      pterodactylUuid: 'server-uuid',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      provisionStep: 'activated',
    },
  });
  return { instance, userId };
}

describe('the reinstall of a server', () => {
  it('hands the container back to the worker', async () => {
    const { instance } = await seedRunningInstance();

    const outcome = await reinstallInstance(instance.id, { requestedBy: 'user-1' });

    // The panel was asked to wipe the container with the key of the customer.
    expect(panel.clientCalls).toHaveLength(1);
    expect(panel.clientCalls[0]!.url).toContain('/settings/reinstall');
    expect(outcome.asked).toBe('client');

    // The cursor of the provisioning goes back before the installation, so the
    // run that follows waits for the installation, puts the application back,
    // starts the container and waits for it to serve.
    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.provisionStep).toBe('image_built');
    expect(after?.status).toBe('PROVISIONING');

    // The worker is asked to bring the container back.
    expect(queueMock.calls).toHaveLength(1);
    expect(queueMock.calls[0]!.instanceId).toBe(instance.id);
    expect(queueMock.calls[0]!.options.reason).toBe('reinstall');
  });

  it('refuses a cancelled instance and does not touch the panel', async () => {
    const { instance } = await seedRunningInstance({ status: 'CANCELLED' });

    await expect(reinstallInstance(instance.id)).rejects.toThrow(/cancelled/i);

    // The service of a customer whose paid period has ended is not started
    // again behind their back.
    expect(panel.clientCalls).toHaveLength(0);
    expect(queueMock.calls).toHaveLength(0);
    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('CANCELLED');
    expect(after?.provisionStep).toBe('activated');
  });

  it('asks the panel again when the panel did not take the reinstall', async () => {
    const { instance } = await seedRunningInstance();
    // A panel that keeps saying "installed" did not take the reinstall.
    panel.takesReinstall = false;

    const outcome = await reinstallInstance(instance.id);

    // The reinstall is asked for again with the key of the platform, which
    // the panel always takes.
    expect(panel.applicationCalls).toContain(20);
    expect(outcome.asked).toBe('application');
    expect(queueMock.calls).toHaveLength(1);
  });
});

describe('the route of the reinstall', () => {
  it('answers that the service is being rebuilt', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    const { instance } = await seedRunningInstance({ userId });

    const response = await client.request('POST', `/api/instances/${instance.id}/settings/reinstall`, {
      confirm: true,
    });

    expect(response.status).toBe(202);
    expect(response.body.reinstalled).toBe(true);
    expect(response.body.status).toBe('reinstalling');

    // The container is handed back to the worker, so it comes back on its own.
    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.provisionStep).toBe('image_built');
    expect(queueMock.calls).toHaveLength(1);

    // The customer is told that the files are gone.
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    expect(events.map((event) => event.message).join(' ')).toMatch(/reinstalled/i);
  });

  it('refuses a cancelled instance', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    const { instance } = await seedRunningInstance({ status: 'CANCELLED', userId });

    const response = await client.request('POST', `/api/instances/${instance.id}/settings/reinstall`, {
      confirm: true,
    });

    expect(response.status).toBe(409);
    expect(panel.clientCalls).toHaveLength(0);
  });
});
