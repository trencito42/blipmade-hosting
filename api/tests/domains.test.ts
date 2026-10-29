import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase } from './helpers.js';

/**
 * The DNS lookup is replaced, so the suite never touches the network. The
 * records that are published are collected in a map the tests fill in.
 */
const { txtRecords } = vi.hoisted(() => ({ txtRecords: new Map<string, string[]>() }));

vi.mock('../src/services/dns.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/dns.js')>();
  return {
    ...actual,
    resolveTxt: vi.fn(async (host: string) => ({ values: txtRecords.get(host) ?? [], error: null })),
  };
});

/**
 * The panel is replaced by the allocation the platform hands out, so the tests
 * do not need a Pterodactyl installation.
 */
vi.mock('../src/services/pterodactyl/application.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/pterodactyl/application.js')>();
  return {
    ...actual,
    getServer: vi.fn(async () => ({ id: 42, node: 1, allocation: 7 })),
    listAllocations: vi.fn(async () => [
      { id: 7, ip: '10.77.0.11', port: 30123, alias: null, notes: null, assigned: true },
    ]),
  };
});

/**
 * The gateway is replaced as well. The real one is exercised through its own
 * helpers further down, but it must never be called over the network here.
 */
type RouteResult = { applied: boolean; reason: string | null; routeId: string | null };

const { applyRoute, removeRoute } = vi.hoisted(() => ({
  applyRoute: vi.fn(async (): Promise<RouteResult> => ({
    applied: false,
    reason: 'The gateway is not configured on this environment.',
    routeId: 'blipmade-route-test',
  })),
  removeRoute: vi.fn(async (): Promise<RouteResult> => ({ applied: true, reason: null, routeId: 'blipmade-route-test' })),
}));

vi.mock('../src/services/gateway.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/gateway.js')>();
  return {
    ...actual,
    applyCaddyRoute: applyRoute,
    removeCaddyRoute: removeRoute,
  };
});

let app: FastifyInstance;
let serverCounter = 0;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  txtRecords.clear();
  applyRoute.mockReset();
  applyRoute.mockResolvedValue({
    applied: false,
    reason: 'The gateway is not configured on this environment.',
    routeId: 'blipmade-route-test',
  });
  removeRoute.mockClear();
});

/** Creates an instance that is deployed, so a hostname can be claimed for it. */
async function seedInstance(userId: string) {
  serverCounter += 1;
  const product = await prisma.product.create({
    data: {
      slug: `wordpress-${serverCounter}`,
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      deployable: true,
      eggId: 1,
    },
  });
  return prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'wordpress',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      pterodactylServerId: 1000 + serverCounter,
    },
  });
}

