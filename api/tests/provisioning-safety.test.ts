import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Pterodactyl panel is replaced with a fake, so the safety rules of the
 * provisioning can be tested without a real container. The provisioning flow
 * itself is real code.
 */
const panel = {
  servers: [] as { id: number; uuid: string }[],
  nextServerId: 100,
  installed: new Set<number>(),
  deleted: [] as number[],
  accounts: [] as {
    id: number;
    username: string;
    email: string;
    external_id: string | null;
    first_name: string | null;
    last_name: string | null;
    root_admin: boolean;
    created_at: string;
  }[],
  nodes: [
    {
      id: 1,
      uuid: 'node-uuid',
      name: 'games-node-01',
      fqdn: 'node1.blipmade.com',
      scheme: 'https',
      // The panel counts the memory and the disk of a node in megabytes.
      memory: 122880,
      disk: 819200,
      memory_overallocate: 0,
      disk_overallocate: 0,
      maintenance_mode: false,
      allocated_resources: { memory: 1024, disk: 5120 },
    },
  ],
  /** Runs after a container is made, so a test can change the world. */
  afterCreate: null as null | (() => Promise<void>),
};

vi.mock('../src/services/pterodactyl/application.js', () => ({
  listServers: vi.fn(async () => []),
  eggEnvironmentTemplate: vi.fn(async () => ({
    USER_UPLOAD: '1',
    AUTO_UPDATE: '0',
    MAIN_FILE: 'index.js',
    NODE_ARGS: '',
    NODE_PACKAGES: '',
    UNNODE_PACKAGES: '',
    GIT_ADDRESS: '',
    BRANCH: '',
    USERNAME: '',
    ACCESS_TOKEN: '',
  })),
  getServer: vi.fn(async (id: number) => {
    const server = panel.servers.find((entry) => entry.id === id);
    if (!server) throw new Error('server not found');
    return {
      id: server.id,
      uuid: server.uuid,
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
        startup_command: 'echo start',
        image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
        installed: panel.installed.has(id) ? 1 : 0,
        environment: {},
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }),
  createServer: vi.fn(async (input: { name: string }) => {
    const id = panel.nextServerId++;
    const server = { id, uuid: `uuid-${id}` };
    panel.servers.push(server);
    if (panel.afterCreate) await panel.afterCreate();
    return {
      id,
      uuid: server.uuid,
      name: input.name,
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
        startup_command: 'echo start',
        image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
        // A server that is created is not installed yet.
        installed: 0,
        environment: {},
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }),
  // The compensation of a failed run deletes the container of the instance.
  deleteServer: vi.fn(async (id: number) => {
    const index = panel.servers.findIndex((entry) => entry.id === id);
    if (index >= 0) panel.servers.splice(index, 1);
    panel.deleted.push(id);
  }),
  reinstallServer: vi.fn(async (id: number) => {
    panel.installed.add(id);
  }),
  waitForServerInstalled: vi.fn(async () => true),
  updateServerDetails: vi.fn(async () => ({})),
  updateServerBuild: vi.fn(async () => ({})),
  updateServerStartup: vi.fn(async () => ({})),
  setServerEnvironment: vi.fn(async () => undefined),
  listNodes: vi.fn(async () => panel.nodes),
  listNests: vi.fn(async () => [{ id: 5, name: 'Node.js' }]),
  listEggs: vi.fn(async () => [
    { id: 15, uuid: 'egg-uuid', name: 'node.js generic', docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_25', startup: 'echo start', nest_id: 5 },
  ]),
  listAllocations: vi.fn(async () => [
    { id: 73, ip: '10.77.0.11', alias: 'node1.blipmade.com', port: 30000, notes: null, assigned: false },
  ]),
  listUsers: vi.fn(async () => panel.accounts),
  findUserByExternalId: vi.fn(async (externalId: string) =>
    panel.accounts.find((account) => account.external_id === externalId) ?? null,
  ),
  createUser: vi.fn(async (input: { email: string; external_id?: string; first_name?: string; last_name?: string }) => {
    const account = {
      id: 4,
      username: 'bm-customer',
      email: input.email,
      external_id: input.external_id ?? null,
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      root_admin: false,
      created_at: new Date().toISOString(),
    };
    panel.accounts.push(account);
    return account;
  }),
  ping: vi.fn(async () => true),
}));

/**
 * The Client API is faked as well. Power control needs the separate client
 * key, so the tests cover both the configured and the missing case.
 */
const clientState = { available: true };
vi.mock('../src/services/pterodactyl/client.js', () => {
  // The error the panel raises when the key of the customer is refused, and
  // the one it raises when a file is not in the container.
  class ClientApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    clientApiAvailable: vi.fn(() => clientState.available),
    clientToken: vi.fn((token: string) => token),
    sendPower: vi.fn(async () => undefined),
    // The application of the product is written into the container before it
    // starts, so the files of the container are written here as well.
    writeFile: vi.fn(async () => undefined),
    // The container holds nothing when the provisioning starts, so the
    // application is not in it yet and the platform writes it.
    listFiles: vi.fn(async () => []),
    // A file that is not in the listing must never be read: the panel answers
    // with an error and not with a "not found" when a file is not there.
    readFile: vi.fn(async () => {
      throw new ClientApiError(500, 'A file that is not in the listing must not be read.');
    }),
    ClientApiError,
  };
});

/**
 * The credential of a customer is faked as well. It comes from the bridge of
 * the panel in the real world, and the bridge is not installed on a test
 * machine.
 */
vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async () => {
    if (!clientState.available) {
      const { unavailable } = await import('../src/lib/errors.js');
      throw unavailable('The key bridge of the panel is not installed.');
    }
    return {
      token: `ptlc_${'a'.repeat(44)}`,
      panelUserId: 4,
      externalId: 'blipmade_acc_test',
      source: 'bridge',
    };
  }),
  hasCustomerCredential: vi.fn(async () => clientState.available),
  storeCustomerCredential: vi.fn(async () => undefined),
  forgetCustomerCredential: vi.fn(async () => undefined),
}));

