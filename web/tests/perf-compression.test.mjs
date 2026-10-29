/**
 * The compression of the delivery path.
 *
 *     node --test web/tests/perf-compression.test.mjs
 *
 * The server is started on a directory of its own, so the test writes its own
 * files and the build of the site is never touched. The compressed forms are
 * written by the same helper that the build uses, so the test sees exactly
 * what a build produces.
 *
 * The answers are read with a plain HTTP request and not with `fetch`: the
 * fetch of Node puts the compressed bytes back the way they were, so it
 * cannot tell what travelled over the wire.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request as httpRequest } from 'node:http';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { precompressSite } from '../src/lib/perf-precompress.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, '..', 'server.mjs');

/** The bytes of a file of the test site. Long enough to be worth compressing. */
const SCRIPT = `console.log(${JSON.stringify('the quick brown fox jumps over the lazy dog '.repeat(40))});\n`;
const PAGE = `<!doctype html><html lang="en"><head><title>Blipmade</title></head><body><p>${'hello '.repeat(60)}</p></body></html>\n`;
/** A picture. The bytes of a picture are already compressed. */
const PICTURE = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/** A port that is free for the moment. */
async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/**
 * Starts the server on a directory of its own and hands the two things a test
 * needs: the address and a way to stop it.
 */
async function start({ apiUrl = 'http://127.0.0.1:1' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'blipmade-compression-'));
  const dist = join(directory, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, 'fonts'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), PAGE);
  writeFileSync(join(dist, 'assets', 'app.js'), SCRIPT);
  writeFileSync(join(dist, 'assets', 'pic.png'), PICTURE);
  writeFileSync(join(dist, 'fonts', 'type.woff2'), PICTURE);
  // The build writes the compressed forms; the test uses the same helper.
  precompressSite(dist);

  const port = await freePort();
  const child = spawn(process.execPath, [server], {
    cwd: directory,
    env: { ...process.env, SERVER_PORT: String(port), API_URL: apiUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (chunk) => log.push(String(chunk)));
  child.stderr.on('data', (chunk) => log.push(String(chunk)));

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(`${base}/healthz`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return {
    base,
    log,
    directory,
    stop: () => {
      child.kill();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/**
 * A request that hands back the bytes exactly as they travelled.
 */
function ask(base, path, { headers = {}, method = 'GET' } = {}) {
  const url = new URL(path, base);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (answer) => {
        const chunks = [];
        answer.on('data', (chunk) => chunks.push(chunk));
        answer.on('end', () =>
          resolve({
            status: answer.statusCode,
            headers: answer.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

/** The body of an answer, put back the way it was. */
function plain(answer) {
  const encoding = answer.headers['content-encoding'];
  if (encoding === 'gzip') return gunzipSync(answer.body).toString('utf8');
  if (encoding === 'br') return brotliDecompressSync(answer.body).toString('utf8');
  return answer.body.toString('utf8');
}

test('static responses carry the browser security policy', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/');
    assert.match(answer.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(answer.headers['content-security-policy'], /https:\/\/challenges\.cloudflare\.com/);
    assert.equal(answer.headers['x-frame-options'], 'DENY');
    assert.equal(answer.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(answer.headers['permissions-policy'], /camera=\(\)/);
    // The test server is plain HTTP. HSTS is deliberately reserved for the
    // trusted HTTPS path in production.
    assert.equal(answer.headers['strict-transport-security'], undefined);
  } finally {
    instance.stop();
  }
});

test('the bytes of a script travel compressed when the client accepts them', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['content-encoding'], 'gzip');
    assert.equal(answer.headers['vary'], 'Accept-Encoding');
    // The bytes that travel are fewer than the bytes of the file.
    assert.ok(
      answer.body.length < SCRIPT.length,
      `${answer.body.length} bytes travelled for ${SCRIPT.length}`,
    );
    assert.equal(Number(answer.headers['content-length']), answer.body.length);
    // The bytes that arrive are the bytes of the file.
    assert.equal(plain(answer), SCRIPT);
  } finally {
    instance.stop();
  }
});

test('brotli is served when the client accepts it', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'br' },
    });
    assert.equal(answer.headers['content-encoding'], 'br');
    assert.ok(answer.body.length < SCRIPT.length);
    assert.equal(plain(answer), SCRIPT);
  } finally {
    instance.stop();
  }
});

test('the smaller of the two encodings is the one that is served', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    assert.equal(answer.headers['content-encoding'], 'br');
    assert.equal(plain(answer), SCRIPT);
  } finally {
    instance.stop();
  }
});

