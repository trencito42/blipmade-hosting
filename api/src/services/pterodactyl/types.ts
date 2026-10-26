/**
 * Shapes returned by the Pterodactyl API, and the vocabulary of the states the
 * node reports for a server.
 */

export interface PteroResource {
  object: string;
  attributes: Record<string, unknown>;
}

export interface PteroList<T = Record<string, unknown>> {
  object: 'list';
  data: { object: string; attributes: T }[];
  meta?: { pagination?: { total: number; count: number; per_page: number; current_page: number; total_pages: number } };
}

export interface PteroServer {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  description: string;
  status: string | null;
  suspended: boolean;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
    oom_disabled?: boolean;
    threads?: number | null;
  };
  feature_limits: { databases: number; allocations: number; backups: number };
  user: number;
  node: number;
  allocation: number | null;
  nest: number;
  egg: number;
  container: {
    startup_command: string;
    image: string;
    installed: number;
    environment: Record<string, string>;
  };
  created_at: string;
  updated_at: string;
}

export interface PteroNode {
  id: number;
  uuid: string;
  name: string;
  fqdn: string;
  scheme: string;
  memory: number;
  disk: number;
  memory_overallocate: number;
  disk_overallocate: number;
  maintenance_mode: boolean;
  allocated_resources: { memory: number; disk: number };
}

export interface PteroEgg {
  id: number;
  uuid: string;
  name: string;
  docker_image: string;
  startup: string;
  nest_id: number;
}

export interface PteroAllocation {
  id: number;
  ip: string;
  alias: string | null;
  port: number;
  notes: string | null;
  assigned: boolean;
}

export interface PteroUser {
  id: number;
  username: string;
  email: string;
  root_admin: boolean;
  created_at: string;
  /**
   * The identifier that the owner of the account put on it. Blipmade writes
   * `blipmade_acc_<the id of the customer>` here, and that is the only thing
   * a reconciliation looks up. An address is never used to find an account.
   */
  external_id: string | null;
  first_name?: string;
  last_name?: string;
}

/** Body accepted by POST /api/application/servers on Pterodactyl 1.15. */
export interface CreateServerInput {
  name: string;
  description?: string;
  user: number;
  egg: number;
  docker_image: string;
  startup: string;
  environment: Record<string, string>;
  limits: { memory: number; swap: number; disk: number; io: number; cpu: number };
  resource_limits: { memory: number; swap: number; disk: number; io: number; cpu: number };
  feature_limits: { databases: number; backups: number };
  /**
   * `default` is the id of the allocation that becomes the server's primary
   * address, and `allocations` lists every address assigned to it.
   */
  allocation: { default: number; allocations: number[] };
}

/**
 * Shapes returned by the Pterodactyl Client API (v1 media type).
 *
 * The client API answers with a JSON:API style envelope: a single resource
 * carries `attributes`, a collection carries `data` with one entry per
 * resource.
 */

/** A single JSON:API resource object: `{ object, attributes }`. */
export interface PteroClientResource<A = Record<string, unknown>> {
  object?: string;
  attributes: A;
}

/** A JSON:API collection: `{ object, data: [{ object, attributes }] }`. */
export interface PteroClientCollection<A = Record<string, unknown>> {
  object?: string;
  data: PteroClientResource<A>[];
  meta?: Record<string, unknown>;
}

/** Attributes of a file entry of `GET /files/list`. */
export interface PteroFileAttributes {
  name: string;
  created_at: string;
  modified_at: string;
  mode: string;
  size: number;
  is_directory?: boolean;
  is_file?: boolean;
  is_symlink?: boolean;
}

/** Attributes of `GET /files/contents`. */
export interface PteroFileContentsAttributes {
  content: string;
  encoding: string;
}

/** Attributes of `GET /resources`. */
export interface PteroStatsAttributes {
  state?: string;
  current_state?: string;
  is_suspended?: boolean;
  cpu_absolute?: number;
  memory_bytes?: number;
  network?: { rx?: number; tx?: number };
  disk?: { used?: number };
  uptime?: number;
  /** Older panels nest the counters below "resources". */
  resources?: {
    memory_bytes?: number;
    cpu_absolute?: number;
    disk_bytes?: number;
    network_rx_bytes?: number;
    network_tx_bytes?: number;
    /** The time the container has been up, in milliseconds. */
    uptime?: number;
  };
}

/** Attributes of a backup of `GET /backups`. */
export interface PteroBackupAttributes {
  uuid: string;
  name: string;
  size?: number;
  bytes?: number;
  created_at: string;
  is_locked?: boolean;
}

