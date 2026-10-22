import { env } from '../../env.js';
import { upstream } from '../../lib/errors.js';
import type {
  CreateServerInput,
  PteroAllocation,
  PteroEgg,
  PteroList,
  PteroNode,
  PteroServer,
  PteroUser,
} from './types.js';

const MEDIA = 'Application/vnd.pterodactyl.v1+json';

export class PterodactylError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = 'PterodactylError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Turns the panel's validation response into a readable message, so the reason
 * a request was rejected is visible in the logs and in the instance record.
 */
export function pterodactylDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errors?: { detail?: string; meta?: { source_field?: string } }[] };
    const errors = parsed.errors ?? [];
    if (!errors.length) return body.slice(0, 300);
    return errors
      .map((error) => {
        const field = error.meta?.source_field;
        return field ? `${field}: ${error.detail}` : (error.detail ?? 'rejected');
      })
      .join('; ');
  } catch {
    return body.slice(0, 300);
  }
}

function requireConfig() {
  if (!env.pterodactylEnabled) {
    throw upstream('Pterodactyl is not configured on this environment.');
  }
}

/**
 * Pterodactyl Application API. This key is administrative: it must never reach
 * the browser. Every call is made from the API or the worker.
 */
export async function applicationRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 20_000,
): Promise<T> {
  requireConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.PTERODACTYL_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.PTERODACTYL_APP_KEY}`,
        Accept: MEDIA,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new PterodactylError(
        response.status,
        text,
        `Pterodactyl ${method} ${path} failed with ${response.status}. ${pterodactylDetail(text)}`,
      );
    }
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof PterodactylError) throw error;
    throw upstream(`Pterodactyl ${method} ${path} could not be reached.`);
  } finally {
    clearTimeout(timer);
  }
}

export async function listServers(): Promise<PteroServer[]> {
  const result = await applicationRequest<PteroList<PteroServer>>('GET', '/api/application/servers?per_page=100');
  return result.data.map((entry) => entry.attributes as PteroServer);
}

export async function getServer(id: number): Promise<PteroServer> {
  const result = await applicationRequest<{ attributes: PteroServer }>(
    'GET',
    `/api/application/servers/${id}`,
  );
  return result.attributes;
}

export async function createServer(input: CreateServerInput): Promise<PteroServer> {
  const result = await applicationRequest<{ attributes: PteroServer }>(
    'POST',
    '/api/application/servers',
    input,
  );
  return result.attributes;
}

/**
 * The panel splits a server update across three routes and each route
 * validates the whole record, so a missing field is rejected with a 422:
 *
 *   PATCH /servers/{id}/details -> name, user
 *   PATCH /servers/{id}/build   -> allocation, limits, feature_limits
 *   PATCH /servers/{id}/startup -> startup, environment, egg, image, skip_scripts
 *
 * Sending fields that belong to another route makes the panel answer with a
 * 500, so each helper only sends what its own route expects.
 */
export async function updateServerDetails(
  serverId: number,
  changes: { name?: string; user?: number; description?: string },
): Promise<PteroServer> {
  const current = await getServer(serverId);
  const result = await applicationRequest<{ attributes: PteroServer }>(
    'PATCH',
    `/api/application/servers/${serverId}/details`,
    {
      name: changes.name ?? current.name,
      user: changes.user ?? current.user,
      description: changes.description ?? (current.description ?? ''),
    },
  );
  return result.attributes;
}

/**
 * Updates the resource limits of a server. The allocation is the id of the
 * address the container publishes its port on.
 */
export async function updateServerBuild(
  serverId: number,
  changes: {
    allocation?: number;
    limits?: { memory: number; swap: number; disk: number; io: number; cpu: number };
    feature_limits?: { databases: number; backups: number };
  },
): Promise<PteroServer> {
  const current = await getServer(serverId);
  const result = await applicationRequest<{ attributes: PteroServer }>(
    'PATCH',
    `/api/application/servers/${serverId}/build`,
    {
      allocation: changes.allocation ?? current.allocation,
      limits: changes.limits ?? {
        memory: current.limits.memory,
        swap: current.limits.swap,
        disk: current.limits.disk,
        io: current.limits.io,
        cpu: current.limits.cpu,
      },
      feature_limits: changes.feature_limits ?? {
        databases: current.feature_limits.databases,
        backups: current.feature_limits.backups,
      },
    },
  );
  return result.attributes;
}

/**
 * Updates the container image, the startup command and the environment
 * variables the egg's install and startup scripts read.
 */
export async function updateServerStartup(
  serverId: number,
  changes: {
    startup?: string;
    environment?: Record<string, string>;
    egg?: number;
    image?: string;
    skip_scripts?: boolean;
  },
): Promise<PteroServer> {
  const current = await getServer(serverId);
  const result = await applicationRequest<{ attributes: PteroServer }>(
    'PATCH',
    `/api/application/servers/${serverId}/startup`,
    {
      startup: changes.startup ?? current.container.startup_command,
      environment: changes.environment ?? current.container.environment,
      egg: changes.egg ?? current.egg,
      image: changes.image ?? current.container.image,
      skip_scripts: changes.skip_scripts ?? false,
    },
  );
  return result.attributes;
}

export async function setServerEnvironment(
  serverId: number,
  environment: Record<string, string>,
): Promise<void> {
  await updateServerStartup(serverId, { environment });
}

/**
 * Asks the node to install the server. This is the route that pulls the
 * image and runs the egg's install script; it is accepted with a 204 and the
 * work happens on the node, so the caller has to wait for the panel to report
 * the server as installed.
 */
export async function reinstallServer(serverId: number): Promise<void> {
  await applicationRequest('POST', `/api/application/servers/${serverId}/reinstall`);
}

/**
 * Waits for the node to finish installing the server. The install script of
 * the node egg prepares the container, which takes a few minutes.
 */
export async function waitForServerInstalled(serverId: number, timeoutMs = 600_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const server = await getServer(serverId).catch(() => null);
    if (server && server.container.installed === 1) return true;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}

export async function deleteServer(serverId: number): Promise<void> {
  await applicationRequest('DELETE', `/api/application/servers/${serverId}`);
}

export async function listNodes(): Promise<PteroNode[]> {
  const result = await applicationRequest<PteroList<PteroNode>>('GET', '/api/application/nodes');
  return result.data.map((entry) => entry.attributes as PteroNode);
}

export async function listNests(): Promise<{ id: number; name: string }[]> {
  const result = await applicationRequest<PteroList<{ id: number; name: string }>>('GET', '/api/application/nests');
  return result.data.map((entry) => entry.attributes);
}

export async function listEggs(nestId: number): Promise<PteroEgg[]> {
  const result = await applicationRequest<PteroList<PteroEgg>>(
    'GET',
    `/api/application/nests/${nestId}/eggs`,
  );
  return result.data.map((entry) => entry.attributes as PteroEgg);
}

export async function listAllocations(nodeId: number): Promise<PteroAllocation[]> {
  const result = await applicationRequest<PteroList<PteroAllocation>>(
    'GET',
    `/api/application/nodes/${nodeId}/allocations?per_page=500`,
  );
  return result.data.map((entry) => entry.attributes as PteroAllocation);
}

/**
 * Returns the default environment variables for an egg.
 *
 * Pterodactyl 1.15 does not expose the egg variables through the Application
 * API, but the panel refuses to create a server without them. The variables of
 * an existing server on the same egg are used as the template, minus the
 * per-server values the panel sets itself.
 */
export async function eggEnvironmentTemplate(eggId: number): Promise<Record<string, string>> {
  const servers = await listServers();
  const sample = servers.find((server) => server.egg === eggId);
  if (!sample) {
    throw new PterodactylError(
      422,
      '',
      `No environment template is known for egg ${eggId}. Create one server on this egg through the panel first.`,
    );
  }

  const template: Record<string, string> = {};
  for (const [key, value] of Object.entries(sample.container.environment ?? {})) {
    // These are filled in by the panel for every server.
    if (key.startsWith('P_SERVER_')) continue;
    template[key] = String(value ?? '');
  }
  return template;
}

export async function listUsers(): Promise<PteroUser[]> {
  const result = await applicationRequest<PteroList<PteroUser>>('GET', '/api/application/users?per_page=100');
  return result.data.map((entry) => entry.attributes as PteroUser);
}

export async function findUserByEmail(email: string): Promise<PteroUser | null> {
  const users = await listUsers();
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function findUserById(id: number): Promise<PteroUser | null> {
  const users = await listUsers();
  return users.find((user) => user.id === id) ?? null;
}

/**
 * Creates a Pterodactyl user. Pterodactyl 1.15 requires a first name and a last
 * name, so the display name is split and a sensible fallback is used when the
 * customer only gave one word.
 */
export async function createUser(input: {
  email: string;
  username: string;
  password: string;
  root_admin: boolean;
  name?: string | null;
}): Promise<PteroUser> {
  const parts = (input.name ?? '').trim().split(/\s+/).filter(Boolean);
  const fallback = input.email.split('@')[0] ?? 'customer';
  const firstName = parts[0] ?? fallback;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Customer';

  const result = await applicationRequest<{ attributes: PteroUser }>('POST', '/api/application/users', {
    email: input.email,
    username: input.username,
    first_name: firstName,
    last_name: lastName,
    password: input.password,
    root_admin: input.root_admin,
  });
  return result.attributes;
}

/** True when the panel answers, used by the health endpoint. */
export async function ping(): Promise<boolean> {
  if (!env.pterodactylEnabled) return false;
  try {
    await applicationRequest('GET', '/api/application/nodes', undefined, 6000);
    return true;
  } catch {
    return false;
  }
}
