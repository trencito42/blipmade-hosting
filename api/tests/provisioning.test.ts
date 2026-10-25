import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Pterodactyl panel is replaced with a fake so the provisioning flow can
 * be tested without creating real containers. The flow itself is real code.
 */
const panel = {
  servers: [] as { id: number; uuid: string }[],
  nextServerId: 100,
  installed: new Set<number>(),
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
    // A server that is created is not installed yet. The installation is
    // requested afterwards, and only once.
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
  reinstallServer: vi.fn(async (id: number) => {
    panel.installed.add(id);
  }),
  waitForServerInstalled: vi.fn(async () => true),
  updateServerDetails: vi.fn(async () => ({})),
  updateServerBuild: vi.fn(async () => ({})),
  updateServerStartup: vi.fn(async () => ({})),
  setServerEnvironment: vi.fn(async () => undefined),
  listNodes: vi.fn(async () => [
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
  ]),
  listNests: vi.fn(async () => [{ id: 5, name: 'Node.js' }]),
  listEggs: vi.fn(async () => [
    { id: 15, uuid: 'egg-uuid', name: 'node.js generic', docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_25', startup: 'echo start', nest_id: 5 },
  ]),
  listAllocations: vi.fn(async () => [
    { id: 73, ip: '10.77.0.11', alias: 'node1.blipmade.com', port: 30000, notes: null, assigned: false },
  ]),
  listUsers: vi.fn(async () => panel.accounts),
  // The account of a customer is found by the external id and by nothing else.
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
    readFile: vi.fn(async () => {
      throw new ClientApiError(404, 'The file is not in the container.');
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

const { prisma } = await import('../src/db.js');
const { provisionInstance } = await import('../src/services/provisioning.js');
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
  // The panel mocks are shared by the whole file, so the call counters start
  // at zero for every test.
  vi.clearAllMocks();
  panel.servers = [];
  panel.nextServerId = 100;
  panel.installed = new Set();
  panel.accounts = [];
  clientState.available = true;

  // The deployment health check talks to the container over HTTP. The panel
  // is faked, so the HTTP answer is faked too.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
});

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

  return prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'wordpress',
      status: 'PENDING',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      provisioningKey: 'test',
    },
  });
}

describe('provisioning', () => {
  it('creates one server and activates the instance', async () => {
    const instance = await seedInstance();

    await provisionInstance(instance.id);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).toBe('ONLINE');
    expect(updated?.pterodactylServerId).toBe(100);
    expect(panel.servers).toHaveLength(1);

    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    expect(events.some((event) => event.type === 'provisioned')).toBe(true);
  });

  it('does not create a second server when it is retried', async () => {
    const instance = await seedInstance();
    const application = await import('../src/services/pterodactyl/application.js');

    await provisionInstance(instance.id);
    const firstServerId = (await prisma.instance.findUnique({ where: { id: instance.id } }))?.pterodactylServerId;

    await provisionInstance(instance.id);
    const secondServerId = (await prisma.instance.findUnique({ where: { id: instance.id } }))?.pterodactylServerId;

    expect(panel.servers).toHaveLength(1);
    expect(secondServerId).toBe(firstServerId);

    // A retry must never reinstall a server that already exists: the files of
    // the customer would be lost.
    expect(application.reinstallServer).toHaveBeenCalledTimes(1);
  });

  it('does not reinstall a server after a crash between the install and the start', async () => {
    const instance = await seedInstance();
    const application = await import('../src/services/pterodactyl/application.js');

    // The container cannot be started, so the run stops after the install.
    clientState.available = false;
    await expect(provisionInstance(instance.id)).rejects.toBeTruthy();

    const afterFirst = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(afterFirst?.provisionStep).toBe('installed');
    expect(afterFirst?.pterodactylServerId).toBe(100);

    clientState.available = true;
    await provisionInstance(instance.id);

    // The second run continues after the install instead of reinstalling.
    expect(application.reinstallServer).toHaveBeenCalledTimes(1);
    const afterSecond = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(afterSecond?.status).toBe('ONLINE');
    expect(afterSecond?.provisionStep).toBe('activated');
  });

  it('refuses a second run while another run holds the instance', async () => {
    const instance = await seedInstance();
    await prisma.instance.update({ where: { id: instance.id }, data: { provisionLockAt: new Date() } });

    await expect(provisionInstance(instance.id)).rejects.toThrow(/already working/i);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).toBe('PENDING');
  });

  it('records the failure and does not activate the instance', async () => {    const instance = await seedInstance();

    // Break the panel so provisioning cannot finish.
    const application = await import('../src/services/pterodactyl/application.js');
    const original = application.listAllocations;
    (application as unknown as { listAllocations: unknown }).listAllocations = vi.fn(async () => {
      throw new Error('panel is down');
    });

    await expect(provisionInstance(instance.id)).rejects.toBeTruthy();

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).toBe('FAILED');
    expect(updated?.provisionError).toBeTruthy();
    expect(updated?.pterodactylServerId).toBeNull();

    (application as unknown as { listAllocations: unknown }).listAllocations = original;
  });

  it('names the missing client key when the container cannot be started', async () => {
    const instance = await seedInstance();
    clientState.available = false;

    await expect(provisionInstance(instance.id)).rejects.toBeTruthy();

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).toBe('FAILED');
    expect(updated?.provisionError).toContain('key bridge');
    // The server is created and installed before the start step, so it must
    // not be created a second time when the job is retried.
    expect(panel.servers).toHaveLength(1);
  });
});
