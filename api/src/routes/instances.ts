import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound, unavailable } from '../lib/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import * as client from '../services/pterodactyl/client.js';
import * as pteroApp from '../services/pterodactyl/application.js';
import { priceConfiguration } from '../services/pricing.js';

function serializeInstance(instance: {
  id: string;
  name: string;
  status: string;
  ram: number;
  cpu: number;
  disk: number;
  price: number;
  currency: string;
  createdAt: Date;
  product: { slug: string; name: string; icon: string };
  subscription: { status: string; currentPeriodEnd: Date | null } | null;
  pterodactylServerId: number | null;
}) {
  return {
    id: instance.id,
    name: instance.name,
    status: instance.status.toLowerCase(),
    product: instance.product,
    ram: instance.ram,
    cpu: instance.cpu,
    disk: instance.disk,
    price: instance.price,
    currency: instance.currency,
    url: instance.pterodactylServerId ? `/app/instances/${instance.id}` : null,
    createdAt: instance.createdAt,
    node: null as { name: string } | null,
    subscription: instance.subscription
      ? { status: instance.subscription.status.toLowerCase(), currentPeriodEnd: instance.subscription.currentPeriodEnd }
      : null,
  };
}

/**
 * Loads an instance and enforces ownership. A missing instance and an
 * instance owned by somebody else both answer 404, so identifiers cannot be
 * probed.
 */
async function loadInstance(userId: string, id: string) {
  const instance = await prisma.instance.findFirst({
    where: { id, userId },
    include: {
      product: true,
      subscription: true,
      user: { select: { pterodactylUserId: true } },
    },
  });
  if (!instance) throw notFound('Instance not found.');
  return instance;
}

function clientTokenFor(instance: { user: { pterodactylUserId: string | null } }) {
  if (!client.clientApiAvailable()) {
    throw unavailable('The Pterodactyl client API key is not configured on this environment, so live server control is unavailable.');
  }
  if (!instance.user.pterodactylUserId) {
    throw unavailable('This instance is not linked to a Pterodactyl account yet.');
  }
  return client.clientToken(instance.user.pterodactylUserId);
}

