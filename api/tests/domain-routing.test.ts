import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The routes of the customers, against an administrative API that behaves like
 * the one of Caddy.
 *
 * The platform writes the routes of the customer domains through the
 * administrative API of Caddy, and the first version of this code spoke an API
 * that Caddy does not have: it asked for a route by its name, which Caddy
 * refuses with "invalid array index", and it sent a list of routes, which
 * Caddy refuses with "cannot unmarshal array". The result was that no route of
 * any customer was ever created, and the domain of a customer waited for a
 * gateway that was perfectly able to serve it.
 *
 * The fake below reproduces the behaviour of the real API: the routes of a
 * server are a list, a route is addressed by its place in that list, a body
 * that is a list is refused, and the token is checked.
 */

interface FakeRoute {
  match?: { host?: string[] }[];
  handle?: { handler: string; upstreams?: { dial?: string }[] }[];
  terminal?: boolean;
}

const state = {
  routes: [] as FakeRoute[],
  /** Every path the platform asked for, so the shape of the calls is checked. */
  calls: [] as { method: string; path: string; token: string | null }[],
  /** True when the gateway is down and answers nothing. */
  offline: false,
};

const TOKEN = 'test-token-for-the-gateway';

/** The address of the fake administrative API. */
const FAKE_URL = 'http://127.0.0.1:23119';

/**
 * The environment of the platform is replaced, so the suite never touches a
 * real gateway. The environment of the platform is read when the module that
 * holds it is loaded, and the file of the tests loads it before the test file
 * runs, so the values cannot be written into the environment of the process
 * from here.
 */
vi.mock('../src/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      CADDY_ADMIN_URL: FAKE_URL,
      CADDY_ADMIN_TOKEN: TOKEN,
      CADDY_APP_SERVER: 'blipmade',
    },
  };
});

/**
 * The routes of the server of Caddy, with the rules of the real API.
 */
function handleAdminApi(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', 'http://caddy.invalid');
  const path = url.pathname;
  const token = request.headers.authorization ?? null;

  state.calls.push({ method: request.method ?? 'GET', path, token });

  // A gateway that is down answers with an error, and the platform has to
  // stop there instead of waiting for the timeout once per hostname.
  if (state.offline) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'the gateway is down' }));
    return;
  }

  if (token !== `Bearer ${TOKEN}`) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not authorized' }));
    return;
  }

  const prefix = '/config/apps/http/servers/blipmade/routes';
  if (!path.startsWith(prefix)) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'unknown path' }));
    return;
  }

  const rest = path.slice(prefix.length);

  // The list of the routes.
  if (rest === '') {
    if (request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(state.routes));
      return;
    }
    if (request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'the body is not JSON' }));
          return;
        }
        // The list is the field, so the body is one route and not a list of
        // routes. Caddy refuses a list with "cannot unmarshal array".
        if (Array.isArray(parsed)) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'cannot unmarshal array into Route' }));
          return;
        }
        state.routes.push(parsed as FakeRoute);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(parsed));
      });
      return;
    }
    // A patch of the whole list replaces the list. The patch of a list is a
    // merge of the fields of the list, and the fields of a list are its
    // entries, so the entries of the body are the entries of the list.
    if (request.method === 'PATCH') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'the body is not JSON' }));
          return;
        }
        if (!Array.isArray(parsed)) {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'the body is not a list of routes' }));
          return;
        }
        state.routes = parsed as FakeRoute[];
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(state.routes));
      });
      return;
    }
    response.writeHead(405, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  // One route of the list, addressed by its place in it. Anything else is
  // refused by Caddy with "invalid array index".
  const index = Number(rest.replace(/^\//, ''));
  if (!Number.isInteger(index)) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: `invalid array index '${rest.replace(/^\//, '')}'` }));
    return;
  }
  if (index < 0 || index >= state.routes.length) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'index out of range' }));
    return;
  }
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(state.routes[index]));
    return;
  }
  if (request.method === 'PATCH') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      state.routes[index] = JSON.parse(body) as FakeRoute;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(state.routes[index]));
    });
    return;
  }
  if (request.method === 'DELETE') {
    state.routes.splice(index, 1);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({}));
    return;
  }
  response.writeHead(405, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'method not allowed' }));
}

let server: Server;

