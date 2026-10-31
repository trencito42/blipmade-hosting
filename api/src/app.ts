import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { env } from './env.js';
import { prisma } from './db.js';
import { addressRateLimitKey, loadSession } from './plugins/auth.js';
import { csrfGuard, ensureCsrfCookie } from './plugins/csrf.js';
import { registerErrorHandler } from './plugins/errorHandler.js';
import { MAX_ATTACHMENT_BYTES } from './lib/attachments.js';
import { perfConfig } from './lib/perf-config.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './lib/perf-request-id.js';
import { beginRequest, endAbortedRequest, endRequest } from './lib/perf-metrics.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerInstanceRoutes } from './routes/instances.js';
import { registerInstanceServerRoutes } from './routes/instance-server.js';
import { registerDomainRoutes } from './routes/domains.js';
import { registerMailRoutes } from './routes/mail.js';
import { registerMailCommerceRoutes } from './routes/mail-commerce.js';
import { registerVpsRoutes } from './routes/vps.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdminActRoutes } from './routes/admin-act.js';
import { registerTwoFactorRoutes } from './routes/two-factor.js';
import { registerAdminStatusRoutes } from './routes/admin-status.js';
import { registerAccountExportRoutes } from './routes/account-export.js';
import { registerAdminMailRoutes } from './routes/admin-mail.js';
import { registerAdminMailPlansRoutes } from './routes/admin-mail-plans.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerAdminNotificationRoutes } from './routes/admin-notifications.js';
import { registerOpsRoutes } from './routes/ops.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerHealthRoutes, registerStatusRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
    },
    /**
     * Only the addresses that are known proxies may set the forwarding
     * headers. Trusting every proxy would let a client forge its own address
     * and walk around the rate limit.
     *
     * The list comes from the environment and believes the loopback and
     * nothing else by default, so the private range of the container network
     * is never believed without the operator saying so (SEC-05).
     */
    trustProxy: env.trustProxies,
    bodyLimit: 2 * 1024 * 1024,

    /**
     * The limits of the server.
     *
     * Without them a client that opens a connection and sends nothing keeps
     * it open for ever: the server had no limit for the request and no limit
     * for the silence of the socket. The values are read from the environment
     * and the value `0` brings back the old behaviour.
     */
    requestTimeout: perfConfig.requestTimeoutMs,
    connectionTimeout: perfConfig.connectionTimeoutMs,
    keepAliveTimeout: perfConfig.keepAliveTimeoutMs,

    /**
     * The id of a request.
     *
     * The id of the proxy is taken when the request came through a proxy that
     * is believed and when the id is well formed, so the journal of the web
     * and the journal of the API speak about the same request. In every other
     * case the API makes an id of its own.
     */
    genReqId: (request) =>
      resolveRequestId(
        {
          headers: request.headers as Record<string, string | string[] | undefined>,
          socket: request.socket,
        },
        env.trustProxies,
      ),
  });

  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(cors, {
    origin: env.APP_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization'],
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    global: false,
    /**
     * The address of the caller is the key.
     *
     * `request.ip` is the address of the client and not the address of a
     * proxy: the web server resolves the chain of the forwarding header
     * before it forwards it, and only the addresses of `TRUSTED_PROXIES` may
     * set that header. Without that list every request would carry the
     * address of the web container and every visitor would share one counter.
     *
     * The key of the counter is the address of the client when that address is
     * known, and the connection when it is not, so a limit is never a limit
     * for the whole platform and one visitor can never lock every other
     * visitor out of a page or of the sign-in.
     */
    keyGenerator: (request) => addressRateLimitKey(request),
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: {
        code: 'rate_limited',
        message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      },
    }),
  });
  await app.register(websocket, {
    options: { maxPayload: 1024 * 1024 },
  });

  // Support tickets accept one file at a time, up to the attachment limit.
  await app.register(multipart, {
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 5 },
  });

  /**
   * Webhooks need the untouched request body to verify a provider signature,
   * so the raw payload is kept for that path only.
   */
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const raw = typeof body === 'string' ? body : body.toString('utf-8');
    if (request.url.startsWith('/api/webhooks/')) {
      done(null, raw);
      return;
    }
    if (!raw.trim()) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch {
      const error = new Error('Invalid JSON body.') as Error & { statusCode?: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  /**
   * A file that is uploaded to a server is sent as it is, so a binary file is
   * not changed on the way. The limit of the route is larger than the limit
   * of the API.
   */
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.addHook('onRequest', async (request, reply) => {
    /**
     * The request is measured from the moment it arrives, and the id of the
     * request is given back, so the interface can show the customer the
     * number of the request that went wrong.
     */
    beginRequest(request);
    reply.header(REQUEST_ID_HEADER, request.id);
    // A client may give up before the answer is ready. The request is then
    // counted once and not twice.
    reply.raw.once('close', () => endAbortedRequest(request));
  });

  app.addHook('onRequest', async (request) => {
    csrfGuard(request);
    request.user = await loadSession(request);
  });

  app.addHook('onResponse', async (request, reply) => {
    endRequest(request, reply.statusCode);
  });

  app.addHook('onSend', async (request, reply, payload) => {
    ensureCsrfCookie(request, reply);
    return payload;
  });

  registerErrorHandler(app);

  await app.register(
    async (api) => {
      await registerHealthRoutes(api);
      await registerStatusRoutes(api);
      await registerAuthRoutes(api);
      await registerCatalogRoutes(api);
      await registerOrderRoutes(api);
      await registerBillingRoutes(api);
      await registerInstanceRoutes(api);
      await registerInstanceServerRoutes(api);
      await registerDomainRoutes(api);
      await registerMailRoutes(api);
      await registerMailCommerceRoutes(api);
      await registerVpsRoutes(api);
      await registerTicketRoutes(api);
      await registerSettingsRoutes(api);
      await registerTwoFactorRoutes(api);
      await registerAdminStatusRoutes(api);
      await registerAccountExportRoutes(api);
      await registerAdminRoutes(api);
      await registerAdminActRoutes(api);
      await registerAdminMailRoutes(api);
      await registerAdminMailPlansRoutes(api);
      await registerNotificationRoutes(api);
      await registerAdminNotificationRoutes(api);
      await registerOpsRoutes(api);
      await registerWebhookRoutes(api);
    },
    { prefix: '/api' },
  );

  // The container health check uses the root path.
  await registerHealthRoutes(app);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
