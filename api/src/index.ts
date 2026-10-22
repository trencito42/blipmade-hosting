import { buildApp } from './app.js';
import { env } from './env.js';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { closeQueue } from './services/queue.js';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown');
  }
  await closeQueue().catch(() => undefined);
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
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
