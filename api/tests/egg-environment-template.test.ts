import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The first customer of a product could not be provisioned.
 *
 * The order BM-00007 was paid, the panel account was created, and the
 * provisioning failed at "server_created" with "No environment template is
 * known for egg 15". The panel does not expose the variables of an egg
 * through the Application API and it refuses to create a server without them,
 * so the platform read them from a server that already existed on the same
 * egg. The very first server of an egg could therefore never be created, and
 * the order could only be fulfilled once a server had been created on that
 * egg by hand.
 *
 * The panel is replaced here with a fake that refuses in the same way, so
 * the failure is reproduced and not only described. The platform now keeps the
 * template of the eggs it uses, so the create of the first server carries the
 * environment and the panel accepts it.
 */

const TOKEN = 'test-panel-key';
const PANEL_PORT = 23121;
const ROOT = resolve(process.cwd(), '..');

vi.mock('../src/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      PTERODACTYL_URL: `http://127.0.0.1:${PANEL_PORT}`,
      PTERODACTYL_APP_KEY: TOKEN,
      // The flag is computed from the raw values when the module is loaded,
      // so it is set here as well. The test must not depend on the panel of
      // the machine it runs on.
      pterodactylEnabled: true,
    },
  };
});

interface CreateRequest {
  name: string;
  egg: number;
  environment: Record<string, string> | undefined;
}

const panel = {
  /** The servers of the panel. There is none: the one that is created is the first. */
  servers: [] as { id: number; egg: number }[],
  /** The bodies of the create requests the platform made. */
  created: [] as CreateRequest[],
  /** The paths the platform asked for. */
  calls: [] as string[],
};

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((done, failed) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
    });
    request.on('end', () => done(data));
    request.on('error', failed);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** The list envelope of the panel. */
function sendList(response: ServerResponse, data: unknown[]): void {
  sendJson(response, 200, {
    object: 'list',
    data: data.map((attributes) => ({ object: 'server', attributes })),
    meta: {
      pagination: {
        total: data.length,
        count: data.length,
        per_page: 100,
        current_page: 1,
        total_pages: 1,
      },
    },
  });
}

/**
 * The answer of the panel when the environment of the egg is missing.
 *
 * The wording is the one of the production failure of BM-00007, so the test
 * fails with the same text when the platform stops sending the environment.
 */
const REFUSAL = {
  errors: [
    {
      detail: 'No environment template is known for egg 15',
      meta: { source_field: 'environment' },
    },
  ],
};

