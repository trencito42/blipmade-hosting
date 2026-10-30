import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Readable } from 'node:stream';
import { env } from '../src/env.js';
import {
  ClientApiError, downloadBackup, downloadFile, downloadHostAllowed,
} from '../src/services/pterodactyl/client.js';

const config = env as unknown as {
  PTERODACTYL_URL: string;
  PTERODACTYL_DOWNLOAD_HOSTS: string;
  PANEL_NODE_ADDRESSES: string;
};
const original = {
  url: config.PTERODACTYL_URL,
  hosts: config.PTERODACTYL_DOWNLOAD_HOSTS,
  nodes: config.PANEL_NODE_ADDRESSES,
};
const TOKEN = `ptlc_${'x'.repeat(44)}`;

afterEach(() => {
  config.PTERODACTYL_URL = original.url;
  config.PTERODACTYL_DOWNLOAD_HOSTS = original.hosts;
  config.PANEL_NODE_ADDRESSES = original.nodes;
  vi.unstubAllGlobals();
});

async function bytes(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}
function signed(address: string) {
  return new Response(JSON.stringify({
    object: 'signed_url', attributes: { url: address },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function setup() {
  config.PTERODACTYL_URL = 'https://panel.example.test';
  config.PTERODACTYL_DOWNLOAD_HOSTS = 'node.example.test';
  config.PANEL_NODE_ADDRESSES = '';
}

describe('signed Pterodactyl file and backup downloads', () => {
  it('streams file bytes without buffering the file or revealing signed URL', async () => {
    setup();
    const payload = Buffer.from('binary-file\x00-safe');
    const file = new Response(new Uint8Array(payload));
    file.arrayBuffer = vi.fn(async () => { throw new Error('Must not buffer a whole file.'); });
    const fetchMock = vi.fn(async (input: string | URL, _options?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://panel.example.test/')) {
        return signed('https://node.example.test/download/file?token=private-signed-token');
      }
      if (url.startsWith('https://node.example.test/')) return file;
      throw new Error('Unexpected host');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadFile(TOKEN, 'server-uuid', '/logs/test.bin');
    expect(await bytes(result)).toEqual(payload);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]!;
    const second = fetchMock.mock.calls[1]!;
    expect(String(first[0])).toContain('/files/download?file=%2Flogs%2Ftest.bin');
    expect((first[1] as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect((second[1] as RequestInit).headers).toBeUndefined();
  });

  it('streams actual backup bytes after resolving the signed_url envelope', async () => {
    setup();
    const backup = Buffer.from('this-is-the-backup-tarball');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      return String(input).startsWith('https://panel.example.test')
        ? signed('https://node.example.test/download/backup?token=secret')
        : new Response(new Uint8Array(backup));
    }));
    expect(await bytes(await downloadBackup(TOKEN, 'server-uuid', 'backup-uuid'))).toEqual(backup);
  });

  it('refuses unauthorized panel responses and invalid client credentials', async () => {
    setup();
    const network = vi.fn(async () => new Response(
      JSON.stringify({ errors: [{ detail: 'Forbidden' }] }), { status: 403 },
    ));
    vi.stubGlobal('fetch', network);
    await expect(downloadBackup(TOKEN, 'server-uuid', 'backup-uuid')).rejects.toBeInstanceOf(ClientApiError);
    await expect(downloadFile('ptla_admin-key', 'server-uuid', '/x')).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('refuses SSRF targets and redirecting signed links to untrusted networks', async () => {
    setup();
    for (const address of [
      'http://node.example.test/download', 'http://127.0.0.1/admin',
      'https://localhost/', 'https://node.example.test.evil.test/x',
      'file:///etc/passwd', 'https://user:pass@node.example.test/x',
      'https://169.254.169.254/latest/meta-data/',
    ]) expect(downloadHostAllowed(address)).toBe(false);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://panel.example.test')) {
        return signed('https://node.example.test/download/backup?token=secret');
      }
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://127.0.0.1/admin' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadBackup(TOKEN, 'server-uuid', 'backup-uuid')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts configured node hosts without accepting arbitrary subdomains', () => {
    setup();
    config.PTERODACTYL_DOWNLOAD_HOSTS = '';
    config.PANEL_NODE_ADDRESSES = 'node.example.test=10.77.0.11:8080';
    expect(downloadHostAllowed('https://node.example.test/download/file?token=secret')).toBe(true);
    expect(downloadHostAllowed('https://evil.node.example.test/download/file')).toBe(false);
  });
});
