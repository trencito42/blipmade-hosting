/**
 * Typed client for the endpoints of one instance.
 *
 * The shared client in ./api.ts carries the transport: the session cookie,
 * the CSRF header and the error shape. This module knows the shape of the
 * answers of the instance routes and nothing else.
 *
 * The panel is never opened by the customer. Every route here is a route of
 * Blipmade, and the answers are the ones the API of Blipmade builds.
 */

import { ApiError, api, del, get, post, put, readCookie, type Instance } from './api';

// --- shared shapes ---------------------------------------------------------

export type PowerSignal = 'start' | 'stop' | 'restart' | 'kill';


export type ScheduleAction = 'power' | 'command' | 'backup';

/** An event of the activity log of Blipmade. */
export interface InstanceEvent {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

/** An entry of the activity of the panel. */
export interface PanelActivity {
  user: string;
  action: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

/** The server of the panel, as the panel describes it. */
export interface PanelServer {
  uuid: string;
  identifier: string;
  name: string;
  state: string;
  isSuspended: boolean;
  limits: Record<string, number>;
  features: string[];
  createdAt: string;
}

/**
 * A file of the instance, as the panel lists it.
 *
 * The permissions are the octal digits of the panel, for example "0644".
 */
export interface InstanceFile {
  name: string;
  mode: string;
  size: number;
  modified_at: string;
  created_at: string;
  is_file: boolean;
  is_directory: boolean;
  is_symlink: boolean;
  mime_type?: string | null;
  owner?: number | null;
  group?: number | null;
}

export interface InstanceDatabase {
  /** The panel identifies a database with a hash id, not with a number. */
  id: string;
  name: string;
  username: string;
  host: string;
  port: number;
  database: string;
  password: string | null;
}

export interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

export interface InstanceBackup {
  id: string;
  name: string;
  size: number;
  created_at: string;
  is_locked: boolean;
}

export interface InstanceAllocation {
  id: number;
  ip: string;
  port: number;
  alias: string | null;
  is_default: boolean;
}

export interface StartupSettings {
  image: string;
  command: string;
  environment: Record<string, string>;
}

export interface InstanceSchedule {
  id: number;
  name: string;
  cron: string;
  action: ScheduleAction | string;
  active: boolean;
  payload: Record<string, unknown>;
  last_run: string | null;
  next_run: string | null;
}

export interface InstanceSettings {
  name: string;
  description: string | null;
  suspended: boolean;
  can_reinstall: boolean;
  egg: string | null;
  docker_image: string | null;
  limits: Record<string, number>;
}

// --- helpers ---------------------------------------------------------------

/** PATCH is not part of the shared client, so it lives here. */
const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });

function buildUrl(path: string, query?: Record<string, string | number>): string {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Downloads a file. The answer of a download is the file itself, so it
 * cannot go through the JSON client: it is fetched here with the same
 * credentials and the same error shape.
 */
async function downloadBlob(path: string, query?: Record<string, string | number>): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: '*/*' },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the Blipmade API. Check your connection and retry.');
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    let code = 'request_failed';
    let message = `Request failed (${response.status}).`;
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      const detail = (payload as { error?: unknown } | null)?.error ?? payload;
      if (detail && typeof detail === 'object') {
        const record = detail as { code?: unknown; message?: unknown };
        if (typeof record.code === 'string') code = record.code;
        if (typeof record.message === 'string') message = record.message;
      }
    }
    throw new ApiError(response.status, code, message, undefined, response.headers.get('x-request-id') ?? undefined);
  }

  return response.blob();
}

// --- the instance ----------------------------------------------------------

export const getInstance = (id: string, signal?: AbortSignal) =>
  get<{ instance: Instance; events: InstanceEvent[] }>(`/instances/${id}`, undefined, signal);

export const renameInstance = (id: string, name: string) =>
  post<{ instance?: Instance }>(`/instances/${id}/rename`, { name });

export const cancelInstance = (id: string) => post<void>(`/instances/${id}/cancel`);

export const sendPower = (id: string, signal: PowerSignal) =>
  post<{ instanceId: string; accepted: boolean }>(`/instances/${id}/power`, { signal });

/** The server of the panel, with the state of the container. */
export const getServer = (id: string, signal?: AbortSignal) =>
  get<{ server: PanelServer }>(`/instances/${id}/server`, undefined, signal);

/**
 * The live usage of the instance.
 *
 * The counters are the ones of the panel: the uptime is in seconds and the
 * memory and the disk are in bytes.
 */
export interface ResourceSample {
  state: string;
  isSuspended: boolean;
  cpuPercent: number | null;
  memoryBytes: number | null;
  diskBytes: number | null;
  networkRx: number | null;
  networkTx: number | null;
  uptimeMs: number | null;
}