test('an encoding the client refuses is not used', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'gzip;q=0, br' },
    });
    assert.equal(answer.headers['content-encoding'], 'br');
  } finally {
    instance.stop();
  }
});

test('a client that accepts nothing gets the plain bytes', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/app.js');
    assert.equal(answer.headers['content-encoding'], undefined);
    assert.equal(answer.body.toString('utf8'), SCRIPT);
    assert.equal(Number(answer.headers['content-length']), SCRIPT.length);
  } finally {
    instance.stop();
  }
});

test('the page of the site is compressed as well', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(answer.headers['content-encoding'], 'gzip');
    assert.ok(answer.body.length < PAGE.length);
    assert.equal(plain(answer), PAGE);
  } finally {
    instance.stop();
  }
});

test('a picture is not compressed, it is compressed already', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/pic.png', {
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['content-encoding'], undefined);
    assert.deepEqual(answer.body, PICTURE);
  } finally {
    instance.stop();
  }
});

test('a typeface is not compressed and keeps its validator', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/fonts/type.woff2', {
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    assert.equal(answer.headers['content-encoding'], undefined);
    assert.equal(answer.headers['cache-control'], 'public, max-age=0, must-revalidate');
    assert.deepEqual(answer.body, PICTURE);

    // The browser asks again with the validator and the answer says the file
    // did not change.
    const again = await ask(instance.base, '/fonts/type.woff2', {
      headers: { 'If-None-Match': answer.headers['etag'] },
    });
    assert.equal(again.status, 304);
  } finally {
    instance.stop();
  }
});

test('every encoding has its own validator', async () => {
  const instance = await start();
  try {
    const plainAnswer = await ask(instance.base, '/assets/app.js');
    const gzipAnswer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    const brAnswer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'br' },
    });
    const plainTag = plainAnswer.headers['etag'];
    const gzipTag = gzipAnswer.headers['etag'];
    const brTag = brAnswer.headers['etag'];
    assert.ok(plainTag && gzipTag && brTag);
    // The bytes of one encoding are never the bytes of another one, so the
    // validators are never the same.
    assert.notEqual(plainTag, gzipTag);
    assert.notEqual(gzipTag, brTag);
    assert.notEqual(plainTag, brTag);
  } finally {
    instance.stop();
  }
});

test('the answer of 304 is given for the encoding the browser holds', async () => {
  const instance = await start();
  try {
    for (const encoding of ['gzip', 'br']) {
      const first = await ask(instance.base, '/assets/app.js', {
        headers: { 'Accept-Encoding': encoding },
      });
      const tag = first.headers['etag'];
      const again = await ask(instance.base, '/assets/app.js', {
        headers: { 'Accept-Encoding': encoding, 'If-None-Match': tag },
      });
      assert.equal(again.status, 304, `${encoding} did not answer 304`);
      assert.equal(again.headers['etag'], tag);
      assert.equal(again.headers['content-encoding'], encoding);
      assert.equal(again.headers['vary'], 'Accept-Encoding');
      assert.equal(again.body.length, 0);
    }
  } finally {
    instance.stop();
  }
});