/**
 * The payment provider is faked, so the refund of a failed provisioning can be
 * watched. The rest of the module is the real one.
 */
const stripeMock = vi.hoisted(() => ({ refundPayment: vi.fn() }));
vi.mock('../src/services/stripe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/stripe.js')>();
  return { ...actual, refundPayment: stripeMock.refundPayment };
});

const { prisma } = await import('../src/db.js');
const { provisionInstance, compensateFailedProvisioning, nodeCapacity, requiredCapacity } = await import(
  '../src/services/provisioning.js'
);
const { nextOrderNumber } = await import('../src/routes/orders.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  const { closeApp } = await import('./helpers.js');
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
  panel.servers = [];
  panel.nextServerId = 100;
  panel.installed = new Set();
  panel.deleted = [];
  panel.accounts = [];
  panel.afterCreate = null;
  panel.nodes = [
    {
      id: 1,
      uuid: 'node-uuid',
      name: 'games-node-01',
      fqdn: 'node1.blipmade.com',
      scheme: 'https',
      memory: 122880,
      disk: 819200,
      memory_overallocate: 0,
      disk_overallocate: 0,
      maintenance_mode: false,
      allocated_resources: { memory: 1024, disk: 5120 },
    },
  ];
  clientState.available = true;

  // The provider returns the money of the order, the way it does in the real
  // world. A test can change this to see what happens when it cannot.
  stripeMock.refundPayment.mockImplementation(async (params: { orderId: string }) => {
    await prisma.payment.updateMany({ where: { orderId: params.orderId }, data: { status: 'REFUNDED' } });
    return true;
  });

  // The deployment health check talks to the container over HTTP. The panel
  // is faked, so the HTTP answer is faked too.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
});

