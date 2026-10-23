import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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

/**
 * proxima nova is served from the Adobe Fonts web project of the account.
 * The desktop font files are not licensed for web use, so the typeface only
 * ever reaches the browser through the kit of that web project.
 *
 * The kit URL comes from the host, and a URL of an unknown host is refused:
 * a stylesheet that is written into the page is loaded by every visitor, so
 * only a URL of Adobe itself may end up there.
 */
const ADOBE_FONTS_HOSTS = ['use.typekit.net', 'p.typekit.net'];

function adobeFontsKitUrl() {
  const raw = (process.env.ADOBE_FONTS_KIT_URL || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.warn('ADOBE_FONTS_KIT_URL is not a URL. The Adobe Fonts web project is not loaded.');
    return null;
  }
  if (url.protocol !== 'https:' || !ADOBE_FONTS_HOSTS.includes(url.host)) {
    console.warn(
      `ADOBE_FONTS_KIT_URL must be an https URL on ${ADOBE_FONTS_HOSTS.join(' or ')}. ` +
      'The Adobe Fonts web project is not loaded.',
    );
    return null;
  }
  return url;
}

const kitUrl = adobeFontsKitUrl();
if (kitUrl) console.log(`Adobe Fonts web project: ${kitUrl.origin}${kitUrl.pathname}`);

/**
 * The stylesheet of the kit is added to the head of the page. The kit declares
 * its own font faces and its own swap behaviour, so nothing is preloaded and
 * no tracking is added: the browser asks Adobe for the stylesheet, and the
 * stylesheet points at the fonts.
 */
function injectAdobeFonts(html) {
  const tags = [
    '<!-- Webfonts loaded by Adobe Fonts -->',
    `<link rel="preconnect" href="${kitUrl.origin}" crossorigin>`,
    `<link rel="stylesheet" href="${kitUrl.href}">`,
  ].join('\n    ');
  const headEnd = html.search(/<\/head\s*>/i);
  if (headEnd !== -1) {
    // The indent of the closing head tag is replaced, so the three new lines
    // sit at the same indent as the rest of the head.
    const before = html.slice(0, headEnd).replace(/\s*$/, '');
    return before + '\n    ' + tags + '\n  ' + html.slice(headEnd);
  }
  const headStart = html.search(/<head\b[^>]*>/i);
  if (headStart !== -1) {
    const at = html.indexOf('>', headStart) + 1;
    return html.slice(0, at) + '\n    ' + tags + '\n  ' + html.slice(at);
  }
  const bodyStart = html.search(/<body\b[^>]*>/i);
  if (bodyStart !== -1) {
    const at = html.indexOf('>', bodyStart) + 1;
    return html.slice(0, at) + '\n    ' + tags + '\n  ' + html.slice(at);
  }
  return tags + html;
}

/**
 * The addresses whose forwarding headers are believed. Every other request is
 * treated as coming straight from the client, so a forged header cannot be
 * used to fake an address.
 */
const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_IPS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function normalizeAddress(address) {
  return (address || '').replace(/^::ffff:/, '');
}

function isTrustedProxy(address) {
  return TRUSTED_PROXY_IPS.includes(normalizeAddress(address));
}

/**
 * The address of the client. The forwarding headers are only used when the
 * request came from a known proxy, and only the last entry is believed,
 * because that is the one the proxy itself added.
 */
function clientAddress(req) {
  const peer = normalizeAddress(req.socket.remoteAddress);
  if (!isTrustedProxy(peer)) return peer;
  const forwarded = req.headers['x-forwarded-for'];
  const chain =
    typeof forwarded === 'string'
      ? forwarded.split(',').map((value) => value.trim()).filter(Boolean)
      : [];
  return chain.length ? chain[chain.length - 1] : peer;
}

/** The scheme the client used, taken from a trusted proxy only. */
function clientProtocol(req) {
  const peer = normalizeAddress(req.socket.remoteAddress);
  const forwarded = req.headers['x-forwarded-proto'];
  const value = typeof forwarded === 'string' ? forwarded.split(',').pop()?.trim() : undefined;
  if (isTrustedProxy(peer) && value) return value;
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
    return res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
  }

  // The API is served from the same origin so the session cookie stays
  // first-party and never needs a cross-site exemption.
  if (req.url?.startsWith('/api/')) {
    const target = new URL(req.url, API_URL);
    // The forwarding headers of the request are replaced, so the API only
    // ever sees an address that this server established itself.
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
    // The web project of Adobe Fonts is only loaded when the host has one.
    // Without it the page is served exactly as it is on disk.
    if (ext === '.html' && kitUrl) {
      const page = Buffer.from(injectAdobeFonts(await readFile(filename, 'utf8')), 'utf8');
      res.writeHead(200, {
        'Content-Type': types['.html'],
        'Content-Length': page.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(page);
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
