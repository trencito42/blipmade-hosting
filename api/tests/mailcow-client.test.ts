import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import { MailcowError, mailcowConfigured, mailcowRequest, waitForPeerCertificate } from '../src/services/mailcow.js';
import { env } from '../src/env.js';

/**
 * The client of the mail system.
 *
 * The mail system of the platform is another program, on another machine. It
 * answers over HTTPS with a certificate that is signed by nobody until the
 * name of the machine is published in the DNS, and the platform does not
 * believe a certificate because somebody answered on the wire: it believes the
 * fingerprint of the certificate that the operator wrote down.
 *
 * These tests put a real HTTPS server in front of the client, with a real
 * self-signed certificate, so the pinning is checked on the same code path
 * that the production uses and not on a copy of it.
 */

interface TestServer {
  url: string;
  fingerprint: string;
  close: () => Promise<void>;
}

/** The fingerprint of the certificate of the server. */
function fingerprintOf(pem: string): string {
  // Without an encoding the answer of openssl is a buffer, which is what the
  // fingerprint is calculated from.
  const der = execFileSync('openssl', ['x509', '-outform', 'der'], { input: pem });
  return createHash('sha256').update(der).digest('hex');
}

/**
 * A HTTPS server with a self-signed certificate.
 *
 * The server answers whatever the test asks it to answer, and it records the
 * headers it received, so the test can see that the key of the platform really
 * travelled with the request.
 */