export async function registerInstanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/instances', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const instances = await prisma.instance.findMany({
      where: { userId: user.id },
      include: { product: true, subscription: true },
      orderBy: { createdAt: 'desc' },
    });
    return { instances: instances.map(serializeInstance) };
  });

  app.get('/instances/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    const events = await prisma.instanceEvent.findMany({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      instance: serializeInstance(instance),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        createdAt: event.createdAt,
      })),
    };
  });

  app.post('/instances/:id/power', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { action } = z.object({ action: z.enum(['start', 'stop', 'restart']) }).parse(request.body);

    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    await client.sendPower(token, instance.pterodactylUuid, action);

    const status = action === 'stop' ? 'STOPPED' : action === 'start' ? 'ONLINE' : 'RESTARTING';
    await prisma.instance.update({ where: { id: instance.id }, data: { status } });
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'power', message: `Power action: ${action}.` } });
    await audit({ actorId: user.id, actorEmail: user.email, action: `instance.power.${action}`, targetType: 'instance', targetId: instance.id });

    return reply202(instance.id);
  });

  app.get('/instances/:id/metrics', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) return { metrics: null };

    try {
      const token = clientTokenFor(instance);
      const resources = await client.getResources(token, instance.pterodactylUuid);
      return {
        metrics: {
          state: resources.state,
          cpuAbsolute: resources.cpu_absolute,
          memoryBytes: resources.memory_bytes,
          networkRx: resources.network?.rx ?? 0,
          networkTx: resources.network?.tx ?? 0,
          diskBytes: resources.disk?.used ?? 0,
          uptimeMs: (resources.uptime ?? 0) * 1000,
        },
      };
    } catch (error) {
      // Metrics are optional: a provider outage must not look like zero usage.
      return { metrics: null, reason: error instanceof Error ? error.message : 'Metrics are unavailable.' };
    }
  });

  app.get('/instances/:id/console', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    const socket = await client.consoleWebsocket(token, instance.pterodactylUuid);
    // The signed token stays on the server; the browser only receives the
    // websocket path it connects to through the API relay.
    return { websocket: `/api/instances/${instance.id}/console/stream`, socket: socket.socket };
  });

  app.get('/instances/:id/files', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ path: z.string().max(1024).optional() }).parse(request.query ?? {});
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    const files = await client.listFiles(token, instance.pterodactylUuid, query.path ?? '/');
    return {
      entries: files.map((file) => ({
        name: file.name,
        isDirectory: file.is_directory,
        isFile: file.is_file,
        size: file.size,
        modifiedAt: file.modified_at,
        mode: file.mode,
      })),
    };
  });

  app.get('/instances/:id/file', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ path: z.string().min(1).max(1024) }).parse(request.query);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    const file = await client.readFile(token, instance.pterodactylUuid, query.path);
    return { content: file.content, encoding: file.encoding };
  });

  app.put('/instances/:id/file', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ path: z.string().min(1).max(1024), content: z.string().max(5_000_000) }).parse(request.body);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    await client.writeFile(token, instance.pterodactylUuid, body.path, body.content);
    return reply.code(204).send();
  });

  app.delete('/instances/:id/file', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ path: z.string().min(1).max(1024) }).parse(request.query ?? {});
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    await client.deleteFile(token, instance.pterodactylUuid, query.path);
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'files', message: `Deleted ${query.path}.` } });
    return reply.code(204).send();
  });

  app.put('/instances/:id/startup', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ startup: z.string().max(4096).optional(), environment: z.record(z.string().max(4096)).optional() })
      .parse(request.body);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylServerId) throw badRequest('This instance is not deployed yet.');

    const server = await pteroApp.getServer(instance.pterodactylServerId);
    const environment = { ...server.container.environment, ...(body.environment ?? {}) };
    await pteroApp.setServerEnvironment(instance.pterodactylServerId, environment);
    if (body.startup) {
      await pteroApp.updateServerStartup(instance.pterodactylServerId, { startup: body.startup });
    }
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'startup', message: 'Startup configuration updated.' } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.startup_updated', targetType: 'instance', targetId: instance.id });

    return { instance: serializeInstance(instance), environment };
  });

  app.put('/instances/:id/resources', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ ram: z.number().int().positive(), cpu: z.number().int().positive(), disk: z.number().int().positive() })
      .parse(request.body);

    const instance = await loadInstance(user.id, id);
    const product = instance.product;

    const price = await prisma.productPrice.findFirst({
      where: { productId: product.id, period: 'MONTHLY', active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!price) throw badRequest('This product has no active price.');

    const { validateConfiguration } = await import('../services/pricing.js');
    validateConfiguration(product, body);

    const newPrice = priceConfiguration(price, product, body);
    const priceDelta = newPrice - instance.price;

    // Push the new limits to the panel. The build route takes the allocation
    // and the limits of the server.
    let panelUpdated = true;
    let panelError: string | null = null;
    if (instance.pterodactylServerId) {
      try {
        await pteroApp.updateServerBuild(instance.pterodactylServerId, {
          limits: {
            memory: body.ram,
            swap: 0,
            disk: body.disk * 1024,
            io: 500,
            cpu: body.cpu * 100,
          },
        });
      } catch (error) {
        panelUpdated = false;
        panelError = error instanceof Error ? error.message : 'The panel rejected the new limits.';
      }
    }

    await prisma.instance.update({
      where: { id: instance.id },
      data: { ram: body.ram, cpu: body.cpu, disk: body.disk, price: newPrice },
    });
    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'resources', message: `Resources changed to ${body.ram} MB, ${body.cpu} vCPU, ${body.disk} GB.` },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.resources_changed',
      targetType: 'instance',
      targetId: instance.id,
      meta: { ram: body.ram, cpu: body.cpu, disk: body.disk, priceDelta, panelUpdated },
    });

    const updated = await loadInstance(user.id, instance.id);
    return {
      instance: serializeInstance(updated),
      priceDelta,
      price: newPrice,
      currency: price.currency,
      panelUpdated,
      panelError,
    };
  });

  app.get('/instances/:id/events', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    const events = await prisma.instanceEvent.findMany({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        createdAt: event.createdAt,
      })),
    };
  });

  app.post('/instances/:id/rename', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(request.body);
    const instance = await loadInstance(user.id, id);

    await prisma.instance.update({ where: { id: instance.id }, data: { name } });
    if (instance.pterodactylServerId) {
      await pteroApp.updateServerDetails(instance.pterodactylServerId, { name }).catch(() => undefined);
    }
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.renamed', targetType: 'instance', targetId: instance.id });
    const updated = await loadInstance(user.id, instance.id);
    return { instance: serializeInstance(updated) };
  });

  app.post('/instances/:id/cancel', async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);

    await prisma.$transaction([
      prisma.instance.update({ where: { id: instance.id }, data: { cancelledAt: new Date(), status: 'CANCELLED' } }),
      prisma.subscription.updateMany({ where: { instanceId: instance.id }, data: { cancelAtPeriodEnd: true } }),
    ]);
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'cancelled', message: 'Cancellation requested. The service runs until the end of the paid period.' } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.cancelled', targetType: 'instance', targetId: instance.id });
    return reply.code(204).send();
  });
}

/** The power route answers 202 because the container reacts asynchronously. */
function reply202(instanceId: string) {
  return { instanceId, accepted: true };
}