/**
 * The globals that another file of the suite stubbed are put back.
 *
 * The files of the suite run one after another in one process, and a stub of
 * the global `fetch` that a file installs would be found by the file that
 * runs after it. The gateway of this file has to reach the fake API with the
 * real `fetch`, so a stub that is left behind is removed here.
 */
vi.unstubAllGlobals();

/**
 * The fake administrative API is started before anything is imported, because
 * the environment of the platform is read when the module that holds it is
 * loaded. The gateway must talk to the fake and to nothing else.
 */
server = createServer(handleAdminApi);
await new Promise<void>((resolve) => server.listen(23119, '127.0.0.1', resolve));

/**
 * The panel is faked: the address of the container comes from there.
 */
vi.mock('../src/services/pterodactyl/application.js', () => ({
  getServer: vi.fn(async () => ({ id: 42, node: 1, allocation: 74 })),
  listAllocations: vi.fn(async () => [
    { id: 74, ip: '10.77.0.11', port: 30001, alias: null, notes: null, assigned: true },
  ]),
}));

const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await resetDatabase();
  state.routes = [];
  state.calls = [];
  state.offline = false;
});

const gateway = await import('../src/services/gateway.js');

describe('the routes of the customers in Caddy', () => {
  it('talks to the fake gateway and to nothing else', async () => {
    const { env } = await import('../src/env.js');
    // The suite must never write into the configuration of the edge of the
    // production.
    expect(env.CADDY_ADMIN_URL).toBe(FAKE_URL);
    expect(env.CADDY_ADMIN_TOKEN).toBe(TOKEN);
  });

  it('creates the route of a hostname', async () => {
    const result = await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });

    expect(result.applied, result.reason ?? 'the gateway gave no reason').toBe(true);
    expect(result.reason).toBeNull();
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]?.match?.[0]?.host).toEqual(['witch.pw']);
    expect(state.routes[0]?.handle?.[0]?.upstreams?.[0]?.dial).toBe('10.77.0.11:30001');
  });

  it('sends the token of the platform with every call', async () => {
    await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });
    expect(state.calls.length).toBeGreaterThan(0);
    for (const call of state.calls) {
      expect(call.token).toBe(`Bearer ${TOKEN}`);
    }
  });

  it('does not create a second route for the same hostname', async () => {
    const route = {
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    };
    await gateway.applyCaddyRoute(route);
    await gateway.applyCaddyRoute(route);

    expect(state.routes).toHaveLength(1);
  });

  it('moves the route of a hostname when the container changed its port', async () => {
    await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });
    const moved = await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30002,
      verifiedAt: new Date(),
    });

    expect(moved.applied).toBe(true);
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]?.handle?.[0]?.upstreams?.[0]?.dial).toBe('10.77.0.11:30002');
  });

  it('keeps the routes of the other hostnames', async () => {
    await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });
    await gateway.applyCaddyRoute({
      hostname: 'www.witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });
    await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30002,
      verifiedAt: new Date(),
    });

    expect(state.routes).toHaveLength(2);
    expect(state.routes.map((route) => route.match?.[0]?.host?.[0])).toEqual([
      'witch.pw',
      'www.witch.pw',
    ]);
  });

  it('removes the route of a hostname', async () => {
    await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });
    const removed = await gateway.removeCaddyRoute('witch.pw');

    expect(removed.applied).toBe(true);
    expect(state.routes).toHaveLength(0);
  });

  it('puts the route of a customer in front of the route of the operator', async () => {
    // The site of the operator answers for the whole base of the platform and
    // it is written before the route of the customer, because it comes from
    // the file of the edge. Caddy walks the routes in the order they are in,
    // so the route of the customer has to be moved in front, or the customer
    // reaches the "no route yet" of the operator.
    state.routes = [
      {
        match: [{ host: ['blipmade.com', 'www.blipmade.com'] }],
        handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: '10.77.0.13:3000' }] }],
        terminal: true,
      },
      {
        match: [{ host: ['*.apps.blipmade.com', 'apps.blipmade.com'] }],
        handle: [{ handler: 'static_response' }],
        terminal: true,
      },
    ];

    await gateway.applyCaddyRoute({
      hostname: 'code-server-exeuw.apps.blipmade.com',
      target: '10.77.0.11',
      targetPort: 30000,
      verifiedAt: new Date(),
    });
    const ordered = await gateway.prioritiseCustomerRoutes(['code-server-exeuw.apps.blipmade.com']);

    expect(ordered.applied, ordered.reason ?? 'the gateway gave no reason').toBe(true);
    expect(state.routes.map((route) => route.match?.[0]?.host?.[0])).toEqual([
      'code-server-exeuw.apps.blipmade.com',
      'blipmade.com',
      '*.apps.blipmade.com',
    ]);
    // The route of the customer still points at its container.
    expect(state.routes[0]?.handle?.[0]?.upstreams?.[0]?.dial).toBe('10.77.0.11:30000');
  });

  it('does not write the routes again when they are already in the right order', async () => {
    await gateway.applyCaddyRoute({
      hostname: 'witch.pw',
      target: '10.77.0.11',
      targetPort: 30001,
      verifiedAt: new Date(),
    });
    await gateway.prioritiseCustomerRoutes(['witch.pw']);
    const writes = () => state.calls.filter((call) => call.method === 'PATCH').length;
    const before = writes();

    const ordered = await gateway.prioritiseCustomerRoutes(['witch.pw']);

    expect(ordered.applied).toBe(true);
    expect(writes()).toBe(before);
  });

  it('does not fail when the hostname has no route', async () => {
    const removed = await gateway.removeCaddyRoute('witch.pw');
    expect(removed.applied).toBe(true);
  });

  it('refuses to route a hostname that was never proven', async () => {
    await expect(
      gateway.applyCaddyRoute({
        hostname: 'witch.pw',
        target: '10.77.0.11',
        targetPort: 30001,
        verifiedAt: null,
      }),
    ).rejects.toThrow(gateway.GatewayNotVerifiedError);
    expect(state.routes).toHaveLength(0);
  });
});

