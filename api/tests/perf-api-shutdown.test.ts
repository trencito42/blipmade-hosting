import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shutdownGracefully } from '../src/lib/perf-shutdown.js';

/**
 * The stopping of the process.
 *
 * The container is asked to stop with SIGTERM and then, if the container does
 * not leave in time, with SIGKILL. The process therefore has to leave by
 * itself, and it has to leave in a time that is known.
 *
 * The test starts the real process, opens a request that takes a while, asks
 * the process to stop and watches how long it takes to leave. The request
 * either finishes or is cut off on purpose, but the process always leaves.
 */

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** The processes that were started. */
const children: ChildProcess[] = [];

/** Finds a port that nothing listens on. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * A worker that accepts connections and never answers.
 *
 * The API asks the worker how it is doing when the state of the platform is
 * asked for, and it gives up after four seconds. The request is therefore
 * slow, and it is slow for a real reason: a dependency that does not answer.
 */
function hangingWorker(): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    // The connection is held open and nothing is ever written to it.
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            // The connections of the API are cut, so the close does not wait
            // for a client that is gone.
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

/** The journal of the processes that were started. */
const journals: { text: string }[] = [];

/** Starts the API and waits until it answers. */
async function startApi(extra: Record<string, string>): Promise<{ child: ChildProcess; port: number }> {
  const port = await freePort();
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: apiDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      METRICS_ENABLED: 'false',
      LOG_LEVEL: 'info',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const journal = { text: '' };
  child.stdout?.on('data', (chunk: Buffer) => {
    journal.text += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    journal.text += chunk.toString();
  });
  journals.push(journal);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The API left before it started (code ${child.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return { child, port };
    } catch {
      // The process is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The API did not start in time.\n${journal.text}`);
}

/**
 * Waits until the process leaves and says with which status.
 *
 * The state of the process is looked at instead of waiting for the event, so
 * a lost event cannot hold the test back.
 */
async function waitForExit(child: ChildProcess, timeoutMs = 30_000): Promise<{ code: number | null; signal: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return { code: child.exitCode, signal: child.signalCode };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The process did not leave in time.');
}

afterEach(async () => {
  while (children.length) {
    const child = children.pop();
    if (child && child.exitCode === null) child.kill('SIGKILL');
  }
  // The journal of the processes is written out, so a test that fails says
  // what the process was doing.
  const journal = journals.map((entry) => entry.text).join('\n');
  journals.length = 0;
  if (journal.trim()) fs.writeFileSync(path.join(os.tmpdir(), 'perf-api-shutdown-journal.log'), journal);
});

afterAll(async () => {
  // Nothing is left behind.
});

describe('the stopping of the process', () => {
  it('lets a request that finishes in time finish, and leaves with a clear status', async () => {
    const worker = await hangingWorker();
    const { child, port } = await startApi({
      API_SHUTDOWN_TIMEOUT_MS: '20000',
      WORKER_URL: `http://127.0.0.1:${worker.port}`,
    });

    const request = fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(30_000) })
      .then((response) => response.status)
      .catch(() => 'cut-off');

    // The request is running now.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const started = Date.now();
    child.kill('SIGTERM');
    const exit = await waitForExit(child);
    const elapsed = Date.now() - started;

    await worker.close();

    expect(elapsed).toBeLessThan(20_000);
    expect(exit.code).toBe(0);
    // The request had the time it needed, so it was answered.
    expect(await request).toBe(200);
  });

  it('cuts off a request that does not finish in time, and leaves all the same', async () => {
    const worker = await hangingWorker();
    const { child, port } = await startApi({
      API_SHUTDOWN_TIMEOUT_MS: '1000',
      WORKER_URL: `http://127.0.0.1:${worker.port}`,
    });

    const request = fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(30_000) })
      .then((response) => response.status)
      .catch(() => 'cut-off');

    // The request is running now.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const started = Date.now();
    child.kill('SIGTERM');
    const exit = await waitForExit(child);
    const elapsed = Date.now() - started;

    await worker.close();

    // The process left, and it left in the time it was promised.
    expect(elapsed).toBeLessThan(15_000);
    // The status says that something had to be cut off.
    expect(exit.code).toBe(1);
    // The request was cut off on purpose and not left hanging.
    expect(await request).toBe('cut-off');
  });

  it('stops taking new connections when it is asked to stop', async () => {
    const worker = await hangingWorker();
    const { child, port } = await startApi({
      API_SHUTDOWN_TIMEOUT_MS: '20000',
      WORKER_URL: `http://127.0.0.1:${worker.port}`,
    });

    const request = fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(30_000) }).catch(() => 'cut-off');
    await new Promise((resolve) => setTimeout(resolve, 500));

    child.kill('SIGTERM');
    await waitForExit(child);
    await worker.close();

    // The port is free again: nothing listens on it.
    const refused = await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(2000) }).then(
      () => 'answered',
      () => 'refused',
    );
    expect(refused).toBe('refused');
  });
});

describe('the stopping inside the process', () => {
  it('gives up on a request that does not finish and says that it did', async () => {
    const { buildApp } = await import('../src/app.js');
    const app = await buildApp();
    app.get('/api/perf-slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      return { ok: true };
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    // A request that runs for a long time is running now.
    const request = fetch(`http://127.0.0.1:${port}/api/perf-slow`).catch(() => 'cut-off');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const started = Date.now();
    const result = await shutdownGracefully(app, { deadlineMs: 800, steps: [] });
    const elapsed = Date.now() - started;

    expect(result.forced).toBe(true);
    expect(result.exitCode).toBe(1);
    // The process does not wait for ever.
    expect(elapsed).toBeLessThan(10_000);
    // The request was cut off on purpose.
    expect(await request).toBe('cut-off');
  });

  it('closes the steps it is given and says what each of them did', async () => {
    const { buildApp } = await import('../src/app.js');
    const app = await buildApp();
    await app.listen({ host: '127.0.0.1', port: 0 });

    const result = await shutdownGracefully(app, {
      deadlineMs: 5000,
      steps: [
        { name: 'queue', run: async () => undefined },
        { name: 'redis', run: async () => undefined },
      ],
    });

    expect(result.forced).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.steps.map((step) => step.name)).toEqual(['queue', 'redis']);
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });
});
