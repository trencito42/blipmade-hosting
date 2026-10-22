import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const port = Number(process.env.SERVER_PORT || process.env.PORT || 30001);
const API_URL = process.env.API_URL || 'http://127.0.0.1:3100';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json'
};

function send(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('Missing dist/index.html. Run: npm ci --include=dev && npm run build');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid SERVER_PORT/PORT: ${port}`);
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
  }

  // The API is served from the same origin so the session cookie stays
  // first-party and never needs a cross-site exemption.
  if (req.url?.startsWith('/api/')) {
    const target = new URL(req.url, API_URL);
    const proxy = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'upstream_error', message: 'The API is not reachable.' } }));
    });
    req.pipe(proxy);
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (pathname.includes('\\') || pathname.includes('\0')) return send(res, 400, 'Bad request');
  let filename = resolve(root, '.' + pathname);
  if (filename !== root && !filename.startsWith(root + sep)) return send(res, 403, 'Forbidden');
  try {
    if (existsSync(filename) && statSync(filename).isDirectory()) filename = join(filename, 'index.html');
    if (!existsSync(filename) || !statSync(filename).isFile()) {
      // Client-side routes such as /login should load React's entry point.
      if (extname(pathname)) return send(res, 404, 'Not found');
      filename = join(root, 'index.html');
    }
    const stat = statSync(filename);
    const ext = extname(filename).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': filename.includes(sep + 'assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(filename).pipe(res);
  } catch (error) {
    console.error('Static response error:', error.message);
    if (!res.headersSent) send(res, 500, 'Internal server error');
    else res.destroy();
  }
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Blipmade site listening on 0.0.0.0:${port}`);
});
