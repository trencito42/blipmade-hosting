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

export type InstanceFeatureId =
  | 'players'
  | 'worlds'
  | 'plugins'
  | 'mods'
  | 'modpacks'
  | 'addons'
  | 'serverSettings'
  | 'versionChange'
  | 'backup'
  | 'console'
  | 'files'
  | 'databases'
  | 'network'
  | 'startup'
  | 'git'
  | 'schedules'
  | 'metrics'
  | 'advanced'
  | 'resourceScaling'
  | 'crossplay';

export interface InstanceCapability {
  supported: boolean;
  available: boolean;
  reason?: string;
  level?: 'basic' | 'advanced';
  requiresRestart?: boolean;
}

export interface InstanceCapabilities {
  productSlug: string;
  family: 'minecraft-java' | 'minecraft-bedrock' | 'games' | 'web' | 'bot' | 'database' | 'generic';
  runtime?: string;
  loader?: string;
  edition?: string;
  features: Record<InstanceFeatureId, InstanceCapability>;
  primaryTabs: string[];
}

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

const DEPLOY_SLUGS = new Set(['nodejs', 'discord-bot', 'python', 'php', 'golang', 'rust-runtime']);
const DATABASE_SLUGS = new Set(['mariadb', 'mysql', 'postgresql', 'mongodb', 'redis']);
const GAME_SLUGS = new Set(['rust', 'fivem', 'counter-strike-1-6', 'counter-strike-2', 'valheim', 'factorio']);

function familyFor(slug: string): InstanceCapabilities['family'] {
  if (['minecraft-paper', 'minecraft-folia', 'minecraft-forge'].includes(slug)) return 'minecraft-java';
  if (slug === 'minecraft-bedrock') return 'minecraft-bedrock';
  if (GAME_SLUGS.has(slug)) return 'games';
  if (slug === 'discord-bot') return 'bot';
  if (DATABASE_SLUGS.has(slug)) return 'database';
  if (DEPLOY_SLUGS.has(slug) || slug === 'wordpress') return 'web';
  return 'generic';
}

/**
 * Server-owned workspace manifest. It describes presentation only; every API
 * operation still enforces ownership/share permissions independently.
 */
export function instanceCapabilities(input: {
  productSlug: string;
  deployed: boolean;
  access: 'owner' | 'manager' | 'viewer';
}): InstanceCapabilities {
  const { productSlug: slug, deployed, access } = input;
  const family = familyFor(slug);
  const profile = capabilitiesFor(slug);
  const canOperate = access !== 'viewer';
  const unavailable = !deployed
    ? 'This service is not deployed yet.'
    : !canOperate
      ? 'Your shared access is read-only.'
      : undefined;
  const feature = (supported: boolean, options: { level?: 'basic' | 'advanced'; restart?: boolean; reason?: string } = {}): InstanceCapability => ({
    supported,
    available: supported && !unavailable,
    ...(supported && unavailable ? { reason: unavailable } : options.reason ? { reason: options.reason } : {}),
    ...(options.level ? { level: options.level } : {}),
    ...(options.restart ? { requiresRestart: true } : {}),
  });
  const readFeature = (options: { level?: 'basic' | 'advanced' } = {}): InstanceCapability => ({
    supported: true,
    available: deployed,
    ...(!deployed ? { reason: 'This service is not deployed yet.' } : {}),
    ...(options.level ? { level: options.level } : {}),
  });
  const java = family === 'minecraft-java';
  const bedrock = family === 'minecraft-bedrock';
  const game = java || bedrock || family === 'games';
  const deploy = DEPLOY_SLUGS.has(slug);
  const plugins = hasCapability(slug, 'minecraft-plugins');
  const modpacks = hasCapability(slug, 'minecraft-modpacks');
  const worlds = hasCapability(slug, 'minecraft-worlds') || bedrock;
  const settings = Boolean(profile?.configKeys.length || profile?.configFile);
  const ownerOnlyReason = access === 'owner' ? undefined : 'Only the service owner can change billing resources.';

  const features: Record<InstanceFeatureId, InstanceCapability> = {
    players: feature(java),
    worlds: feature(worlds, { restart: true }),
    plugins: feature(plugins, { restart: true }),
    mods: feature(modpacks, { restart: true }),
    modpacks: feature(modpacks, { restart: true }),
    addons: feature(hasCapability(slug, 'addons'), { restart: true }),
    serverSettings: feature(settings, { restart: true }),
    versionChange: feature(slug === 'minecraft-paper', { restart: true }),
    backup: feature(true),
    console: readFeature(),
    files: feature(true, { level: 'advanced' }),
    databases: feature(true, { level: 'advanced' }),
    network: feature(true, { level: 'advanced' }),
    startup: feature(true, { level: 'advanced' }),
    git: feature(deploy),
    schedules: feature(true, { level: 'advanced' }),
    metrics: readFeature({ level: 'advanced' }),
    advanced: readFeature(),
    resourceScaling: {
      supported: true,
      available: deployed && access === 'owner',
      ...(!deployed ? { reason: 'This service is not deployed yet.' } : ownerOnlyReason ? { reason: ownerOnlyReason } : {}),
      level: 'advanced',
    },
    crossplay: feature(hasCapability(slug, 'minecraft-crossplay'), { restart: true }),
  };

  const primaryTabs = java
    ? ['overview', 'console', 'minecraft', ...(plugins || modpacks ? ['addons'] : []), 'backups', 'settings']
    : game
      ? ['overview', 'console', 'game', 'addons', 'backups', 'settings']
      : deploy
        ? ['overview', 'console', 'git', 'domains', 'settings']
        : family === 'database'
          ? ['overview', 'databases', 'backups', 'settings']
          : ['overview', 'console', 'files', 'backups', 'settings'];

  return {
    productSlug: slug,
    family,
    ...(java ? { edition: 'Java', loader: slug.replace('minecraft-', '') } : bedrock ? { edition: 'Bedrock' } : {}),
    ...(deploy ? { runtime: slug } : {}),
    features,
    primaryTabs,
  };
}