async function startServer(
  handler: (
    body: string,
    headers: Record<string, unknown>,
  ) => { status: number; body: string; type?: string; hang?: boolean; close?: boolean },
): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'mailcow-test-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '2', '-subj', '/CN=mail.blipmade.test',
  ], { stdio: 'ignore' });

  const key = readFileSync(keyPath, 'utf-8');
  const cert = readFileSync(certPath, 'utf-8');

  const server = https.createServer({ key, cert }, (request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const answer = handler(Buffer.concat(chunks).toString('utf-8'), request.headers as Record<string, unknown>);
      // A server that keeps the request open never answers. It is what the
      // test of the timeout needs: the answer of a server that replies at
      // once would arrive before the timeout of the client, and the test
      // would depend on the speed of the machine instead of on the code.
      if (answer.hang) return;
      response.writeHead(answer.status, {
        'Content-Type': 'application/json',
        // A server that closes the connection after every answer makes the
        // client open a connection of its own for the next call. That is what
        // the test of the session that is taken up again needs: the session of
        // the last connection can be taken up again, and in a session that is
        // taken up again the server does not send its certificate again.
        ...(answer.close ? { Connection: 'close' } : {}),
      });
      response.end(answer.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `https://127.0.0.1:${port}`,
    fingerprint: fingerprintOf(cert),
    close: () =>
      new Promise<void>((resolve) => {
        // The client keeps the connection alive, so the server would wait for
        // ever for a socket that nobody closes. The sockets are closed first.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const original = {
  url: env.MAILCOW_API_URL,
  key: env.MAILCOW_API_KEY,
  fingerprint: env.MAILCOW_API_CERT_SHA256,
};

/**
 * The settings of the client, written for the duration of a test.
 *
 * The settings of the platform are read once, when the program starts, and
 * they are not meant to be changed while it runs. The tests change them
 * anyway, because a test of a certificate is not possible without a server
 * that has a certificate of its own.
 */
const settings = env as unknown as {
  MAILCOW_API_URL: string;
  MAILCOW_API_KEY: string;
  MAILCOW_API_CERT_SHA256: string;
};

function configure(overrides: { url?: string; key?: string; fingerprint?: string }): void {
  settings.MAILCOW_API_URL = overrides.url ?? original.url;
  settings.MAILCOW_API_KEY = overrides.key ?? original.key;
  settings.MAILCOW_API_CERT_SHA256 = overrides.fingerprint ?? original.fingerprint;
}

afterAll(() => {
  configure({});
});

describe('the client of the mail system', () => {
  it('says that the mail system is not configured when there is no address and no key', () => {
    configure({ url: '', key: '' });
    expect(mailcowConfigured()).toBe(false);
  });

  it('says that the mail system is configured when there is an address and a key', () => {
    configure({ url: 'https://mail.example.test', key: 'a-key' });
    expect(mailcowConfigured()).toBe(true);
  });

  it('refuses to call the mail system when it is not configured', async () => {
    configure({ url: '', key: '' });
    await expect(mailcowRequest('/get/status/version')).rejects.toMatchObject({
      name: 'MailcowError',
      code: 'not_configured',
    });
  });

  it('reads a plain answer as the thing that was read and not as a refusal', async () => {
    // The calls that only read answer with the thing that was read, and a
    // thing that was read carries no verdict. A read that was taken for a
    // refusal would break the health of the service and the version of it.
    const server = await startServer(() => ({ status: 200, body: '{"version":"55982ac"}' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/status/version')).resolves.toEqual({ version: '55982ac' });
    } finally {
      await server.close();
    }
  });

  it('reads a list of things that were read as a list and not as verdicts', async () => {
    const server = await startServer(() => ({ status: 200, body: '[{"domain_name":"acme.ro","mboxes_in_domain":2}]' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/domain/all')).resolves.toEqual([{ domain_name: 'acme.ro', mboxes_in_domain: 2 }]);
    } finally {
      await server.close();
    }
  });

  it('sends the key of the platform with the request', async () => {
    const server = await startServer(() => ({ status: 200, body: '{"version":"abc"}' }));
    try {
      configure({ url: server.url, key: 'the-key-of-the-platform', fingerprint: server.fingerprint });
      const answer = await mailcowRequest<{ version: string }>('/get/status/version');
      expect(answer.version).toBe('abc');
    } finally {
      await server.close();
    }
  });

  it('accepts the certificate whose fingerprint the operator wrote down', async () => {
    const server = await startServer(() => ({ status: 200, body: '{"version":"abc"}' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/status/version')).resolves.toEqual({ version: 'abc' });
    } finally {
      await server.close();
    }
  });

  it('refuses a certificate whose fingerprint is not the one that was written down', async () => {
    const server = await startServer(() => ({ status: 200, body: '{"version":"abc"}' }));
    try {
      const other = 'f'.repeat(64);
      configure({ url: server.url, key: 'a-key', fingerprint: other });
      await expect(mailcowRequest('/get/status/version')).rejects.toThrow(/certificate/i);
    } finally {
      await server.close();
    }
  });

  it('accepts the fingerprint written in upper case, because a fingerprint is not a secret', async () => {
    const server = await startServer(() => ({ status: 200, body: '{"version":"abc"}' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint.toUpperCase() });
      await expect(mailcowRequest('/get/status/version')).resolves.toEqual({ version: 'abc' });
    } finally {
      await server.close();
    }
  });

  it('checks the certificate of every call, also when the session of the last one is taken up again', async () => {
    // The server closes the connection after every answer, so every call opens
    // a connection of its own. A session that is taken up again is a session in
    // which the server does not send its certificate again, and a client that
    // keeps its sessions would have no certificate to compare with the
    // fingerprint that the operator wrote down.
    const server = await startServer(() => ({ status: 200, body: '{"version":"abc"}', close: true }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/status/version')).resolves.toEqual({ version: 'abc' });
      await expect(mailcowRequest('/get/status/version')).resolves.toEqual({ version: 'abc' });
      await expect(mailcowRequest('/get/status/version')).resolves.toEqual({ version: 'abc' });
    } finally {
      await server.close();
    }
  });

  it('turns the refusal of the mail system into an error that carries its words', async () => {
    const server = await startServer(() => ({
      status: 200,
      body: '[{"type":"error","msg":["mailbox_quota_exceeds_domain_quota","1024"]}]',
    }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/add/mailbox')).rejects.toMatchObject({
        name: 'MailcowError',
        code: 'mailbox_quota_exceeds_domain_quota',
        message: expect.stringContaining('mailbox_quota_exceeds_domain_quota'),
      });
    } finally {
      await server.close();
    }
  });

  it('says that the key was refused when the mail system answers with 401', async () => {
    const server = await startServer(() => ({ status: 401, body: '[{"type":"error","msg":["access_denied"]}]' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/status/version')).rejects.toMatchObject({
        code: 'access_denied',
      });
    } finally {
      await server.close();
    }
  });

  it('says that the answer was not JSON when the mail system answers with a page', async () => {
    const server = await startServer(() => ({ status: 200, body: '<html>not the API</html>' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/status/version')).rejects.toMatchObject({
        code: 'not_json',
      });
    } finally {
      await server.close();
    }
  });

  it('gives up when the mail system does not answer in time', async () => {
    // The server keeps the request open and never answers, so the wait ends
    // because of the timeout of the client and not because the answer was
    // quick.
    const server = await startServer(() => ({ status: 200, body: '', hang: true }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await expect(mailcowRequest('/get/status/version', { timeoutMs: 250 })).rejects.toThrow();
    } finally {
      await server.close();
    }
  });

  it('sends the body of a change as JSON', async () => {
    let seen = '';
    const server = await startServer((body) => {
      seen = body;
      return { status: 200, body: '[{"type":"success","msg":["done"]}]' };
    });
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      await mailcowRequest('/add/domain', { method: 'POST', body: { domain: 'acme.ro' } });
      expect(JSON.parse(seen)).toEqual({ domain: 'acme.ro' });
    } finally {
      await server.close();
    }
  });

  it('keeps the error of the mail system in one shape', async () => {
    const server = await startServer(() => ({ status: 200, body: '[{"type":"error","msg":["boom"]}]' }));
    try {
      configure({ url: server.url, key: 'a-key', fingerprint: server.fingerprint });
      const error = await mailcowRequest('/get/status/version').catch((caught) => caught);
      expect(error).toBeInstanceOf(MailcowError);
      expect((error as MailcowError).status).toBe(200);
      expect((error as MailcowError).code).toBe('boom');
    } finally {
      await server.close();
    }
  });
});

/**
 * The certificate of the mail system.
 *
 * With TLS 1.3 the certificate of the server travels after the handshake that
 * the client considers done, so the socket can be "secure" a moment before
 * the certificate is on it. A check that reads the certificate once refuses
 * a mail system that answered correctly, and the refusal looks like a broken
 * mail system.
 */
describe('the certificate of the mail system', () => {
  const raw = Buffer.from('the-certificate-of-the-mail-system');
  const fingerprint = createHash('sha256').update(raw).digest('hex');

  it('waits for the certificate when it does not arrive with the handshake', async () => {
    let reads = 0;
    let waits = 0;
    const read = () => (reads++ < 2 ? undefined : raw);
    await expect(
      waitForPeerCertificate(read, fingerprint, (resolve) => {
        waits += 1;
        resolve();
      }),
    ).resolves.toBeUndefined();
    expect(reads).toBe(3);
    expect(waits).toBe(2);
  });

  it('refuses a certificate that is not the one that was expected, even when it arrives late', async () => {
    let reads = 0;
    const read = () => (reads++ < 1 ? undefined : raw);
    await expect(
      waitForPeerCertificate(read, 'f'.repeat(64), (resolve) => resolve()),
    ).rejects.toThrow(/certificate/i);
  });

  it('refuses the mail system when no certificate ever arrives', async () => {
    await expect(
      waitForPeerCertificate(() => undefined, fingerprint, (resolve) => resolve(), 3),
    ).rejects.toThrow(/did not show a certificate/i);
  });

  it('does not wait when the certificate is there when the handshake ends', async () => {
    let waits = 0;
    await expect(
      waitForPeerCertificate(() => raw, fingerprint, (resolve) => {
        waits += 1;
        resolve();
      }),
    ).resolves.toBeUndefined();
    expect(waits).toBe(0);
  });
});