describe('claiming a hostname', () => {
  it('refuses a hostname the platform keeps for itself', async () => {
    const { client, userId } = await registerAndLogin(app, 'reserved@example.com');
    const instance = await seedInstance(userId);

    const root = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'blipmade.com',
    });
    expect(root.status).toBe(400);

    // The service names of the platform are reserved as well.
    const service = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'panel.blipmade.com',
    });
    expect(service.status).toBe(400);

    const domains = await prisma.instanceDomain.count();
    expect(domains).toBe(0);
  });

  it('refuses a hostname that staff reserved at runtime', async () => {
    await prisma.setting.create({
      data: { key: 'reserved_domains', value: ['blocked.example.com'] },
    });

    const { client, userId } = await registerAndLogin(app, 'setting@example.com');
    const instance = await seedInstance(userId);

    const blocked = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'blocked.example.com',
    });
    expect(blocked.status).toBe(400);

    // Everything under a reserved domain is reserved as well.
    const below = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'app.blocked.example.com',
    });
    expect(below.status).toBe(400);
  });

  it('refuses a hostname that is not a plain host name', async () => {
    const { client, userId } = await registerAndLogin(app, 'invalid@example.com');
    const instance = await seedInstance(userId);

    for (const hostname of ['*.example.com', 'example', '192.168.0.10', '-bad.example.com', 'bad-.example.com']) {
      const response = await client.request('POST', `/api/instances/${instance.id}/domains`, { hostname });
      expect(response.status).toBe(400);
    }
  });

  it('returns a random token and the name it has to be published under', async () => {
    const { client, userId } = await registerAndLogin(app, 'claim@example.com');
    const instance = await seedInstance(userId);

    const response = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'customer.example.com',
    });

    expect(response.status).toBe(201);
    const domain = response.body.domain;
    expect(domain.hostname).toBe('customer.example.com');
    expect(domain.status).toBe('verifying');
    expect(domain.verification.host).toBe('_blipmade-verify.customer.example.com');
    expect(typeof domain.verification.token).toBe('string');
    // At least 16 random bytes, so the token cannot be guessed.
    expect(domain.verification.token.length).toBeGreaterThanOrEqual(22);
    expect(domain.verification.instructions).toContain('_blipmade-verify.customer.example.com');
    expect(domain.verification.instructions).toContain(domain.verification.token);

    const row = await prisma.instanceDomain.findUnique({ where: { id: domain.id } });
    expect(row?.verificationToken).toBe(domain.verification.token);
    expect(row?.verificationHost).toBe('_blipmade-verify.customer.example.com');
    expect(row?.claimedByUserId).toBe(userId);
    expect(row?.status).toBe('VERIFYING');
    expect(row?.verifiedAt).toBeNull();
  });

  it('gives every hostname its own token', async () => {
    const { client, userId } = await registerAndLogin(app, 'tokens@example.com');
    const instance = await seedInstance(userId);

    const first = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'one.example.com',
    });
    const second = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'two.example.com',
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.domain.verification.token).not.toBe(second.body.domain.verification.token);
  });

  it('does not let a second account claim the same hostname', async () => {
    const { client: first, userId: firstUserId } = await registerAndLogin(app, 'first@example.com');
    const instance = await seedInstance(firstUserId);
    const claimed = await first.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'taken.example.com',
    });
    expect(claimed.status).toBe(201);

    const { client: second, userId: secondUserId } = await registerAndLogin(app, 'second@example.com');
    const otherInstance = await seedInstance(secondUserId);
    const response = await second.request('POST', `/api/instances/${otherInstance.id}/domains`, {
      hostname: 'taken.example.com',
    });

    expect(response.status).toBe(409);

    // The hostname does not change hands.
    const row = await prisma.instanceDomain.findUnique({ where: { hostname: 'taken.example.com' } });
    expect(row?.claimedByUserId).toBe(firstUserId);
  });

  it('lets an expired claim go, so the hostname is free again', async () => {
    const { userId: firstUserId } = await registerAndLogin(app, 'expired-owner@example.com');
    const instance = await seedInstance(firstUserId);
    await prisma.instanceDomain.create({
      data: {
        instanceId: instance.id,
        hostname: 'stale.example.com',
        targetPort: 30123,
        status: 'VERIFYING',
        verificationToken: 'old-token',
        verificationHost: '_blipmade-verify.stale.example.com',
        claimedByUserId: firstUserId,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    });

    const { client: second, userId: secondUserId } = await registerAndLogin(app, 'expired-new@example.com');
    const otherInstance = await seedInstance(secondUserId);
    const response = await second.request('POST', `/api/instances/${otherInstance.id}/domains`, {
      hostname: 'stale.example.com',
    });

    expect(response.status).toBe(201);
    const row = await prisma.instanceDomain.findUnique({ where: { hostname: 'stale.example.com' } });
    expect(row?.claimedByUserId).toBe(secondUserId);
    expect(row?.verificationToken).not.toBe('old-token');
  });
});