describe('the repair of the routes', () => {
  async function seedDomain(hostname: string, verified: boolean) {
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
      },
    });
    const instance = await prisma.instance.create({
      data: {
        userId,
        productId: product.id,
        name: 'discord-bot',
        status: 'ONLINE',
        ram: 1024,
        cpu: 1,
        disk: 10,
        price: 149,
        currency: 'EUR',
        provisioningKey: 'test',
        pterodactylServerId: 42,
      },
    });
    return prisma.instanceDomain.create({
      data: {
        instanceId: instance.id,
        hostname,
        targetPort: 30001,
        status: verified ? 'PENDING_DNS' : 'VERIFYING',
        verifiedAt: verified ? new Date() : null,
        verificationToken: 'token',
        verificationHost: `_blipmade-verify.${hostname}`,
        claimedByUserId: userId,
      },
    });
  }

  it('puts back a route that the gateway lost', async () => {
    const { reconcileDomainRoutes } = await import('../src/services/domain-routing.js');
    await seedDomain('witch.pw', true);

    // The gateway is restarted: its configuration is replaced and the routes
    // of the customers are gone with it.
    state.routes = [];

    const outcomes = await reconcileDomainRoutes();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.applied).toBe(true);
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]?.match?.[0]?.host).toEqual(['witch.pw']);
  });

  it('says in the panel that the domain is active again', async () => {
    const { reconcileDomainRoutes } = await import('../src/services/domain-routing.js');
    const domain = await seedDomain('witch.pw', true);

    await reconcileDomainRoutes();

    const updated = await prisma.instanceDomain.findUnique({ where: { id: domain.id } });
    expect(updated?.status).toBe('ACTIVE');
    expect(updated?.lastError).toBeNull();
  });

  it('does not wait for the gateway when it is down', async () => {
    const { reconcileDomainRoutes } = await import('../src/services/domain-routing.js');
    await seedDomain('witch.pw', true);
    state.offline = true;

    const outcomes = await reconcileDomainRoutes();

    expect(outcomes).toHaveLength(0);
    expect(state.routes).toHaveLength(0);
  });

  it('never routes a hostname that was not proven', async () => {
    const { reconcileDomainRoutes } = await import('../src/services/domain-routing.js');
    await seedDomain('unproven.example.com', false);

    const outcomes = await reconcileDomainRoutes();

    expect(outcomes).toHaveLength(0);
    expect(state.routes).toHaveLength(0);
  });
});
