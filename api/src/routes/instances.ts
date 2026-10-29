import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { env } from '../env.js';
import { AppError, badRequest, notFound, unavailable } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import * as client from '../services/pterodactyl/client.js';
import { hasCustomerCredential, resolveCustomerCredential } from '../services/panel/credentials.js';
import { nodeAddressFor } from '../services/panel/nodes.js';
import * as pteroApp from '../services/pterodactyl/application.js';
import { applyUpgradeOrder, createUpgradeOrder, quoteResourceChange, settleFreeUpgradeOrder } from '../services/upgrades.js';
import { notifyInstanceCanceled, notifyInstanceUnsuspended } from '../services/notifications.js';
import { parseGeneratedVariableSpecs } from '../services/instance-credentials.js';
import { createCheckout } from '../services/stripe.js';
import { customerStatusOf } from '../services/runtime-state.js';
import { isAllowedWebSocketOrigin } from '../lib/websocket-origin.js';

/**
 * The routes of the instances carry a limit.
 *
 * The power of a server, the command that is sent to it and the name
 * it is given reach the panel, so they carry the limit of the panel. The
 * change of the resources and the cancellation only write rows in the
 * database of the platform, so they carry the limit of the account.
 */

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
  product: { slug: string; name: string; icon: string; generatedVariables?: unknown };
  subscription: { status: string; currentPeriodEnd: Date | null } | null;
  orderItem?: { subscription: { status: string; currentPeriodEnd: Date | null } | null } | null;
  pterodactylServerId: number | null;
  domains?: { hostname: string; status: string }[];
  runtimeState: string | null;
  runtimeCondition: string | null;
  runtimeStateCheckedAt: Date | null;
  runtimeStateStale: boolean;
}) {
  const subscription = subscriptionOf(instance);
  // The address the customer reaches the instance at. It is the domain that
  // is routed, and there is none before a domain is proven and routed.
  const active = (instance.domains ?? []).find((domain) => domain.status === 'ACTIVE');
  return {
    id: instance.id,
    name: instance.name,
    // The state the customer sees is the state the node reports, and not the
    // state the platform believed when the service was provisioned. A service
    // whose container runs is not shown as restarting for ever.
    status: customerStatusOf(instance),
    // What the node said the last time it was asked, and when it said it.
    // The state is stale when the node could not be asked: the last known
    // state is kept and the customer is told that it is not fresh.
    runtime: {
      state: instance.runtimeState,
      condition: instance.runtimeCondition,
      checkedAt: instance.runtimeStateCheckedAt,
      stale: instance.runtimeStateStale,
    },
    product: instance.product,
    ram: instance.ram,
    cpu: instance.cpu,
    disk: instance.disk,
    price: instance.price,
    currency: instance.currency,
    url: active ? `https://${active.hostname}` : null,
    createdAt: instance.createdAt,
    node: null as { name: string } | null,
    // Whether this service has a password that the platform made for it. The
    // console shows it only then, so a service without one does not carry an
    // empty panel.
    credentials: Object.keys(parseGeneratedVariableSpecs(instance.product.generatedVariables)).length > 0,
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
      domains: { select: { hostname: true, status: true } },
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

/**
 * The client key of the customer that owns the instance.
 *
 * The key is scoped to the panel account of that customer, so the panel
 * refuses a request for a server of somebody else even if this check were
 * wrong. It never reaches the browser.
 */
async function clientTokenFor(instance: { id: string; userId: string; pterodactylUuid: string | null }) {
  if (!instance.pterodactylUuid) {
    throw unavailable('This instance is not deployed yet.');
  }
  const credential = await resolveCustomerCredential(instance.userId);
  return client.clientToken(credential.token);
}

export async function registerInstanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/instances', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    // The list is read in pages. It was read whole before, so the answer grew
    // with the number of the services of the customer.
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 100, maxSize: 200 });
    const rows = await prisma.instance.findMany({
      where: withCursor({ userId: user.id }, cursor, 'createdAt'),
      include: { product: true, subscription: true, domains: { select: { hostname: true, status: true } } },
      orderBy: pageOrder('createdAt'),
      take: limit + 1,
    });
    const page = pageOf(rows, limit, 'createdAt');
    return { instances: page.rows.map(serializeInstance), pagination: page.pagination };
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

  app.post('/instances/:id/power', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        signal: z.enum(['start', 'stop', 'restart', 'kill']).optional(),
        action: z.enum(['start', 'stop', 'restart', 'kill']).optional(),
      })
      .parse(request.body ?? {});
    const action = body.signal ?? body.action;
    if (!action) throw badRequest('The power action is missing.');

    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    // The service was suspended and the customer starts it again, so the
    // customer is told that it works again.
    const wasSuspended = instance.status === 'SUSPENDED';

    const cooldownKey = `instance:power:${instance.id}`;
    const acquired = await redis.set(cooldownKey, action, 'EX', 30, 'NX');
    if (acquired !== 'OK') throw new AppError(429, 'power_cooldown', 'Wait 30 seconds before another power action.');
    try {
      const token = await clientTokenFor(instance);
      await client.sendPower(token, instance.pterodactylUuid, action);
    } catch (error) {
      await redis.del(cooldownKey);
      throw error;
    }

    const status = action === 'stop' ? 'STOPPED' : action === 'start' ? 'ONLINE' : 'RESTARTING';
    await prisma.instance.update({ where: { id: instance.id }, data: { status } });
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'power', message: `Power action: ${action}.` } });
    await audit({ actorId: user.id, actorEmail: user.email, action: `instance.power.${action}`, targetType: 'instance', targetId: instance.id });

    if (wasSuspended && action === 'start') {
      // The moment of the start is the occurrence, so a service that is
      // suspended again and started again has a message of its own.
      await notifyInstanceUnsuspended({
        userId: user.id,
        instanceName: instance.name,
        occurrence: new Date().toISOString(),
      });
    }

    return reply202(instance.id);
  });

  app.get('/instances/:id/metrics', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) return { metrics: null };

    try {
      const token = await clientTokenFor(instance);
      const resources = await client.getResources(token, instance.pterodactylUuid);
      return {
        metrics: {
          state: resources.state,
          cpuAbsolute: resources.cpu_absolute,
          memoryBytes: resources.memory_bytes,
          networkRx: resources.network?.rx ?? 0,
          networkTx: resources.network?.tx ?? 0,
          diskBytes: resources.disk?.used ?? 0,
          // The panel counts the time the container has been up in
          // milliseconds, and that is what the console shows.
          uptimeMs: resources.uptime ?? 0,
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
    //
    // The console needs the client key of the customer. When there is no key
    // and the panel cannot issue one, the reason is said out loud instead of
    // opening a socket that would fail.
    const hasKey = await hasCustomerCredential(user.id);
    if (!hasKey && !env.panelBridgeEnabled) {
      throw unavailable(
        'The console needs the client key of this customer on the panel. The key bridge of the panel is not installed yet (see docs/PANEL_BRIDGE.md), so the panel cannot issue one.',
      );
    }
    return { websocket: `/api/instances/${instance.id}/console/stream` };
  });

  /**
   * Console relay. The browser opens this socket with its session cookie, the
   * API opens the panel console on its behalf and the traffic is piped in both
   * directions. The panel token never reaches the browser, and the socket is
   * only opened for an instance the caller owns.
   */
  app.get('/instances/:id/console/stream', {
    websocket: true,
    preValidation: async (request: FastifyRequest, reply) => {
      // A WebSocket GET cannot carry the CSRF header from a browser fetch().
      // Reject foreign origins *before* upgrading the authenticated socket.
      if (!isAllowedWebSocketOrigin(request.headers.origin, env.APP_ORIGIN)) {
        return reply.code(403).send({ error: { code: 'forbidden', message: 'Console origin is not allowed.' } });
      }
      if (!request.user) {
        return reply.code(401).send({ error: { code: 'unauthorized', message: 'Sign in to use the console.' } });
      }
    },
  }, (socket, request: FastifyRequest) => {
    void relayConsole(socket, request);
  });

  /** Sends a command to the running server. */
  app.post('/instances/:id/command', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { command } = z.object({ command: z.string().trim().min(1).max(1000) }).parse(request.body);

    const instance = await loadInstance(user.id, id);
    if (!instance.pterodactylUuid) throw badRequest('This instance is not deployed yet.');

    const token = await clientTokenFor(instance);
    await client.sendCommand(token, instance.pterodactylUuid, command);
    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'command', message: 'Console command sent.' },
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
  app.put('/instances/:id/resources', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ ram: z.number().int().positive(), cpu: z.number().int().positive(), disk: z.number().int().positive() })
      .parse(request.body);

    const instance = await loadInstance(user.id, id);
    const quote = await quoteResourceChange(instance, body);

    if (!quote.requiresPayment) {
      // A change that costs less is applied right away and the recurring
      // amount is lowered afterwards. There is no money to collect, so the
      // platform settles the order itself before the change is applied.
      const order = await createUpgradeOrder(instance, body, quote, user);
      await settleFreeUpgradeOrder(order.id, user);
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

  app.post('/instances/:id/rename', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
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

  app.post('/instances/:id/cancel', {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await loadInstance(user.id, id);
    // A service that is cancelled twice is one message: the customer has
    // been told already, and the service does not change.
    const wasCancelled = instance.status === 'CANCELLED';
    const cancelledAt = new Date();

    await prisma.$transaction([
      prisma.instance.update({ where: { id: instance.id }, data: { cancelledAt, status: 'CANCELLED' } }),
      prisma.subscription.updateMany({ where: { instanceId: instance.id }, data: { cancelAtPeriodEnd: true } }),
    ]);
    await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'cancelled', message: 'Cancellation requested. The service runs until the end of the paid period.' } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.cancelled', targetType: 'instance', targetId: instance.id });

    if (!wasCancelled) {
      // The moment of the cancellation is the occurrence, so a service that is
      // cancelled again after a new period has a message of its own.
      await notifyInstanceCanceled({
        userId: user.id,
        instanceName: instance.name,
        occurrence: cancelledAt.toISOString(),
      });
    }
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
  let credentials: { socket: string; token: string };
  try {
    const credential = await resolveCustomerCredential(user.id);
    credentials = await client.consoleWebsocket(
      client.clientToken(credential.token),
      instance.pterodactylUuid,
    );
  } catch {
    socket.close(1011, 'The console could not be opened.');
    return;
  }

  // Wings authenticates with an auth event after the socket opens.
  // A token in the URL query is ignored by Wings.
  // The panel answers with the address of the node as it is known on the
  // internet. That address is not always the one that can be reached from
  // here, so the operator can name the address that works. The name of the
  // node is kept for the certificate, so the certificate of the node is still
  // the one that is checked.
  const address = nodeAddressFor(credentials.socket);
  const targetUrl = new URL(credentials.socket);
  targetUrl.host = address.host;
  const target = new WebSocket(
    targetUrl.toString(),
    {
      // The library reads the name of the node for the certificate of the
      // connection, even when the connection is opened to another address. The
      // types of the library do not name the option.
      servername: address.servername,
      // The node only takes a connection that says it comes from the panel, so
      // the address of the panel travels with it.
      headers: { Origin: env.PTERODACTYL_URL },
    } as unknown as WebSocket.ClientOptions,
  );

  target.on('open', () => {
    target.send(JSON.stringify({ event: 'auth', args: [credentials.token] }));
  });
  target.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    let packet: { event?: string; args?: string[] };
    try { packet = JSON.parse(data.toString()); } catch { return; }
    if (packet.event === 'auth success') {
      target.send(JSON.stringify({ event: 'send logs', args: [null] }));
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ event: 'connected' }));
    } else if (packet.event === 'console output') {
      if (socket.readyState === socket.OPEN) socket.send(packet.args?.[0] ?? '');
    } else if (packet.event === 'token expiring' || packet.event === 'token expired') {
      void resolveCustomerCredential(user.id).then((customer) => client.consoleWebsocket(client.clientToken(customer.token), instance.pterodactylUuid!)).then((fresh) => {
        credentials = fresh;
        if (target.readyState === target.OPEN) target.send(JSON.stringify({ event: 'auth', args: [fresh.token] }));
      }).catch(() => target.close());
    } else if (packet.event === 'auth error' || packet.event === 'daemon error') {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ event: 'error', message: 'The node rejected the console connection.' }));
    }
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

  socket.on('close', () => {
    if (target.readyState === target.OPEN) target.close();
  });
  socket.on('error', () => {
    if (target.readyState === target.OPEN) target.close();
  });
}
