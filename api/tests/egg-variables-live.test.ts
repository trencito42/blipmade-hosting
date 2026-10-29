import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The variables of an egg are read from the panel.
 *
 * The platform could only create a server on an egg it had a template for, and
 * the templates it had were four. Every other egg of the panel was closed to
 * the customers of the products that used it: the create of the first server
 * failed with "No environment template is known for egg N", and the fallback
 * of reading the variables of a server that already existed only works from
 * the second server of an egg.
 *
 * The panel does know the variables of every egg it has. It gives them when
 * they are asked for with `include=variables`, which is what the platform does
 * now for an egg it does not know. The eggs the platform knows keep their
 * template, because the password of a database and the name of its user are
 * part of what the customer is told.
 */

const TOKEN = 'test-panel-key';
const PANEL_PORT = 23122;

vi.mock('../src/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      PTERODACTYL_URL: `http://127.0.0.1:${PANEL_PORT}`,
      PTERODACTYL_APP_KEY: TOKEN,
      pterodactylEnabled: true,
    },
  };
});

const panel = {
  calls: [] as string[],
  servers: [] as { id: number; egg: number }[],
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/**
 * The answer of the panel for an egg that carries its variables.
 *
 * The shape is the one of the panel: the variables are in the relationships of
 * the egg, and each one has the name the egg writes it with and the value it
 * has when nobody says otherwise.
 */
function eggWithVariables(id: number, name: string, variables: Record<string, string>) {
  return {
    object: 'egg',
    attributes: {
      id,
      uuid: `egg-uuid-${id}`,
      name,
      nest: 5,
      author: 'someone@example.test',
      description: '',
      docker_image: 'ghcr.io/ptero-eggs/yolks:debian',
      docker_images: { Debian: 'ghcr.io/ptero-eggs/yolks:debian' },
      config: { files: {}, startup: { done: 'ready' }, stop: '^C', logs: [] },
      startup: 'echo start',
      script: { privileged: true, install: '#!/bin/bash', entry: 'ash', container: 'alpine:3.4' },
      relationships: {
        variables: {
          object: 'list',
          data: Object.entries(variables).map(([env_variable, default_value]) => ({
            object: 'egg_variable',
            attributes: { id: 1, egg_id: id, name: env_variable, env_variable, default_value },
          })),
        },
      },
    },
  };
}

async function answerPanel(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://panel.invalid');
  const path = url.pathname;
  panel.calls.push(path + url.search);

  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    sendJson(response, 401, { error: 'not authorized' });
    return;
  }

  if (request.method === 'GET' && path === '/api/application/nests') {
    sendJson(response, 200, {
      object: 'list',
      data: [{ object: 'nest', attributes: { id: 5, name: 'Discord Bots' } }],
      meta: { pagination: { total: 1, count: 1, per_page: 100, current_page: 1, total_pages: 1 } },
    });
    return;
  }

  if (request.method === 'GET' && path === '/api/application/nests/5/eggs') {
    sendJson(response, 200, {
      object: 'list',
      data: [
        { object: 'egg', attributes: { id: 15, name: 'node.js generic', nest_id: 5 } },
        { object: 'egg', attributes: { id: 77, name: 'Redis-7', nest_id: 5 } },
      ],
      meta: { pagination: { total: 2, count: 2, per_page: 100, current_page: 1, total_pages: 1 } },
    });
    return;
  }

  if (request.method === 'GET' && path === '/api/application/nests/5/eggs/77') {
    sendJson(response, 200, eggWithVariables(77, 'Redis-7', { REDIS_PASSWORD: 'changeme', MEMORY_LIMIT: '512' }));
    return;
  }

  if (request.method === 'GET' && path === '/api/application/servers') {
    sendJson(response, 200, {
      object: 'list',
      data: panel.servers.map((server) => ({ object: 'server', attributes: { id: server.id, egg: server.egg } })),
      meta: { pagination: { total: panel.servers.length, count: panel.servers.length, per_page: 100, current_page: 1, total_pages: 1 } },
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
  panel.calls = [];
  panel.servers = [];
});

const application = await import('../src/services/pterodactyl/application.js');

describe('the environment of an egg the platform does not know', () => {
  it('is read from the panel', async () => {
    const template = await application.eggEnvironmentTemplate(77);

    expect(template).toEqual({ REDIS_PASSWORD: 'changeme', MEMORY_LIMIT: '512' });
    expect(panel.calls).toContain('/api/application/nests/5/eggs/77?include=variables');
  });

  it('is known without a server that already exists', async () => {
    // The state the panel was in when the first customer of a product on this
    // egg was provisioned: no server at all.
    panel.servers = [];

    const template = await application.eggEnvironmentTemplate(77);

    expect(Object.keys(template).length).toBeGreaterThan(0);
  });
});

describe('the environment of an egg the platform knows', () => {
  it('keeps the template the platform holds', async () => {
    // The password of the database of a customer and the name of its user are
    // part of what the customer is told, so the template of the platform wins
    // over the value the panel has by default.
    const template = await application.eggEnvironmentTemplate(15);

    expect(template.MAIN_FILE).toBe('index.js');
    expect(panel.calls).not.toContain('/api/application/nests/5/eggs/15?include=variables');
  });
});
