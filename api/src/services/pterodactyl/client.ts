/**
 * Pterodactyl Client API adapter (Pterodactyl 1.x).
 *
 * Credential strategy
 * -------------------
 * The panel issues two kinds of API key:
 *
 *   - the application key (`ptla_...`) is administrative. The panel rejects it
 *     on every client endpoint ("You are attempting to use an application API
 *     key on an endpoint that requires a client API key"), so it never reaches
 *     this module and is never returned by it.
 *   - the client key (`ptc_...`) is the only credential a client endpoint
 *     accepts.
 *
 * The intended end state is one panel-issued client key per customer account,
 * stored encrypted on the server (see `api/src/lib/secrets.ts` for
 * `encryptSecret` / `decryptSecret`) and looked up by the Pterodactyl user id.
 * Until that per-customer store exists, the single key configured in
 * `PTERODACTYL_CLIENT_KEY` is the interim fallback for every account.
 *
 * The key stays on the server: it is sent as a bearer token to the panel and
 * is never handed to the browser.
 *
 * The panel answers with a JSON:API style envelope (`{ object, attributes }`,
 * or `{ object, data: [{ object, attributes }] }` for a collection). The
 * adapters in this file unwrap that envelope, so the callers only ever see
 * the normalized shapes.
 *
 * Reference:
 *   - https://docs.pterodactyl.io/v1/api/client-server-file-manager/get-list-files
 *   - https://docs.pterodactyl.io/v1/api/client-server/get-resource-usage
 */

import { env } from '../../env.js';
import { unavailable } from '../../lib/errors.js';
import type {
  PteroBackupAttributes,
  PteroClientCollection,
  PteroClientServerAttributes,
  PteroFileAttributes,
  PteroFileContentsAttributes,
  PteroStatsAttributes,
} from './types.js';

const MEDIA = 'Application/vnd.pterodactyl.v1+json';
/** Prefix of a client API key issued by the panel. */
const CLIENT_KEY_PREFIX = 'ptc_';

/**
 * True when the configured credential is a panel-issued client key. The
 * application key is administrative and is rejected by the panel on every
 * client endpoint, so it is never a usable client credential.
 */
export function clientApiKeyIsUsable(): boolean {
  const key = env.PTERODACTYL_CLIENT_KEY;
  return typeof key === 'string' && key.startsWith(CLIENT_KEY_PREFIX);
}

/** True when the client API can be used at all on this environment. */
export function clientApiAvailable(): boolean {
  return clientApiKeyIsUsable();
}

/**
 * The bearer token for the client API.
 *
 * `userId` and `perms` are the seam for the per-customer key: the lookup by
 * the Pterodactyl user id lands here once the encrypted per-customer store
 * exists. Until then the configured client key is used for every account.
 */
export function clientToken(userId: string | number, perms: '*' | string[] = '*'): string {
  const key = requireClientConfig();
  // The parameters are part of the contract of the call sites and stay until
  // the per-customer lookup replaces the global key.
  void userId;
  void perms;
  return key;
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

/**
 * Fails with an actionable message when the client credential is missing or
 * is not a client key, or when the panel URL is missing. The application key
 * is never accepted here.
 */
function requireClientConfig(): string {
  const key = env.PTERODACTYL_CLIENT_KEY;
  if (!clientApiKeyIsUsable()) {
    throw unavailable(
      'The Pterodactyl Client API key is missing or invalid. PTERODACTYL_CLIENT_KEY must hold a panel-issued client key that starts with "ptc_"; the application key ("ptla_") is rejected by the client endpoints.',
    );
  }
  if (!env.PTERODACTYL_URL) {
    throw unavailable('The Pterodactyl panel URL is not configured (PTERODACTYL_URL).');
  }
  return key;
}

/** Turns the panel's error body into a readable message. */
function clientDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errors?: { detail?: string }[] };
    const detail = (parsed.errors ?? [])
      .map((error) => error.detail)
      .filter((text): text is string => Boolean(text))
      .join('; ');
    return detail || body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

interface ClientRequestOptions {
  token: string;
  /** Body that is sent as JSON. */
  body?: unknown;
  /** Body that is sent as it is, used by the file write endpoint. */
  rawBody?: string;
  timeoutMs?: number;
  query?: Record<string, string | number | undefined>;
}

