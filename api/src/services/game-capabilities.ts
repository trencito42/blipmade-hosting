/**
 * Game-aware capability registry. A product only exposes actions that have a backend.
 * Unsupported operations are absent, never simulated.
 */

export type GameCapability =
  | 'config-env'
  | 'config-file'
  | 'minecraft-plugins'
  | 'minecraft-modpacks'
  | 'minecraft-worlds'
  | 'minecraft-players'
  | 'minecraft-performance'
  | 'minecraft-crossplay'
  | 'addons'
  | 'smart-connect'
  | 'console'
  | 'backups';

export interface GameCapabilityProfile {
  slug: string;
  title: string;
  capabilities: GameCapability[];
  configFile: string | null;
  configKeys: { key: string; label: string; source: 'env' | 'properties' }[];
}

const SHARED: GameCapability[] = ['console', 'backups'];

export const GAME_CAPABILITIES: GameCapabilityProfile[] = [
  {
    slug: 'minecraft-paper',
    title: 'Minecraft Paper',
    capabilities: [...SHARED, 'minecraft-plugins', 'minecraft-worlds', 'minecraft-players', 'minecraft-performance', 'minecraft-crossplay', 'addons', 'smart-connect'],
    configFile: '/server.properties',
    configKeys: [],
  },
  {
    slug: 'minecraft-folia',
    title: 'Minecraft Folia',
    capabilities: [...SHARED, 'minecraft-plugins', 'minecraft-worlds', 'minecraft-players', 'minecraft-performance', 'addons', 'smart-connect'],
    configFile: '/server.properties',
    configKeys: [],
  },
  {
    slug: 'minecraft-forge',
    title: 'Minecraft Forge',
    capabilities: [...SHARED, 'minecraft-worlds', 'minecraft-players', 'minecraft-modpacks', 'addons', 'smart-connect'],
    configFile: '/server.properties',
    configKeys: [],
  },
  {
    slug: 'minecraft-bedrock',
    title: 'Bedrock',
    capabilities: [...SHARED, 'config-file', 'addons'],
    configFile: '/server.properties',
    configKeys: [
      { key: 'server-name', label: 'Server name', source: 'properties' },
      { key: 'gamemode', label: 'Game mode', source: 'properties' },
      { key: 'difficulty', label: 'Difficulty', source: 'properties' },
      { key: 'max-players', label: 'Max players', source: 'properties' },
      { key: 'level-name', label: 'World name', source: 'properties' },
    ],
  },
  {
    slug: 'rust',
    title: 'Rust',
    capabilities: [...SHARED, 'config-env', 'addons'],
    configFile: null,
    configKeys: [
      { key: 'LEVEL', label: 'Level', source: 'env' },
      { key: 'WORLD_SIZE', label: 'World size', source: 'env' },
      { key: 'HOSTNAME', label: 'Server name', source: 'env' },
    ],
  },
  {
    slug: 'fivem',
    title: 'FiveM',
    capabilities: [...SHARED, 'config-file', 'addons'],
    configFile: '/server.cfg',
    configKeys: [
      { key: 'sv_hostname', label: 'Hostname', source: 'properties' },
      { key: 'sv_maxclients', label: 'Max clients', source: 'properties' },
    ],
  },
  {
    slug: 'counter-strike-1-6',
    title: 'Counter-Strike 1.6',
    capabilities: [...SHARED, 'config-env', 'addons'],
    configFile: null,
    configKeys: [
      { key: 'HLDS_GAME', label: 'Game folder', source: 'env' },
      { key: 'SRCDS_MAP', label: 'Map', source: 'env' },
    ],
  },
  {
    slug: 'counter-strike-2',
    title: 'Counter-Strike 2',
    capabilities: [...SHARED, 'config-env', 'addons'],
    configFile: null,
    configKeys: [
      { key: 'GAME_TYPE', label: 'Game type', source: 'env' },
      { key: 'GAME_MODE', label: 'Game mode', source: 'env' },
      { key: 'SRCDS_MAP', label: 'Map', source: 'env' },
    ],
  },
  {
    slug: 'valheim',
    title: 'Valheim',
    capabilities: [...SHARED, 'config-env', 'addons'],
    configFile: null,
    configKeys: [{ key: 'WORLD', label: 'World', source: 'env' }],
  },
  {
    slug: 'factorio',
    title: 'Factorio',
    capabilities: [...SHARED, 'config-env', 'addons', 'smart-connect'],
    configFile: null,
    configKeys: [{ key: 'AUTOSAVE_INTERVAL', label: 'Autosave interval (minutes)', source: 'env' }],
  },
];

export function capabilitiesFor(slug: string): GameCapabilityProfile | null {
  return GAME_CAPABILITIES.find((row) => row.slug === slug) ?? null;
}

export function hasCapability(slug: string, capability: GameCapability): boolean {
  return Boolean(capabilitiesFor(slug)?.capabilities.includes(capability));
}
