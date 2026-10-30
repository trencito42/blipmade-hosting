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
 *   - the client key (`ptlc_...`) is the only credential a client endpoint
 *     accepts.
 *
 * There is one client key per customer. The panel issues it on request (see
 * `api/src/services/panel/credentials.ts`), it is scoped to the panel account
 * of that customer, and it is stored encrypted on this server. There is no
 * shared key any more: one key for all customers could only ever reach the
 * servers of the account that owns it.
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
  PteroStatsAttributes,
} from './types.js';

const MEDIA = 'Application/vnd.pterodactyl.v1+json';
/**
 * Prefix of a client API key issued by the panel.
 *
 * Pterodactyl names the identifier of a key after its kind: a key of the
 * client API starts with "ptlc_" and a key of the application API starts with
 * "ptla_". The full key is the identifier of sixteen characters plus the
 * secret of thirty-two, so a key of a customer is forty-eight characters long.
 */
const CLIENT_KEY_PREFIX = 'ptlc_';

/**
 * True when the configured credential is a panel-issued client key. The
 * application key is administrative and is rejected by the panel on every
 * client endpoint, so it is never a usable client credential.
 */
export function clientApiKeyIsUsable(key: string | null | undefined): boolean {
  // The identifier of the panel is sixteen characters and the secret is
  // thirty-two, so a real key of a customer is forty-eight characters long.
  return typeof key === 'string' && key.startsWith(CLIENT_KEY_PREFIX) && key.length >= 40;
}

/**
 * True when the client API can be used at all on this environment. The panel
 * has to be able to issue a key for a customer, and that is what the bridge
 * of the panel does.
 */
export function clientApiAvailable(): boolean {
  return Boolean(env.PTERODACTYL_URL && env.PANEL_KEYMINT_URL && env.PANEL_KEYMINT_SECRET);
}

/**
 * The bearer token for the client API.
 *
 * The token is the client key of the customer. It is resolved by
 * `services/panel/credentials.ts`, which keeps one key per customer and hands
 * it over for the length of one request. Nothing else decides which key is
 * used, so a customer can never act on a server of somebody else.
 */