async function clientRequest<T>(
  method: string,
  path: string,
  options: ClientRequestOptions,
): Promise<T> {
  requireClientConfig();
  // The panel refuses an application key on a client endpoint, so a token
  // that is not a client key never leaves the server.
  if (!options.token.startsWith(CLIENT_KEY_PREFIX)) {
    throw unavailable(
      'The Pterodactyl Client API key is missing or invalid. Only a panel-issued client key that starts with "ptc_" may be used on a client endpoint.',
    );
  }

  const url = new URL(`${env.PTERODACTYL_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
    Accept: MEDIA,
  };
  let body: string | undefined;
  if (options.rawBody !== undefined) {
    headers['Content-Type'] = 'text/plain; charset=utf-8';
    body = options.rawBody;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ClientApiError(
        response.status,
        text,
        `Pterodactyl client ${method} ${path} failed with ${response.status}. ${clientDetail(text)}`,
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

/** Unwraps the `attributes` of a JSON:API resource object. */
function resourceAttributes<T>(payload: unknown): T {
  const source = (payload ?? {}) as { attributes?: T };
  return (source.attributes ?? source) as T;
}

/** Unwraps the `data` of a JSON:API collection. */
function collectionEntries<A>(payload: unknown): { attributes: A }[] {
  const collection = payload as PteroClientCollection<A> | undefined;
  return Array.isArray(collection?.data) ? collection.data : [];
}

/**
 * Normalizes the file list of `GET /files/list` into a flat array.
 *
 * See https://docs.pterodactyl.io/v1/api/client-server-file-manager/get-list-files
 */
export function parseFileList(payload: unknown): ClientFile[] {
  return collectionEntries<PteroFileAttributes>(payload).map((entry) => {
    const attributes = entry?.attributes ?? ({} as PteroFileAttributes);
    const isFile = attributes.is_file === true;
    const isSymlink = attributes.is_symlink === true;
    return {
      name: String(attributes.name ?? ''),
      created_at: String(attributes.created_at ?? ''),
      modified_at: String(attributes.modified_at ?? ''),
      size: Number(attributes.size ?? 0),
      mode: String(attributes.mode ?? ''),
      is_directory: attributes.is_directory ?? (!isFile && !isSymlink),
      is_file: isFile,
      is_symlink: isSymlink,
    };
  });
}

/**
 * Normalizes the resource usage of `GET /resources`.
 *
 * See https://docs.pterodactyl.io/v1/api/client-server/get-resource-usage
 */
export function parseResources(payload: unknown): ClientResources {
  const attributes = resourceAttributes<PteroStatsAttributes>(payload);
  // Older panels nest the counters below "resources".
  const nested = attributes.resources ?? {};
  const network = attributes.network ?? {};
  const disk = attributes.disk ?? {};
  return {
    state: attributes.current_state ?? attributes.state ?? '',
    is_suspended: Boolean(attributes.is_suspended),
    cpu_absolute: attributes.cpu_absolute ?? nested.cpu_absolute ?? 0,
    memory_bytes: attributes.memory_bytes ?? nested.memory_bytes ?? 0,
    network: {
      rx: network.rx ?? nested.network_rx_bytes ?? 0,
      tx: network.tx ?? nested.network_tx_bytes ?? 0,
    },
    disk: {
      used: disk.used ?? nested.disk_bytes ?? 0,
    },
    uptime: attributes.uptime ?? 0,
  };
}

/** Normalizes the file contents of `GET /files/contents`. */
export function parseFileContents(payload: unknown): { content: string; encoding: string } {
  const attributes = resourceAttributes<PteroFileContentsAttributes>(payload);
  return {
    content: typeof attributes.content === 'string' ? attributes.content : '',
    encoding: typeof attributes.encoding === 'string' ? attributes.encoding : 'utf-8',
  };
}

/** Normalizes a backup of the backup list or of a created backup. */
export function parseBackup(payload: unknown): ClientBackup {
  const attributes = resourceAttributes<PteroBackupAttributes>(payload);
  return {
    uuid: String(attributes.uuid ?? ''),
    name: String(attributes.name ?? ''),
    size: Number(attributes.size ?? attributes.bytes ?? 0),
    created_at: String(attributes.created_at ?? ''),
    is_locked: Boolean(attributes.is_locked),
  };
}

/** Normalizes the backup list of `GET /backups`. */
export function parseBackups(payload: unknown): ClientBackup[] {
  return collectionEntries<PteroBackupAttributes>(payload).map((entry) => parseBackup(entry));
}

/** Normalizes the server object of `GET /servers/{uuid}`. */
export function parseServer(payload: unknown): ClientServer {
  const attributes = resourceAttributes<PteroClientServerAttributes>(payload);
  const limits = attributes.limits;
  return {
    uuid: String(attributes.uuid ?? ''),
    identifier: String(attributes.identifier ?? ''),
    server_name: String(attributes.server_name ?? attributes.name ?? ''),
    state: String(attributes.state ?? attributes.current_state ?? ''),
    is_suspended: Boolean(attributes.is_suspended),
    current_state: String(attributes.current_state ?? attributes.state ?? ''),
    limits: {
      memory: Number(limits?.memory ?? 0),
      swap: Number(limits?.swap ?? 0),
      disk: Number(limits?.disk ?? 0),
      io: Number(limits?.io ?? 0),
      cpu: Number(limits?.cpu ?? 0),
    },
    features: Array.isArray(attributes.features) ? attributes.features.map((feature) => String(feature)) : [],
    created_at: String(attributes.created_at ?? ''),
  };
}

/**
 * Normalizes the console credentials of `GET /websocket`. The panel answers
 * with `{ data: { token, socket } }`; the socket and the signed token stay on
 * the server.
 */
export function parseConsoleWebsocket(payload: unknown): { socket: string; token: string } {
  const source = (payload ?? {}) as {
    data?: { token?: string; socket?: string };
    token?: string;
    socket?: string;
  };
  const credentials = source.data ?? source;
  return {
    socket: String(credentials.socket ?? ''),
    token: String(credentials.token ?? ''),
  };
}

/**
 * Splits a path into the directory and the file names the delete endpoint
 * expects: `/logs/app.log` becomes `{ root: "/logs", files: ["app.log"] }`.
 */
function splitPath(path: string): { root: string; files: string[] } {
  const normalized = path.replace(/^\/+/, '');
  const separator = normalized.lastIndexOf('/');
  if (separator === -1) return { root: '/', files: [normalized] };
  const directory = normalized.slice(0, separator);
  const name = normalized.slice(separator + 1);
  if (!name) return { root: '/', files: [normalized] };
  return { root: directory ? `/${directory}` : '/', files: [name] };
}

export function getServer(token: string, uuid: string): Promise<ClientServer> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}`, { token }).then(parseServer);
}

