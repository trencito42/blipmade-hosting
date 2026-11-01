import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fingerprintMatches, parseFingerprint, pinnedAgent } from '../src/lib/pinned-tls.js';

/**
 * The pinned certificate of Proxmox.
 *
 * The tests run against a real TLS server with a certificate that nobody
 * signed, which is what the hypervisor has. The server counts the requests it
 * received, so a refused connection is proved by the count and not only by
 * the error.
 */

let server: https.Server;
let port = 0;
let fingerprint = '';
let received = 0;

function get(agent: https.Agent): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: '127.0.0.1', port, path: '/', agent, headers: { Authorization: 'PVEAPIToken=secret' } }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve(text));
    });
    req.on('error', reject);
  });
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinned-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=n7030e1'], { stdio: 'ignore' });
  fingerprint = execFileSync('openssl', ['x509', '-in', join(dir, 'c.pem'), '-noout', '-fingerprint', '-sha256'], { encoding: 'utf-8' }).split('=')[1].trim();
  server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (_req, res) => {
    received += 1;
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('the pinned certificate', () => {
  it('reads a fingerprint in the usual forms', () => {
    const colon = 'AA:'.repeat(31) + 'AA';
    expect(parseFingerprint(colon)?.length).toBe(32);
    expect(parseFingerprint('sha256 Fingerprint='.replace('sha256 Fingerprint=', 'SHA256:') + 'aa'.repeat(32))?.length).toBe(32);
    expect(parseFingerprint('abc')).toBeNull();
    expect(parseFingerprint('')).toBeNull();
    expect(fingerprintMatches(colon, parseFingerprint('aa'.repeat(32))!)).toBe(true);
    expect(fingerprintMatches(undefined, parseFingerprint('aa'.repeat(32))!)).toBe(false);
  });

  it('refuses a fingerprint that is not SHA-256', () => {
    expect(() => pinnedAgent('not a fingerprint')).toThrow(/SHA-256/);
  });

  it('talks to the server whose certificate is the pinned one', async () => {
    received = 0;
    expect(await get(pinnedAgent(fingerprint))).toBe('ok');
    expect(received).toBe(1);
  });

  it('refuses any other certificate and never sends the request', async () => {
    received = 0;
    const wrong = fingerprint.replace(/^../, (pair) => (pair === '00' ? '01' : '00'));
    await expect(get(pinnedAgent(wrong))).rejects.toThrow(/not the pinned one/);
    expect(received).toBe(0);
  });

  it('is refused by an ordinary agent, which proves the certificate is not signed by anyone', async () => {
    await expect(get(new https.Agent({ rejectUnauthorized: true }))).rejects.toThrow();
  });
});
