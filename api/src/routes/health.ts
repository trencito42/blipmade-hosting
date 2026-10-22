import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { redisPing } from '../redis.js';
import { mailTransportName } from '../lib/mailer.js';
import { env } from '../env.js';
import * as ptero from '../services/pterodactyl/application.js';

const startedAt = Date.now();

async function databaseOk(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function healthHandler() {
  const [database, redis] = await Promise.all([databaseOk(), redisPing()]);
  return {
    status: database ? 'ok' : 'degraded',
    service: 'blipmade-api',
    version: '1.0.0',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    database,
    redis,
    mail: mailTransportName(),
    stripe: env.stripeEnabled ? 'live' : env.isTest ? 'test' : 'not_configured',
    pterodactyl: env.pterodactylEnabled ? 'configured' : 'not_configured',
    pterodactylClient: env.pterodactylClientEnabled ? 'configured' : 'not_configured',
  };
}

/** Registered both at the root (container health check) and under /api. */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', healthHandler);
}

/**
 * Public service status. Every component state comes from a real check, so the
 * page never claims a green light that was not measured.
 */
export async function registerStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async () => {
    const [database, redis, panel] = await Promise.all([databaseOk(), redisPing(), ptero.ping()]);
    const components = [
      { id: 'api', name: 'Platform API', state: database ? 'operational' : 'down' },
      { id: 'dashboard', name: 'Dashboard', state: database ? 'operational' : 'down' },
      { id: 'deployments', name: 'Deployments', state: panel ? 'operational' : 'degraded' },
      { id: 'apps', name: 'Apps hosting', state: panel ? 'operational' : 'degraded' },
      { id: 'databases', name: 'Databases', state: panel ? 'operational' : 'degraded' },
      { id: 'support', name: 'Support', state: database ? 'operational' : 'degraded' },
      { id: 'cache', name: 'Cache and queues', state: redis ? 'operational' : 'degraded' },
    ];
    const overall = components.some((c) => c.state === 'down')
      ? 'major_outage'
      : components.some((c) => c.state === 'degraded')
        ? 'degraded'
        : 'operational';
    return { overall, components, updatedAt: new Date().toISOString() };
  });
}