export async function getResources(id: string, signal?: AbortSignal): Promise<ResourceSample> {
  const answer = await get<{ resources?: Partial<ResourceSample> & { uptime?: number; cpu_absolute?: number; memory_bytes?: number; is_suspended?: boolean; network?: { rx?: number; tx?: number }; disk?: { used?: number } } }>(
    `/instances/${id}/resources`,
    undefined,
    signal,
  );
  const raw = answer?.resources ?? {};
  const network = raw.network ?? {};
  const disk = raw.disk ?? {};
  const cpu = raw.cpu_absolute ?? raw.cpuPercent ?? null;

  return {
    state: raw.state ?? '',
    isSuspended: raw.isSuspended ?? raw.is_suspended ?? false,
    // The panel reports the share of one core, so a fraction of one is a
    // fraction of a core and not a percentage.
    cpuPercent: cpu === null ? null : cpu > 0 && cpu <= 1 ? cpu * 100 : cpu,
    memoryBytes: raw.memory_bytes ?? raw.memoryBytes ?? null,
    diskBytes: disk.used ?? raw.diskBytes ?? null,
    networkRx: network.rx ?? raw.networkRx ?? null,
    networkTx: network.tx ?? raw.networkTx ?? null,
    uptimeMs: raw.uptime === undefined ? (raw.uptimeMs ?? null) : raw.uptime * 1000,
  };
}

// --- console ---------------------------------------------------------------

/**
 * The path of the console stream. The panel address and the panel token stay
 * on the server: the API relays the stream in both directions.
 */
export const getConsole = (id: string, signal?: AbortSignal) =>
  get<{ websocket: string }>(`/instances/${id}/console`, undefined, signal);

export const sendCommand = (id: string, command: string) =>
  post<{ sent: boolean }>(`/instances/${id}/command`, { command });

// --- files -----------------------------------------------------------------

export const listFiles = (id: string, path: string, signal?: AbortSignal) =>
  get<{ files: InstanceFile[]; path: string }>(`/instances/${id}/files`, { path }, signal);

export const readFile = (id: string, path: string, signal?: AbortSignal) =>
  get<{ content: string; encoding: string }>(`/instances/${id}/file`, { path }, signal);

export const writeFile = (id: string, path: string, content: string) =>
  put<void>(`/instances/${id}/file`, { path, content });

export const deleteFile = (id: string, path: string) =>
  api<void>(`/instances/${id}/file`, { method: 'DELETE', query: { path } });

export const renameFile = (id: string, path: string, to: string) =>
  post<{ renamed: boolean }>(`/instances/${id}/files/rename`, { path, to });

export const moveFile = (id: string, path: string, to: string) =>
  post<{ moved: boolean }>(`/instances/${id}/files/move`, { path, to });

export const copyFile = (id: string, path: string, to: string) =>
  post<{ copied: boolean }>(`/instances/${id}/files/copy`, { path, to });

/**
 * Uploads a file.
 *
 * A text file travels as a JSON object. A file that is not text travels as
 * it is, with the folder and the name in the query.
 */
export async function uploadFile(
  id: string,
  directory: string,
  name: string,
  content: string | ArrayBuffer,
): Promise<void> {
  if (typeof content === 'string') {
    await api<void>(`/instances/${id}/files/upload`, { method: 'POST', body: { path: directory, name, content } });
    return;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  const csrf = readCookie('bm_csrf');
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const response = await fetch(buildUrl(`/instances/${id}/files/upload`, { directory, filename: name }), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: content,
  });

  if (response.ok) return;

  let code = 'request_failed';
  let message = `Request failed (${response.status}).`;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    const detail = (payload as { error?: unknown } | null)?.error ?? payload;
    if (detail && typeof detail === 'object') {
      const record = detail as { code?: unknown; message?: unknown };
      if (typeof record.code === 'string') code = record.code;
      if (typeof record.message === 'string') message = record.message;
    }
  }
  throw new ApiError(response.status, code, message, undefined, response.headers.get('x-request-id') ?? undefined);
}

export const downloadFile = (id: string, path: string) =>
  downloadBlob(`/instances/${id}/files/download`, { path });

/**
 * The node decides the format of the archive and reads the format of an
 * archive out of the file itself, so neither call names one.
 */
export const compressFiles = (id: string, paths: string[]) =>
  post<{ compressed: boolean; archive: string }>(`/instances/${id}/files/compress`, { paths });

export const decompressArchive = (id: string, path: string) =>
  post<{ decompressed: boolean }>(`/instances/${id}/files/decompress`, { path });

/** The same two operations under the names the file manager uses. */
export const archiveFiles = compressFiles;
export const unarchiveFile = decompressArchive;

/** The permissions of a file, as the number of the bits. */
export const chmodFile = (id: string, path: string, mode: number) =>
  post<{ chmodded: boolean }>(`/instances/${id}/files/chmod`, { path, mode });

// --- databases -------------------------------------------------------------

export const listDatabases = (id: string, signal?: AbortSignal) =>
  get<{ databases: InstanceDatabase[] }>(`/instances/${id}/databases`, undefined, signal);