export function clientToken(token: string): string {
  if (!clientApiKeyIsUsable(token)) {
    throw unavailable(
      'The credential of this customer on the panel is missing or invalid. Only a panel-issued client key that starts with "ptlc_" may be used on a client endpoint.',
    );
  }
  return token;
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
 * Fails with an actionable message when the panel URL is missing. The
 * credential itself is checked by `clientToken`, because it is per customer.
 */
function requirePanelUrl(): void {
  if (!env.PTERODACTYL_URL) {
    throw unavailable('The Pterodactyl panel URL is not configured (PTERODACTYL_URL).');
  }
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
  rawBody?: string | Buffer;
  timeoutMs?: number;
  query?: Record<string, string | number | undefined>;
  /** The answer is binary and is returned as it is. */
  binary?: boolean;
  /** The answer is text and is returned as it is. */
  raw?: boolean;
}

async function clientRequest<T>(
  method: string,
  path: string,
  options: ClientRequestOptions,
): Promise<T> {
  requirePanelUrl();
  // The panel refuses an application key on a client endpoint, so a token
  // that is not a client key never leaves the server.
  if (!options.token.startsWith(CLIENT_KEY_PREFIX)) {
    throw unavailable(
      'The credential of this customer on the panel is missing or invalid. Only a panel-issued client key that starts with "ptlc_" may be used on a client endpoint.',
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
  let body: string | Buffer | undefined;
  if (options.rawBody !== undefined) {
    headers['Content-Type'] = Buffer.isBuffer(options.rawBody) ? 'application/octet-stream' : 'text/plain; charset=utf-8';
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

    if (options.binary) {
      if (!response.ok) {
        const text = await response.text();
        throw new ClientApiError(
          response.status,
          text,
          `Pterodactyl client ${method} ${path} failed with ${response.status}. ${clientDetail(text)}`,
        );
      }
      return (Buffer.from(await response.arrayBuffer()) as unknown) as T;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new ClientApiError(
        response.status,
        text,
        `Pterodactyl client ${method} ${path} failed with ${response.status}. ${clientDetail(text)}`,
      );
    }
    if (options.raw) return text as unknown as T;
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
    // The panel nests the counters below "resources".
    uptime: attributes.uptime ?? nested.uptime ?? 0,
  };
}

/** Normalizes the file contents of `GET /files/contents`. */
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
    server_name: String(attributes.name ?? attributes.server_name ?? ''),
    // The panel names the state of a server "status" on the client api.
    state: String(attributes.status ?? attributes.state ?? attributes.current_state ?? ''),
    is_suspended: Boolean(attributes.is_suspended),
    current_state: String(attributes.status ?? attributes.current_state ?? attributes.state ?? ''),
    limits: {
      memory: Number(limits?.memory ?? 0),
      swap: Number(limits?.swap ?? 0),
      disk: Number(limits?.disk ?? 0),
      io: Number(limits?.io ?? 0),
      cpu: Number(limits?.cpu ?? 0),
    },
    // The panel names the features of a server "egg_features" on the client api.
    features: Array.isArray(attributes.egg_features)
      ? attributes.egg_features.map((feature) => String(feature))
      : Array.isArray(attributes.features)
        ? attributes.features.map((feature) => String(feature))
        : [],
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
 * Splits a path into the directory and the file names the file endpoints
 * expect: `/logs/app.log` becomes `{ root: "/logs", files: ["app.log"] }`.
 *
 * Defined once, further down, next to the other path helpers.
 */
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

/**
 * Reads a file.
 *
 * The panel answers with the content of the file as it is, not with an object,
 * so the answer is read as text.
 */
export function readFile(token: string, uuid: string, path: string): Promise<{ content: string; encoding: string }> {
  return clientRequest<string>('GET', `/api/client/servers/${uuid}/files/contents`, {
    token,
    query: { file: path },
    raw: true,
  }).then((content) => ({ content: content ?? '', encoding: 'utf-8' }));
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

// ---------------------------------------------------------------------------
// The rest of the client api.
//
// Every function here takes the client key of the customer that owns the
// server. The key is resolved by `services/panel/credentials.ts` and is never
// shared, so a customer can only reach the servers of their own account.
// ---------------------------------------------------------------------------

/** Splits a path into the folder and the name inside it. */
function splitPath(path: string): { root: string; files: string[] } {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const separator = normalized.lastIndexOf('/');
  if (separator === -1) return { root: '/', files: [normalized] };
  const directory = normalized.slice(0, separator);
  const name = normalized.slice(separator + 1);
  if (!name) return { root: '/', files: [normalized] };
  // The directory already carries the leading slash, so it is used as it is.
  return { root: directory || '/', files: [name] };
}

/** The parent folder of a path and the name inside it. */
function parentAndName(path: string): { root: string; name: string } {
  const { root, files } = splitPath(path);
  return { root, name: files[0] ?? '' };
}

// --- files ----------------------------------------------------------------

/**
 * Creates a folder.
 *
 * The panel takes the folder to create it in under "root" and the name of the
 * new folder under "name".
 */
export function createFolder(token: string, uuid: string, path: string) {
  const { root, name } = parentAndName(path);
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/files/create-folder`, {
    token,
    body: { root, name },
  });
}

/**
 * Renames a file or a folder inside the same folder.
 *
 * The panel expects the folder under the name "root" and the names of the
 * files inside it. The name of the file may not carry a path, because the
 * node always renames it inside the folder it is given.
 */
export function renameFile(token: string, uuid: string, path: string, to: string) {
  const { root } = parentAndName(path);
  const { name } = parentAndName(to);
  return clientRequest<void>('PUT', `/api/client/servers/${uuid}/files/rename`, {
    token,
    body: { root, files: [{ from: path.split('/').pop(), to: name }] },
  });
}

/**
 * Moves a file or a folder to another folder.
 *
 * The panel has no route of its own for a move. The node renames a file, and
 * the new name may point at another folder, so a move is a rename that starts
 * at the root of the server.
 */
export function moveFile(token: string, uuid: string, path: string, to: string) {
  return clientRequest<void>('PUT', `/api/client/servers/${uuid}/files/rename`, {
    token,
    body: { root: '/', files: [{ from: absolutePath(path), to: absolutePath(to) }] },
  });
}

/** A path that always starts at the root of the server. */
function absolutePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.replace(/\/+/g, '/');
}

/**
 * Copies a file or a folder to another place.
 *
 * The panel copies next to the original and picks the name of the copy itself
 * ("<name> copy", then "<name> copy 2"). The folder is listed before and after,
 * so the copy is found by what is new in it and it is moved to the place the
 * customer asked for afterwards.
 */
export async function copyFile(token: string, uuid: string, path: string, to: string) {
  const { root } = parentAndName(absolutePath(path));
  const before = new Set((await listFiles(token, uuid, root)).map((entry) => entry.name));
  await clientRequest<void>('POST', `/api/client/servers/${uuid}/files/copy`, {
    token,
    body: { location: absolutePath(path) },
  });
  const created = (await listFiles(token, uuid, root)).map((entry) => entry.name).filter((name) => !before.has(name));
  const name = created.length === 1 ? created[0] : (copyName(path).split('/').pop() ?? '');
  const copied = `${root === '/' ? '' : root}/${name}`;
  if (absolutePath(copied) !== absolutePath(to)) await moveFile(token, uuid, copied, to);
}

/** The name the panel gives to the copy of a file. */
function copyName(path: string): string {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${path} copy`;
  return `${path.slice(0, path.length - name.length + dot)} copy${name.slice(dot)}`;
}

/**
 * Uploads a file. The content is sent to the panel as it is and the panel
 * streams it to the node.
 *
 * The panel also offers a signed address that the browser could write to, but
 * that address belongs to the node. The file goes through Blipmade instead, so
 * the node is never named in the browser.
 */
export function uploadFile(
  token: string,
  uuid: string,
  directory: string,
  filename: string,
  content: Buffer,
) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/files/write`, {
    token,
    query: { file: joinPath(directory, filename) },
    rawBody: content,
  });
}

/** Joins a folder and a file name into one path. */
function joinPath(directory: string, filename: string): string {
  const folder = directory && directory !== '/' ? directory.replace(/\/+$/, '') : '';
  return `${folder}/${filename}`.replace(/\/+/g, '/');
}

/** Reads a file as it is, for a download. */
/**
 * Downloads a file.
 *
 * The panel knows an address that is signed and that points at the node, but
 * that address belongs to the node and its certificate cannot be checked
 * against it. The file therefore comes through the panel, which owns the
 * connection to the node. The panel only answers for a file of a certain size,
 * and it says so when the file is too big.
 */
export function downloadFile(token: string, uuid: string, path: string): Promise<Buffer> {
  return clientRequest<Buffer>('GET', `/api/client/servers/${uuid}/files/contents`, {
    token,
    query: { file: path },
    binary: true,
  });
}

/**
 * Compresses files into an archive.
 *
 * The node decides the format of the archive and the name it gets, so the
 * answer of the panel is read to learn the name of the archive that was made.
 */
export async function compressFiles(token: string, uuid: string, paths: string[]): Promise<string> {
  const first = paths[0] ?? '/';
  const { root } = parentAndName(first);
  const answer = await clientRequest<unknown>('POST', `/api/client/servers/${uuid}/files/compress`, {
    token,
    body: {
      root,
      files: paths.map((path) => path.split('/').pop() ?? path),
    },
  });
  const attributes = resourceAttributes<{ name?: string }>(answer);
  return String(attributes.name ?? '');
}

/** Unpacks an archive. */
/**
 * Unpacks an archive. The node reads the format out of the archive itself.
 */
export function decompressArchive(token: string, uuid: string, path: string) {
  const { root } = parentAndName(path);
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/files/decompress`, {
    token,
    body: { root, file: path.split('/').pop() ?? path },
  });
}

/** Changes the permissions of a file or a folder. */
export function chmodFile(token: string, uuid: string, path: string, mode: number) {
  const { root } = parentAndName(path);
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/files/chmod`, {
    token,
    // The node takes the permissions as the octal digits of the mode, so the
    // number is written back as those digits.
    body: { root, files: [{ file: path.split('/').pop() ?? path, mode: mode.toString(8) }] },
  });
}

// --- databases ------------------------------------------------------------

export interface ClientDatabase {
  /**
   * The panel names a database with a hash id, not with a number, so the id
   * is a string everywhere it is used.
   */
  id: string;
  name: string;
  username: string;
  host: string;
  port: number;
  password: string | null;
  /** The hosts that are allowed to connect. */
  remote: string;
}

/**
 * Reads the databases of a server.
 *
 * The password is only in the answer when it is asked for, so it is asked for
 * here and the customer sees the credentials of their own databases.
 */
export function listDatabases(token: string, uuid: string): Promise<ClientDatabase[]> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/databases`, {
    token,
    query: { include: 'password' },
  }).then((payload) =>
    collectionEntries<Record<string, unknown>>(payload).map((entry) => {
      const attributes = (entry?.attributes ?? {}) as Record<string, unknown>;
      const host = (attributes.host ?? {}) as Record<string, unknown>;
      return {
        id: String(attributes.id ?? ''),
        name: String(attributes.name ?? ''),
        username: String(attributes.username ?? ''),
        host: String(host.address ?? ''),
        port: Number(host.port ?? 0),
        password: typeof attributes.password === 'string' ? attributes.password : null,
        remote: String(attributes.connections_from ?? ''),
      };
    }),
  );
}

export function createDatabase(
  token: string,
  uuid: string,
  payload: { database: string; username: string; password: string; remote: string },
) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/databases`, { token, body: payload });
}

/**
 * Changes the password of a database.
 *
 * The panel offers one change for a database: a new password. The name and the
 * list of hosts that may connect cannot be changed by the customer, so the
 * panel does not offer them.
 */
export function rotateDatabasePassword(token: string, uuid: string, id: string) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/databases/${id}/rotate-password`, { token });
}

