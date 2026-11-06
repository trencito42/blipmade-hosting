/**
 * The settings a game tab is allowed to change.
 * A key is either an egg variable or one line of a known file. There is no shared plugin installer.
 */

export interface GameField {
  key: string;
  label: string;
  source: 'env' | 'properties';
  file?: string;
}

export interface GameWorkspace {
  slug: string;
  title: string;
  summary: string;
  fields: GameField[];
}

export const GAME_WORKSPACES: GameWorkspace[] = [
  {
    slug: 'minecraft-bedrock',
    title: 'Bedrock',
    summary: 'These values are written into server.properties. Bedrock has no Paper plugin installer.',
    fields: [
      { key: 'server-name', label: 'Server name', source: 'properties', file: '/server.properties' },
      { key: 'gamemode', label: 'Game mode', source: 'properties', file: '/server.properties' },
      { key: 'difficulty', label: 'Difficulty', source: 'properties', file: '/server.properties' },
      { key: 'max-players', label: 'Max players', source: 'properties', file: '/server.properties' },
      { key: 'level-name', label: 'World name', source: 'properties', file: '/server.properties' },
    ],
  },
  {
    slug: 'rust',
    title: 'Rust',
    summary: 'Map settings are the egg variables. They apply on the next start. Rust has no plugin installer here.',
    fields: [
      { key: 'LEVEL', label: 'Level', source: 'env' },
      { key: 'WORLD_SIZE', label: 'World size', source: 'env' },
      { key: 'HOSTNAME', label: 'Server name', source: 'env' },
    ],
  },
  {
    slug: 'fivem',
    title: 'FiveM',
    summary: 'server.cfg is the server file. Resources are folders you put in the server, not a shared plugin catalogue.',
    fields: [
      { key: 'sv_hostname', label: 'Hostname', source: 'properties', file: '/server.cfg' },
      { key: 'sv_maxclients', label: 'Max clients', source: 'properties', file: '/server.cfg' },
    ],
  },
  {
    slug: 'counter-strike-1-6',
    title: 'Counter-Strike 1.6',
    summary: 'The map and the game folder are egg variables. They apply on the next start.',
    fields: [
      { key: 'HLDS_GAME', label: 'Game folder', source: 'env' },
      { key: 'SRCDS_MAP', label: 'Map', source: 'env' },
    ],
  },
  {
    slug: 'counter-strike-2',
    title: 'Counter-Strike 2',
    summary: 'Mode and map are egg variables. They apply on the next start. There is no plugin installer.',
    fields: [
      { key: 'GAME_TYPE', label: 'Game type', source: 'env' },
      { key: 'GAME_MODE', label: 'Game mode', source: 'env' },
      { key: 'SRCDS_MAP', label: 'Map', source: 'env' },
    ],
  },
  {
    slug: 'valheim',
    title: 'Valheim',
    summary: 'The world name is the egg variable WORLD. It applies on the next start.',
    fields: [{ key: 'WORLD', label: 'World', source: 'env' }],
  },
  {
    slug: 'factorio',
    title: 'Factorio',
    summary: 'Autosave interval is the egg variable. There is no shared add-on catalogue.',
    fields: [{ key: 'AUTOSAVE_INTERVAL', label: 'Autosave interval (minutes)', source: 'env' }],
  },
];

export function gameWorkspace(slug: string): GameWorkspace | null {
  return GAME_WORKSPACES.find((workspace) => workspace.slug === slug) ?? null;
}

/** Reads key=value or key "value" lines and writes the listed keys back without dropping the other lines. */
export function mergeConfigLines(text: string, updates: Record<string, string>): string {
  const keys = new Set(Object.keys(updates));
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((line) => {
    const match = /^(\s*)([A-Za-z0-9_.-]+)(\s*[=\s]\s*)(.*)$/.exec(line);
    if (!match || !keys.has(match[2]!)) return line;
    seen.add(match[2]!);
    const quoted = match[4]!.startsWith('"');
    const value = updates[match[2]!] ?? '';
    return `${match[1]}${match[2]}${match[3]}${quoted ? `"${value.replace(/"/g, '')}"` : value}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  return lines.filter((line, index, all) => line !== '' || index < all.length - 1).join('\n') + (text.endsWith('\n') || text === '' ? '\n' : '');
}

export function readConfigValue(text: string, key: string): string {
  for (const line of text.split(/\r?\n/)) {
    const match = new RegExp(`^\\s*${key}(?:\\s*=\\s*|\\s+)\"?([^\"\\n]*)\"?\\s*$`).exec(line);
    if (match) return match[1] ?? '';
  }
  return '';
}