export const createDatabase = (
  id: string,
  body: { database: string; username: string; password: string; remote: string },
) => post<{ created: boolean }>(`/instances/${id}/databases`, body);

export const updateDatabase = (
  id: string,
  databaseId: string,
  body: { password?: string; remote?: string },
) => patch<{ updated: boolean }>(`/instances/${id}/databases/${databaseId}`, body);

export const deleteDatabase = (id: string, databaseId: string) =>
  del<void>(`/instances/${id}/databases/${databaseId}`);

/**
 * The credentials of a database. The password is only in this answer, and the
 * call is written to the audit log.
 */
export const getDatabaseCredentials = (id: string, databaseId: string) =>
  get<{ credentials: DatabaseCredentials }>(`/instances/${id}/databases/${databaseId}/credentials`);

// --- backups ---------------------------------------------------------------

export const listBackups = (id: string, signal?: AbortSignal) =>
  get<{ backups: InstanceBackup[] }>(`/instances/${id}/backups`, undefined, signal);

export const createBackup = (id: string, body: { name: string; locked: boolean }) =>
  post<{ backup: { id: string; name: string } }>(`/instances/${id}/backups`, body);

export const downloadBackup = (id: string, backupId: string) =>
  downloadBlob(`/instances/${id}/backups/${backupId}/download`);

export const restoreBackup = (id: string, backupId: string) =>
  post<{ restored: boolean }>(`/instances/${id}/backups/${backupId}/restore`);

export const deleteBackup = (id: string, backupId: string) =>
  del<void>(`/instances/${id}/backups/${backupId}`);

// --- network ---------------------------------------------------------------

export const listAllocations = (id: string, signal?: AbortSignal) =>
  get<{ allocations: InstanceAllocation[] }>(`/instances/${id}/allocations`, undefined, signal);

/** Makes an address the primary one of the instance. */
export const setPrimaryAllocation = (id: string, primary: number) =>
  put<{ updated: boolean }>(`/instances/${id}/allocations`, { primary });

export const createAllocation = (id: string, body: { ip: string; port: number; alias?: string }) =>
  post<{ created: boolean }>(`/instances/${id}/allocations`, body);

export const updateAllocation = (id: string, allocationId: number, body: { isDefault?: boolean; alias?: string | null }) =>
  patch<{ updated: boolean }>(`/instances/${id}/allocations/${allocationId}`, body);

export const deleteAllocation = (id: string, allocationId: number) =>
  del<void>(`/instances/${id}/allocations/${allocationId}`);

// --- startup ---------------------------------------------------------------

export const getStartup = (id: string, signal?: AbortSignal) =>
  get<StartupSettings>(`/instances/${id}/startup`, undefined, signal);

export const updateStartup = (
  id: string,
  body: { image?: string; command?: string; environment?: Record<string, string> },
) => put<StartupSettings>(`/instances/${id}/startup`, body);

// --- schedules -------------------------------------------------------------

export const listSchedules = (id: string, signal?: AbortSignal) =>
  get<{ schedules: InstanceSchedule[] }>(`/instances/${id}/schedules`, undefined, signal);

export const createSchedule = (
  id: string,
  body: { name: string; cron: string; action: ScheduleAction; active: boolean; payload: Record<string, unknown> },
) => post<{ created: boolean }>(`/instances/${id}/schedules`, body);

export const updateSchedule = (
  id: string,
  scheduleId: number,
  body: { name?: string; cron?: string; active?: boolean; payload?: Record<string, unknown> },
) => patch<{ updated: boolean }>(`/instances/${id}/schedules/${scheduleId}`, body);

export const deleteSchedule = (id: string, scheduleId: number) =>
  del<void>(`/instances/${id}/schedules/${scheduleId}`);

export const runSchedule = (id: string, scheduleId: number) =>
  post<{ ran: boolean }>(`/instances/${id}/schedules/${scheduleId}/run`);

// --- settings and activity -------------------------------------------------

export const getSettings = (id: string, signal?: AbortSignal) =>
  get<InstanceSettings>(`/instances/${id}/settings`, undefined, signal);

export const updateSettings = (id: string, body: { name?: string; description?: string }) =>
  patch<InstanceSettings>(`/instances/${id}/settings`, body);

export const reinstallInstance = (id: string) =>
  post<{ reinstalled: boolean }>(`/instances/${id}/settings/reinstall`, { confirm: true });

export const setSuspended = (id: string, suspended: boolean) =>
  post<{ suspended: boolean }>(`/instances/${id}/suspend`, { suspended });

export const listEvents = (id: string, signal?: AbortSignal) =>
  get<{ events: InstanceEvent[] }>(`/instances/${id}/events`, undefined, signal);

export const listActivity = (id: string, signal?: AbortSignal) =>
  get<{ activity: PanelActivity[] }>(`/instances/${id}/activity`, undefined, signal);