export function deleteDatabase(token: string, uuid: string, id: string) {
  return clientRequest<void>('DELETE', `/api/client/servers/${uuid}/databases/${id}`, { token });
}

/**
 * The credentials of a database. The answer holds the password, so the call
 * is written to the audit log by the caller.
 */
export async function databaseCredentials(token: string, uuid: string, id: string): Promise<ClientDatabase> {
  const databases = await listDatabases(token, uuid);
  const found = databases.find((database) => database.id === id);
  if (!found) throw new Error('The panel does not know this database.');
  return found;
}

// --- backups --------------------------------------------------------------

export function deleteBackup(token: string, uuid: string, id: string) {
  return clientRequest<void>('DELETE', `/api/client/servers/${uuid}/backups/${id}`, { token });
}

/** Reads a backup as it is, for a download. */
export function downloadBackup(token: string, uuid: string, id: string): Promise<Buffer> {
  return clientRequest<Buffer>('GET', `/api/client/servers/${uuid}/backups/${id}/download`, {
    token,
    binary: true,
  });
}

/** Restores a backup. The files of the server are replaced by the archive. */
export function restoreBackup(token: string, uuid: string, id: string) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/backups/${id}/restore`, { token });
}

// --- schedules ------------------------------------------------------------

export interface ClientSchedule {
  id: number;
  name: string;
  cron: string;
  action: string;
  active: boolean;
  payload: Record<string, unknown>;
  last_run: string | null;
  next_run: string | null;
}

/** The parts of a cron expression, in the order the panel stores them. */
function cronParts(cron: string): {
  minute: string;
  hour: string;
  day_of_month: string;
  month: string;
  day_of_week: string;
} {
  const [minute = '*', hour = '*', dayOfMonth = '*', month = '*', dayOfWeek = '*'] = cron.trim().split(/\s+/);
  return { minute, hour, day_of_month: dayOfMonth, month, day_of_week: dayOfWeek };
}

/** The payload of a task, which the panel keeps as one line of text. */
function taskPayload(action: string, payload: Record<string, unknown>): string | null {
  if (action === 'power') return String(payload.signal ?? 'start');
  if (action === 'command') return String(payload.command ?? '');
  return null;
}

/** The id of a schedule in an answer of the panel. */
function scheduleId(payload: unknown): number {
  const attributes = (payload as { attributes?: Record<string, unknown> })?.attributes ?? {};
  return Number(attributes.id ?? 0);
}

/**
 * The first task of a schedule, which is the one that is shown.
 *
 * The panel puts the tasks of a schedule in the relations of the answer.
 */
function firstTask(entry: { attributes?: Record<string, unknown> }): Record<string, unknown> {
  const attributes = (entry?.attributes ?? {}) as Record<string, unknown>;
  const relations = (attributes.relationships ?? {}) as Record<string, unknown>;
  const tasks = (relations.tasks ?? {}) as { data?: { attributes?: Record<string, unknown> }[] };
  const first = Array.isArray(tasks.data) ? tasks.data[0] : undefined;
  return (first?.attributes ?? {}) as Record<string, unknown>;
}

/**
 * The payload of a task, as the customer knows it.
 *
 * The panel keeps the payload of a task as one line of text, so the text is
 * read back into the field that belongs to the action.
 */
function taskPayloadOf(action: string, payload: unknown): Record<string, unknown> {
  const value = typeof payload === 'string' ? payload : '';
  if (action === 'power') return { signal: value };
  if (action === 'command') return { command: value };
  return {};
}

export function listSchedules(token: string, uuid: string): Promise<ClientSchedule[]> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/schedules`, {
    token,
    query: { include: 'tasks' },
  }).then((payload) =>
    collectionEntries<Record<string, unknown>>(payload).map((entry) => {
      const attributes = (entry?.attributes ?? {}) as Record<string, unknown>;
      const cron = (attributes.cron ?? {}) as Record<string, unknown>;
      const task = firstTask(entry);
      return {
        id: Number(attributes.id ?? 0),
        name: String(attributes.name ?? ''),
        cron: `${cron.minute ?? '*'} ${cron.hour ?? '*'} ${cron.day_of_month ?? '*'} ${cron.month ?? '*'} ${cron.day_of_week ?? '*'}`,
        action: String(task.action ?? ''),
        active: attributes.is_active === true,
        payload: taskPayloadOf(String(task.action ?? ''), task.payload),
        last_run: attributes.last_run_at ? String(attributes.last_run_at) : null,
        next_run: attributes.next_run_at ? String(attributes.next_run_at) : null,
      };
    }),
  );
}

