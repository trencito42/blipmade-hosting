/**
 * The typeface of the interface is served by the web server, checked without
 * a browser.
 *
 *     node --test web/tests/fonts-server.test.mjs
 *
 * The server is started on a directory of its own, so the test writes its own
 * files and the build of the site is never touched.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "..", "server.mjs");

/** A port that is free for the moment. */
async function freePort() {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts the server on a directory of its own and hands the two things a test
 * needs: the address and a way to stop it.
 */
async function start() {
  const directory = mkdtempSync(join(tmpdir(), "blipmade-fonts-"));
  mkdirSync(join(directory, "dist"), { recursive: true });
  writeFileSync(join(directory, "dist", "index.html"), "<!doctype html><html lang=\"en\"><body></body></html>");
  const port = await freePort();
  const child = spawn(process.execPath, [server], {
    cwd: directory,
    env: { ...process.env, SERVER_PORT: String(port), API_URL: "http://127.0.0.1:1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The server writes the state of the typeface when it starts.
  const log = [];
  child.stdout.on("data", (chunk) => log.push(String(chunk)));
  child.stderr.on("data", (chunk) => log.push(String(chunk)));

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

test("the health of the site says that the typeface is served by the site", async () => {
  const instance = await start();
  try {
    const answer = await fetch(`${instance.base}/healthz`);
    assert.equal(answer.status, 200);
    const body = await answer.json();
    assert.equal(body.status, "ok");
    assert.equal(body.fonts.family, "Geist Variable");
    assert.equal(body.fonts.mono, "Geist Mono Variable");
    assert.equal(body.fonts.installed, true);
    assert.equal(body.fonts.webfont, true);
    assert.equal(body.fonts.source, "self");
    assert.deepEqual(body.fonts.files, []);
    assert.deepEqual(body.fonts.missing, []);
    assert.equal(body.fonts.fallback, "sans-serif");

    // The console of the container says the same.
    assert.ok(instance.log.join("").includes("Geist Variable"));
  } finally {
    instance.stop();
  }
});

test("the site does not serve a typeface of its own under /fonts", async () => {
  const instance = await start();
  try {
    // The files of the typeface are written by the build, next to the other
    // files of the site, and they carry the name of the build. There is no
    // directory of typefaces that the server serves on its own, so the answer
    // is a plain 404.
    const answer = await fetch(`${instance.base}/fonts/proxima-nova-400.woff2`);
    assert.equal(answer.status, 404);
  } finally {
    instance.stop();
  }
});

test("the site does not walk out of its own directory", async () => {
  const instance = await start();
  try {
    for (const path of [
      "/fonts/../server.mjs",
      "/fonts/%2e%2e/server.mjs",
      "/fontawesome/../../server.mjs",
      "/../package.json",
    ]) {
      const answer = await fetch(`${instance.base}${path}`);
      assert.ok(answer.status === 403 || answer.status === 404, `${path} answered ${answer.status}`);
    }
  } finally {
    instance.stop();
  }
});
