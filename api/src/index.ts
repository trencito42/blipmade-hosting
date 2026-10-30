import { buildApp } from './app.js';
import { initErrorReporting } from './lib/sentry.js';
import { env } from './env.js';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { closeQueue } from './services/queue.js';
import { perfConfig } from './lib/perf-config.js';
import { createMetricsServer } from './lib/perf-metrics.js';
import { shutdownGracefully } from './lib/perf-shutdown.js';

const app = await buildApp();

/**
 * The measures of the API are given away by a listener of their own, on the
 * loopback of the container, and only to a collector that knows the key.
 * The public listener is not used, because the web container forwards every
 * path that begins with `/api`.
 */
initErrorReporting('api');

const metricsServer = createMetricsServer({
  enabled: env.METRICS_ENABLED,
  host: perfConfig.metricsHost,
  port: perfConfig.metricsPort,
  token: perfConfig.metricsToken,
  log: app.log,
});

let stopping = false;

/**
 * The process is asked to stop.
 *
 * The server stops taking new connections, the requests that are running are
 * given the time that was promised, the queue of this process is closed so
 * that nothing new is put on it, the cache and the database are closed, and
 * the process leaves with a status that says what happened.
 *
 * The worker is a process of its own, so the API cannot stop the intake of
 * the worker; it can only stop putting new jobs on the queue.
 */
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;

  const result = await shutdownGracefully(app, {
    deadlineMs: perfConfig.shutdownTimeoutMs,
    signal,
    log: app.log,
    steps: [
      { name: 'queue', run: () => closeQueue() },
      { name: 'redis', run: () => redis.quit() },
      { name: 'database', run: () => prisma.$disconnect() },
    ],
  });

  await metricsServer.close().catch(() => undefined);

  // The status is set first, so the process leaves with it even when nothing
  // is holding it any more. The timer is the last resort: it makes sure the
  // process leaves even when something still holds it, and it does not keep
  // the process alive by itself.
  process.exitCode = result.exitCode;
  setTimeout(() => process.exit(result.exitCode), 1000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`blipmade-api listening on ${env.HOST}:${env.PORT}`);
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
