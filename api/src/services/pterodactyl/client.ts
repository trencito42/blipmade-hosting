import jwt from 'jsonwebtoken';
import { env } from '../../env.js';
import { unavailable } from '../../lib/errors.js';

const MEDIA = 'Application/vnd.pterodactyl.v1+json';

/**
 * Pterodactyl Client API.
 *
 * The Application API key is administrative and grants no client privileges, so
 * every customer-facing call (power, files, console, resources) is signed with
 * the separate **Client API key**:
 *
 *   - a client key issued by the panel (`ptc_...`) is sent as it is;
 *   - a shared secret is signed as an HS256 JWT with the payload
 *     { user_id: "<pterodactyl user id>", perms: "*" }.
 *
 * The token is generated on the server and never sent to the browser.
 */

export function clientApiAvailable(): boolean {
  return env.pterodactylClientEnabled;
}

export function clientToken(userId: string | number, perms: '*' | string[] = '*'): string {
  if (!env.pterodactylClientEnabled) {
    throw unavailable('The Pterodactyl Client API key is not configured on this environment.');
  }
  const key = env.PTERODACTYL_CLIENT_KEY;
  // A key issued by the panel is already a bearer token.
  if (key.startsWith('ptc_')) return key;
  return jwt.sign({ user_id: String(userId), perms }, key, {
    algorithm: 'HS256',
    expiresIn: '10m',
  });
}

export class ClientApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = 'ClientApiError';
    this.status = status;
    this.body = body;
  }
}

async function clientRequest<T>(
  method: string,
  path: string,
  options: { token: string; body?: unknown; timeoutMs?: number; query?: Record<string, string | number | undefined> },
): Promise<T> {
  if (!env.pterodactylClientEnabled) {
    throw unavailable('The Pterodactyl Client API key is not configured on this environment.');
  }

  const url = new URL(`${env.PTERODACTYL_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: MEDIA,
        'Content-Type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ClientApiError(
        response.status,
        text,
        `Pterodactyl client ${method} ${path} failed with ${response.status}.`,
      );
    }
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof ClientApiError) throw error;
    throw unavailable('The Pterodactyl client API could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

export interface ClientServer {
  uuid: string;
  identifier: string;
  server_name: string;
  state: string;
  is_suspended: boolean;
  current_state: string;
  limits: { memory: number; swap: number; disk: number; io: number; cpu: number };
  features: string[];
  created_at: string;
}

export interface ClientResources {
  state: string;
  is_suspended: boolean;
  cpu_absolute: number;
  memory_bytes: number;
  network: { rx: number; tx: number };
  disk: { used: number };
  uptime: number;
}

export interface ClientFile {
  name: string;
  created_at: string;
  modified_at: string;
  size: number;
  mode: string;
  is_directory: boolean;
  is_file: boolean;
  is_symlink: boolean;
}

export interface ClientBackup {
  uuid: string;
  name: string;
  size: number;
  created_at: string;
  is_locked: boolean;
}

export function getServer(token: string, uuid: string) {
  return clientRequest<ClientServer>('GET', `/api/client/servers/${uuid}`, { token });
}

export function getResources(token: string, uuid: string) {
  return clientRequest<ClientResources>('GET', `/api/client/servers/${uuid}/resources`, { token });
}

export function sendPower(token: string, uuid: string, signal: 'start' | 'stop' | 'restart' | 'kill') {
  return clientRequest('POST', `/api/client/servers/${uuid}/power`, { token, body: { signal } });
}

export function listFiles(token: string, uuid: string, path = '/') {
  return clientRequest<ClientFile[]>('GET', `/api/client/servers/${uuid}/files`, {
    token,
    query: { path },
  });
}

export function readFile(token: string, uuid: string, path: string) {
  return clientRequest<{ content: string; encoding: string }>('GET', `/api/client/servers/${uuid}/files/content`, {
    token,
    query: { path },
  });
}

export function writeFile(token: string, uuid: string, path: string, content: string) {
  return clientRequest('POST', `/api/client/servers/${uuid}/files/content`, {
    token,
    body: { path, content, encoding: 'utf-8' },
  });
}

export function deleteFile(token: string, uuid: string, path: string) {
  return clientRequest('DELETE', `/api/client/servers/${uuid}/files/content`, {
    token,
    query: { path },
  });
}

export function listBackups(token: string, uuid: string) {
  return clientRequest<ClientBackup[]>('GET', `/api/client/servers/${uuid}/backups`, { token });
}

export function createBackup(token: string, uuid: string, payload: { name: string; locked: boolean }) {
  return clientRequest('POST', `/api/client/servers/${uuid}/backups`, { token, body: payload });
}

/**
 * Console websocket credentials. The socket URL and token stay on the server;
 * the API relays the stream to the browser.
 */
export async function consoleWebsocket(token: string, uuid: string): Promise<{ socket: string; token: string }> {
  const result = await clientRequest<{ token: string; socket: string }>(
    'GET',
    `/api/client/servers/${uuid}/websocket`,
    { token },
  );
  return result;
}
