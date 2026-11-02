import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pinnedAgent } from '../src/lib/pinned-tls.js';

function get(agent: https.Agent, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    https.get({ host: '127.0.0.1', port, path: '/', agent, rejectUnauthorized: false, headers: { connection: 'close' } }, (response) => { response.resume(); response.on('end', () => resolve(response.statusCode ?? 0)); }).on('error', reject);
  });
}

describe('the pinned connection to the hypervisor', () => {
  it('accepts the pinned certificate on every connection, also the ones made one after another', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pin-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const cert = readFileSync(join(dir, 'c.pem'));
    const fingerprint = new X509Certificate(cert).fingerprint256;
    const server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert }, (_request, response) => response.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    // A new connection each time, as when the pages ask for the state and the usage together.
    const agent = pinnedAgent(fingerprint);
    for (let round = 0; round < 6; round += 1) {
      // One after the other, each on a new connection: the second one resumes the session of the first.
      expect(await get(agent, port)).toBe(200);
      expect(await get(agent, port)).toBe(200);
    }
    // Another certificate is still refused.
    await expect(get(pinnedAgent(createHash('sha256').update('x').digest('hex')), port)).rejects.toThrow();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
