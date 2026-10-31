import { createServer, request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { createBrotliCompress, createGzip, constants as zlibConstants } from 'node:zlib';
import { fontStatus } from './fonts.mjs';
import { isTrustedAddress, parseTrustedProxies, resolveClientAddress } from './src/lib/client-address.mjs';

const root = resolve(process.cwd(), 'dist');
const port = Number(process.env.SERVER_PORT || process.env.PORT || 30001);
const API_URL = process.env.API_URL || 'http://127.0.0.1:3100';
/** How long a read waits for the API to come back (a deploy): 24 tries, a third of a second apart. */
const UPSTREAM_RETRIES = 24;
const UPSTREAM_RETRY_MS = 350;
const RETRYABLE = new Set(['ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'EHOSTUNREACH', 'ETIMEDOUT']);
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

/**
 * The compression of the delivery path.
 *
 * The site is built once and then served many times, so the bytes that travel
 * over and over are compressed once, when the site is built. The forms are
 * written next to the files they come from (`index.js.gz`, `index.js.br`) and
 * the server only has to pick the one that matches what the client accepts.
 *
 * The machine that serves the site is small. Compressing a 300 kB bundle at
 * every request would cost it far more than the delivery of the result, so
 * the compression happens on the build machine instead.
 *
 * The answers of the API cannot be compressed ahead of time, so they are
 * compressed while they are sent, with a setting that costs little: they are
 * small and they are not the same bytes twice.
 */

/** The encodings the delivery path knows, the smaller one first. */
const ENCODINGS = ['br', 'gzip'];

/** The types that are worth compressing. The pictures and the fonts are not. */
const COMPRESSIBLE_TYPES = new Set([
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/manifest+json',
  'image/svg+xml',
  'text/plain',
  'text/xml',
  'application/xml',
]);

/** The suffix of every form that the build writes. */
const ENCODING_SUFFIXES = { br: '.br', gzip: '.gz' };

/**
 * The quality of the compression of an answer of the API.
 *
 * The answers are small and they are not read twice, so the setting that
 * spends the least CPU is the right one. The files of the site are compressed
 * once, with the best setting there is.
 */
const STREAM_BROTLI_QUALITY = 4;

/** The type of a content type, without the parameters that follow it. */
function mimeOf(contentType) {
  if (typeof contentType !== 'string') return '';
  const semicolon = contentType.indexOf(';');
  return (semicolon === -1 ? contentType : contentType.slice(0, semicolon)).trim().toLowerCase();
}

/** Whether a body of this type is worth compressing. */
function isCompressible(contentType) {
  return COMPRESSIBLE_TYPES.has(mimeOf(contentType));
}

/**
 * The encodings the client accepts, with the quality it gives them.
 *
 * A quality of zero is a refusal: `gzip;q=0` means the client would rather
 * have the plain bytes than the compressed ones.
 */
function acceptedEncodings(header) {
  const accepted = new Map();
  let any = 0;
  if (typeof header !== 'string' || header === '') return { accepted, any };
  for (const part of header.split(',')) {
    const [rawName, ...parameters] = part.split(';');
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const [key, value] = parameter.split('=');
      if (key && key.trim().toLowerCase() === 'q') {
        const parsed = Number.parseFloat(value);
        quality = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    if (name === '*') {
      any = quality;
      continue;
    }
    accepted.set(name, quality);
  }
  return { accepted, any };
}

/**
 * The encoding to answer with, from the ones the client accepts and the ones
 * that are on the disk.
 *
 * The encoding with the highest quality wins. When two of them are equally
 * welcome, the smaller one wins, so the answer is the one that travels in the
 * fewest bytes.
 */
function chooseEncoding(header, available) {
  const { accepted, any } = acceptedEncodings(header);
  let chosen = null;
  let chosenQuality = 0;
  for (const encoding of available) {
    const quality = accepted.has(encoding) ? accepted.get(encoding) : any;
    if (quality <= 0) continue;
    if (quality > chosenQuality) {
      chosen = encoding;
      chosenQuality = quality;
    }
  }
  return chosen;
}

/**
 * The validator of a representation.
 *
 * The tag names the bytes that are sent: the size and the moment of the file.
 * Every form of a file has its own tag, so a browser can never take the bytes
 * of one encoding for the bytes of another one.
 */
function entityTag(size, mtimeMs) {
  return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

/** The weak comparison of two validators (RFC 9110, 8.8.3.2). */
function sameTag(one, other) {
  const bare = (tag) => (tag.startsWith('W/') ? tag.slice(2) : tag);
  return bare(one) === bare(other);
}

/**
 * Whether the client already has the bytes that are about to be sent.
 *
 * The client asks with the validator it has. The comparison is the weak one,
 * which is the one the standard asks for in `If-None-Match`.
 */
function clientHasTheBytes(header, etag) {
  if (typeof header !== 'string' || header === '') return false;
  const tags = header.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (tags.includes('*')) return true;
  return tags.some((tag) => sameTag(tag, etag));
}

/**
 * Adds a name to the `Vary` of an answer, without losing the names that are
 * already there.
 */
function withVary(header, name) {
  const names = typeof header === 'string' ? header.split(',') : [];
  const trimmed = names.map((entry) => entry.trim()).filter(Boolean);
  if (!trimmed.some((entry) => entry.toLowerCase() === name.toLowerCase())) trimmed.push(name);
  return trimmed.join(', ');
}

/**
 * The forms of a file that are on the disk.
 *
 * The identity form is not in the list: the caller already has it. The list
 * holds the compressed forms that are really there, so a build that was made
 * without the compression still works.
 */
function compressedForms(filename) {
  const forms = [];
  for (const encoding of ENCODINGS) {
    const path = filename + ENCODING_SUFFIXES[encoding];
    try {
      if (!existsSync(path)) continue;
      const stat = statSync(path);
      if (!stat.isFile()) continue;
      forms.push({ encoding, path, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // The form is not there. The plain file is served instead.
    }
  }
  return forms;
}


function send(res, status, message) {
  res.writeHead(status, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}

/** Browser policy shared by pages, API responses and errors. */
function securityHeaders() {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // The origins the browser may call besides this site: Turnstile, and (CONNECT_SRC_EXTRA) the address
      // that receives the errors of the browser, for example the GlitchTip of the platform.
      `connect-src 'self' https://challenges.cloudflare.com ${(process.env.CONNECT_SRC_EXTRA || '').replace(/[^A-Za-z0-9:/._ *-]/g, '')}`.trim(),
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join('; '),
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(self), usb=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

/** HSTS is only sent when the visitor really reached the public HTTPS site. */
function responseSecurityHeaders(req) {
  return {
    ...securityHeaders(),
    ...(clientProtocol(req) === 'https'
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

/**
 * The typefaces of the interface.
 *
 * The interface asks for Hanken Grotesk, Funnel Display and JetBrains Mono,
 * and it asks this site for
 * them: the files are part of the build and are served from here, so the
 * visitor is never sent to a third party for a letter. The health of the site
 * says so, so the operator can see where the typeface of the interface comes
 * from.
 */
const fonts = fontStatus();
console.log(`Typeface: ${fonts.family} and ${fonts.mono}, served by this site.`);

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
 * The chain of the header is read from the right, because the last element of
 * the chain is the proxy that is the closest to this server and the first one
 * is the client that wrote the request. The address of the proxy is never the
 * address that is written down.
 */
function clientAddress(req) {
  return resolveClientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], TRUSTED_PROXIES);
}

/**
 * The identifier of the request.
 *
 * The API believes this header only when it comes from a proxy it trusts, and
 * this server is that proxy. The identifier of the client must therefore never
 * arrive: a client that chose its own identifier could put the same number on
 * many requests, or the number of another request, and the journal of an
 * incident would lie. The identifier is made here instead, and the one that
 * arrived is replaced.
 */
function requestId() {
  return randomUUID();
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
    res.writeHead(200, { ...responseSecurityHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    // The health of the site names the typeface of the interface and the
    // files that are still missing, so the operator does not have to look
    // into the container to find out.
    const body = JSON.stringify({ status: 'ok', fonts: fontStatus() });
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
    // The identifier of the request is the one of this server, never the
    // one the client chose.
    headers['x-request-id'] = requestId();

    const forward = (attempt) => {
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
        const headers = { ...upstream.headers, ...responseSecurityHeaders(req) };
        const compressible = !headers['content-encoding'] && isCompressible(headers['content-type']);
        // An answer that carries its own validator is passed on as it is: the
        // validator describes the bytes of the API, and the API is the one
        // that knows whether they are still the same.
        const encoding =
          compressible && !headers.etag
            ? chooseEncoding(req.headers['accept-encoding'], ENCODINGS)
            : null;
        if (compressible) headers['vary'] = withVary(headers['vary'], 'Accept-Encoding');
        if (encoding) {
          // The length of the plain bytes is not the length of the bytes that
          // are sent, and the answer is written in pieces, so the length is
          // left to the server.
          delete headers['content-length'];
          delete headers['transfer-encoding'];
          headers['content-encoding'] = encoding;
        }
        res.writeHead(upstream.statusCode ?? 502, headers);
        if (!encoding) {
          upstream.pipe(res);
          return;
        }
        const compressor =
          encoding === 'br'
            ? createBrotliCompress({
                params: { [zlibConstants.BROTLI_PARAM_QUALITY]: STREAM_BROTLI_QUALITY },
              })
            : createGzip();
        compressor.on('error', () => res.destroy());
        upstream.pipe(compressor).pipe(res);
      },
    );
    proxy.on('error', (error) => {
      // A deploy replaces the API for a few seconds. A read that finds nobody there is asked
      // again for a few seconds, so the visitor waits a moment instead of seeing an error.
      // Only reads are repeated: a write that may have arrived must never be sent twice.
      const reads = req.method === 'GET' || req.method === 'HEAD';
      if (reads && attempt < UPSTREAM_RETRIES && !res.headersSent && RETRYABLE.has(error?.code)) {
        setTimeout(() => forward(attempt + 1), UPSTREAM_RETRY_MS);
        return;
      }
      if (res.headersSent) return void res.destroy();
      res.writeHead(502, { ...responseSecurityHeaders(req), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'upstream_error', message: 'The API is not reachable. Try again in a moment.' } }));
    });
    if (req.method === 'GET' || req.method === 'HEAD') proxy.end();
    else if (attempt === 0) req.pipe(proxy);
    };
    forward(0);
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed');
  let pathname;
  let search;
  try {
    const url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
    search = url.search;
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (pathname.includes('\\') || pathname.includes('\0')) return send(res, 400, 'Bad request');

  // The documentation was named with a question in the address
  // (`/docs?p=upgrade`). The site names a page with a part of the address
  // (`/docs/upgrade`). An address that was kept from before is sent to the
  // page it names.
  if (pathname === '/docs') {
    const asked = new URLSearchParams(search).get('p');
    if (asked) {
      res.writeHead(301, { ...responseSecurityHeaders(req), Location: `/docs/${encodeURIComponent(asked)}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
  }

  // The compressed forms are the private business of the server. They are
  // served through the file they belong to, never on their own.
  if (['.gz', '.br'].includes(extname(pathname).toLowerCase())) return send(res, 404, 'Not found');
  let filename = resolve(root, '.' + pathname);
  if (filename !== root && !filename.startsWith(root + sep)) return send(res, 403, 'Forbidden');
  let status = 200;
  try {
    if (existsSync(filename) && statSync(filename).isDirectory()) filename = join(filename, 'index.html');
    if (!existsSync(filename) || !statSync(filename).isFile()) {
      if (extname(pathname)) return send(res, 404, 'Not found');
      // The dashboard and the admin area are drawn by the browser: they need a
      // session and the answer of the API. Every other address that does not
      // exist is the page of an address that does not exist, and it is
      // answered with the answer 404 and with the page itself.
      const isClientArea = pathname === '/app' || pathname === '/admin' || pathname.startsWith('/app/') || pathname.startsWith('/admin/');
      const notFound = join(root, '404.html');
      if (!isClientArea && existsSync(notFound)) {
        filename = notFound;
        status = 404;
      } else {
        filename = join(root, 'index.html');
      }
    }
    const stat = statSync(filename);
    const ext = extname(filename).toLowerCase();
    const type = types[ext] || 'application/octet-stream';
    // The typefaces are served from this machine. The name of a file does not
    // change when the file does, so the browser is asked whether the file
    // changed instead of being told to keep it for a year.
    const isFont = pathname.startsWith('/fonts/') && ['.woff2', '.woff'].includes(ext);
    const cacheControl = isFont
      ? 'public, max-age=0, must-revalidate'
      : filename.includes(sep + 'assets' + sep)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';

    // The compressed form of the file, when the client accepts one and the
    // build has written it. A file that has no compressed form is served as
    // it is, which is what a site that was built without the compression
    // needs.
    const compressible = isCompressible(type);
    const forms = compressible ? compressedForms(filename) : [];
    const chosen = chooseEncoding(
      req.headers['accept-encoding'],
      forms.map((form) => form.encoding),
    );
    const form = chosen ? forms.find((entry) => entry.encoding === chosen) : null;
    const served = form ?? { path: filename, size: stat.size, mtimeMs: stat.mtimeMs };

    // Every form of the file has its own validator, so a browser can never
    // take the bytes of one encoding for the bytes of another one.
    const etag = entityTag(served.size, served.mtimeMs);
    const headers = {
      ...responseSecurityHeaders(req),
      'Content-Type': type,
      'Content-Length': served.size,
      'Cache-Control': cacheControl,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    };
    // The answer depends on what the client accepts, so the caches are told.
    if (compressible) headers['Vary'] = 'Accept-Encoding';
    if (form) headers['Content-Encoding'] = form.encoding;

    // The browser asks whether the file changed. The answer says it did not,
    // and no body is sent.
    if (clientHasTheBytes(req.headers['if-none-match'], etag)) {
      res.writeHead(304, {
        ...responseSecurityHeaders(req),
        ETag: etag,
        'Cache-Control': cacheControl,
        ...(compressible ? { Vary: 'Accept-Encoding' } : {}),
        ...(form ? { 'Content-Encoding': form.encoding } : {}),
      });
      return res.end();
    }
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    createReadStream(served.path).pipe(res);
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
  // The identifier of the request is the one of this server, never the
  // one the client chose.
  headers['x-request-id'] = requestId();

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
