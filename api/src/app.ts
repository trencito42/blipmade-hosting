import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { env } from './env.js';
import { prisma } from './db.js';
import { loadSession } from './plugins/auth.js';
import { csrfGuard, ensureCsrfCookie } from './plugins/csrf.js';
import { registerErrorHandler } from './plugins/errorHandler.js';
import { MAX_ATTACHMENT_BYTES } from './lib/attachments.js';
import { rateLimitRun } from './lib/rate-limit.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerInstanceRoutes } from './routes/instances.js';
import { registerDomainRoutes } from './routes/domains.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerAdminRoutes } from './routes/admin.js';
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
     */
    trustProxy: env.trustProxies,
    bodyLimit: 2 * 1024 * 1024,
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
    // The address of the caller is the key. In the test environment the key
    // carries the run number, so the counters of one test do not count
    // against the next one.
    keyGenerator: (request) => (env.isTest ? `${request.ip}:${rateLimitRun()}` : request.ip),
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

  app.addHook('onRequest', async (request) => {
    csrfGuard(request);
    request.user = await loadSession(request);
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
      await registerDomainRoutes(api);
      await registerTicketRoutes(api);
      await registerAdminRoutes(api);
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