async function answerPanel(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://panel.invalid');
  const path = url.pathname;
  panel.calls.push(path);

  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    sendJson(response, 401, { error: 'not authorized' });
    return;
  }

  if (request.method === 'GET' && path === '/api/application/servers') {
    sendList(
      response,
      panel.servers.map((server) => ({ id: server.id, egg: server.egg })),
    );
    return;
  }

  if (request.method === 'GET' && path === '/api/application/nests') {
    sendJson(response, 200, {
      object: 'list',
      data: [{ object: 'nest', attributes: { id: 5, name: 'Node.js' } }],
      meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 1, total_pages: 1 } },
    });
    return;
  }

  if (request.method === 'GET' && path === '/api/application/nests/5/eggs') {
    sendJson(response, 200, {
      object: 'list',
      data: [
        {
          object: 'egg',
          attributes: {
            id: 15,
            uuid: 'egg-uuid',
            name: 'node.js generic',
            docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
            startup: 'echo start',
            nest_id: 5,
          },
        },
        {
          object: 'egg',
          attributes: {
            id: 17,
            uuid: 'egg-uuid-postgres',
            name: 'Postgres 16',
            docker_image: 'ghcr.io/ptero-eggs/yolks:postgres_16',
            startup: 'postgres -D /home/container/postgres_db/',
            nest_id: 5,
          },
        },
        {
          object: 'egg',
          attributes: {
            id: 18,
            uuid: 'egg-uuid-code-server',
            name: 'Code-Server',
            docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_18',
            startup: 'sh .local/lib/code-server-{{VERSION}}/bin/code-server',
            nest_id: 5,
          },
        },
        {
          object: 'egg',
          attributes: {
            id: 19,
            uuid: 'egg-uuid-uptime-kuma',
            name: 'Uptime Kuma',
            docker_image: 'ghcr.io/ptero-eggs/apps:uptimekuma',
            startup: 'node /home/container/server/server.js',
            nest_id: 5,
          },
        },
      ],
      meta: { pagination: { total: 4, count: 4, per_page: 100, current_page: 1, total_pages: 1 } },
    });
    return;
  }

  if (request.method === 'POST' && path === '/api/application/servers') {
    const body = JSON.parse((await readBody(request)) || '{}') as CreateRequest;
    panel.created.push(body);

    // The panel refuses a server without the variables of the egg.
    if (!body.environment || Object.keys(body.environment).length === 0) {
      sendJson(response, 422, REFUSAL);
      return;
    }

    const id = 100 + panel.servers.length;
    panel.servers.push({ id, egg: body.egg });
    sendJson(response, 200, {
      attributes: {
        id,
        uuid: `uuid-${id}`,
        name: body.name,
        description: '',
        status: null,
        suspended: false,
        limits: { memory: 1024, swap: 0, disk: 10240, io: 500, cpu: 100 },
        feature_limits: { databases: 0, backups: 0 },
        user: 1,
        node: 1,
        allocation: 73,
        nest: 5,
        egg: body.egg,
        container: {
          startup_command: 'echo start',
          image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
          installed: 0,
          environment: body.environment,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    return;
  }

  sendJson(response, 404, { error: 'unknown path' });
}

let server: Server;

beforeAll(async () => {
  server = createServer((request, response) => {
    void answerPanel(request, response);
  });
  await new Promise<void>((done) => server.listen(PANEL_PORT, '127.0.0.1', done));
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

beforeEach(() => {
  panel.servers = [];
  panel.created = [];
  panel.calls = [];
});

const application = await import('../src/services/pterodactyl/application.js');

/** The create of a server, without the environment of the egg. */
function createWithoutEnvironment() {
  return application.createServer({
    name: 'Blipmade instance',
    description: 'Blipmade instance for customer@example.com',
    user: 1,
    egg: 15,
    docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
    startup: 'echo start',
    environment: {},
    limits: { memory: 1024, swap: 0, disk: 10240, io: 500, cpu: 100 },
    resource_limits: { memory: 1024, swap: 0, disk: 10240, io: 500, cpu: 100 },
    feature_limits: { databases: 0, backups: 0 },
    allocation: { default: 73, allocations: [73] },
  });
}

describe('the environment of the egg', () => {
  it('is refused by the panel when the create does not carry it', async () => {
    // The failure of BM-00007, reproduced: the panel answers with the same
    // text it answered with on the day.
    await expect(createWithoutEnvironment()).rejects.toThrow(
      /No environment template is known for egg 15/,
    );
  });

  it('is known without a server that already exists', async () => {
    // The panel holds no server at all, which is the state it was in when
    // the first customer of a product was provisioned.
    expect(panel.servers).toEqual([]);

    const template = await application.eggEnvironmentTemplate(15);

    expect(Object.keys(template).length).toBeGreaterThan(0);
    expect(template.MAIN_FILE).toBe('index.js');
    expect(template.USER_UPLOAD).toBe('0');
    expect(template.AUTO_UPDATE).toBe('0');
  });

  it('carries the variables of the script that creates the egg', async () => {
    // The script that creates the egg by hand and the platform have to give
    // the egg the same variables, otherwise the first server of the egg would
    // run with a different environment than the ones after it.
    const source = await readFile(join(ROOT, 'scripts', 'create-egg-template.py'), 'utf-8');
    const block = source.match(/ENVIRONMENT\s*=\s*\{([\s\S]*?)\n\}/);
    expect(block, 'the script has to declare the variables of the egg').not.toBeNull();

    const declared = Object.fromEntries(
      [...block![1]!.matchAll(/"([A-Z_]+)":\s*"([^"]*)"/g)].map((entry) => [entry[1]!, entry[2]!]),
    );
    expect(Object.keys(declared).length).toBeGreaterThan(0);

    const template = await application.eggEnvironmentTemplate(15);
    for (const [key, value] of Object.entries(declared)) {
      expect(template[key], `the variable ${key} of the egg`).toBe(value);
    }
  });

  it('carries exactly the variables of the egg and nothing else', async () => {
    // The check above only proves that the variables of the script are there.
    // A variable that the platform adds on its own would change the
    // environment of the server, so the set of variables is compared in both
    // directions: the egg of the panel carries the variables of the script
    // and `BRANCH`, and nothing more.
    const source = await readFile(join(ROOT, 'scripts', 'create-egg-template.py'), 'utf-8');
    const block = source.match(/ENVIRONMENT\s*=\s*\{([\s\S]*?)\n\}/);
    expect(block).not.toBeNull();
    const declared = [...block![1]!.matchAll(/"([A-Z_]+)":\s*"([^"]*)"/g)].map((entry) => entry[1]!);

    // `BRANCH` comes from the egg itself and not from the script.
    const expected = [...declared, 'BRANCH'].sort();

    const template = await application.eggEnvironmentTemplate(15);
    expect(Object.keys(template).sort()).toEqual(expected);
  });

  it('makes the create of the first server of the egg succeed', async () => {
    const template = await application.eggEnvironmentTemplate(15);

    const server = await application.createServer({
      name: 'Blipmade instance',
      description: 'Blipmade instance for customer@example.com',
      user: 1,
      egg: 15,
      docker_image: 'ghcr.io/ptero-eggs/yolks:nodejs_25',
      startup: 'echo start',
      environment: template,
      limits: { memory: 1024, swap: 0, disk: 10240, io: 500, cpu: 100 },
      resource_limits: { memory: 1024, swap: 0, disk: 10240, io: 500, cpu: 100 },
      feature_limits: { databases: 0, backups: 0 },
      allocation: { default: 73, allocations: [73] },
    });

    expect(server.id).toBe(100);
    expect(panel.created).toHaveLength(1);
    expect(panel.created[0]?.environment).toEqual(template);
  });
});

describe('the environment of an egg that is named', () => {
  it('is found by the name the panel gives the egg', async () => {
    // The number of an egg belongs to the panel: it is given when the egg is
    // imported. The name is written in the egg itself, so the platform looks
    // the egg up by its name.
    const template = await application.eggEnvironmentTemplate(17);

    expect(template.PGUSER).toBe('postgres');
    expect(template.PGPASSWORD).toBeTruthy();
    expect(Object.keys(template).sort()).toEqual(['PGPASSWORD', 'PGUSER']);
  });

  it('is found without asking the panel when the name is known', async () => {
    const calls = panel.calls.length;
    const template = await application.eggEnvironmentTemplate(17, 'Postgres 16');

    expect(template.PGUSER).toBe('postgres');
    expect(panel.calls.length).toBe(calls);
  });

  it('carries the variables of the official eggs of the platform', async () => {
    // The variables of the official eggs are known: the panel refuses a
    // server whose environment does not carry all of them, and it refuses the
    // ones that break the rule of the egg.
    const postgres = await application.eggEnvironmentTemplate(17);
    expect(Object.keys(postgres).sort()).toEqual(['PGPASSWORD', 'PGUSER']);
    expect(postgres.PGUSER.length).toBeLessThanOrEqual(20);
    expect(postgres.PGPASSWORD.length).toBeLessThanOrEqual(20);

    const codeServer = await application.eggEnvironmentTemplate(18);
    expect(Object.keys(codeServer).sort()).toEqual(['PASSWORD', 'VERSION']);
    expect(codeServer.VERSION).toBe('latest');
    expect(codeServer.PASSWORD.length).toBeLessThanOrEqual(32);

    const uptime = await application.eggEnvironmentTemplate(19);
    expect(Object.keys(uptime).sort()).toEqual(['AUTO_UPDATE', 'GIT_ADDRESS', 'JS_FILE']);
    expect(uptime.JS_FILE).toBe('server/server.js');
    expect(uptime.AUTO_UPDATE).toBe('1');
  });
});