export function getResources(token: string, uuid: string): Promise<ClientResources> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/resources`, { token }).then(parseResources);
}

export function sendPower(token: string, uuid: string, signal: 'start' | 'stop' | 'restart' | 'kill') {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/power`, { token, body: { signal } });
}

/**
 * Sends a command to the console of the server. The server has to be online,
 * the panel answers with a 502 otherwise.
 */
export function sendCommand(token: string, uuid: string, command: string) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/command`, { token, body: { command } });
}

export function listFiles(token: string, uuid: string, path = '/'): Promise<ClientFile[]> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/files/list`, {
    token,
    query: { directory: path },
  }).then(parseFileList);
}

export function readFile(token: string, uuid: string, path: string): Promise<{ content: string; encoding: string }> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/files/contents`, {
    token,
    query: { file: path },
  }).then(parseFileContents);
}

/**
 * Writes a file. The panel expects the content as the raw body of the
 * request, not as a JSON object.
 */
export function writeFile(token: string, uuid: string, path: string, content: string) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/files/write`, {
    token,
    query: { file: path },
    rawBody: content,
  });
}

/**
 * Deletes a file or a folder. The endpoint is a POST that takes the directory
 * and the names inside it.
 */
export function deleteFile(token: string, uuid: string, path: string) {
  const { root, files } = splitPath(path);
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/files/delete`, {
    token,
    body: { root, files },
  });
}

export function listBackups(token: string, uuid: string): Promise<ClientBackup[]> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/backups`, { token }).then(parseBackups);
}

export function createBackup(token: string, uuid: string, payload: { name: string; locked: boolean }): Promise<ClientBackup> {
  return clientRequest<unknown>('POST', `/api/client/servers/${uuid}/backups`, {
    token,
    body: payload,
  }).then(parseBackup);
}

/**
 * Console websocket credentials. The socket URL and token stay on the server;
 * the API relays the stream to the browser.
 */
export async function consoleWebsocket(token: string, uuid: string): Promise<{ socket: string; token: string }> {
  const result = await clientRequest<unknown>('GET', `/api/client/servers/${uuid}/websocket`, { token });
  return parseConsoleWebsocket(result);
}
