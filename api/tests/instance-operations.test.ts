import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The operations a customer runs on their own server.
 *
 * The panel is faked at the network level, so the real adapters run: the real
 * request is built, the real key of the customer is put in it and the real
 * answer is parsed. The tests check the two rules that matter:
 *
 *  - every request carries the key of the customer that owns the server;
 *  - a customer never reaches the server of somebody else.
 */

const panel = {
  /** The key of every customer, by the id of the customer in Blipmade. */
  tokens: new Map<string, string>(),
  /** Every request that reached the panel. */
  calls: [] as { url: string; method: string; token: string }[],
};

vi.mock('../src/services/panel/credentials.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/panel/credentials.js')>(
    '../src/services/panel/credentials.js',
  );
  return {
    ...actual,
    resolveCustomerCredential: vi.fn(async (userId: string) => {
      const token = panel.tokens.get(userId);
      if (!token) {
        const { unavailable } = await import('../src/lib/errors.js');
        throw unavailable('The key bridge of the panel is not installed.');
      }
      return {
        token,
        panelUserId: 4,
        externalId: `blipmade_acc_${userId}`,
        source: 'bootstrap',
      };
    }),
  };
});

const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');
const { encryptSecret } = await import('../src/lib/secrets.js');

/**
 * Stores the key of a customer the way the platform stores it: encrypted, one
 * per customer.
 */
async function storeCredential(userId: string, token: string): Promise<void> {
  await prisma.panelCredential.create({
    data: {
      userId,
      panelUserId: 4,
      externalId: `blipmade_acc_${userId}`,
      tokenEnc: encryptSecret(token),
      source: 'bootstrap',
    },
  });
}

/** A key of the panel with the shape the panel issues. */
function panelKey(seed: string): string {
  return `ptlc_${seed.repeat(44).slice(0, 44)}`;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The answers of the panel for the paths the operations use. */
function panelAnswer(url: string): Response {
  if (url.includes('/files/list')) {
    return json({
      object: 'file_list',
      data: [
        {
          object: 'file',
          attributes: {
            name: 'app.log',
            created_at: '2024-01-01T00:00:00+00:00',
            modified_at: '2024-01-02T00:00:00+00:00',
            mode: '-rw-r--r--',
            is_directory: false,
            is_file: true,
            is_symlink: false,
            size: 42,
          },
        },
      ],
    });
  }
  if (url.includes('/files/contents')) {
    // The panel answers with the content of the file as it is, not with an
    // object around it.
    return new Response('hello world', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  if (url.includes('/backups')) {
    return json({
      object: 'backup_list',
      data: [
        {
          object: 'backup',
          attributes: {
            uuid: 'backup-1',
            name: 'Nightly',
            size: 1024,
            created_at: '2024-01-02T00:00:00+00:00',
            is_locked: false,
          },
        },
      ],
    });
  }
  if (url.includes('/databases')) {
    return json({
      object: 'database_list',
      data: [
        {
          object: 'database',
          attributes: {
            id: 3,
            name: 'app',
            username: 'u_app',
            host: '10.77.0.11',
            port: 3306,
            database: 'app',
            password: 'secret',
          },
        },
      ],
    });
  }
  if (url.includes('/activity')) {
    return json({ object: 'activity', data: [] });
  }
  if (url.includes('/stats') || url.endsWith('/resources')) {
    return json({
      object: 'stats',
      attributes: {
        state: 'running',
        is_suspended: false,
        cpu_absolute: 4.5,
        memory_bytes: 268435456,
        network: { rx: 1024, tx: 2048 },
        disk: { used: 4096 },
        uptime: 3600,
      },
    });
  }
  if (url.includes('/websocket')) {
    return json({ object: 'websocket', attributes: { socket: 'wss://node.example.test/ws', token: 'panel-token' } });
  }
  if (url.includes('/api/client/servers/')) {
    return json({
      object: 'server',
      attributes: {
        uuid: 'server-uuid',
        identifier: 'server-uuid',
        server_name: 'Test instance',
        state: 'running',
        is_suspended: false,
        limits: { memory: 1024, disk: 10240, cpu: 100 },
        features: { backups: 1, databases: 1 },
        created_at: '2024-01-01T00:00:00+00:00',
      },
    });
  }
  return new Response('', { status: 204 });
}

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  panel.tokens.clear();
  panel.calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const token = String(headers.Authorization ?? '').replace(/^Bearer\s+/i, '');
      panel.calls.push({ url, method: init?.method ?? 'GET', token });
      return panelAnswer(url);
    }),
  );
});

