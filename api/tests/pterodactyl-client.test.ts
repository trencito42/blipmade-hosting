import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import {
  clientApiAvailable,
  clientApiKeyIsUsable,
  clientToken,
  deleteFile,
  listFiles,
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
  PANEL_KEYMINT_URL: env.PANEL_KEYMINT_URL,
  PANEL_KEYMINT_SECRET: env.PANEL_KEYMINT_SECRET,
  PTERODACTYL_APP_KEY: env.PTERODACTYL_APP_KEY,
};

/**
 * A client key of the panel: the identifier of sixteen characters and the
 * secret of thirty-two, the same shape the panel issues.
 */
const CLIENT_KEY = `ptlc_${'a'.repeat(44)}`;

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
  setEnv('PANEL_KEYMINT_URL', '');
  setEnv('PANEL_KEYMINT_SECRET', '');
  setEnv('PTERODACTYL_APP_KEY', 'ptla_admin_key');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  setEnv('PTERODACTYL_URL', ORIGINAL.PTERODACTYL_URL);
  setEnv('PANEL_KEYMINT_URL', ORIGINAL.PANEL_KEYMINT_URL);
  setEnv('PANEL_KEYMINT_SECRET', ORIGINAL.PANEL_KEYMINT_SECRET);
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

  it('reads the uptime of a container from the place the panel puts it', () => {
    // The panel of the production nests the counters below "resources".
    const resources = parseResources({
      object: 'stats',
      attributes: {
        current_state: 'starting',
        is_suspended: false,
        resources: {
          memory_bytes: 37318656,
          cpu_absolute: 0.005,
          disk_bytes: 3692,
          network_rx_bytes: 64281,
          network_tx_bytes: 28412,
          uptime: 89565736,
        },
      },
    });

    expect(resources.uptime).toBe(89565736);
    expect(resources.memory_bytes).toBe(37318656);
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

});

describe('pterodactyl client credential', () => {
  it('is not usable when the key is not a client key', () => {
    expect(clientApiKeyIsUsable('ptla_admin_key')).toBe(false);
    expect(clientApiKeyIsUsable('')).toBe(false);
    expect(clientApiKeyIsUsable(null)).toBe(false);
  });

  it('is usable for a client key of the panel', () => {
    expect(clientApiKeyIsUsable(CLIENT_KEY)).toBe(true);
  });

  it('is not available while the panel cannot issue a key', () => {
    setEnv('PANEL_KEYMINT_URL', '');
    setEnv('PANEL_KEYMINT_SECRET', '');
    expect(clientApiAvailable()).toBe(false);
  });

  it('is available when the panel can issue a key', () => {
    setEnv('PANEL_KEYMINT_URL', 'https://panel.example.test/api/blipmade/keymint');
    setEnv('PANEL_KEYMINT_SECRET', 'x'.repeat(32));
    expect(clientApiAvailable()).toBe(true);
  });

  it('names the client credential when the key is not a client key', () => {
    expect(() => clientToken('ptla_admin_key')).toThrow(/client key/i);
  });

  it('never returns the application key', () => {
    setEnv('PTERODACTYL_APP_KEY', 'ptla_admin_key');

    expect(() => clientToken('ptla_admin_key')).toThrow();
    expect(() => clientToken('4')).toThrow();
  });

  it('returns the client key of the customer', () => {
    expect(clientToken(CLIENT_KEY)).toBe(CLIENT_KEY);
  });
});

describe('pterodactyl client requests', () => {
  it('lists the files through the list endpoint', async () => {
    const fetchMock = stubFetch({ object: 'file_list', data: [] });

    await listFiles(CLIENT_KEY, 'uuid-1', '/logs');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/client/servers/uuid-1/files/list');
    expect(new URL(String(url)).searchParams.get('directory')).toBe('/logs');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${CLIENT_KEY}`);
  });

  it('deletes a file with a POST to the delete endpoint', async () => {
    const fetchMock = stubFetch();

    await deleteFile(CLIENT_KEY, 'uuid-1', '/logs/app.log');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/client/servers/uuid-1/files/delete');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ root: '/logs', files: ['app.log'] });
  });

  it('writes a file with the raw content as the body', async () => {
    const fetchMock = stubFetch();

    await writeFile(CLIENT_KEY, 'uuid-1', '/logs/app.log', 'hello world');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/client/servers/uuid-1/files/write');
    expect(new URL(String(url)).searchParams.get('file')).toBe('/logs/app.log');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('hello world');
  });

  it('refuses to call the panel without a client key', async () => {
    const fetchMock = stubFetch();

    await expect(writeFile('ptla_admin_key', 'uuid-1', '/logs/app.log', 'hello world')).rejects.toThrow(
      /client key/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
