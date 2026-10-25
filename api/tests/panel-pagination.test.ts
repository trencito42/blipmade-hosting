import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The lists of the panel, and the environment of the eggs.
 *
 * The panel answers with one page and says in the metadata how many pages
 * there are. A request that does not ask for the pages sees only the first
 * one, so a panel with more servers than one page hides the rest: the
 * platform would believe that a node has more capacity than it has, and it
 * would reserve an address that is already given to a server.
 *
 * The panel does not expose the variables of an egg, and it refuses to create
 * a server without them. Reading them from an existing server on the same egg
 * works only after the first server of that egg exists, so the very first
 * customer of a product could never be provisioned. That is what happened to
 * the order BM-00007.
 */

const TOKEN = 'test-panel-key';

vi.mock('../src/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      PTERODACTYL_URL: 'http://127.0.0.1:23120',
      PTERODACTYL_APP_KEY: TOKEN,
      // The flag is computed from the raw values when the module is loaded,
      // so it is set here as well. The test must not depend on the panel of
      // the machine it runs on.
      pterodactylEnabled: true,
    },
  };
});

/** The pages the fake panel answers with. */
const panel = {
  /** The servers of the panel, one per page. */
  servers: [] as { id: number; egg: number; environment: Record<string, string> }[],
  /** The paths the platform asked for. */
  calls: [] as string[],
};

function answerPanel(request: { url?: string; headers: Record<string, unknown> }, response: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }): void {
  const url = new URL(request.url ?? '/', 'http://panel.invalid');
  const path = url.pathname;
  const query = url.searchParams;
  panel.calls.push(`${path}${query.toString() ? `?${query.toString()}` : ''}`);

  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not authorized' }));
    return;
  }

  if (path === '/api/application/servers') {
    const perPage = Number(query.get('per_page') ?? 50);
    const page = Number(query.get('page') ?? 1);
    const totalPages = Math.max(1, Math.ceil(panel.servers.length / perPage));
    const slice = panel.servers.slice((page - 1) * perPage, page * perPage);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        object: 'list',
        data: slice.map((server) => ({
          object: 'server',
          attributes: {
            id: server.id,
            uuid: `uuid-${server.id}`,
            egg: server.egg,
            allocation: 73,
            node: 1,
            container: { environment: server.environment },
          },
        })),
        meta: {
          pagination: {
            total: panel.servers.length,
            count: slice.length,
            per_page: perPage,
            current_page: page,
            total_pages: totalPages,
          },
        },
      }),
    );
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'unknown path' }));
}

let server: Server;

beforeAll(async () => {
  server = createServer(answerPanel as never);
  await new Promise<void>((resolve) => server.listen(23120, '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  panel.servers = [];
  panel.calls = [];
});

const application = await import('../src/services/pterodactyl/application.js');

describe('the lists of the panel', () => {
  it('reads every page of the servers', async () => {
    // 250 servers: with one page of 100 the platform would see a third of them.
    panel.servers = Array.from({ length: 250 }, (_, index) => ({
      id: index + 1,
      egg: 15,
      environment: { MAIN_FILE: 'index.js' },
    }));

    const servers = await application.listServers();

    expect(servers).toHaveLength(250);
    expect(servers[249]?.id).toBe(250);
    expect(panel.calls.filter((call) => call.startsWith('/api/application/servers'))).toHaveLength(3);
  });

  it('asks for the pages of the list', async () => {
    panel.servers = Array.from({ length: 120 }, (_, index) => ({ id: index + 1, egg: 15, environment: {} }));

    await application.listServers();

    expect(panel.calls).toContain('/api/application/servers?per_page=100');
    expect(panel.calls).toContain('/api/application/servers?per_page=100&page=2');
  });

  it('reads one page when the list fits in it', async () => {
    panel.servers = [{ id: 1, egg: 15, environment: {} }];

    const servers = await application.listServers();

    expect(servers).toHaveLength(1);
    expect(panel.calls).toHaveLength(1);
  });
});

describe('the environment of an egg', () => {
  it('is known without a server that already exists', async () => {
    // The order BM-00007 failed here: no server existed on the egg yet.
    panel.servers = [];

    const template = await application.eggEnvironmentTemplate(15);

    expect(template.MAIN_FILE).toBe('index.js');
    expect(template.AUTO_UPDATE).toBe('0');
    expect(Object.keys(template).length).toBeGreaterThan(0);
    // The panel fills these in for every server, so they are not part of the
    // template.
    expect(Object.keys(template).some((key) => key.startsWith('P_SERVER_'))).toBe(false);
  });

  it('is read from a server of the egg when the egg is not known', async () => {
    panel.servers = [
      {
        id: 7,
        egg: 99,
        environment: { MAIN_FILE: 'server.js', P_SERVER_UUID: 'not-part-of-the-template' },
      },
    ];

    const template = await application.eggEnvironmentTemplate(99);

    expect(template.MAIN_FILE).toBe('server.js');
    expect(template.P_SERVER_UUID).toBeUndefined();
  });

  it('says what the operator has to do when the egg is unknown and has no server', async () => {
    panel.servers = [];

    await expect(application.eggEnvironmentTemplate(99)).rejects.toThrow(/No environment template is known for egg 99/);
  });
});