describe('proving the ownership of a hostname', () => {
  it('does not activate a hostname when the token does not match', async () => {
    const { client, userId } = await registerAndLogin(app, 'wrong-token@example.com');
    const instance = await seedInstance(userId);
    const claimed = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'mismatch.example.com',
    });
    const domainId = claimed.body.domain.id as string;

    // A record that carries the wrong value is not a proof.
    txtRecords.set('_blipmade-verify.mismatch.example.com', ['not-the-token']);

    const response = await client.request('POST', `/api/domains/${domainId}/verify`);
    expect(response.status).toBe(200);
    expect(response.body.domain.status).toBe('verifying');
    expect(response.body.domain.verification.verified).toBe(false);

    const row = await prisma.instanceDomain.findUnique({ where: { id: domainId } });
    expect(row?.verifiedAt).toBeNull();
    expect(row?.status).toBe('VERIFYING');
    // The hostname is never routed before the proof was accepted.
    expect(applyRoute).not.toHaveBeenCalled();
  });

  it('does not accept a record that only points at the gateway', async () => {
    const { client, userId } = await registerAndLogin(app, 'a-record@example.com');
    const instance = await seedInstance(userId);
    const claimed = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'a-record.example.com',
    });
    const domainId = claimed.body.domain.id as string;

    // An A record for the shared gateway address proves nothing, so the
    // lookup finds no TXT record at all.
    const response = await client.request('POST', `/api/domains/${domainId}/verify`);
    expect(response.status).toBe(200);
    expect(response.body.domain.status).toBe('verifying');

    const row = await prisma.instanceDomain.findUnique({ where: { id: domainId } });
    expect(row?.verifiedAt).toBeNull();
    expect(applyRoute).not.toHaveBeenCalled();
  });

  it('activates a hostname when the token matches', async () => {
    const { client, userId } = await registerAndLogin(app, 'right-token@example.com');
    const instance = await seedInstance(userId);
    const claimed = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'proven.example.com',
    });
    const domainId = claimed.body.domain.id as string;
    const token = claimed.body.domain.verification.token as string;

    txtRecords.set('_blipmade-verify.proven.example.com', [token]);
    applyRoute.mockResolvedValue({ applied: true, reason: null, routeId: 'blipmade-route-test' });

    const response = await client.request('POST', `/api/domains/${domainId}/verify`);
    expect(response.status).toBe(200);
    expect(response.body.domain.status).toBe('active');
    expect(response.body.domain.verification.verified).toBe(true);

    const row = await prisma.instanceDomain.findUnique({ where: { id: domainId } });
    expect(row?.verifiedAt).not.toBeNull();
    expect(row?.status).toBe('ACTIVE');

    // The hostname is only routed after the proof was accepted.
    expect(applyRoute).toHaveBeenCalledTimes(1);
    expect(applyRoute).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'proven.example.com', verifiedAt: expect.any(Date) }),
    );
  });

  it('keeps the claim when the gateway is not configured yet', async () => {
    const { client, userId } = await registerAndLogin(app, 'no-gateway@example.com');
    const instance = await seedInstance(userId);
    const claimed = await client.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'waiting.example.com',
    });
    const domainId = claimed.body.domain.id as string;
    const token = claimed.body.domain.verification.token as string;

    txtRecords.set('_blipmade-verify.waiting.example.com', [token]);
    applyRoute.mockResolvedValue({
      applied: false,
      reason: 'The gateway is not configured on this environment.',
      routeId: 'blipmade-route-test',
    });

    const response = await client.request('POST', `/api/domains/${domainId}/verify`);
    expect(response.status).toBe(200);

    const row = await prisma.instanceDomain.findUnique({ where: { id: domainId } });
    // The proof was accepted, so the claim is kept.
    expect(row?.verifiedAt).not.toBeNull();
    expect(row?.status).toBe('PENDING_DNS');
    expect(row?.lastError).toContain('gateway');

    // The customer is told that the hostname waits for the gateway, not for
    // the records they have already published.
    expect(response.body.domain.status).toBe('pending_gateway');
  });

  it('does not let another account verify a hostname', async () => {
    const { client: owner, userId: ownerId } = await registerAndLogin(app, 'verify-owner@example.com');
    const instance = await seedInstance(ownerId);
    const claimed = await owner.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'owned.example.com',
    });
    const domainId = claimed.body.domain.id as string;
    const token = claimed.body.domain.verification.token as string;
    txtRecords.set('_blipmade-verify.owned.example.com', [token]);

    const { client: other } = await registerAndLogin(app, 'verify-other@example.com');
    const response = await other.request('POST', `/api/domains/${domainId}/verify`);

    expect(response.status).toBe(403);

    const row = await prisma.instanceDomain.findUnique({ where: { id: domainId } });
    expect(row?.verifiedAt).toBeNull();
    expect(applyRoute).not.toHaveBeenCalled();
  });

  it('does not let another account release a hostname', async () => {
    const { client: owner, userId: ownerId } = await registerAndLogin(app, 'release-owner@example.com');
    const instance = await seedInstance(ownerId);
    const claimed = await owner.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'kept.example.com',
    });

    const { client: other } = await registerAndLogin(app, 'release-other@example.com');
    const response = await other.request('DELETE', `/api/domains/${claimed.body.domain.id}`);

    expect(response.status).toBe(403);
    expect(await prisma.instanceDomain.count({ where: { hostname: 'kept.example.com' } })).toBe(1);
  });

  it('lets staff release a hostname and writes it to the audit log', async () => {
    const { client: owner, userId: ownerId } = await registerAndLogin(app, 'release-staff-owner@example.com');
    const instance = await seedInstance(ownerId);
    const claimed = await owner.request('POST', `/api/instances/${instance.id}/domains`, {
      hostname: 'audited.example.com',
    });

    const { client: admin } = await createAdmin(app);
    const response = await admin.request('DELETE', `/api/domains/${claimed.body.domain.id}`);

    expect(response.status).toBe(204);
    expect(await prisma.instanceDomain.count({ where: { hostname: 'audited.example.com' } })).toBe(0);

    const logs = await prisma.auditLog.findMany({ where: { action: 'domain.released' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.actorId).toBeTruthy();
  });
});

