import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import * as gateway from '../services/gateway.js';
import * as ptero from '../services/pterodactyl/application.js';

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4, 'Enter a hostname.')
  .max(253, 'That hostname is too long.')
  .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/, 'Enter a valid hostname, such as app.example.com.');

async function serializeDomain(domain: {
  id: string;
  instanceId: string;
  hostname: string;
  status: string;
  targetPort: number;
  lastError: string | null;
  instance: { name: string };
}) {
  const target = process.env.DOMAIN_TARGET ?? '193.34.214.143';
  return {
    id: domain.id,
    instanceId: domain.instanceId,
    instanceName: domain.instance.name,
    hostname: domain.hostname,
    status: domain.status.toLowerCase(),
    targetPort: domain.targetPort,
    dnsRecords: gateway.dnsRecordsFor(domain.hostname, target),
    lastError: domain.lastError,
  };
}

export async function registerDomainRoutes(app: FastifyInstance): Promise<void> {
  app.get('/domains', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const domains = await prisma.instanceDomain.findMany({
      where: { instance: { userId: user.id } },
      include: { instance: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { domains: domains.map(serializeDomain) };
  });

  app.post('/instances/:id/domains', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { hostname } = z.object({ hostname: hostnameSchema }).parse(request.body);

    const instance = await prisma.instance.findFirst({
      where: { id, userId: user.id },
      include: { product: true },
    });
    if (!instance) throw notFound('Instance not found.');
    if (!instance.pterodactylServerId) throw badRequest('This instance is not deployed yet, so it has no port to route to.');

    const existing = await prisma.instanceDomain.findUnique({ where: { hostname } });
    if (existing) throw badRequest('That hostname is already in use.');

    const server = await ptero.getServer(instance.pterodactylServerId);
    const allocations = await ptero.listAllocations(server.node);
    const allocation = allocations.find((candidate) => candidate.id === server.allocation);
    const targetPort = allocation?.port ?? 0;

    const domain = await prisma.instanceDomain.create({
      data: {
        instanceId: instance.id,
        hostname,
        targetPort,
        status: 'PENDING_DNS',
      },
      include: { instance: { select: { name: true } } },
    });

    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'domain', message: `Domain ${hostname} added. Waiting for DNS.` },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'domain.created', targetType: 'instance_domain', targetId: domain.id, meta: { hostname } });

    return reply.code(201).send({ domain: await serializeDomain(domain) });
  });

  app.post('/domains/:id/verify', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const domain = await prisma.instanceDomain.findFirst({
      where: { id, instance: { userId: user.id } },
      include: { instance: { select: { name: true, pterodactylServerId: true } } },
    });
    if (!domain) throw notFound('Domain not found.');

    const addresses = await gateway.resolveHostname(domain.hostname);
    const target = process.env.DOMAIN_TARGET ?? '193.34.214.143';

    if (!addresses.length) {
      const updated = await prisma.instanceDomain.update({
        where: { id: domain.id },
        data: { status: 'PENDING_DNS', lastError: 'No A record is visible for this hostname yet.' },
        include: { instance: { select: { name: true } } },
      });
      return { domain: await serializeDomain(updated) };
    }

    if (!addresses.includes(target)) {
      const updated = await prisma.instanceDomain.update({
        where: { id: domain.id },
        data: { status: 'ERROR', lastError: `This hostname points to ${addresses.join(', ')} instead of ${target}.` },
        include: { instance: { select: { name: true } } },
      });
      return { domain: await serializeDomain(updated) };
    }

    // DNS is correct, so ask the gateway to route the hostname.
    let applied = false;
    let reason: string | null = null;
    if (domain.instance.pterodactylServerId) {
      const server = await ptero.getServer(domain.instance.pterodactylServerId);
      const allocations = await ptero.listAllocations(server.node);
      const allocation = allocations.find((candidate) => candidate.id === server.allocation);
      const result = await gateway.applyCaddyRoute({
        hostname: domain.hostname,
        target: allocation?.ip ?? '10.77.0.11',
        targetPort: domain.targetPort,
      });
      applied = result.applied;
      reason = result.reason;
    }

    const updated = await prisma.instanceDomain.update({
      where: { id: domain.id },
      data: {
        status: applied ? 'ACTIVE' : 'VERIFYING',
        lastError: applied ? null : reason ?? 'The gateway has not confirmed the route yet.',
      },
      include: { instance: { select: { name: true } } },
    });

    await prisma.instanceEvent.create({
      data: {
        instanceId: domain.instanceId,
        type: 'domain',
        message: applied ? `Domain ${domain.hostname} is active.` : `Domain ${domain.hostname} verified, waiting for the gateway.`,
      },
    });

    return { domain: await serializeDomain(updated) };
  });

  app.delete('/domains/:id', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const domain = await prisma.instanceDomain.findFirst({
      where: { id, instance: { userId: user.id } },
    });
    if (!domain) throw notFound('Domain not found.');

    await gateway.removeCaddyRoute(domain.hostname);
    await prisma.instanceDomain.delete({ where: { id: domain.id } });
    await prisma.instanceEvent.create({
      data: { instanceId: domain.instanceId, type: 'domain', message: `Domain ${domain.hostname} removed.` },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'domain.deleted', targetType: 'instance_domain', targetId: id, meta: { hostname: domain.hostname } });

    return reply.code(204).send();
  });
}