/**
 * Creates a schedule and the task it runs.
 *
 * The panel keeps the schedule and its tasks apart, so a schedule with a task
 * is two calls: first the schedule, then the task that belongs to it.
 */
export async function createSchedule(
  token: string,
  uuid: string,
  payload: { name: string; cron: string; action: string; active: boolean; payload: Record<string, unknown> },
) {
  const created = await clientRequest<unknown>('POST', `/api/client/servers/${uuid}/schedules`, {
    token,
    body: { name: payload.name, is_active: payload.active, ...cronParts(payload.cron) },
  });
  const id = scheduleId(created);
  if (!id) throw new Error('The panel did not return the id of the new schedule.');
  await clientRequest<void>('POST', `/api/client/servers/${uuid}/schedules/${id}/tasks`, {
    token,
    body: { action: payload.action, payload: taskPayload(payload.action, payload.payload), time_offset: 0 },
  });
}

/**
 * Changes a schedule.
 *
 * The fields of the schedule and the task it runs are kept apart by the panel,
 * so a change of the action changes the task as well.
 */
export async function updateSchedule(
  token: string,
  uuid: string,
  id: number,
  payload: { name?: string; cron?: string; active?: boolean; payload?: Record<string, unknown> },
) {
  const current = await clientRequest<unknown>('GET', `/api/client/servers/${uuid}/schedules/${id}`, {
    token,
    query: { include: 'tasks' },
  });
  const attributes = (current as { attributes?: Record<string, unknown> })?.attributes ?? {};
  const cron = (attributes.cron ?? {}) as Record<string, unknown>;

  await clientRequest<void>('POST', `/api/client/servers/${uuid}/schedules/${id}`, {
    token,
    body: {
      name: payload.name ?? String(attributes.name ?? ''),
      is_active: payload.active ?? attributes.is_active === true,
      minute: String(cron.minute ?? '*'),
      hour: String(cron.hour ?? '*'),
      day_of_month: String(cron.day_of_month ?? '*'),
      month: String(cron.month ?? '*'),
      day_of_week: String(cron.day_of_week ?? '*'),
    },
  });

  if (payload.payload) {
    const tasks = (attributes.tasks ?? []) as { attributes?: Record<string, unknown> }[];
    const task = Array.isArray(tasks) ? tasks[0]?.attributes : undefined;
    const taskId = Number(task?.id ?? 0);
    if (taskId) {
      await clientRequest<void>('POST', `/api/client/servers/${uuid}/schedules/${id}/tasks/${taskId}`, {
        token,
        body: {
          action: String(task?.action ?? 'power'),
          payload: taskPayload(String(task?.action ?? 'power'), payload.payload),
          time_offset: Number(task?.time_offset ?? 0),
          sequence_id: Number(task?.sequence_id ?? 1),
          continue_on_failure: task?.continue_on_failure === true,
        },
      });
    }
  }
}

