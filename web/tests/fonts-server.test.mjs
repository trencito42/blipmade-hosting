/**
 * The typefaces are served by the web server, checked without a browser.
 *
 *     node --test web/tests/fonts-server.test.mjs
 *
 * The server is started on a directory of its own, so the test writes its own
 * files and the build of the site is never touched.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, '..', 'server.mjs');

/** A port that is free for the moment. */
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts the server on a directory of its own and hands the two things a test
 * needs: the address and a way to stop it.
 */
async function start(distribution) {
  const directory = mkdtempSync(join(tmpdir(), 'blipmade-fonts-'));
  mkdirSync(join(directory, 'dist'), { recursive: true });
  mkdirSync(join(directory, 'dist', 'fonts'), { recursive: true });
  writeFileSync(join(directory, 'dist', 'index.html'), '<!doctype html><html lang="en"><body></body></html>');
  for (const file of distribution) {
    writeFileSync(join(directory, 'dist', 'fonts', file), 'wOF2fake-font-bytes');
  }
  const port = await freePort();
  const child = spawn(process.execPath, [server], {
    cwd: directory,
    env: { ...process.env, SERVER_PORT: String(port), API_URL: 'http://127.0.0.1:1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // The server writes the state of the typeface when it starts.
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

test('the health of the site names the files that are missing', async () => {
  const instance = await start(['proxima-nova-400.woff2']);
  try {
    const answer = await fetch(`${instance.base}/healthz`);
    assert.equal(answer.status, 200);
    const body = await answer.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.fonts.family, 'Proxima Nova');
    assert.equal(body.fonts.installed, false);
    assert.equal(body.fonts.fallback, 'Geist Variable');
    assert.deepEqual(body.fonts.missing, [
      '/fonts/proxima-nova-600.woff2',
      '/fonts/proxima-nova-700.woff2',
    ]);
    assert.equal(body.fonts.files.length, 3);
    assert.equal(body.fonts.files.filter((entry) => entry.present).length, 1);
    // The console of the container names the files as well.
    assert.ok(instance.log.join('').includes('/fonts/proxima-nova-600.woff2'));
  } finally {
    instance.stop();
  }
});

test('the typeface is there when the three files are there', async () => {
  const instance = await start([
    'proxima-nova-400.woff2',
    'proxima-nova-600.woff2',
    'proxima-nova-700.woff2',
  ]);
  try {
    const body = await (await fetch(`${instance.base}/healthz`)).json();
    assert.equal(body.fonts.installed, true);
    assert.deepEqual(body.fonts.missing, []);
  } finally {
    instance.stop();
  }
});

test('a file that is put in place while the site runs is seen', async () => {
  const instance = await start([]);
  try {
    let body = await (await fetch(`${instance.base}/healthz`)).json();
    assert.equal(body.fonts.installed, false);
    assert.equal(body.fonts.missing.length, 3);

    // The file appears in the directory of the running site.
    writeFileSync(
      join(instance.directory, 'dist', 'fonts', 'proxima-nova-400.woff2'),
      'wOF2fake-font-bytes',
    );

    body = await (await fetch(`${instance.base}/healthz`)).json();
    assert.equal(body.fonts.files.filter((entry) => entry.present).length, 1);
    assert.deepEqual(body.fonts.missing, [
      '/fonts/proxima-nova-600.woff2',
      '/fonts/proxima-nova-700.woff2',
    ]);
  } finally {
    instance.stop();
  }
});

test('a file of the typeface is served as a font', async () => {
  const instance = await start(['proxima-nova-400.woff2']);
  try {
    const answer = await fetch(`${instance.base}/fonts/proxima-nova-400.woff2`);
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('content-type'), 'font/woff2');
    // The name of a file does not change when the file does, so the browser
    // is asked whether the file changed.
    assert.equal(answer.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    const etag = answer.headers.get('etag');
    assert.ok(etag, 'the answer carries an ETag');
    assert.equal(await answer.text(), 'wOF2fake-font-bytes');

    // The browser asks again with the ETag and gets an answer that says the
    // file did not change.
    const again = await fetch(`${instance.base}/fonts/proxima-nova-400.woff2`, {
      headers: { 'if-none-match': etag },
    });
    assert.equal(again.status, 304);
    assert.equal(again.headers.get('etag'), etag);
  } finally {
    instance.stop();
  }
});

test('a file that is not there is not served', async () => {
  const instance = await start([]);
  try {
    const answer = await fetch(`${instance.base}/fonts/proxima-nova-400.woff2`);
    assert.equal(answer.status, 404);
  } finally {
    instance.stop();
  }
});

test('the site does not walk out of its own directory', async () => {
  const instance = await start([]);
  try {
    for (const path of ['/fonts/../server.mjs', '/fonts/%2e%2e/server.mjs', '/../package.json']) {
      const answer = await fetch(`${instance.base}${path}`);
      assert.ok(answer.status === 403 || answer.status === 404, `${path} answered ${answer.status}`);
    }
  } finally {
    instance.stop();
  }
});
