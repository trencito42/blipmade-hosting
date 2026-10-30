import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Readable } from 'node:stream';
import { env } from '../src/env.js';
import { ClientApiError, downloadBackup, downloadFile } from '../src/services/pterodactyl/client.js';

const config = env as unknown as { PTERODACTYL_URL: string };
const oldUrl = config.PTERODACTYL_URL;
const TOKEN = `ptlc_${'x'.repeat(44)}`;

afterEach(() => {
  config.PTERODACTYL_URL = oldUrl;
  vi.unstubAllGlobals();
});

async function bytes(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

describe('Pterodactyl download streaming', () => {
  it('streams a file without invoking Response.arrayBuffer()', async () => {
    config.PTERODACTYL_URL = 'https://panel.example.test';
    const payload = Buffer.from('binary-file\x00-and-safe');
    const response = new Response(payload);
    response.arrayBuffer = vi.fn(async () => { throw new Error('Must not buffer a full file.'); });
    const calls = vi.fn(async (_input: string | URL, _options?: RequestInit) => response);
    vi.stubGlobal('fetch', calls);

    const stream = await downloadFile(TOKEN, 'server-uuid', '/logs/test.bin');
    expect(await bytes(stream)).toEqual(payload);
    expect(response.arrayBuffer).not.toHaveBeenCalled();
    const [url, options] = calls.mock.calls[0]!;
    expect(String(url)).toContain('/api/client/servers/server-uuid/files/contents?file=%2Flogs%2Ftest.bin');
    expect((options as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it('streams backup bytes and rejects upstream authorization failures', async () => {
    config.PTERODACTYL_URL = 'https://panel.example.test';
    const calls = vi.fn(async () => new Response('backup bytes', { status: 200 }));
    vi.stubGlobal('fetch', calls);
    expect((await bytes(await downloadBackup(TOKEN, 'server-uuid', 'backup-uuid'))).toString()).toBe('backup bytes');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ errors: [{ detail: 'Forbidden' }] }),
      { status: 403 },
    )));
    await expect(downloadBackup(TOKEN, 'server-uuid', 'backup-uuid')).rejects.toBeInstanceOf(ClientApiError);
  });

  it('never starts an upstream download using a fake client token', async () => {
    config.PTERODACTYL_URL = 'https://panel.example.test';
    const calls = vi.fn();
    vi.stubGlobal('fetch', calls);
    await expect(downloadFile('ptla_admin-key', 'server-uuid', '/x')).rejects.toThrow();
    expect(calls).not.toHaveBeenCalled();
  });
});
