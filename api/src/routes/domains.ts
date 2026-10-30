import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { randomToken } from '../lib/tokens.js';
import * as gateway from '../services/gateway.js';
import * as dns from '../services/dns.js';
import { resolveTarget } from '../services/domain-routing.js';
import {
  notifyDomainDnsIncomplete,
  notifyDomainVerificationInstructions,
  notifyDomainVerified,
} from '../services/notifications.js';

/**
 * The routes of the hostnames carry the limit of the panel.
 *
 * A hostname is claimed, proven and released through the panel and the
 * gateway of the platform, and every one of those steps spends the
 * resources of the node of everybody. The limit is counted for the
 * account of the customer and for the address of the caller.
 */

/**
 * The routes of the hostnames carry the limit of the panel.
 *
 * A hostname is claimed, proven and released through the panel and the
 * gateway of the platform, and every one of those steps spends the
 * resources of the node of everybody. The limit is counted for the
 * account of the customer and for the address of the caller.
 */

/**
 * A hostname is only routed to a customer container when that customer proved
 * that the hostname belongs to them. The proof is a TXT record with a random
 * token that the platform generated for the hostname. An A record that points
 * at the shared gateway address is never accepted as a proof: every customer
 * points at the same address, so it cannot tell two hostnames apart.
 */

/** A claim that was never proven expires after a week, so it stops blocking the hostname. */
const CLAIM_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** The domain of the platform itself. It and everything under it are reserved. */
const RESERVED_ROOT_DOMAINS = ['blipmade.com'];

/** The services the platform publishes under its own domain. */
const RESERVED_SERVICE_NAMES = [
  'panel',
  'api',
  'app',
  'apps',
  'status',
  'docs',
  'www',
  'mail',
  'email',
  'cdn',
  'admin',
  'account',
  'accounts',
  'auth',
  'billing',
  'blog',
  'checkout',
  'console',
  'dashboard',
  'db',
  'ftp',
  'git',
  'grafana',
  'help',
  'id',
  'imap',
  'internal',
  'intranet',
  'login',
  'monitor',
  'ns1',
  'ns2',
  'pop',
  'private',
  'redis',
  'registry',
  'shop',
  'smtp',
  'support',
  'test',
  'vault',
  'worker',
];

/** The machines of the platform. They are reached under the domain of the platform. */
const RESERVED_MACHINE_NAMES = [
  'node1',
  'node2',
  'node3',
  'node4',
  'gateway',
  'proxy',
  'caddy',
  'vm102',
  'db',
  'redis',
  'worker',
  'registry',
  'monitor',
  'backup',
];

interface DomainRow {
  id: string;
  instanceId: string;
  hostname: string;
  status: string;
  targetPort: number;
  lastError: string | null;
  verificationToken: string | null;
  verificationHost: string | null;
  verifiedAt: Date | null;
  claimedByUserId: string | null;
  caddyRouteId: string | null;
  createdAt: Date;
  instance: { name: string };
}

/** The hostnames the platform keeps for itself. */
export function builtInReservedDomains(): string[] {
  const entries = new Set<string>(RESERVED_ROOT_DOMAINS);
  const base = env.DOMAIN_BASE.trim().toLowerCase();
  if (base) {
    entries.add(base);
    for (const name of RESERVED_SERVICE_NAMES) entries.add(`${name}.${base}`);
    for (const name of RESERVED_MACHINE_NAMES) entries.add(`${name}.${base}`);
  }
  return [...entries];
}

/**
 * The reserved hostnames: the built-in list plus the one staff can extend at
 * runtime through the setting `reserved_domains`, which holds an array of
 * domain names.
 */
async function reservedDomains(): Promise<string[]> {
  const entries = new Set<string>(builtInReservedDomains());
  const setting = await prisma.setting.findUnique({ where: { key: 'reserved_domains' } });
  const value = setting?.value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const name = entry.trim().toLowerCase();
      if (name) entries.add(name);
    }
  }
  return [...entries];
}

/**
 * True when the hostname is one of the reserved names, or a subdomain of one.
 * An entry that starts with a dot only reserves the subdomains.
 */
export function matchesReservedEntry(hostname: string, entry: string): boolean {
  if (entry.startsWith('.')) return hostname.endsWith(entry);
  return hostname === entry || hostname.endsWith(`.${entry}`);
}

async function isReservedHostname(hostname: string): Promise<boolean> {
  const entries = await reservedDomains();
  return entries.some((entry) => matchesReservedEntry(hostname, entry));
}