describe('the reserved hostnames', () => {
  it('keeps the platform names for itself', async () => {
    const routes = await vi.importActual<typeof import('../src/routes/domains.js')>('../src/routes/domains.js');

    expect(routes.builtInReservedDomains()).toContain('blipmade.com');
    expect(routes.matchesReservedEntry('blipmade.com', 'blipmade.com')).toBe(true);
    expect(routes.matchesReservedEntry('panel.blipmade.com', 'blipmade.com')).toBe(true);
    // A name that only ends in the same letters is not reserved.
    expect(routes.matchesReservedEntry('notblipmade.com', 'blipmade.com')).toBe(false);
    expect(routes.matchesReservedEntry('customer.example.com', 'blipmade.com')).toBe(false);

    if (env.DOMAIN_BASE) {
      const base = env.DOMAIN_BASE.trim().toLowerCase();
      expect(routes.builtInReservedDomains()).toContain(base);
      expect(routes.builtInReservedDomains()).toContain(`panel.${base}`);
      expect(routes.builtInReservedDomains()).toContain(`node1.${base}`);
    }
  });
});

describe('on-demand certificates', () => {
  it('allows only a hostname that the platform has verified', async () => {
    const { userId } = await registerAndLogin(app, 'certificate-owner@example.test');
    const instance = await seedInstance(userId);
    await prisma.instanceDomain.create({
      data: {
        instanceId: instance.id,
        hostname: 'verified.example.com',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        targetPort: 30123,
      },
    });

    const allowed = await app.inject({ method: 'GET', url: '/api/caddy/allow-certificate?domain=verified.example.com' });
    const unknown = await app.inject({ method: 'GET', url: '/api/caddy/allow-certificate?domain=unknown.example.com' });
    const wildcard = await app.inject({ method: 'GET', url: '/api/caddy/allow-certificate?domain=*.example.com' });

    expect(allowed.statusCode).toBe(204);
    expect(unknown.statusCode).toBe(403);
    expect(wildcard.statusCode).toBe(403);
  });
});

