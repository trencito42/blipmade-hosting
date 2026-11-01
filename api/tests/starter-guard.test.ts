import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { looksLikeStarter, usesStarterApplication } from '../src/services/starter-apps.js';
import { verifyDeployment } from '../src/services/provisioning.js';

let server: http.Server;
let port = 0;
let reply = '';

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(reply);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('the stand-in server is never proof of a product', () => {
  it('is only put beside bare runtimes', () => {
    expect(usesStarterApplication('nodejs')).toBe(true);
    expect(usesStarterApplication('wordpress')).toBe(false);
    expect(usesStarterApplication('postgresql')).toBe(false);
    expect(usesStarterApplication('minecraft-paper')).toBe(false);
  });

  it('recognises its own answers', () => {
    expect(looksLikeStarter('WordPress is running on Blipmade.\n')).toBe(true);
    expect(looksLikeStarter('{"status":"ok","app":"wordpress","uptime":3}')).toBe(true);
    expect(looksLikeStarter('{"status": "ok", "app": "x"}')).toBe(true);
    expect(looksLikeStarter('<html><title>My WordPress site</title></html>')).toBe(false);
  });

  it('fails a product whose probe is answered by the stand-in, and passes the real one', async () => {
    const options = { attempts: 1, delayMs: 1, rejectStarter: true };
    reply = 'WordPress is running on Blipmade.\n';
    expect((await verifyDeployment('127.0.0.1', port, { kind: 'http', path: '/' }, options)).ok).toBe(false);
    reply = '<html>Welcome to WordPress</html>';
    expect((await verifyDeployment('127.0.0.1', port, { kind: 'http', path: '/' }, options)).ok).toBe(true);
    reply = 'Node is running on Blipmade.\n';
    expect((await verifyDeployment('127.0.0.1', port, { kind: 'http', path: '/' }, { attempts: 1, delayMs: 1 })).ok).toBe(true);
  });
});