/**
 * Checks the hostname and returns it in the form the platform stores it: the
 * name is trimmed and lower cased, everything that is not a plain host name
 * is refused.
 */
function assertValidHostname(raw: string): string {
  const hostname = raw.trim().toLowerCase();
  if (!hostname) throw badRequest('Enter a hostname.');
  if (hostname.length > 253) throw badRequest('That hostname is too long.');
  if (hostname.includes('*')) {
    throw badRequest('A wildcard cannot be claimed. Enter the hostname you want to use.');
  }
  if (!gateway.isValidHostname(hostname)) {
    throw badRequest('Enter a valid hostname, such as app.example.com.');
  }
  return hostname;
}

/** True when a claim was never proven and has expired. */
function isClaimExpired(domain: {
  verifiedAt: Date | null;
  createdAt: Date;
  claimedByUserId: string | null;
}): boolean {
  // A row that was never claimed is not a claim, so it never expires.
  if (!domain.claimedByUserId) return false;
  if (domain.verifiedAt) return false;
  return Date.now() - domain.createdAt.getTime() > CLAIM_TTL_MS;
}

/**
 * The status of a hostname, as the customer is shown it.
 *
 * The status that is stored says "pending dns" for a hostname that waits for
 * the proof of ownership and for one that waits for the gateway. The two are
 * not the same thing: a hostname whose proof was accepted waits for the
 * gateway, and telling the customer that it is waiting for the DNS sends them
 * to publish records they have already published.
 *
 * The stored status is not changed, so the schema does not move; only the
 * answer of the API is more precise than the row.
 */
function statusFor(domain: DomainRow): string {
  if (domain.status === 'PENDING_DNS' && domain.verifiedAt) return 'pending_gateway';
  return domain.status.toLowerCase();
}

/** How long the address of an instance under the base of the platform is kept before it may change again. */
const ADDRESS_CHANGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether the hostname is an address of the platform: the base of the platform owns it. */
function isPlatformAddress(hostname: string): boolean {
  const base = env.DOMAIN_BASE.trim().toLowerCase();
  return Boolean(base) && hostname.toLowerCase().endsWith(`.${base}`);
}

