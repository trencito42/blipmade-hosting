import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The port of the allocation, and the application that answers on it.
 *
 * The node publishes the port of the allocation for the container, and the
 * route of the domain of the customer points at that same port. The
 * application that the platform writes into the container therefore has to
 * listen on it: an application that listens on a port of its own is a
 * container that the node publishes but nobody can reach, and the route of the
 * domain of the customer answers with "connection refused".
 *
 * The check of the deployment has to ask that port as well. A product whose
 * probe is the container itself was accepted while the application inside it
 * listened somewhere else, so the platform said "online" for a service that
 * nobody could reach.
 */

const panel = {
  servers: [] as { id: number; uuid: string }[],
  nextServerId: 100,
  installed: new Set<number>(),
  accounts: [] as { id: number; external_id: string | null }[],
  /** The state the node reports for the container. */
  containerState: 'running',
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
    const uuid = `uuid-${id}`;
    panel.servers.push({ id, uuid });
    return {
      id,
      uuid,
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
    {
      id: 15,
      uuid: 'egg-uuid',
      name: 'node.js generic',
      docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
      startup: 'echo start',
      nest_id: 5,
    },
  ]),
  listAllocations: vi.fn(async () => [
    { id: 73, ip: '10.77.0.11', alias: 'node1.blipmade.com', port: 30000, notes: null, assigned: false },
  ]),
  listUsers: vi.fn(async () => panel.accounts),
  findUserByExternalId: vi.fn(async (externalId: string) =>
    panel.accounts.find((account) => account.external_id === externalId) ?? null,
  ),
  createUser: vi.fn(async (input: { email: string; external_id?: string }) => {
    const account = { id: 4, external_id: input.external_id ?? null };
    panel.accounts.push(account);
    return account;
  }),
  ping: vi.fn(async () => true),
}));

/** The files that are written into the container, so the test can read them. */
const writtenFiles: { path: string; content: string }[] = [];

/** The files that are already in the container when the provisioning starts. */
const containerFiles = new Map<string, string>();

vi.mock('../src/services/pterodactyl/client.js', () => {
  class ClientApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    clientApiAvailable: vi.fn(() => true),
    clientToken: vi.fn((token: string) => token),
    sendPower: vi.fn(async () => undefined),
    readFile: vi.fn(async (_token: string, _uuid: string, path: string) => {
      const content = containerFiles.get(path);
      if (content === undefined) throw new ClientApiError(404, `The file ${path} is not in the container.`);
      return { content, encoding: 'utf-8' };
    }),
    writeFile: vi.fn(async (_token: string, _uuid: string, path: string, content: string) => {
      writtenFiles.push({ path, content });
      containerFiles.set(path, content);
    }),
    getResources: vi.fn(async () => ({
      state: panel.containerState,
      memory_bytes: 64 * 1024 * 1024,
      is_suspended: false,
    })),
    ClientApiError,
  };
});

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
const { provisionInstance } = await import('../src/services/provisioning.js');
const { starterFiles } = await import('../src/services/starter-apps.js');
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
  panel.servers = [];
  panel.nextServerId = 100;
  panel.installed = new Set();
  panel.accounts = [];
  panel.containerState = 'running';
  writtenFiles.length = 0;
  containerFiles.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));
});

async function seedInstance(probe: Record<string, unknown> | null) {
  const { userId } = await registerAndLogin(await getApp(), 'owner@example.com');
  const product = await prisma.product.create({
    data: {
      slug: 'discord-bot',
      name: 'Discord Bot',
      category: 'BOTS',
      description: 'A bot that talks to Discord.',
      icon: 'bot',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      deployable: true,
      eggId: 15,
      dockerImage: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
      healthProbe: probe as never,
    },
  });

  return prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'discord-bot',
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

describe('the application of a new container', () => {
  it('listens on the port of the allocation', async () => {
    const instance = await seedInstance({ kind: 'http', path: '/' });

    await provisionInstance(instance.id);

    const application = writtenFiles.find((file) => file.path === 'index.js');
    expect(application).toBeDefined();
    // The node publishes the port 30000 for this allocation, so the
    // application has to answer there. The panel gives that port to the
    // container in `SERVER_PORT`, so the application reads that name first.
    expect(application!.content).toContain(
      'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30000)',
    );
  });

  it('is not accepted while the application does not answer on the port of the allocation', async () => {
    const instance = await seedInstance({ kind: 'container' });

    // The container is alive, but nothing answers on the published port.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    await expect(provisionInstance(instance.id)).rejects.toThrow(/does not answer on 10\.77\.0\.11:30000/);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).not.toBe('ONLINE');
    expect(updated?.status).toBe('FAILED');
    expect(updated?.provisionError).toContain('does not answer on 10.77.0.11:30000');
  });

  it('is accepted when the application answers on the port of the allocation', async () => {
    const instance = await seedInstance({ kind: 'container' });

    await provisionInstance(instance.id);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).toBe('ONLINE');
  });

  it('corrects the port of a file of the platform that is already in the container', async () => {
    const instance = await seedInstance({ kind: 'http', path: '/' });

    // The container holds the application of the platform, written before the
    // port was corrected: it listened on a port of its own.
    const platform = starterFiles({
      slug: 'discord-bot',
      name: 'Discord Bot',
      healthPath: '/',
      port: 30000,
    });
    const code = platform.find((file) => file.path === 'index.js')!;
    containerFiles.set(
      'index.js',
      code.content.replace(
        'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30000);',
        'const port = Number(process.env.PORT || 3000);',
      ),
    );
    containerFiles.set('package.json', platform.find((file) => file.path === 'package.json')!.content);

    await provisionInstance(instance.id);

    const application = writtenFiles.find((file) => file.path === 'index.js');
    expect(application).toBeDefined();
    expect(application!.content).toContain(
      'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30000)',
    );
    // The package of the platform is already right, so it is not written again.
    expect(writtenFiles.find((file) => file.path === 'package.json')).toBeUndefined();
  });

  it('never writes over the code of a customer', async () => {
    const instance = await seedInstance({ kind: 'http', path: '/' });

    // The customer replaced the application of the platform with their own.
    const customer = [
      'const http = require("node:http");',
      'const port = Number(process.env.SERVER_PORT || process.env.PORT || 30000);',
      'http.createServer((request, response) => {',
      '  response.writeHead(200);',
      '  response.end("the code of the customer");',
      '}).listen(port);',
      '',
    ].join('\n');
    containerFiles.set('index.js', customer);

    await provisionInstance(instance.id);

    // The file of the customer is not written over.
    expect(writtenFiles.find((file) => file.path === 'index.js')).toBeUndefined();
    expect(containerFiles.get('index.js')).toBe(customer);

    // The service is still handed over.
    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.status).toBe('ONLINE');
  });
});