export function deleteSchedule(token: string, uuid: string, id: number) {
  return clientRequest<void>('DELETE', `/api/client/servers/${uuid}/schedules/${id}`, { token });
}

/** Runs a schedule right away. */
export function runSchedule(token: string, uuid: string, id: number) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/schedules/${id}/execute`, { token });
}

// --- allocations ----------------------------------------------------------

export interface ClientAllocation {
  id: number;
  ip: string;
  port: number;
  alias: string | null;
  is_default: boolean;
}

export function listAllocations(token: string, uuid: string): Promise<ClientAllocation[]> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/network/allocations`, { token }).then((payload) =>
    collectionEntries<Record<string, unknown>>(payload).map((entry) => {
      const attributes = (entry?.attributes ?? {}) as Record<string, unknown>;
      const ipAlias = attributes.ip_alias ? String(attributes.ip_alias) : '';
      const notes = attributes.notes ? String(attributes.notes) : '';
      return {
        id: Number(attributes.id ?? 0),
        ip: String(attributes.ip ?? ''),
        port: Number(attributes.port ?? 0),
        alias: ipAlias || notes || null,
        is_default: attributes.is_default === true,
      };
    }),
  );
}

/**
 * Adds an address to the server.
 *
 * The panel picks the address itself out of the free ones of the node, so
 * nothing is sent with the call.
 */