async function makeInstance(ownerId: string, uuid = 'server-uuid') {
  const product = await prisma.product.create({
    data: {
      slug: `product-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test product',
      category: 'WEB_CMS',
      description: 'A product used only by the tests.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });

  return prisma.instance.create({
    data: {
      userId: ownerId,
      productId: product.id,
      name: 'Test instance',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylServerId: 100,
      pterodactylUuid: uuid,
    },
  });
}

describe('the operations of a customer on their own server', () => {
  it('lists the files with the key of the customer', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    panel.tokens.set(userId, panelKey('a'));
    const instance = await makeInstance(userId);

    const response = await client.request('GET', `/api/instances/${instance.id}/files?path=/logs`);

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(response.body.files[0].name).toBe('app.log');
    // The request carried the key of this customer and nothing else.
    expect(panel.calls).toHaveLength(1);
    expect(panel.calls[0]!.token).toBe(panelKey('a'));
    expect(panel.calls[0]!.url).toContain('/api/client/servers/server-uuid/files/list');
  });

  it('reads a file with the key of the customer', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    panel.tokens.set(userId, panelKey('b'));
    const instance = await makeInstance(userId);

    const response = await client.request('GET', `/api/instances/${instance.id}/file?path=/logs/app.log`);

    expect(response.status).toBe(200);
    expect(response.body.content).toBe('hello world');
    expect(panel.calls[0]!.token).toBe(panelKey('b'));
  });

  it('writes a file with the key of the customer', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    panel.tokens.set(userId, panelKey('c'));
    const instance = await makeInstance(userId);

    const response = await client.request('PUT', `/api/instances/${instance.id}/file`, {
      path: '/logs/app.log',
      content: 'hello world',
    });

    expect(response.status).toBe(204);
    expect(panel.calls[0]!.method).toBe('POST');
    expect(panel.calls[0]!.url).toContain('/files/write');
    expect(panel.calls[0]!.token).toBe(panelKey('c'));
  });

  it('shows the usage of the server', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    panel.tokens.set(userId, panelKey('d'));
    const instance = await makeInstance(userId);

    const response = await client.request('GET', `/api/instances/${instance.id}/resources`);

    expect(response.status).toBe(200);
    expect(response.body.resources.state).toBe('running');
    expect(response.body.resources.memory_bytes).toBe(268435456);
  });

  it('lists the backups and the databases', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    panel.tokens.set(userId, panelKey('e'));
    const instance = await makeInstance(userId);

    const backups = await client.request('GET', `/api/instances/${instance.id}/backups`);
    expect(backups.status).toBe(200);
    expect(backups.body.backups[0].id).toBe('backup-1');

    const databases = await client.request('GET', `/api/instances/${instance.id}/databases`);
    expect(databases.status).toBe(200);
    expect(databases.body.databases[0].name).toBe('app');
  });

  it('never shows the key of the panel or the address of the console', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    panel.tokens.set(userId, panelKey('f'));
    await storeCredential(userId, panelKey('f'));
    const instance = await makeInstance(userId);

    const response = await client.request('GET', `/api/instances/${instance.id}/console`);

    expect(response.status).toBe(200);
    // The browser is told where to open the console, nothing else. The
    // address of the node and the token of the panel stay on the server.
    expect(response.body.websocket).toBe(`/api/instances/${instance.id}/console/stream`);
    expect(JSON.stringify(response.body)).not.toContain('panel-token');
    expect(JSON.stringify(response.body)).not.toContain(panelKey('f'));
    expect(JSON.stringify(response.body)).not.toContain('wss://');
  });

  it('never stores a console command containing a credential in customer-visible events', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'command-privacy@example.com');
    panel.tokens.set(userId, panelKey('g'));
    const instance = await makeInstance(userId);
    const password = 'sensitive-value-never-persist';
    const response = await client.request('POST', `/api/instances/${instance.id}/command`, {
      command: `setpassword ${password}`,
    });

    expect(response.status).toBe(200);
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    expect(events.some((event) => event.type === 'command')).toBe(true);
    expect(JSON.stringify(events)).not.toContain(password);
    expect(JSON.stringify(events)).not.toContain('setpassword');
    const auditLog = await prisma.auditLog.findMany({ where: { targetId: instance.id } });
    expect(JSON.stringify(auditLog)).not.toContain(password);
  });

  it('says that the panel cannot issue a key when the bridge is not installed', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'owner@example.com');
    // No key for this customer: the bridge of the panel is not installed.
    const instance = await makeInstance(userId);

    const response = await client.request('GET', `/api/instances/${instance.id}/files`);

    expect(response.status).toBe(503);
    expect(response.body.error?.code).toBe('unavailable');
    expect(panel.calls).toHaveLength(0);
  });
});

describe('the isolation between two customers', () => {
  it('does not let one customer reach the server of another one', async () => {
    const app = await getApp();
    const { client: owner, userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other, userId: otherId } = await registerAndLogin(app, 'other@example.com');

    panel.tokens.set(ownerId, panelKey('a'));
    panel.tokens.set(otherId, panelKey('b'));

    const instance = await makeInstance(ownerId);

    // Every operation on the server of the owner answers 404 for the other
    // customer, exactly like a server that does not exist.
    const routes: [string, string, unknown][] = [
      ['GET', `/api/instances/${instance.id}/files`, undefined],
      ['GET', `/api/instances/${instance.id}/file?path=/logs/app.log`, undefined],
      ['GET', `/api/instances/${instance.id}/server`, undefined],
      ['GET', `/api/instances/${instance.id}/resources`, undefined],
      ['GET', `/api/instances/${instance.id}/backups`, undefined],
      ['GET', `/api/instances/${instance.id}/databases`, undefined],
      ['GET', `/api/instances/${instance.id}/allocations`, undefined],
      ['GET', `/api/instances/${instance.id}/schedules`, undefined],
      ['GET', `/api/instances/${instance.id}/activity`, undefined],
      ['GET', `/api/instances/${instance.id}/console`, undefined],
      ['POST', `/api/instances/${instance.id}/power`, { signal: 'stop' }],
      ['POST', `/api/instances/${instance.id}/command`, { command: 'ls' }],
      ['POST', `/api/instances/${instance.id}/backups`, { name: 'Nightly', locked: false }],
      ['DELETE', `/api/instances/${instance.id}/file?path=/logs/app.log`, undefined],
      ['PUT', `/api/instances/${instance.id}/file`, { path: '/logs/app.log', content: 'x' }],
      ['POST', `/api/instances/${instance.id}/settings/reinstall`, { confirm: true }],
    ];

    for (const [method, url, body] of routes) {
      const response = await other.request(method, url, body);
      expect(response.status, `${method} ${url}`).toBe(404);
    }

    // The panel was never asked about the server of the owner.
    expect(panel.calls).toHaveLength(0);

    // The owner still reaches their own server.
    const own = await owner.request('GET', `/api/instances/${instance.id}/files`);
    expect(own.status).toBe(200);
    expect(panel.calls).toHaveLength(1);
    expect(panel.calls[0]!.token).toBe(panelKey('a'));
  });

  it('never uses the key of the other customer', async () => {
    const app = await getApp();
    const { userId: ownerId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other, userId: otherId } = await registerAndLogin(app, 'other@example.com');

    panel.tokens.set(ownerId, panelKey('a'));
    panel.tokens.set(otherId, panelKey('b'));

    const instance = await makeInstance(ownerId);
    await other.request('GET', `/api/instances/${instance.id}/files`);

    // The key of the other customer never reaches the panel for the server of
    // the owner.
    expect(panel.calls.filter((call) => call.token === panelKey('b'))).toHaveLength(0);
  });
});