async function seedProduct() {
  return prisma.product.create({
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
}

/**
 * An instance that belongs to an order, the way the platform makes it when the
 * money of the order arrived.
 */
async function seedInstanceWithOrder(options: {
  status?: 'PENDING' | 'AWAITING_PAYMENT' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'FAILED';
  disk?: number;
  cpu?: number;
  ram?: number;
} = {}) {
  const { userId } = await registerAndLogin(await getApp(), 'owner@example.com');
  const product = await seedProduct();
  const status = options.status ?? 'PAID';
  const ram = options.ram ?? 1024;
  const cpu = options.cpu ?? 1;
  const disk = options.disk ?? 10;

  const order = await prisma.order.create({
    data: {
      number: 'BM-00001',
      userId,
      status,
      total: 149,
      currency: 'EUR',
      fulfillmentStatus: status === 'PAID' || status === 'FULFILLED' ? 'PROVISIONING' : 'NOT_STARTED',
      items: {
        create: {
          productId: product.id,
          name: 'WordPress',
          quantity: 1,
          unitAmount: 149,
          total: 149,
          currency: 'EUR',
          config: { ram, cpu, disk, optionCodes: [] },
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
      status: 'PENDING',
      ram,
      cpu,
      disk,
      price: 149,
      currency: 'EUR',
      provisioningKey: `test-${order.id}`,
    },
  });

  return { order, instance, userId, product };
}

describe('the capacity gate of the provisioning', () => {
  it('brings the disk of an instance and the disk of a node to the same unit', () => {
    const capacity = nodeCapacity({
      id: 1,
      uuid: 'node-uuid',
      name: 'games-node-01',
      fqdn: 'node1.blipmade.com',
      scheme: 'https',
      memory: 122880,
      disk: 819200,
      memory_overallocate: 0,
      disk_overallocate: 0,
      maintenance_mode: false,
      allocated_resources: { memory: 1024, disk: 5120 },
    });
    const required = requiredCapacity({ ram: 1024, disk: 10, cpu: 1 });

    // The panel counts the disk of a node in megabytes and the disk of a plan
    // in gigabytes.
    expect(capacity.freeDiskMb).toBe(819200 + 0 - 5120);
    expect(required.diskMb).toBe(10 * 1024);
    expect(required.diskGb).toBe(10);
    expect(required.memoryMb).toBe(1024);
  });

  it('refuses an instance whose disk does not fit on the node and names the values', async () => {
    const { instance } = await seedInstanceWithOrder({ status: 'PAID', disk: 20 });

    // The node has ten gigabytes of free disk, the instance asks for twenty.
    panel.nodes[0] = {
      ...panel.nodes[0]!,
      disk: 10240,
      disk_overallocate: 0,
      allocated_resources: { memory: 1024, disk: 0 },
    };

    const failure = await provisionInstance(instance.id).then(
      () => null,
      (error) => error as Error,
    );
    expect(failure?.message).toMatch(/10240 MB of free disk/);
    expect(failure?.message).toMatch(/20480 MB of disk \(20 GB\)/);

    // No container was made and the node was not touched.
    expect(panel.servers).toHaveLength(0);
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.pterodactylServerId).toBeNull();
    expect(updated?.status).toBe('FAILED');
  });

  it('refuses an instance whose memory does not fit on the node and names the values', async () => {
    const { instance } = await seedInstanceWithOrder({ status: 'PAID', ram: 4096 });

    panel.nodes[0] = {
      ...panel.nodes[0]!,
      memory: 2048,
      memory_overallocate: 0,
      allocated_resources: { memory: 0, disk: 0 },
    };

    const failure = await provisionInstance(instance.id).then(
      () => null,
      (error) => error as Error,
    );
    expect(failure?.message).toMatch(/2048 MB of free memory/);
    expect(failure?.message).toMatch(/4096 MB of memory/);
    expect(panel.servers).toHaveLength(0);
  });

  it('refuses an instance that asks for more processor than the product allows', async () => {
    const { instance, product } = await seedInstanceWithOrder({ status: 'PAID', cpu: 16 });
    await prisma.product.update({ where: { id: product.id }, data: { maxCpu: 4 } });

    const failure = await provisionInstance(instance.id).then(
      () => null,
      (error) => error as Error,
    );
    expect(failure?.message).toMatch(/16 vCPU/);
    expect(panel.servers).toHaveLength(0);
  });
});

describe('the payment gate of the provisioning', () => {
  it('makes no server and no allocation for an order that was not paid', async () => {
    const { instance, order } = await seedInstanceWithOrder({ status: 'AWAITING_PAYMENT' });

    await expect(provisionInstance(instance.id)).rejects.toThrow(/awaiting_payment/);

    // Nothing was made on the panel and the instance holds no capacity.
    expect(panel.servers).toHaveLength(0);
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.pterodactylServerId).toBeNull();
    expect(updated?.pterodactylAllocation).toBeNull();
    expect(updated?.pterodactylNodeId).toBeNull();
    expect(updated?.status).not.toBe('ONLINE');

    // The reason is in the journal of the instance and in the audit journal.
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    const refusal = events.find((event) => event.type === 'refused');
    expect(refusal?.message).toContain(order.number);
    const audits = await prisma.auditLog.findMany({ where: { action: 'instance.provision_refused' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.targetId).toBe(instance.id);
  });

  it('refuses an order that was cancelled', async () => {
    const { instance } = await seedInstanceWithOrder({ status: 'CANCELLED' });

    await expect(provisionInstance(instance.id)).rejects.toThrow(/cancelled/);
    expect(panel.servers).toHaveLength(0);
  });

  it('refuses a run when the order is cancelled while the container is made', async () => {
    const { instance, order } = await seedInstanceWithOrder({ status: 'PAID' });

    // The order is cancelled while the run is working.
    panel.afterCreate = async () => {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    };

    await expect(provisionInstance(instance.id)).rejects.toThrow(/cancelled/);

    // The container that was made is deleted instead of being left on the
    // node, and the instance keeps no address.
    expect(panel.servers).toHaveLength(0);
    expect(panel.deleted).toEqual([100]);
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.pterodactylServerId).toBeNull();
    expect(updated?.pterodactylAllocation).toBeNull();
  });
});

describe('the compensation of a failed provisioning', () => {
  it('leaves no server, no allocation and the money back', async () => {
    const { instance, order } = await seedInstanceWithOrder({ status: 'PAID' });

    // The container cannot be started, so the run fails after it was made.
    clientState.available = false;
    await expect(provisionInstance(instance.id, { final: true })).rejects.toBeTruthy();

    // No container on the node.
    expect(panel.servers).toHaveLength(0);
    expect(panel.deleted).toEqual([100]);

    // The instance holds no address any more.
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.pterodactylServerId).toBeNull();
    expect(updated?.pterodactylUuid).toBeNull();
    expect(updated?.pterodactylAllocation).toBeNull();
    expect(updated?.pterodactylNodeId).toBeNull();

    // The money of the order is back with the customer.
    const refunded = await prisma.order.findUnique({ where: { id: order.id } });
    expect(refunded?.status).toBe('REFUNDED');
    expect(stripeMock.refundPayment).toHaveBeenCalledTimes(1);
    expect(stripeMock.refundPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.id }));

    // Every step of the compensation is in the journal.
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    const types = events.map((event) => event.type);
    expect(types).toContain('server_deleted');
    expect(types).toContain('refunded');
    expect(types).toContain('compensated');
    const audits = await prisma.auditLog.findMany({ where: { action: 'order.refunded' } });
    expect(audits).toHaveLength(1);
  });

  it('does not refund twice when the job is delivered again', async () => {
    const { instance, order } = await seedInstanceWithOrder({ status: 'PAID' });

    clientState.available = false;
    await expect(provisionInstance(instance.id, { final: true })).rejects.toBeTruthy();
    expect(stripeMock.refundPayment).toHaveBeenCalledTimes(1);

    // The job comes back a second time.
    const result = await compensateFailedProvisioning(instance.id, 'the job was delivered again');

    expect(result.refunded).toBe(false);
    expect(result.refundDue).toBe(false);
    expect(stripeMock.refundPayment).toHaveBeenCalledTimes(1);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.status).toBe('REFUNDED');
    // The container is not deleted a second time.
    expect(panel.deleted).toEqual([100]);
  });

  it('flags the refund when the payments are not configured', async () => {
    const { instance, order } = await seedInstanceWithOrder({ status: 'PAID' });

    // The provider cannot return the money.
    stripeMock.refundPayment.mockImplementation(async () => false);
    clientState.available = false;
    await expect(provisionInstance(instance.id, { final: true })).rejects.toBeTruthy();

    // The order is flagged for the refund instead of being silently paid.
    const pending = await prisma.order.findUnique({ where: { id: order.id } });
    expect(pending?.status).toBe('PAID');
    expect(pending?.fulfillmentStatus).toBe('FAILED');
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    expect(events.map((event) => event.type)).toContain('refund_due');
    const audits = await prisma.auditLog.findMany({ where: { action: 'order.refund_pending' } });
    expect(audits).toHaveLength(1);

    // The container and the address are gone all the same.
    expect(panel.servers).toHaveLength(0);
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.pterodactylServerId).toBeNull();
    expect(updated?.pterodactylAllocation).toBeNull();
  });
});

