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
        `Pterodactyl ${method} ${path} failed with ${response.status}.`,
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
 * The Application API has no PATCH for servers. `POST /servers/{id}/details`
 * is a full update and requires name, user, egg, docker_image, startup,
 * environment and limits, so the current server state is read first and merged
 * with the changes.
 */
export async function updateServerDetails(
  serverId: number,
  changes: {
    name?: string;
    user?: number;
    egg?: number;
    docker_image?: string;
    startup?: string;
    environment?: Record<string, string>;
    limits?: { memory: number; swap: number; disk: number; io: number; cpu: number };
    feature_limits?: { databases: number; backups: number };
  },
): Promise<PteroServer> {
  const current = await getServer(serverId);
  const payload = {
    name: changes.name ?? current.name,
    description: current.description ?? '',
    user: changes.user ?? current.user,
    egg: changes.egg ?? current.egg,
    docker_image: changes.docker_image ?? current.container.image,
    startup: changes.startup ?? current.container.startup_command,
    environment: changes.environment ?? current.container.environment,
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
  };
  const result = await applicationRequest<{ attributes: PteroServer }>(
    'POST',
    `/api/application/servers/${serverId}/details`,
    payload,
  );
  return result.attributes;
}

export async function setServerEnvironment(
  serverId: number,
  environment: Record<string, string>,
): Promise<void> {
  await applicationRequest('POST', `/api/application/servers/${serverId}/environment`, { environment });
}

export async function buildServer(serverId: number, payload: { image: string; pull_image?: boolean; rebuild_container?: boolean; allow_failure?: boolean }): Promise<void> {
  await applicationRequest('POST', `/api/application/servers/${serverId}/build`, payload);
}

export async function installServer(serverId: number): Promise<void> {
  await applicationRequest('POST', `/api/application/servers/${serverId}/install`);
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

export async function createUser(input: {
  email: string;
  username: string;
  password: string;
  root_admin: boolean;
}): Promise<PteroUser> {
  const result = await applicationRequest<{ attributes: PteroUser }>('POST', '/api/application/users', {
    email: input.email,
    username: input.username,
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
