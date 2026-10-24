/**
 * The identifier of the request that the web gives to the API.
 *
 *     node --test web/tests/request-id.test.mjs
 *
 * The API believes the header `x-request-id` only when it comes from a proxy
 * it trusts, and the web is that proxy. So the identifier of the client must
 * never arrive: a client that chose its own identifier could put the same
 * number on many requests, or the number of another request, and the journal of
 * an incident would lie.
 *
 * The test starts a stub of the API that writes down the header it receives,
 * and the web in front of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, '..', 'server.mjs');

const PAGE = '<!doctype html><html lang="en"><head><title>Blipmade</title></head><body></body></html>\n';

/** What an identifier may look like, in the API and in the web. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

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
 * Starts the stub of the API and the web in front of it.
 *
 * The stub writes down the identifier it receives, so the test can see what
 * the web forwarded.
 */
async function start() {
  const received = [];
  const api = createServer((req, res) => {
    received.push({ url: req.url, id: req.headers['x-request-id'] });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const apiPort = api.address().port;

  const directory = mkdtempSync(join(tmpdir(), 'blipmade-request-id-'));
  mkdirSync(join(directory, 'dist'), { recursive: true });
  writeFileSync(join(directory, 'dist', 'index.html'), PAGE);

  const port = await freePort();
  const child = spawn(process.execPath, [server], {
    cwd: directory,
    env: { ...process.env, SERVER_PORT: String(port), API_URL: `http://127.0.0.1:${apiPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();

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
    received,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      await new Promise((resolve) => api.close(resolve));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('the identifier of the client is replaced by the one of the web', async () => {
  const stack = await start();
  try {
    const chosen = 'chosen-by-the-client';
    await fetch(`${stack.base}/api/catalog/products`, {
      headers: { 'x-request-id': chosen },
    });

    assert.equal(stack.received.length, 1, 'the stub of the API must have been called');
    const forwarded = stack.received[0].id;
    assert.notEqual(
      forwarded,
      chosen,
      'the identifier chosen by the client reached the API: the journal of an incident can be written by the client',
    );
    assert.match(String(forwarded), ID_PATTERN, 'the identifier of the web must be well formed');
  } finally {
    await stack.stop();
  }
});

test('every request gets its own identifier', async () => {
  const stack = await start();
  try {
    await fetch(`${stack.base}/api/catalog/products`);
    await fetch(`${stack.base}/api/catalog/products`);

    assert.equal(stack.received.length, 2);
    const [first, second] = stack.received.map((entry) => entry.id);
    assert.match(String(first), ID_PATTERN);
    assert.match(String(second), ID_PATTERN);
    assert.notEqual(first, second, 'two requests must not share an identifier');
  } finally {
    await stack.stop();
  }
});

test('a request without an identifier still gets one', async () => {
  const stack = await start();
  try {
    await fetch(`${stack.base}/api/catalog/products`);
    assert.equal(stack.received.length, 1);
    assert.match(String(stack.received[0].id), ID_PATTERN);
  } finally {
    await stack.stop();
  }
});
