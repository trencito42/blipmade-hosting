import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { PROXIMA_NOVA_FILES, fontStatus } from './fonts.mjs';
import { isTrustedAddress, parseTrustedProxies, resolveClientAddress } from './src/lib/client-address.mjs';

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

/**
 * The typefaces of the interface.
 *
 * proxima nova is served from this machine, under `/fonts/`. The files are
 * placed by the operator, because a typeface that is licensed for the
 * desktop is not licensed for the web.
 *
 * The site does not pretend that the typeface is there when it is not: the
 * health of the site names the files that are missing, and the interface
 * keeps Geist as the fallback until the files arrive.
 */
const fontDirectory = join(root, 'fonts');

/**
 * The state of the typeface, read from the disk.
 *
 * The files are looked at every time the state is asked for, so the answer is
 * true even when a file is put in place while the site is running.
 */
function currentFontStatus() {
  const present = PROXIMA_NOVA_FILES.map(({ file }) => file).filter((file) =>
    existsSync(join(fontDirectory, file)),
  );
  return fontStatus(present);
}

const fonts = currentFontStatus();
if (fonts.installed) {
  console.log(`Typeface: ${fonts.family} is served from /fonts (${fonts.files.length} files)`);
} else {
  console.warn(
    `Typeface: the files of ${fonts.family} are not all there, so the interface uses ${fonts.fallback}. ` +
      `Missing: ${fonts.missing.join(', ')}. See docs/TYPOGRAPHY.md.`,
  );
}

/**
 * The addresses whose forwarding headers are believed. Every other request is
 * treated as coming straight from the client, so a forged header cannot be
 * used to fake an address.
 *
 * The list comes from the environment (`TRUSTED_PROXY_IPS`, separated by
 * commas). An entry is an address or a block of addresses, written as
 * `172.16.0.0/12`. When the value is not set, nobody is trusted and the
 * address of the socket is the address that is written down.
 */
const TRUSTED_PROXIES = parseTrustedProxies(process.env.TRUSTED_PROXY_IPS || '');

/**
 * The address of the client.
 *
 * The chain of the header is read from the left, because the first element of
 * the chain is the client and the last one is the proxy that is the closest to
 * this server. The address of the proxy is never the address that is written
 * down.
 */
function clientAddress(req) {
  return resolveClientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], TRUSTED_PROXIES);
}

/** The scheme the client used, taken from a trusted proxy only. */
function clientProtocol(req) {
  const peer = req.socket.remoteAddress;
  const forwarded = req.headers['x-forwarded-proto'];
  const value = typeof forwarded === 'string' ? forwarded.split(',').pop()?.trim() : undefined;
  if (isTrustedAddress(peer, TRUSTED_PROXIES) && value) return value;
  return 'http';
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('Missing dist/index.html. Run: npm ci --include=dev && npm run build');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid SERVER_PORT/PORT: ${port}`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    // The health of the site names the typeface of the interface and the
    // files that are still missing, so the operator does not have to look
    // into the container to find out.
    const body = JSON.stringify({ status: 'ok', fonts: currentFontStatus() });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }

  // The API is served from the same origin so the session cookie stays
  // first-party and never needs a cross-site exemption.
  if (req.url?.startsWith('/api/')) {
    const target = new URL(req.url, API_URL);
    // The forwarding headers of the request are replaced, so the API only ever
    // sees an address that this server established itself: the address of the
    // client, not the address of the proxy and not the header of the client.
    const headers = { ...req.headers, host: target.host };
    delete headers['x-forwarded-for'];
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    delete headers['x-real-ip'];
    const address = clientAddress(req);
    headers['x-forwarded-for'] = address;
    headers['x-real-ip'] = address;
    headers['x-forwarded-proto'] = clientProtocol(req);

    const proxy = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: req.method,
        headers,
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
    // The typefaces are served from this machine. The name of a file does not
    // change when the file does, so the browser is asked whether the file
    // changed instead of being told to keep it for a year.
    const isFont = pathname.startsWith('/fonts/') && ['.woff2', '.woff'].includes(ext);
    if (isFont) {
      const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': types[ext],
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(filename).pipe(res);
    }
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

/**
 * The console of an instance is a WebSocket, so the upgrade is proxied to the
 * API. The session cookie travels with the handshake and the API checks the
 * ownership of the instance before it opens the console.
 */
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/api/')) {
    socket.destroy();
    return;
  }
  const target = new URL(req.url, API_URL);
  const headers = { ...req.headers, host: target.host };
  const address = clientAddress(req);
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  delete headers['x-real-ip'];
  headers['x-forwarded-for'] = address;
  headers['x-real-ip'] = address;
  headers['x-forwarded-proto'] = clientProtocol(req);

  const proxy = httpRequest({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers,
  });

  proxy.on('upgrade', (upstream, upstreamSocket, upstreamHead) => {
    // The answer of the API carries the headers of the handshake. They are
    // written out one by one, because the socket of the upstream does not
    // carry them itself.
    const lines = [];
    for (let index = 0; index < upstream.rawHeaders.length; index += 2) {
      lines.push(`${upstream.rawHeaders[index]}: ${upstream.rawHeaders[index + 1]}`);
    }
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
    if (upstreamHead && upstreamHead.length) upstreamSocket.unshift(upstreamHead);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });
  proxy.on('response', (response) => {
    // The API refused the upgrade, so the browser gets a clear answer.
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });
  proxy.on('error', () => socket.destroy());

  if (head && head.length) proxy.write(head);
  proxy.end();
});
