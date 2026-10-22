import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';

const app = Fastify({ logger: true });

const PANEL = process.env.PTERODACTYL_URL;
const PTERO_KEY = process.env.PTERODACTYL_APP_KEY;
const INTERNAL_TOKEN = process.env.BLIPMADE_INTERNAL_API_TOKEN;

if (!PANEL || !PTERO_KEY || !INTERNAL_TOKEN) {
  throw new Error('Missing backend configuration');
}

async function authorize(request, reply) {
  const given = request.headers.authorization?.replace(/^Bearer /i, '') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(INTERNAL_TOKEN);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

async function pteroGet(path) {
  const response = await fetch(`${PANEL}${path}`, {
    headers: {
      Authorization: `Bearer ${PTERO_KEY}`,
      Accept: 'Application/vnd.pterodactyl.v1+json'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Pterodactyl HTTP ${response.status}`);
  }

  return response.json();
}

app.get('/health', async () => ({
  status: 'ok',
  service: 'blipmade-api',
  version: '0.1.0'
}));

app.get('/internal/servers', {
  preHandler: authorize
}, async (request, reply) => {
  try {
    const result = await pteroGet('/api/application/servers?per_page=50');

    return {
      servers: result.data.map(({ attributes: s }) => ({
        id: s.id,
        uuid: s.uuid,
        identifier: s.identifier,
        name: s.name,
        status: s.status,
        userId: s.user,
        limits: s.limits
      })),
      pagination: result.meta?.pagination ?? null
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({
      error: 'Pterodactyl unavailable'
    });
  }
});

app.get('/internal/nodes', {
  preHandler: authorize
}, async (request, reply) => {
  try {
    const result = await pteroGet('/api/application/nodes');

    return {
      nodes: result.data.map(({ attributes: n }) => ({
        id: n.id,
        name: n.name,
        fqdn: n.fqdn,
        memory: n.memory,
        disk: n.disk
      }))
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({
      error: 'Pterodactyl unavailable'
    });
  }
});

await app.listen({
  host: '0.0.0.0',
  port: 3100
});
