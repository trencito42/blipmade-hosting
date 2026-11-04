import type { FastifyInstance, FastifyRequest } from 'fastify';
import { handleDiscordInteraction } from '../services/discord/interactions.js';

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

export async function registerDiscordInteractionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/integrations/discord/interactions',
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const raw = (request as RawBodyRequest).rawBody ?? Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));
      const headers = request.headers as Record<string, string | undefined>;
      const response = await handleDiscordInteraction(raw.toString('utf8'), headers);
      const text = await response.text();
      reply.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        reply.header(key, value);
      }
      return reply.send(text);
    },
  );
}
