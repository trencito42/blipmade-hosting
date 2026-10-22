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