test('the validator of one encoding does not pass for another one', async () => {
  const instance = await start();
  try {
    const gzipAnswer = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    const gzipTag = gzipAnswer.headers['etag'];
    // The browser holds the gzip bytes and asks for brotli. The answer is not
    // a 304, because the bytes of brotli are not the bytes it holds.
    const again = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'br', 'If-None-Match': gzipTag },
    });
    assert.equal(again.status, 200);
    assert.equal(again.headers['content-encoding'], 'br');
    assert.notEqual(again.headers['etag'], gzipTag);
  } finally {
    instance.stop();
  }
});

test('the plain bytes answer 304 as well', async () => {
  const instance = await start();
  try {
    const first = await ask(instance.base, '/assets/app.js');
    const again = await ask(instance.base, '/assets/app.js', {
      headers: { 'If-None-Match': first.headers['etag'] },
    });
    assert.equal(again.status, 304);
    assert.equal(again.headers['content-encoding'], undefined);
  } finally {
    instance.stop();
  }
});

test('a file that has no compressed form is served as it is', async () => {
  const instance = await start();
  try {
    // A file that was put in place after the build has no compressed form.
    writeFileSync(join(instance.directory, 'dist', 'assets', 'late.js'), SCRIPT);
    const answer = await ask(instance.base, '/assets/late.js', {
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['content-encoding'], undefined);
    assert.equal(answer.body.toString('utf8'), SCRIPT);
  } finally {
    instance.stop();
  }
});

test('the compressed forms are not served on their own', async () => {
  const instance = await start();
  try {
    const answer = await ask(instance.base, '/assets/app.js.gz');
    assert.equal(answer.status, 404);
  } finally {
    instance.stop();
  }
});

test('a request without a body has the same answer as one with a body', async () => {
  const instance = await start();
  try {
    const withBody = await ask(instance.base, '/assets/app.js', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    const withoutBody = await ask(instance.base, '/assets/app.js', {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(withoutBody.status, 200);
    assert.equal(withoutBody.headers['content-encoding'], 'gzip');
    assert.equal(withoutBody.headers['content-length'], withBody.headers['content-length']);
    assert.equal(withoutBody.headers['etag'], withBody.headers['etag']);
    assert.equal(withoutBody.body.length, 0);
  } finally {
    instance.stop();
  }
});

test('the answer of the API is compressed as well', async () => {
  const payload = JSON.stringify({ users: Array.from({ length: 40 }, (_, index) => ({ id: index })) });
  const api = createServer((req, res) => {
    if (req.url === '/api/with-etag') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ETag: '"upstream-1"' });
      res.end(payload);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const apiPort = api.address().port;

  const instance = await start({ apiUrl: `http://127.0.0.1:${apiPort}` });

  try {
    const answer = await ask(instance.base, '/api/users', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['content-encoding'], 'gzip');
    assert.equal(answer.headers['vary'], 'Accept-Encoding');
    assert.ok(answer.body.length < payload.length);
    assert.equal(plain(answer), payload);

    // An answer of the API that carries its own validator is passed on as it
    // is: the validator of the API must keep describing its own bytes.
    const withTag = await ask(instance.base, '/api/with-etag', {
      headers: { 'Accept-Encoding': 'gzip, br' },
    });
    assert.equal(withTag.headers['content-encoding'], undefined);
    assert.equal(withTag.headers['etag'], '"upstream-1"');
    assert.equal(withTag.body.toString('utf8'), payload);
  } finally {
    api.close();
    instance.stop();
  }
});

test('the build writes the compressed forms of the files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'blipmade-precompress-'));
  try {
    assert.equal(precompressSite(directory).length, 0);

    writeFileSync(join(directory, 'app.js'), SCRIPT);
    writeFileSync(join(directory, 'pic.png'), PICTURE);
    const files = precompressSite(directory);
    assert.equal(files.length, 1, 'only the text file is compressed');
    assert.equal(files[0].file, join(directory, 'app.js'));
    assert.ok(files[0].gzip < files[0].raw);
    assert.ok(files[0].brotli < files[0].raw);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