export function createAllocation(token: string, uuid: string) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/network/allocations`, { token });
}

/** Changes the label of an address. The panel keeps that label in its notes. */
export function updateAllocation(token: string, uuid: string, id: number, payload: { notes: string }) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/network/allocations/${id}`, { token, body: payload });
}

/** Makes an address the primary one of the server. */
export function setPrimaryAllocation(token: string, uuid: string, id: number) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/network/allocations/${id}/primary`, { token });
}

export function deleteAllocation(token: string, uuid: string, id: number) {
  return clientRequest<void>('DELETE', `/api/client/servers/${uuid}/network/allocations/${id}`, { token });
}

// --- settings and activity ------------------------------------------------

export function renameServer(token: string, uuid: string, payload: { name: string; description?: string }) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/settings/rename`, { token, body: payload });
}

/** Reinstalls the server. The files of the customer are lost. */
export function reinstallServer(token: string, uuid: string) {
  return clientRequest<void>('POST', `/api/client/servers/${uuid}/settings/reinstall`, { token });
}

export interface ClientActivity {
  user: string;
  action: string;
  meta: Record<string, unknown>;
  created_at: string;
}

/**
 * The activity of the server.
 *
 * The panel writes the name of the event in "event", the moment in
 * "timestamp" and the details of the event in "properties". Older panels
 * used "action", "created_at" and "meta", so both are read.
 */
export function listActivity(token: string, uuid: string): Promise<ClientActivity[]> {
  return clientRequest<unknown>('GET', `/api/client/servers/${uuid}/activity`, { token }).then((payload) =>
    collectionEntries<Record<string, unknown>>(payload).map((entry) => {
      const attributes = (entry?.attributes ?? {}) as Record<string, unknown>;
      const properties = (attributes.properties ?? {}) as Record<string, unknown>;
      const meta = (attributes.meta ?? {}) as Record<string, unknown>;
      const user = attributes.user ?? attributes.username;
      return {
        user: typeof user === 'string' ? user : '',
        action: String(attributes.event ?? attributes.action ?? ''),
        meta: {
          ...meta,
          ...properties,
          ...(attributes.ip ? { ip: String(attributes.ip) } : {}),
          ...(attributes.is_api !== undefined ? { is_api: Boolean(attributes.is_api) } : {}),
          ...(attributes.description ? { description: String(attributes.description) } : {}),
        },
        created_at: String(attributes.timestamp ?? attributes.created_at ?? ''),
      };
    }),
  );
}
