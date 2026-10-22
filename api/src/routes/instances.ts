import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound, unavailable } from '../lib/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import * as client from '../services/pterodactyl/client.js';
import * as pteroApp from '../services/pterodactyl/application.js';
import { applyUpgradeOrder, createUpgradeOrder, quoteResourceChange } from '../services/upgrades.js';
import { createCheckout } from '../services/stripe.js';

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
  orderItem?: { subscription: { status: string; currentPeriodEnd: Date | null } | null } | null;
  pterodactylServerId: number | null;
}) {
  const subscription = subscriptionOf(instance);
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
    subscription: subscription
      ? { status: subscription.status.toLowerCase(), currentPeriodEnd: subscription.currentPeriodEnd }
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
      // A line that was ordered with a quantity above one links its
      // subscription through the order line.
      orderItem: { include: { subscription: true } },
      user: { select: { pterodactylUserId: true } },
    },
  });
  if (!instance) throw notFound('Instance not found.');
  return instance;
}

/** The subscription that pays for an instance, whichever way it is linked. */
function subscriptionOf(instance: {
  subscription: { status: string; currentPeriodEnd: Date | null } | null;
  orderItem?: { subscription: { status: string; currentPeriodEnd: Date | null } | null } | null;
}) {
  return instance.subscription ?? instance.orderItem?.subscription ?? null;
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

  /**
   * The console of an instance. The browser is told which path to open; the
   * panel address and the panel token stay on the server.
   */
  app.get('/instances/:id/console', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    // The relay checks the ownership again when the socket is opened, so the
    // route only confirms that the service exists.
    if (!client.clientApiAvailable()) {
      throw unavailable('The Pterodactyl client API key is not configured on this environment.');
    }
    return { websocket: `/api/instances/${instance.id}/console/stream` };
  });

  /**
   * Console relay. The browser opens this socket with its session cookie, the
   * API opens the panel console on its behalf and the traffic is piped in both
   * directions. The panel token never reaches the browser, and the socket is
   * only opened for an instance the caller owns.
   */
  app.get('/instances/:id/console/stream', { websocket: true }, (socket, request: FastifyRequest) => {
    void relayConsole(socket, request);
  });

  /** Sends a command to the running server. */
  app.post('/instances/:id/command', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { command } = z.object({ command: z.string().trim().min(1).max(1000) }).parse(request.body);

    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = clientTokenFor(instance);
    await client.sendCommand(token, instance.pterodactylUuid, command);
    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'command', message: `Command sent: ${command}` },
    });
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.command_sent',
      targetType: 'instance',
      targetId: instance.id,
    });
    return { sent: true };
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

  /**
   * Prices a resource change without changing anything. The client shows the
   * difference before the customer commits to it.
   */
  app.get('/instances/:id/resources/quote', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z
      .object({
        ram: z.coerce.number().int().positive(),
        cpu: z.coerce.number().int().positive(),
        disk: z.coerce.number().int().positive(),
      })
      .parse(request.query ?? {});
    const instance = await loadInstance(user.id, id);
    const quote = await quoteResourceChange(instance, query);
    return { quote };
  });

  /**
   * Changes the resources of an instance.
   *
   * A change that costs more is a paid product: the route creates an order
   * and a checkout session, and the instance is only changed once the payment
   * is confirmed. A change that costs less is applied immediately.
   */
  app.put('/instances/:id/resources', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ ram: z.number().int().positive(), cpu: z.number().int().positive(), disk: z.number().int().positive() })
      .parse(request.body);

    const instance = await loadInstance(user.id, id);
    const quote = await quoteResourceChange(instance, body);

    if (!quote.requiresPayment) {
      // A change that costs less is applied right away and the recurring
      // amount is lowered afterwards.
      const order = await createUpgradeOrder(instance, body, quote, user);
      const result = await applyUpgradeOrder(order.id);
      const updated = await loadInstance(user.id, instance.id);
      return {
        status: result.applied ? 'applied' : 'failed',
        instance: serializeInstance(updated),
        order: { id: order.id, number: order.number },
        priceDelta: quote.priceDelta,
        price: quote.newPrice,
        currency: quote.currency,
        reason: result.reason,
      };
    }

    // The change has to be paid for before it touches the server.
    const order = await createUpgradeOrder(instance, body, quote, user);
    const checkout = await createCheckout({ ...order, items: [] });
    if (!checkout.url) {
      throw unavailable(checkout.reason ?? 'Checkout is unavailable on this environment.');
    }
    await prisma.order.update({ where: { id: order.id }, data: { status: 'AWAITING_PAYMENT' } });

    return {
      status: 'requires_payment',
      order: { id: order.id, number: order.number },
      priceDelta: quote.priceDelta,
      price: quote.newPrice,
      currency: quote.currency,
      checkoutUrl: checkout.url,
      sessionId: checkout.sessionId,
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

/**
 * Connects a browser to the console of a server.
 *
 * The panel token is added by the server and never leaves it, so a customer
 * cannot use it for anything else. Everything the browser sends is forwarded
 * to the console and everything the console sends is forwarded back.
 */
async function relayConsole(socket: WebSocket, request: FastifyRequest): Promise<void> {
  const user = request.user;
  if (!user) {
    socket.close(4401, 'Sign in to use the console.');
    return;
  }

  let instanceId: string;
  try {
    instanceId = z.object({ id: z.string() }).parse(request.params).id;
  } catch {
    socket.close(4400, 'Bad request.');
    return;
  }

  const instance = await prisma.instance.findFirst({
    where: { id: instanceId, userId: user.id },
    include: { user: { select: { pterodactylUserId: true } } },
  });
  if (!instance) {
    socket.close(4404, 'Instance not found.');
    return;
  }
  if (!instance.pterodactylUuid) {
    socket.close(4009, 'This instance is not deployed yet.');
    return;
  }
  if (!client.clientApiAvailable() || !instance.user.pterodactylUserId) {
    socket.close(4001, 'The Pterodactyl client API is not available on this environment.');
    return;
  }

  let credentials: { socket: string; token: string };
  try {
    credentials = await client.consoleWebsocket(
      client.clientToken(instance.user.pterodactylUserId),
      instance.pterodactylUuid,
    );
  } catch {
    socket.close(1011, 'The console could not be opened.');
    return;
  }

  const separator = credentials.socket.includes('?') ? '&' : '?';
  const target = new WebSocket(
    `${credentials.socket}${separator}token=${encodeURIComponent(credentials.token)}`,
  );

  target.on('open', () => {
    socket.send(JSON.stringify({ event: 'connected' }));
  });
  target.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (socket.readyState === socket.OPEN) socket.send(data.toString());
  });
  target.on('close', (code: number, reason: Buffer) => {
    if (socket.readyState === socket.OPEN) {
      socket.close(1000, reason?.toString() || 'The console closed.');
    }
  });
  target.on('error', () => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ event: 'error', message: 'The console connection failed.' }));
      socket.close(1011, 'Console error.');
    }
  });

  socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    if (target.readyState === target.OPEN) target.send(data.toString());
  });
  socket.on('close', () => {
    if (target.readyState === target.OPEN) target.close();
  });
  socket.on('error', () => {
    if (target.readyState === target.OPEN) target.close();
  });
}
