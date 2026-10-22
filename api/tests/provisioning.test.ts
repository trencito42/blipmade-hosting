import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Pterodactyl panel is replaced with a fake so the provisioning flow can
 * be tested without creating real containers. The flow itself is real code.
 */
const panel = {
  servers: [] as { id: number; uuid: string }[],
  nextServerId: 100,
  installed: new Set<number>(),
};

vi.mock('../src/services/pterodactyl/application.js', () => ({
  listServers: vi.fn(async () => []),
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
    panel.installed.add(id);
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
        installed: 1,
        environment: {},
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }),
  buildServer: vi.fn(async () => undefined),
  installServer: vi.fn(async (id: number) => {
    panel.installed.add(id);
  }),
  updateServerDetails: vi.fn(async () => ({})),
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
  listUsers: vi.fn(async () => [{ id: 4, username: 'tester', email: 'owner@example.com', root_admin: false, created_at: new Date().toISOString() }]),
  findUserByEmail: vi.fn(async (email: string) => ({ id: 4, username: 'tester', email, root_admin: false, created_at: new Date().toISOString() })),
  findUserById: vi.fn(async () => null),
  createUser: vi.fn(async (input: { email: string }) => ({
    id: 4,
    username: 'tester',
    email: input.email,
    root_admin: false,
    created_at: new Date().toISOString(),
  })),
  ping: vi.fn(async () => true),
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
  panel.servers = [];
  panel.nextServerId = 100;
  panel.installed = new Set();

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

    await provisionInstance(instance.id);
    const firstServerId = (await prisma.instance.findUnique({ where: { id: instance.id } }))?.pterodactylServerId;

    await provisionInstance(instance.id);
    const secondServerId = (await prisma.instance.findUnique({ where: { id: instance.id } }))?.pterodactylServerId;

    expect(panel.servers).toHaveLength(1);
    expect(secondServerId).toBe(firstServerId);
  });

  it('records the failure and does not activate the instance', async () => {
    const instance = await seedInstance();

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
});