describe('the attempt of a provisioning', () => {
  it('makes one server when the run is repeated after the database refused the write', async () => {
    const { instance, userId, product } = await seedInstanceWithOrder({ status: 'PAID' });

    // Another instance already holds the number of the container, so the write
    // of the identifiers of the server is refused by the database.
    const decoy = await prisma.instance.create({
      data: {
        userId,
        productId: product.id,
        name: 'decoy',
        status: 'ONLINE',
        ram: 1024,
        cpu: 1,
        disk: 10,
        price: 149,
        currency: 'EUR',
        provisioningKey: 'decoy',
        pterodactylServerId: 100,
        pterodactylUuid: 'uuid-decoy',
      },
    });

    await expect(provisionInstance(instance.id)).rejects.toBeTruthy();

    // The container exists on the node, but the instance does not know it.
    expect(panel.servers).toHaveLength(1);
    const afterFirst = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(afterFirst?.pterodactylServerId).toBeNull();

    // The write goes through now.
    await prisma.instance.delete({ where: { id: decoy.id } });

    // The second run finds the attempt and reuses the container instead of
    // making a second one.
    await provisionInstance(instance.id);
    expect(panel.servers).toHaveLength(1);
    const afterSecond = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(afterSecond?.pterodactylServerId).toBe(100);
    expect(afterSecond?.status).toBe('ONLINE');
  });

  it('makes one server when two runs happen at the same time', async () => {
    const { instance } = await seedInstanceWithOrder({ status: 'PAID' });

    const results = await Promise.allSettled([
      provisionInstance(instance.id),
      provisionInstance(instance.id),
    ]);

    expect(panel.servers).toHaveLength(1);
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.pterodactylServerId).toBe(100);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
  });
});

