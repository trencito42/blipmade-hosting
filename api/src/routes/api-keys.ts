import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { newApiKey } from '../lib/api-keys.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';

/**
 * The API keys of a customer, for scripts and automation.
 *
 * A key reads (GET) or reads and writes. It works on the services of the account (instances,
 * servers, domains, tickets, billing reads) and never on the settings of the account, the keys
 * themselves, the payment method or the staff area. The key is shown once; only its hash is kept.
 */
export async function registerApiKeyRoutes(app: FastifyInstance): Promise<void> {
  const write = {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  };

  app.get('/settings/api-keys', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const keys = await prisma.apiKey.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    return {
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scope: key.scope,
        lastUsedAt: key.lastUsedAt,
        lastUsedIp: key.lastUsedIp,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        expired: Boolean(key.expiresAt && key.expiresAt.getTime() < Date.now()),
      })),
    };
  });

  app.post('/settings/api-keys', write, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const body = z
      .object({
        name: z.string().trim().min(2).max(60),
        scope: z.enum(['read', 'write']).default('read'),
        expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
      })
      .parse(request.body ?? {});
    const count = await prisma.apiKey.count({ where: { userId: user.id, revokedAt: null } });
    if (count >= 10) throw badRequest('An account can keep 10 API keys. Revoke one to make another.');
    const made = newApiKey();
    const key = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: body.name,
        prefix: made.prefix,
        hash: made.hash,
        scope: body.scope,
        expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000) : null,
      },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.api_key_created', targetType: 'user', targetId: user.id, meta: { name: body.name, scope: body.scope }, ip: request.ip });
    return { key: made.key, id: key.id, prefix: made.prefix };
  });

  app.delete('/settings/api-keys/:id', write, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const done = await prisma.apiKey.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (done.count === 0) throw notFound('That key was not found.');
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.api_key_revoked', targetType: 'user', targetId: user.id, ip: request.ip });
    return { ok: true };
  });
}
