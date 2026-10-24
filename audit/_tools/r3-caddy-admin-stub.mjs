/**
 * The stand-in for the administrative API of Caddy.
 *
 * The platform writes the route of a customer into Caddy through the
 * administrative API: it reads the route of the hostname, and it creates it
 * when it is not there yet. This server answers the calls of that protocol
 * and writes down every request it receives, so the evidence shows exactly
 * which path, which header and which body the platform uses.
 *
 * The token is checked, so a call without it is refused the way Caddy
 * refuses it.
 *
 * Usage: node r3-caddy-admin-stub.mjs [port] [state file] [token]
 */
import { createServer } from 'node:http';
import { writeFileSync, readFileSync, appendFileSync } from 'node:fs';

const PORT = Number(process.argv[2] ?? 2619);
const FILE = process.argv[3] ?? '/tmp/blipmade-r3/caddy-admin.json';
const TOKEN = process.argv[4] ?? '';
const LOG = `${FILE}.log`;

function load() {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(routes) {
  writeFileSync(FILE, JSON.stringify(routes, null, 2), 'utf8');
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const auth = req.headers.authorization ?? '';
    const lines = [
      `--- ${new Date().toISOString()}`,
      `${req.method} ${req.url}`,
      `authorization: ${auth ? 'Bearer <present>' : '<none>'}`,
    ];
    if (body) lines.push(`body: ${body}`);

    const send = (code, payload) => {
      const text = payload === undefined ? '' : JSON.stringify(payload);
      lines.push(`answer: ${code} ${text}`);
      appendFileSync(LOG, `${lines.join('\n')}\n`, 'utf8');
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(text);
    };

    if (auth !== `Bearer ${TOKEN}`) {
      send(401, { error: 'invalid token' });
      return;
    }

    const routes = load();
    const prefix = '/config/apps/http/servers/blipmade/routes';
    const id = decodeURIComponent(req.url.split('/').pop() ?? '');

    if (req.method === 'GET' && req.url === prefix) {
      send(200, Object.values(routes));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith(`${prefix}/`)) {
      if (routes[id]) send(200, routes[id]);
      else send(404, { error: 'route not found' });
      return;
    }
    if (req.method === 'POST' && req.url === prefix) {
      const parsed = body ? JSON.parse(body) : [];
      for (const route of parsed) {
        const routeId = `blipmade-route-${String(route.match?.[0]?.host?.[0] ?? '').slice(0, 8)}`;
        routes[routeId] = route;
      }
      save(routes);
      send(200, parsed);
      return;
    }
    if (req.method === 'PATCH' && req.url.startsWith(`${prefix}/`)) {
      routes[id] = body ? JSON.parse(body) : {};
      save(routes);
      send(200, routes[id]);
      return;
    }
    if (req.method === 'DELETE' && req.url.startsWith(`${prefix}/`)) {
      delete routes[id];
      save(routes);
      send(200, {});
      return;
    }
    send(404, { error: 'unknown path' });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`caddy-admin-stub listening on 127.0.0.1:${PORT}, state in ${FILE}`);
});
