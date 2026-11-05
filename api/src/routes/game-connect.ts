import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { badRequest } from '../lib/errors.js';
import * as operations from '../services/panel/operations.js';
import { connectInfo, syncGameConnect } from '../services/game-connect.js';

/**
 * The clean address of a game server. The owner and the members of a shared server can read it; the owner and a manager
 * can ask for it to be checked again. The server finds the game, the address and the port itself.
 */
export async function registerGameConnectRoutes(app: FastifyInstance): Promise<void> {
  async function load(request: FastifyRequest) {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return operations.loadOwnedInstance(user.id, id, request.method, request.url);
  }

  app.get('/instances/:id/connect', async (request: FastifyRequest) => {
    const instance = await load(request);
    return connectInfo(instance.id);
  });

  app.post('/instances/:id/connect/sync', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const instance = await load(request);
    const result = await syncGameConnect(instance.id);
    if (result.state === 'DISABLED') throw badRequest(result.reason ?? 'Smart Connect is off.');
    return { ...(await connectInfo(instance.id)), wrote: result.wrote };
  });
}
