/**
 * Puts the panel stub back into a known state before a run of the journey
 * harness: the addresses are free again and one sample server is left on the
 * egg, because the platform derives the environment template of an egg from an
 * existing server on that egg (Pterodactyl 1.15 does not expose the variables
 * of an egg through the Application API).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const STATE_FILE = process.env.STUB_STATE || '/tmp/cj/panel-state.json';
const uuid = () => crypto.randomUUID();

const state = {
  nodes: [{
    id: 1, uuid: uuid(), name: 'cj-node-01', fqdn: 'node1.blipmade.com', scheme: 'https',
    memory: 122880, disk: 819200, memory_overallocate: 0, disk_overallocate: 0,
    maintenance_mode: false, allocated_resources: { memory: 0, disk: 0 },
  }],
  nests: [{ id: 1, uuid: uuid(), name: 'Blipmade Nest' }],
  eggs: [{
    id: 15, uuid: uuid(), name: 'Blipmade Egg', docker_image: 'ghcr.io/blipmade/base:1',
    startup: 'java -jar server.jar', nest_id: 1,
  }],
  allocations: Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, ip: '10.77.0.11', alias: `cj-alloc-${String(i + 1).padStart(2, '0')}`,
    port: 25565 + i, notes: null, assigned: false,
  })),
  users: [],
  servers: [{
    id: 5000, uuid: uuid(), identifier: "cj-5000", name: 'cj-egg-template',
    description: 'environment template for egg 15', status: 'running', suspended: false,
    limits: { memory: 512, swap: 0, disk: 10240, io: 500, cpu: 100 },
    feature_limits: { databases: 3, allocations: 3, backups: 3 },
    user: 1, node: 1, allocation: 1, nest: 1, egg: 15,
    container: {
      startup_command: 'java -jar server.jar', image: 'ghcr.io/blipmade/base:1', installed: 1,
      environment: {
        SERVER_JARFILE: 'server.jar', VANILLA_VERSION: 'latest',
        MIN_MEMORY: '512', MAX_MEMORY: '512', STARTUP_COMMAND: 'java -jar server.jar',
      },
    },
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }],
  nextServerId: 5001,
  nextUserId: 500,
  files: {}, databases: {}, backups: {}, schedules: {}, activity: {}, minted: {},
};

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log(`panel stub state reset: ${state.allocations.length} addresses free, 1 sample server on egg 15`);
