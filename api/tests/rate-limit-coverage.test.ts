import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import { LIMITS } from '../src/lib/rate-limit.js';
import { registerAdminRoutes } from '../src/routes/admin.js';
import { registerAuthRoutes } from '../src/routes/auth.js';
import { registerBillingRoutes } from '../src/routes/billing.js';
import { registerCatalogRoutes } from '../src/routes/catalog.js';
import { registerDomainRoutes } from '../src/routes/domains.js';
import { registerInstanceServerRoutes } from '../src/routes/instance-server.js';
import { registerInstanceRoutes } from '../src/routes/instances.js';
import { registerOrderRoutes } from '../src/routes/orders.js';
import { registerSettingsRoutes } from '../src/routes/settings.js';
import { registerTicketRoutes } from '../src/routes/tickets.js';
import { registerWebhookRoutes } from '../src/routes/webhooks.js';

/**
 * The limits of the routes that change something (SEC-06).
 *
 * Every route that writes carries a limit, and the limit is counted twice:
 * once for the account of the caller and once for the address of the caller.
 * The file checks the three rules that make the two counters useful:
 *
 *  - a route that had no limit now refuses the request that passes it, with
 *    the answer of the platform;
 *  - the limit of one account does not refuse another account, even when the
 *    two accounts come from the same address;
 *  - the limit of one address does refuse the accounts that the address
 *    rotates, so the address cannot buy as much as it wants with a new
 *    account for every request.
 *
 * The webhook of the provider is the one route that is not limited: a
 * delivery that is refused is delivered again by the provider, for ever.
 */

let app: FastifyInstance;

/** A ticket, the way a customer writes one. */
const TICKET = { subject: 'The server does not answer', body: 'It stopped this morning.' };

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

/**
 * The routes of the platform and the limit of every one of them.
 *
 * The routes are registered on an instance of their own, so the limit that
 * every route carries can be read. The instance carries the plugin of the
 * rate limit, because the routes ask for it when they are registered.
 */
async function routeTable(): Promise<Array<{ method: string; url: string; limit: unknown }>> {
  const probe = Fastify();
  await probe.register(rateLimit, { global: false });

  const routes: Array<{ method: string; url: string; limit: unknown }> = [];
  probe.addHook('onRoute', (options) => {
    const method = Array.isArray(options.method) ? options.method[0] : options.method;
    routes.push({ method: String(method), url: options.url, limit: options.config?.rateLimit ?? null });
  });

  await registerAdminRoutes(probe);
  await registerAuthRoutes(probe);
  await registerBillingRoutes(probe);
  await registerCatalogRoutes(probe);
  await registerDomainRoutes(probe);
  await registerInstanceServerRoutes(probe);
  await registerInstanceRoutes(probe);
  await registerOrderRoutes(probe);
  await registerSettingsRoutes(probe);
  await registerTicketRoutes(probe);
  await registerWebhookRoutes(probe);
  await probe.ready();
  await probe.close();

  return routes;
}

describe('the limits of the routes', () => {
  it('gives every route that writes a limit', async () => {
    const routes = await routeTable();
    const writing = routes.filter((route) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method));

    // The webhook of the provider is the only one that stays without a
    // limit: a delivery that is refused is delivered again by the provider,
    // for ever.
    const without = writing
      .filter((route) => !route.limit)
      .map((route) => `${route.method} ${route.url}`);

    expect(without).toEqual([
      'POST /webhooks/stripe',
      'POST /webhooks/stripe/test',
      'POST /webhooks/stripe/replay',
    ]);
    expect(writing.length).toBeGreaterThan(80);
  });

  it('counts the address more generously than the account', () => {
    for (const [name, policy] of Object.entries(LIMITS)) {
      // One address may be the address of several customers, so the address
      // is never the stricter of the two.
      expect(policy.address, name).toBeGreaterThanOrEqual(policy.account);
    }
  });

  it('is stricter for the panel and for the mail than for a row in the database', () => {
    expect(LIMITS.panel.account).toBeLessThan(LIMITS.accountWrite.account);
    expect(LIMITS.mail.account).toBeLessThan(LIMITS.accountWrite.account);
  });
});

describe('a route that had no limit', () => {
  it('refuses the request that passes the limit of the account', async () => {
    const { client } = await registerAndLogin(app, 'tickets@example.com');

    // The account fills its own limit.
    for (let index = 0; index < LIMITS.mail.account; index += 1) {
      const response = await client.request('POST', '/api/tickets', TICKET);
      expect(response.status).toBe(201);
    }

    const refused = await client.request('POST', '/api/tickets', TICKET);
    expect(refused.status).toBe(429);
    // The answer is the answer of the platform, the same one the limits that
    // were already there answer with.
    expect(refused.body.error.code).toBe('rate_limited');
    expect(refused.body.error.requestId).toBeTruthy();
  });

  it('does not let the limit of one account refuse another account', async () => {
    const { client: first } = await registerAndLogin(app, 'first@example.com');
    const { client: second } = await registerAndLogin(app, 'second@example.com');

    // The first account fills its own limit.
    for (let index = 0; index < LIMITS.mail.account; index += 1) {
      const response = await first.request('POST', '/api/tickets', TICKET);
      expect(response.status).toBe(201);
    }

    const refused = await first.request('POST', '/api/tickets', TICKET);
    expect(refused.status).toBe(429);

    // The second account comes from the same address and is not refused by
    // the counter of the first one: the limit of the account is the limit of
    // one account and not the limit of the address.
    const other = await second.request('POST', '/api/tickets', TICKET);
    expect(other.status).toBe(201);
  });

  it('refuses the address that rotates the accounts', async () => {
    const clients = [];
    for (const email of ['one@example.com', 'two@example.com', 'three@example.com']) {
      clients.push((await registerAndLogin(app, email)).client);
    }

    // Every account fills its own limit, and every account is a different
    // one, so the limit of the account is never the one that is reached.
    for (const client of clients) {
      for (let index = 0; index < LIMITS.mail.account; index += 1) {
        const response = await client.request('POST', '/api/tickets', TICKET);
        expect(response.status).toBe(201);
      }
    }

    // The limit of the address is reached: the next account is refused, even
    // though its own limit is untouched.
    const { client: fourth } = await registerAndLogin(app, 'four@example.com');
    const refused = await fourth.request('POST', '/api/tickets', TICKET);
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');
  });
});

describe('the webhook of the provider', () => {
  it('accepts a burst of deliveries', async () => {
    const client = makeClient(app);

    // The deliveries of the provider are not throttled: a delivery that is
    // refused is delivered again by the provider, for ever.
    for (let index = 0; index < 50; index += 1) {
      const response = await client.request('POST', '/api/webhooks/stripe', {
        id: `evt_burst_${index}`,
        type: 'customer.created',
        data: { object: {} },
      });
      expect(response.status).toBe(200);
    }
  });
});

describe('the limits that were already there', () => {
  it('still refuses the request that passes the limit of the address', async () => {
    const client = makeClient(app);

    // The limit of the request of a reset was five requests in a quarter of
    // an hour, and it is still five.
    for (let index = 0; index < 5; index += 1) {
      const response = await client.request('POST', '/api/auth/forgot-password', {
        email: `known-${index}@example.com`,
      });
      expect(response.status).toBe(200);
    }

    const refused = await client.request('POST', '/api/auth/forgot-password', {
      email: 'known-5@example.com',
    });
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('rate_limited');
  });
});