describe('the gateway', () => {
  it('refuses to route a hostname that was never verified', async () => {
    const actual = await vi.importActual<typeof import('../src/services/gateway.js')>(
      '../src/services/gateway.js',
    );
    await expect(
      actual.applyCaddyRoute({
        hostname: 'customer.example.com',
        target: '10.77.0.11',
        targetPort: 30123,
        verifiedAt: null,
      }),
    ).rejects.toThrow(actual.GatewayNotVerifiedError);
  });

  it('refuses to route a hostname that is not a plain host name', async () => {
    const actual = await vi.importActual<typeof import('../src/services/gateway.js')>(
      '../src/services/gateway.js',
    );
    for (const hostname of ['*.example.com', 'example', '192.168.0.10', 'Example.com']) {
      expect(actual.isValidHostname(hostname)).toBe(false);
    }
    expect(actual.isValidHostname('customer.example.com')).toBe(true);
  });

  it('refuses a target that is not an address inside the platform', async () => {
    const actual = await vi.importActual<typeof import('../src/services/gateway.js')>(
      '../src/services/gateway.js',
    );
    expect(actual.isValidTargetHost('10.77.0.11')).toBe(true);
    expect(actual.isValidTargetHost('https://example.com')).toBe(false);
    expect(actual.isValidTargetHost('example.com:8080')).toBe(false);
    expect(actual.isValidTargetHost('93.184.216.34')).toBe(false);
    expect(actual.isValidTargetPort(30123)).toBe(true);
    expect(actual.isValidTargetPort(80)).toBe(false);
  });

  it('keeps its routes in a namespace of its own', async () => {
    const actual = await vi.importActual<typeof import('../src/services/gateway.js')>(
      '../src/services/gateway.js',
    );
    const first = actual.routeIdFor('customer.example.com');
    const second = actual.routeIdFor('customer.example.com');
    expect(first).toBe(second);
    expect(first.startsWith('blipmade-route-')).toBe(true);
    expect(actual.routeIdFor('other.example.com')).not.toBe(first);
  });

  it('puts its routes in the server of Caddy that is configured', async () => {
    const actual = await vi.importActual<typeof import('../src/services/gateway.js')>(
      '../src/services/gateway.js',
    );
    const server = env.CADDY_APP_SERVER.trim() || 'blipmade';
    expect(actual.routesPath()).toContain('/config/apps/http/servers/');
    expect(actual.routesPath()).toContain(`/${server}/routes`);
    // The routes never leave the namespace of the platform.
    expect(actual.routesPath()).not.toContain('/config/apps/http/servers//');
  });

  it('names the settings that are missing when the gateway is not configured', async () => {    const actual = await vi.importActual<typeof import('../src/services/gateway.js')>(
      '../src/services/gateway.js',
    );
    const problem = actual.gatewayConfigurationProblem();

    // The message says what to write in the environment file, because
    // "the gateway is not configured" says nothing to anybody.
    expect(problem).toMatch(/CADDY_ADMIN_URL|CADDY_ADMIN_TOKEN/);
    // The value of a setting is never part of the message.
    if (env.CADDY_ADMIN_TOKEN) expect(problem).not.toContain(env.CADDY_ADMIN_TOKEN);
    if (env.CADDY_ADMIN_URL) expect(problem).not.toContain(env.CADDY_ADMIN_URL);

    // The error carries the same words, so the customer and the operator read
    // the same thing.
    expect(new actual.GatewayNotConfiguredError().message).toBe(problem);
  });
});