/** Attributes of `GET /servers/{uuid}`. */
export interface PteroClientServerAttributes {
  uuid: string;
  identifier: string;
  name?: string;
  server_name?: string;
  /** The panel names the state of a server "status" on the client api. */
  status?: string;
  state?: string;
  current_state?: string;
  is_suspended?: boolean;
  limits?: { memory: number; swap: number; disk: number; io: number; cpu: number };
  /** The panel names the features of a server "egg_features" on the client api. */
  egg_features?: string[];
  features?: string[];
  created_at?: string;
}

/**
 * The state of a container that is really serving.
 *
 * The panel takes the state of a server from the daemon of the node. Only
 * "running" means that the container is up and serving: a container that is
 * "starting" has not passed its health check yet, and one that is "offline",
 * "stopped" or "crashed" is not a service at all. A deployment that is called
 * healthy in one of those states hands a broken container to a customer.
 */
export const RUNNING_STATE = 'running';

/**
 * The state of a container that is coming up.
 *
 * A container that is starting may still reach the running state, so a check
 * that waits for it is right and a check that gives up at once is wrong.
 */
export const STARTING_STATE = 'starting';

/**
 * The state of the node without spaces around it and in one case.
 *
 * The daemon of a node is not bound to one spelling of a state, so the states
 * are compared in a form that does not depend on it.
 */
export function normalizeState(state: string | null | undefined): string {
  return (state ?? '').trim().toLowerCase();
}

/** True when the state the node reports means the container is up and serving. */
export function isRunningState(state: string | null | undefined): boolean {
  return normalizeState(state) === RUNNING_STATE;
}

/** True when the state the node reports means the container is still coming up. */
export function isStartingState(state: string | null | undefined): boolean {
  return normalizeState(state) === STARTING_STATE;
}

/**
 * The memory a container has to use to be counted as alive.
 *
 * A container that is not running has no memory of its own, and a container
 * that runs always has some. The containers of this platform use tens of
 * megabytes, so one megabyte is the lowest line that tells the two apart
 * without being wrong for a small application.
 */
export const MEMORY_ALIVE_BYTES = 1024 * 1024;

/** What the node says about a container. */
export interface ContainerEvidence {
  /** The state the node reports for the container. */
  state: string | null | undefined;
  /** The memory the container uses, in bytes. */
  memoryBytes: number;
  /** True when the container is suspended. */
  suspended: boolean;
}

/** What the platform concludes from what the node says. */
export interface ContainerVerdict {
  /** True when the container serves the customer. */
  serving: boolean;
  /** True when the node itself said that the container is running. */
  confirmed: boolean;
  /** The reason, in words, for the verdict. */
  reason: string;
}

/**
 * Judges a container by what the node says about it.
 *
 * The node only says "running" when the health check of the egg passes. A
 * product whose egg has no health check, or one whose check does not match
 * the application, stays in "starting" for as long as the container is up: the
 * container serves, but the node never says so.
 *
 * A check that only accepts "running" refuses those servers, and the customer
 * gets his money back for a service that works. A check that accepts every
 * state calls a stopped container healthy. The truth is in between: the
 * container is alive when the node reports memory in use and the container is
 * not suspended.
 *
 * The doubt is never hidden: a container that is alive but that the node does
 * not confirm is served, and the reason says so in words.
 */
export function judgeContainer(evidence: ContainerEvidence): ContainerVerdict {
  const state = normalizeState(evidence.state);
  const memory = Number.isFinite(evidence.memoryBytes) ? evidence.memoryBytes : 0;

  if (isRunningState(state)) {
    return {
      serving: true,
      confirmed: true,
      reason: `The container is running on the node (state: ${state}).`,
    };
  }

  if (isStartingState(state)) {
    const alive = !evidence.suspended && memory >= MEMORY_ALIVE_BYTES;
    if (alive) {
      return {
        serving: true,
        confirmed: false,
        reason:
          `The node reports the state "${state}" and the container uses ${Math.round(memory / (1024 * 1024))} MB of memory, ` +
          'so the container is alive; the node does not confirm the running state, because the health check of the egg does not pass.',
      };
    }
    return {
      serving: false,
      confirmed: false,
      reason: `The node reports the state "${state}" and the container shows no memory in use yet, so it is not serving yet.`,
    };
  }

  if (!state) {
    return {
      serving: false,
      confirmed: false,
      reason: 'The node reported no state at all for the server, so the deployment cannot be called healthy.',
    };
  }

  return {
    serving: false,
    confirmed: false,
    reason: `The node reports the state "${state}", which is not a state in which the container serves the customer.`,
  };
}
