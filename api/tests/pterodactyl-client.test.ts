import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import {
  clientApiAvailable,
  clientApiKeyIsUsable,
  clientToken,
  deleteFile,
  listFiles,
  parseFileContents,
  parseFileList,
  parseResources,
  writeFile,
} from '../src/services/pterodactyl/client.js';

/**
 * The panel is never contacted. The adapters are pure functions over the
 * JSON:API envelope and the requests are checked against a stubbed fetch.
 */

const ORIGINAL = {
  PTERODACTYL_URL: env.PTERODACTYL_URL,
  PTERODACTYL_CLIENT_KEY: env.PTERODACTYL_CLIENT_KEY,
  PTERODACTYL_APP_KEY: env.PTERODACTYL_APP_KEY,
};

/** The environment is frozen for the type checker, but writable at runtime. */
function setEnv(key: keyof typeof ORIGINAL, value: string): void {
  Object.defineProperty(env, key, { value, configurable: true, writable: true, enumerable: true });
}

function stubFetch(payload?: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: URL, _init?: RequestInit) =>
      new Response(payload === undefined ? '' : JSON.stringify(payload), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  setEnv('PTERODACTYL_URL', 'https://panel.example.test');
  setEnv('PTERODACTYL_CLIENT_KEY', '');
  setEnv('PTERODACTYL_APP_KEY', 'ptla_admin_key');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  setEnv('PTERODACTYL_URL', ORIGINAL.PTERODACTYL_URL);
  setEnv('PTERODACTYL_CLIENT_KEY', ORIGINAL.PTERODACTYL_CLIENT_KEY);
  setEnv('PTERODACTYL_APP_KEY', ORIGINAL.PTERODACTYL_APP_KEY);
});

describe('pterodactyl client adapters', () => {
  it('unwraps the file list into a flat array', () => {
    const files = parseFileList({
      object: 'file_list',
      data: [
        {
          object: 'file',
          attributes: {
            name: 'server.properties',
            created_at: '2024-01-01T00:00:00+00:00',
            modified_at: '2024-01-02T00:00:00+00:00',
            mode: '-rw-r--r--',
            is_directory: false,
            is_file: true,
            is_symlink: false,
            size: 42,
          },
        },
        {
          object: 'file',
          attributes: {
            name: 'logs',
            created_at: '2024-01-01T00:00:00+00:00',
            modified_at: '2024-01-03T00:00:00+00:00',
            mode: 'drwxr-xr-x',
            is_directory: true,
            is_file: false,
            is_symlink: false,
            size: 0,
          },
        },
      ],
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({
      name: 'server.properties',
      created_at: '2024-01-01T00:00:00+00:00',
      modified_at: '2024-01-02T00:00:00+00:00',
      size: 42,
      mode: '-rw-r--r--',
      is_directory: false,
      is_file: true,
      is_symlink: false,
    });
    expect(files[1]?.name).toBe('logs');
    expect(files[1]?.is_directory).toBe(true);
  });

  it('reads the resource usage from the attributes', () => {
    const resources = parseResources({
      object: 'stats',
      attributes: {
        state: 'running',
        current_state: 'running',
        is_suspended: false,
        cpu_absolute: 12.5,
        memory_bytes: 588701696,
        network: { rx: 694220, tx: 337090 },
        disk: { used: 130156361 },
        uptime: 3600,
      },
    });

    expect(resources.state).toBe('running');
    expect(resources.is_suspended).toBe(false);
    expect(resources.cpu_absolute).toBe(12.5);
    expect(resources.memory_bytes).toBe(588701696);
    expect(resources.network).toEqual({ rx: 694220, tx: 337090 });
    expect(resources.disk).toEqual({ used: 130156361 });
    expect(resources.uptime).toBe(3600);
  });

  it('falls back to the state of the attributes', () => {
    const resources = parseResources({
      object: 'stats',
      attributes: { state: 'stopped', memory_bytes: 0, network: {}, disk: {}, uptime: 0 },
    });

    expect(resources.state).toBe('stopped');
    expect(resources.network).toEqual({ rx: 0, tx: 0 });
    expect(resources.disk).toEqual({ used: 0 });
  });

  it('reads the file contents from the attributes', () => {
    const contents = parseFileContents({
      object: 'file_contents',
      attributes: { content: 'hello world', encoding: 'utf-8' },
    });

    expect(contents).toEqual({ content: 'hello world', encoding: 'utf-8' });
  });
});

describe('pterodactyl client credential', () => {
  it('is not available without a client key', () => {
    setEnv('PTERODACTYL_CLIENT_KEY', '');
    expect(clientApiAvailable()).toBe(false);
    expect(clientApiKeyIsUsable()).toBe(false);
  });

  it('is not available when the key is not a client key', () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptla_admin_key');
    expect(clientApiAvailable()).toBe(false);
    expect(clientApiKeyIsUsable()).toBe(false);
  });

  it('is available for a client key', () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptc_customer_key');
    expect(clientApiAvailable()).toBe(true);
    expect(clientApiKeyIsUsable()).toBe(true);
  });

  it('names the client credential when the key is not a client key', () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptla_admin_key');

    expect(() => clientToken(4)).toThrow(/Client API key/);
  });

  it('never returns the application key', () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptla_admin_key');
    setEnv('PTERODACTYL_APP_KEY', 'ptla_admin_key');

    expect(() => clientToken(4)).toThrow();
    expect(() => clientToken('4')).toThrow();
  });

  it('returns the client key', () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptc_customer_key');

    expect(clientToken(4)).toBe('ptc_customer_key');
    expect(clientToken('4', ['server.control.console'])).toBe('ptc_customer_key');
  });
});

describe('pterodactyl client requests', () => {
  it('lists the files through the list endpoint', async () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptc_customer_key');
    const fetchMock = stubFetch({ object: 'file_list', data: [] });

    await listFiles('ptc_customer_key', 'uuid-1', '/logs');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/client/servers/uuid-1/files/list');
    expect(new URL(String(url)).searchParams.get('directory')).toBe('/logs');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ptc_customer_key');
  });

  it('deletes a file with a POST to the delete endpoint', async () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptc_customer_key');
    const fetchMock = stubFetch();

    await deleteFile('ptc_customer_key', 'uuid-1', '/logs/app.log');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/client/servers/uuid-1/files/delete');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ root: '/logs', files: ['app.log'] });
  });

  it('writes a file with the raw content as the body', async () => {
    setEnv('PTERODACTYL_CLIENT_KEY', 'ptc_customer_key');
    const fetchMock = stubFetch();

    await writeFile('ptc_customer_key', 'uuid-1', '/logs/app.log', 'hello world');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/client/servers/uuid-1/files/write');
    expect(new URL(String(url)).searchParams.get('file')).toBe('/logs/app.log');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('hello world');
  });

  it('refuses to call the panel without a client key', async () => {
    const fetchMock = stubFetch();

    await expect(writeFile('ptla_admin_key', 'uuid-1', '/logs/app.log', 'hello world')).rejects.toThrow(
      /Client API key/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
