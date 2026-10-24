import { afterEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { getApp, closeApp } from './helpers.js';

/**
 * The limits of the server.
 *
 * The server had no limit at all: no limit for the request and no limit for
 * the silence of a socket. A client that opened a connection and sent nothing
 * kept it open, and every connection it kept open was a connection that
 * nothing else could use.
 *
 * The limits are read from the environment, and the value `0` brings back the
 * old behaviour.
 */

/** The servers that were built for one test. */
const built: FastifyInstance[] = [];

/** Builds a server with limits of its own and lets it listen. */
async function serverWith(limits: Record<string, string>): Promise<{ app: FastifyInstance; port: number }> {
  for (const [key, value] of Object.entries(limits)) vi.stubEnv(key, value);
  vi.resetModules();
  const { buildApp } = await import('../src/app.js');
  const app = await buildApp();
  built.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { app, port };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  while (built.length) {
    const app = built.pop();
    await app?.close().catch(() => undefined);
  }
  await closeApp();
});

describe('the limits of the server', () => {
  it('gives the server the limits that were measured', async () => {
    const app = await getApp();
    // The whole request has to be received in this time.
    expect(app.server.requestTimeout).toBe(30_000);
    // The socket may be silent for this long.
    expect(app.server.timeout).toBe(45_000);
    // An idle connection is kept for this long.
    expect(app.server.keepAliveTimeout).toBe(15_000);
  });

  it('closes a connection that sends nothing', async () => {
    const { port } = await serverWith({ API_CONNECTION_TIMEOUT_MS: '700' });

    const closed = await new Promise<boolean>((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 10_000);
      socket.on('error', () => {
        // The server closed the connection: the error is the answer.
      });
      socket.on('close', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    expect(closed).toBe(true);
  });

  it('brings back the old behaviour with the value zero', async () => {
    const { app } = await serverWith({
      API_REQUEST_TIMEOUT_MS: '0',
      API_CONNECTION_TIMEOUT_MS: '0',
      API_KEEPALIVE_TIMEOUT_MS: '0',
    });
    // No limit for the request and no limit for the silence of the socket.
    expect(app.server.requestTimeout).toBe(0);
    expect(app.server.timeout).toBe(0);
    // The server keeps its own default of seventy-two seconds.
    expect(app.server.keepAliveTimeout).toBe(72_000);
  });
});