describe('the number of an order', () => {
  it('hands out a different number to a hundred orders that arrive at the same time', async () => {
    const { userId } = await registerAndLogin(await getApp(), 'owner@example.com');

    const numbers: string[] = [];
    const failures: unknown[] = [];

    // The orders arrive in waves, the way they arrive in the real world.
    for (let wave = 0; wave < 4; wave += 1) {
      const batch = await Promise.allSettled(
        Array.from({ length: 25 }, async () => {
          const number = await nextOrderNumber();
          await prisma.order.create({ data: { number, userId, total: 149, currency: 'EUR' } });
          return number;
        }),
      );
      for (const result of batch) {
        if (result.status === 'fulfilled') numbers.push(result.value);
        else failures.push(result.reason);
      }
    }

    // No order failed on the unique column and no number was handed out
    // twice.
    expect(failures).toEqual([]);
    expect(numbers).toHaveLength(100);
    expect(new Set(numbers).size).toBe(100);
    for (const number of numbers) expect(number).toMatch(/^BM-\d{5}$/);

    const stored = await prisma.order.findMany({ select: { number: true } });
    expect(stored).toHaveLength(100);
    expect(new Set(stored.map((order) => order.number)).size).toBe(100);
  });

  it('never hands out a number that is already in use', async () => {
    const { userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    await prisma.order.create({ data: { number: 'BM-00042', userId, total: 149, currency: 'EUR' } });

    // The counter starts at the highest number that exists.
    const number = await nextOrderNumber();
    expect(number).toBe('BM-00043');
  });
});
