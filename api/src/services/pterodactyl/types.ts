/** Shapes returned by the Pterodactyl Application API (v1 media type). */

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
