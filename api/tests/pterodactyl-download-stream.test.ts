import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Readable } from 'node:stream';
import { env } from '../src/env.js';
import { ClientApiError, downloadBackup, downloadFile, downloadHostAllowed } from '../src/services/pterodactyl/client.js';

const config = env as unknown as { PTERODACTYL_URL: string; PTERODACTYL_DOWNLOAD_HOSTS: string; PANEL_NODE_ADDRESSES: string };
const original = { url: config.PTERODACTYL_URL, hosts: config.PTERODACTYL_DOWNLOAD_HOSTS, nodes: config.PANEL_NODE_ADDRESSES };
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
  return new Response(JSON.stringify({ object: 'signed_url', attributes: { url: address } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function setup() {
  config.PTERODACTYL_URL = 'https://panel.example.test';
  config.PTERODACTYL_DOWNLOAD_HOSTS = 'node.example.test';
  config.PANEL_NODE_ADDRESSES = '';
}

describe('signed Pterodactyl file and backup downloads', () => {
  it('streams file bytes without buffering or forwarding the panel credential', async () => {
    setup();
    const payload = Buffer.from('binary-file\x00-safe');
    const file = new Response(new Uint8Array(payload));
    const buffered = vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => { throw new Error('Must not buffer a whole file.'); });
    const fetchMock = vi.fn(async (input: string | URL, _options?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://panel.example.test/')) return signed('https://node.example.test/download/file?token=private');
      if (url.startsWith('https://node.example.test/')) return file;
      throw new Error('Unexpected host');
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await bytes(await downloadFile(TOKEN, 'server-uuid', '/logs/test.bin'))).toEqual(payload);
    expect(buffered).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/files/download?file=%2Flogs%2Ftest.bin');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toBeUndefined();
  });

  it('streams actual backup bytes after resolving the signed envelope', async () => {
    setup();
    const backup = Buffer.from('this-is-the-backup-tarball');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).startsWith('https://panel.example.test')
      ? signed('https://node.example.test/download/backup?token=secret')
      : new Response(new Uint8Array(backup))));
    expect(await bytes(await downloadBackup(TOKEN, 'server-uuid', 'backup-uuid'))).toEqual(backup);
  });

  it('rejects upstream authorization failure and fake client credentials', async () => {
    setup();
    const network = vi.fn(async () => new Response(JSON.stringify({ errors: [{ detail: 'Forbidden' }] }), { status: 403 }));
    vi.stubGlobal('fetch', network);
    await expect(downloadBackup(TOKEN, 'server-uuid', 'backup-uuid')).rejects.toBeInstanceOf(ClientApiError);
    await expect(downloadFile('ptla_admin-key', 'server-uuid', '/x')).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('rejects SSRF targets and redirects to unlisted hosts', async () => {
    setup();
    for (const address of [
      'http://node.example.test/download', 'http://127.0.0.1/admin', 'https://localhost/',
      'https://node.example.test.evil.test/x', 'file:///etc/passwd',
      'https://user:pass@node.example.test/x', 'https://169.254.169.254/latest/meta-data/',
    ]) expect(downloadHostAllowed(address)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).startsWith('https://panel.example.test')
      ? signed('https://node.example.test/download/backup?token=secret')
      : new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/admin' } })));
    await expect(downloadBackup(TOKEN, 'server-uuid', 'backup-uuid')).rejects.toThrow();
  });

  it('accepts an exact configured node host but not a subdomain', () => {
    setup();
    config.PTERODACTYL_DOWNLOAD_HOSTS = '';
    config.PANEL_NODE_ADDRESSES = 'node.example.test=10.77.0.11:8080';
    expect(downloadHostAllowed('https://node.example.test/download/file?token=secret')).toBe(true);
    expect(downloadHostAllowed('https://evil.node.example.test/download/file')).toBe(false);
  });
});