/** The moment the address may change again, or null when it may change now. */
async function addressChangeAvailableAt(domainId: string): Promise<Date | null> {
  const last = await prisma.auditLog.findFirst({
    where: { action: 'domain.address_changed', targetType: 'instance_domain', targetId: domainId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last) return null;
  const next = new Date(last.createdAt.getTime() + ADDRESS_CHANGE_INTERVAL_MS);
  return next.getTime() > Date.now() ? next : null;
}

function serializeDomain(domain: DomainRow, changeAvailableAt: Date | null = null) {
  const target = process.env.DOMAIN_TARGET ?? '193.34.214.143';
  const records = gateway.dnsRecordsFor(domain.hostname, target);
  if (domain.verificationHost && domain.verificationToken) {
    records.push({ name: domain.verificationHost, type: 'TXT', value: domain.verificationToken });
  }
  return {
    id: domain.id,
    instanceId: domain.instanceId,
    instanceName: domain.instance.name,
    hostname: domain.hostname,
    status: statusFor(domain),
    targetPort: domain.targetPort,
    dnsRecords: records,
    lastError: domain.lastError,
    /** An address of the platform: it needs no DNS record and no proof, and its name may change. */
    platform: isPlatformAddress(domain.hostname),
    /** The moment the name of an address of the platform may change again, or null when it may change now. */
    addressChangeAvailableAt: changeAvailableAt,
    verification: {
      /** The name the TXT record has to be published under. */
      host: domain.verificationHost,
      /** The value the TXT record has to carry. */
      token: domain.verificationToken,
      /** True once the proof was accepted. */
      verified: Boolean(domain.verifiedAt),
      verifiedAt: domain.verifiedAt,
      /** The moment an unproven claim expires. */
      expiresAt: domain.verifiedAt ? null : new Date(domain.createdAt.getTime() + CLAIM_TTL_MS),
      instructions:
        domain.verificationHost && domain.verificationToken
          ? `Add a TXT record for ${domain.verificationHost} with the value ${domain.verificationToken}`
          : null,
    },
  };
}

export async function registerDomainRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Caddy asks this endpoint before issuing an on-demand certificate. The
   * answer comes from the same domain table that owns the reverse-proxy
   * routes, so arbitrary SNI values can never make the edge request a
   * certificate. This endpoint is called from the private network and carries
   * no customer session.
   */
  app.get('/caddy/allow-certificate', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute', keyGenerator: addressRateLimitKey } },
  }, async (request: FastifyRequest, reply) => {
    const parsed = z.object({ domain: z.string().trim().toLowerCase() }).safeParse(request.query);
    if (!parsed.success || !gateway.isValidHostname(parsed.data.domain)) {
      return reply.code(403).send();
    }
    const domain = await prisma.instanceDomain.findFirst({
      where: { hostname: parsed.data.domain, verifiedAt: { not: null } },
      select: { id: true },
    });
    return domain ? reply.code(204).send() : reply.code(403).send();
  });

  app.get('/domains', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const domains = await prisma.instanceDomain.findMany({
      where: { instance: { userId: user.id } },
      include: { instance: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const waits = await Promise.all(
      domains.map((domain) => (isPlatformAddress(domain.hostname) ? addressChangeAvailableAt(domain.id) : Promise.resolve(null))),
    );
    return { domains: domains.map((domain, index) => serializeDomain(domain, waits[index] ?? null)) };
  });

  /**
   * Changes the name of the address an instance has under the base of the
   * platform. The address may change once in seven days, so a link that was
   * shared does not move under the feet of the people who use it.
   */
  app.put('/domains/:id/address', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { name } = z.object({ name: z.string() }).parse(request.body ?? {});

    const base = env.DOMAIN_BASE.trim().toLowerCase();
    const label = name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(label)) {
      throw badRequest('Use 3 to 40 letters, numbers and dashes. The name cannot start or end with a dash.');
    }
    const hostname = `${label}.${base}`;

    const domain = await prisma.instanceDomain.findUnique({
      where: { id },
      include: { instance: { select: { id: true, name: true, userId: true, pterodactylServerId: true, status: true } } },
    });
    if (!domain || domain.instance.userId !== user.id) throw notFound('Domain not found.');
    if (!isPlatformAddress(domain.hostname)) {
      throw badRequest('Only the address that Blipmade gives to an instance can be renamed.');
    }
    if (domain.hostname === hostname) throw badRequest('That is already the address of this instance.');

    const staff = user.role === 'STAFF' || user.role === 'ADMIN';
    const wait = staff ? null : await addressChangeAvailableAt(domain.id);
    if (wait) {
      throw conflict(`The address can change once in 7 days. You can change it again on ${wait.toISOString().slice(0, 10)}.`);
    }

    if (await isReservedHostname(hostname)) throw badRequest('That name is reserved by the platform.');
    const taken = await prisma.instanceDomain.findUnique({ where: { hostname }, select: { id: true } });
    if (taken) throw conflict('That name is taken. Choose another one.');

    // The old route goes first, so the old address never points at the
    // container once the name has moved.
    try {
      await gateway.removeCaddyRoute(domain.hostname);
    } catch (error) {
      request.log.warn(
        { hostname: domain.hostname, reason: error instanceof Error ? error.message : 'unknown' },
        'the route could not be removed from the gateway',
      );
    }

    let status: 'ACTIVE' | 'PENDING_DNS' | 'ERROR' = 'PENDING_DNS';
    let lastError: string | null = null;
    let caddyRouteId: string | null = null;
    try {
      const target = await resolveTarget(domain.instance);
      const result = await gateway.applyCaddyRoute({
        hostname,
        target: target.host,
        targetPort: target.port,
        verifiedAt: domain.verifiedAt ?? new Date(),
      });
      status = result.applied ? 'ACTIVE' : 'PENDING_DNS';
      lastError = result.reason;
      caddyRouteId = result.routeId ?? null;
    } catch (error) {
      // The worker routes the new name on its next pass.
      lastError = error instanceof Error ? error.message : 'The gateway could not be reached.';
    }

    const updated = await prisma.instanceDomain.update({
      where: { id: domain.id },
      data: { hostname, status, lastError, caddyRouteId },
      include: { instance: { select: { name: true } } },
    });
    await prisma.instanceEvent.create({
      data: { instanceId: domain.instanceId, type: 'domain', message: `The address changed from ${domain.hostname} to ${hostname}.` },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'domain.address_changed',
      targetType: 'instance_domain',
      targetId: domain.id,
      meta: { from: domain.hostname, to: hostname },
    });

    return { domain: serializeDomain(updated, staff ? null : new Date(Date.now() + ADDRESS_CHANGE_INTERVAL_MS)) };
  });

  /**
   * Claims a hostname for an instance. The claim is not a routing decision: it
   * starts a proof of ownership that the customer has to finish.
   */
  app.post('/instances/:id/domains', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { hostname: raw } = z.object({ hostname: z.string() }).parse(request.body ?? {});
    const hostname = assertValidHostname(raw);

    const instance = await prisma.instance.findFirst({
      where: { id, userId: user.id },
      include: { product: true },
    });
    if (!instance) throw notFound('Instance not found.');
    if (!instance.pterodactylServerId) {
      throw badRequest('This instance is not deployed yet, so it has no port to route to.');
    }

    if (await isReservedHostname(hostname)) {
      throw badRequest('That hostname is reserved by the platform.');
    }

    // The token is the proof of ownership. It is random, so it cannot be
    // guessed and it is different for every hostname.
    const token = randomToken(24);
    const verificationHost = dns.verificationHostFor(hostname);
    const target = await resolveTarget(instance);

    const existing = await prisma.instanceDomain.findUnique({
      where: { hostname },
      include: { instance: { select: { userId: true } } },
    });

    let domain;
    if (existing && isClaimExpired(existing)) {
      // The claim was never proven and has expired, so it no longer blocks
      // the hostname.
      await prisma.instanceDomain.delete({ where: { id: existing.id } });
      domain = await prisma.instanceDomain.create({
        data: {
          instanceId: instance.id,
          hostname,
          targetPort: target.port,
          status: 'VERIFYING',
          verificationToken: token,
          verificationHost,
          claimedByUserId: user.id,
        },
        include: { instance: { select: { name: true } } },
      });
    } else if (existing && existing.claimedByUserId && existing.claimedByUserId !== user.id) {
      throw conflict('That hostname is already claimed by another account.');
    } else if (existing && existing.verifiedAt) {
      throw conflict('That hostname is already in use.');
    } else if (existing && existing.instance.userId !== user.id) {
      throw conflict('That hostname is already in use.');
    } else if (existing) {
      // The row was created by the provisioning flow. Its owner takes it over
      // and receives a fresh token.
      domain = await prisma.instanceDomain.update({
        where: { id: existing.id },
        data: {
          instanceId: instance.id,
          claimedByUserId: user.id,
          verificationToken: token,
          verificationHost,
          targetPort: target.port,
          status: 'VERIFYING',
          lastError: null,
        },
        include: { instance: { select: { name: true } } },
      });
    } else {
      domain = await prisma.instanceDomain.create({
        data: {
          instanceId: instance.id,
          hostname,
          targetPort: target.port,
          status: 'VERIFYING',
          verificationToken: token,
          verificationHost,
          claimedByUserId: user.id,
        },
        include: { instance: { select: { name: true } } },
      });
    }

    await prisma.instanceEvent.create({
      data: {
        instanceId: instance.id,
        type: 'domain',
        message: `Domain ${hostname} claimed. Waiting for the proof of ownership.`,
      },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'domain.claimed',
      targetType: 'instance_domain',
      targetId: domain.id,
      meta: { hostname },
    });

    // The customer is told how to prove that the hostname is theirs. The
    // token of the proof travels in this message and in nothing else: the
    // outbox empties the message as soon as it is on the queue.
    await notifyDomainVerificationInstructions({
      userId: user.id,
      domain: hostname,
      host: verificationHost,
      token,
      occurrence: domain.updatedAt,
    });

    return reply.code(201).send({ domain: serializeDomain(domain) });
  });

  /**
   * Checks the proof of ownership of a claimed hostname. Only a TXT record
   * with the token of the hostname counts as a proof.
   */
  app.post('/domains/:id/verify', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const domain = await prisma.instanceDomain.findUnique({
      where: { id },
      include: { instance: { select: { name: true, userId: true, pterodactylServerId: true } } },
    });
    if (!domain) throw notFound('Domain not found.');
    if (domain.claimedByUserId !== user.id) {
      throw forbidden('Only the account that claimed this hostname can verify it.');
    }
    if (isClaimExpired(domain)) {
      throw badRequest('This claim expired before the hostname was proven. Claim it again.');
    }
    if (!domain.verificationToken || !domain.verificationHost) {
      throw badRequest('This hostname was never claimed. Claim it first.');
    }

    // The proof: a TXT record with the token of this hostname. An A record
    // that points at the shared gateway address proves nothing.
    const lookup = await dns.resolveTxt(domain.verificationHost);
    if (!dns.matchesToken(lookup.values, domain.verificationToken)) {
      const updated = await prisma.instanceDomain.update({
        where: { id: domain.id },
        data: {
          status: 'VERIFYING',
          lastError:
            lookup.error ??
            `The TXT record for ${domain.verificationHost} does not carry the expected value yet.`,
        },
        include: { instance: { select: { name: true } } },
      });

      // The customer is told that the DNS is not ready. The message is tied
      // to the hostname, so checking the proof ten times does not send ten
      // messages.
      await notifyDomainDnsIncomplete({
        userId: user.id,
        domain: domain.hostname,
        missing: [domain.verificationHost],
      });

      return { domain: serializeDomain(updated) };
    }

    // The proof was accepted, so the hostname may be routed.
    const verifiedAt = domain.verifiedAt ?? new Date();
    const target = await resolveTarget(domain.instance);

    let status: 'ACTIVE' | 'PENDING_DNS' | 'ERROR' = 'ACTIVE';
    let lastError: string | null = null;
    let caddyRouteId = domain.caddyRouteId;
    try {
      const result = await gateway.applyCaddyRoute({
        hostname: domain.hostname,
        target: target.host,
        targetPort: target.port,
        verifiedAt,
      });
      status = result.applied ? 'ACTIVE' : 'PENDING_DNS';
      lastError = result.reason;
      caddyRouteId = result.routeId ?? caddyRouteId;
    } catch (error) {
      if (error instanceof gateway.GatewayNotConfiguredError) {
        // The hostname is proven, but there is no gateway to route it yet. The
        // claim is kept, so nothing is lost.
        status = 'PENDING_DNS';
        lastError = error.message;
      } else if (error instanceof gateway.GatewayValidationError) {
        status = 'ERROR';
        lastError = error.message;
      } else {
        status = 'PENDING_DNS';
        lastError = error instanceof Error ? error.message : 'The gateway could not be reached.';
      }
    }

    const updated = await prisma.instanceDomain.update({
      where: { id: domain.id },
      data: { status, lastError, verifiedAt, targetPort: target.port, caddyRouteId },
      include: { instance: { select: { name: true } } },
    });

    await prisma.instanceEvent.create({
      data: {
        instanceId: domain.instanceId,
        type: 'domain',
        message:
          status === 'ACTIVE'
            ? `Domain ${domain.hostname} is active.`
            : `Domain ${domain.hostname} verified, waiting for the gateway.`,
      },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'domain.verified',
      targetType: 'instance_domain',
      targetId: domain.id,
      meta: { hostname: domain.hostname, status },
    });

    // The hostname is proved. The customer is told that it belongs to them
    // now, and the moment of the proof is what makes this message its own.
    await notifyDomainVerified({
      userId: user.id,
      domain: domain.hostname,
      occurrence: updated.updatedAt,
    });

    return { domain: serializeDomain(updated) };
  });

  /**
   * Releases a hostname. Only the account that claimed it may do so. Staff may
   * release a hostname after they have looked at it, and every release is
   * written to the audit log.
   */
  app.delete('/domains/:id', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const domain = await prisma.instanceDomain.findUnique({
      where: { id },
      include: { instance: { select: { userId: true } } },
    });
    if (!domain) throw notFound('Domain not found.');

    const staff = user.role === 'STAFF' || user.role === 'ADMIN';
    const owner =
      domain.claimedByUserId === user.id ||
      (!domain.claimedByUserId && domain.instance.userId === user.id);
    if (!staff && !owner) {
      throw forbidden('Only the account that claimed this hostname can release it.');
    }

    // The route is removed first, so the hostname never points at the
    // container once the claim is gone.
    try {
      await gateway.removeCaddyRoute(domain.hostname);
    } catch (error) {
      request.log.warn(
        { hostname: domain.hostname, reason: error instanceof Error ? error.message : 'unknown' },
        'the route could not be removed from the gateway',
      );
    }

    await prisma.instanceDomain.delete({ where: { id: domain.id } });
    await prisma.instanceEvent.create({
      data: { instanceId: domain.instanceId, type: 'domain', message: `Domain ${domain.hostname} released.` },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: staff && !owner ? 'domain.released' : 'domain.deleted',
      targetType: 'instance_domain',
      targetId: id,
      meta: { hostname: domain.hostname, releasedByStaff: staff && !owner },
    });

    return reply.code(204).send();
  });
}
