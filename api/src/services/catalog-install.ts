import { DISCORD_TEMPLATES } from './discord-templates.js';

/** Files and settings a published preset writes into the customer container. */
export interface CatalogInstallPlan {
  productSlug: string;
  presetSlug: string;
  files: { path: string; content: string }[];
  /** Merged into an existing properties file instead of replacing it. */
  properties?: { path: string; values: Record<string, string> };
  /** Appended once to an existing config file. */
  append?: { path: string; line: string };
  startup: string | null;
  /** Merged into the egg environment. Never a full replacement. */
  environment: Record<string, string>;
}

export function presetChosen(config: unknown): boolean {
  const slug = (config as { catalog?: { preset?: { slug?: unknown } } } | null)?.catalog?.preset?.slug;
  return typeof slug === 'string' && slug.length > 0;
}

/** A preset is installed only after the server process is running. Five tries, then it stops. */
export function presetOutcome(state: string, attempts: number): 'installed' | 'retry' | 'gave_up' {
  if (state === 'running') return 'installed';
  if (attempts >= 5) return 'gave_up';
  return 'retry';
}

export function safeInstallPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  const parts = path.split('/').slice(1);
  return parts.length > 0 && parts.every((part) => part !== '' && part !== '.' && part !== '..' && /^[A-Za-z0-9._@~-]+$/.test(part));
}

export function mergeProperties(existing: string, values: Record<string, string>): string {
  const lines = existing.split(/\r?\n/);
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const match = /^([A-Za-z0-9_.-]+)=(.*)$/.exec(line);
    if (!match || !(match[1] in values)) return line;
    seen.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  return `${next.filter((line, index) => line !== '' || index < next.length - 1).join('\n')}\n`;
}

export function appendOnce(existing: string, line: string): string {
  const wanted = line.trim();
  if (existing.split(/\r?\n/).some((entry) => entry.trim() === wanted)) {
    return existing.endsWith('\n') || existing === '' ? existing : `${existing}\n`;
  }
  const base = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`;
  return `${base}${wanted}\n`;
}

/** The install for a known preset. Null means the choice has no files to write. */
export function catalogInstallPlan(productSlug: string, presetSlug: string): CatalogInstallPlan | null {
  const discord = productSlug === 'discord-bot' ? DISCORD_TEMPLATES[presetSlug] : undefined;
  if (discord) {
    return {
      productSlug,
      presetSlug,
      files: [
        { path: '/package.json', content: discord.packageJson },
        { path: '/index.js', content: discord.index },
      ],
      startup: 'npm install && node index.js',
      environment: {},
    };
  }
  const runtime = productSlug === 'discord-bot' || productSlug === 'nodejs' || productSlug === 'python';
  if ((productSlug === 'python' && (presetSlug === 'blank' || presetSlug === 'py-blank'))) {
    return {
      productSlug,
      presetSlug,
      files: [
        { path: '/requirements.txt', content: '' },
        { path: '/main.py', content: 'print("blipmade bot is running")\n' },
      ],
      startup: 'pip install -r requirements.txt && python main.py',
      environment: {},
    };
  }
  if (runtime && presetSlug === 'blank') {
    return {
      productSlug,
      presetSlug,
      files: [
        { path: '/package.json', content: JSON.stringify({ name: 'blipmade-bot', private: true, main: 'index.js' }, null, 2) },
        { path: '/index.js', content: 'console.log("blipmade bot is running");\n' },
      ],
      startup: 'npm install && node index.js',
      environment: {},
    };
  }
  if (runtime && (presetSlug === 'git' || presetSlug === 'zip' || presetSlug === 'py-git' || presetSlug === 'py-zip')) {
    return null;
  }
  if (productSlug === 'minecraft-paper' && presetSlug === 'paper-survival') {
    return {
      productSlug,
      presetSlug,
      files: [],
      properties: { path: '/server.properties', values: { gamemode: 'survival', difficulty: 'normal', pvp: 'true', 'white-list': 'false', motd: 'Blipmade survival' } },
      startup: null,
      environment: {},
    };
  }
  if (productSlug === 'minecraft-forge' && presetSlug === 'forge-modded') {
    return {
      productSlug,
      presetSlug,
      files: [{ path: '/mods/.blipmade-forge', content: 'Forge modpacks install from the server page into this folder.\n' }],
      properties: { path: '/server.properties', values: { gamemode: 'survival', motd: 'Blipmade Forge' } },
      startup: null,
      environment: {},
    };
  }
  if (productSlug === 'counter-strike-2' && presetSlug === 'casual') {
    return { productSlug, presetSlug, files: [], startup: null, environment: { GAME_TYPE: '0', GAME_MODE: '0', SRCDS_MAP: 'de_dust2' } };
  }
  if (productSlug === 'counter-strike-2' && presetSlug === 'competitive') {
    return { productSlug, presetSlug, files: [], startup: null, environment: { GAME_TYPE: '0', GAME_MODE: '1', SRCDS_MAP: 'de_mirage' } };
  }
  if (productSlug === 'counter-strike-1-6' && presetSlug === 'dust2') {
    return { productSlug, presetSlug, files: [], startup: null, environment: { HLDS_GAME: 'cstrike', SRCDS_MAP: 'de_dust2' } };
  }
  if (productSlug === 'rust' && presetSlug === 'procedural') {
    return { productSlug, presetSlug, files: [], startup: null, environment: { LEVEL: 'procedural', WORLD_SIZE: '3000' } };
  }
  if (productSlug === 'fivem' && presetSlug === 'freeroam') {
    return {
      productSlug,
      presetSlug,
      files: [
        { path: '/resources/blipmade-freeroam/fxmanifest.lua', content: "fx_version 'cerulean'\ngame 'gta5'\nserver_script 'server.lua'\n" },
        { path: '/resources/blipmade-freeroam/server.lua', content: "RegisterCommand('blipmade', function()\n  print('blipmade freeroam resource is running')\nend, true)\n" },
      ],
      append: { path: '/server.cfg', line: 'ensure blipmade-freeroam' },
      startup: null,
      environment: {},
    };
  }
  if (productSlug === 'valheim' && presetSlug === 'dedicated') {
    return { productSlug, presetSlug, files: [], startup: null, environment: { WORLD: 'Dedicated' } };
  }
  return null;
}

export interface CatalogInstallIO {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  startup(startup: string | null, environment: Record<string, string>): Promise<void>;
}

/** Writes the plan. A repeated call writes the same files and does not duplicate an appended line. */
export async function runCatalogInstall(plan: CatalogInstallPlan, io: CatalogInstallIO): Promise<string[]> {
  const written: string[] = [];
  for (const file of plan.files) {
    if (!safeInstallPath(file.path)) throw new Error(`The preset path is not safe: ${file.path}`);
    await io.write(file.path, file.content);
    written.push(file.path);
  }
  if (plan.properties) {
    if (!safeInstallPath(plan.properties.path)) throw new Error(`The preset path is not safe: ${plan.properties.path}`);
    const existing = await io.read(plan.properties.path);
    await io.write(plan.properties.path, mergeProperties(existing ?? '', plan.properties.values));
    written.push(plan.properties.path);
  }
  if (plan.append) {
    if (!safeInstallPath(plan.append.path)) throw new Error(`The preset path is not safe: ${plan.append.path}`);
    const existing = await io.read(plan.append.path);
    await io.write(plan.append.path, appendOnce(existing ?? '', plan.append.line));
    written.push(plan.append.path);
  }
  if (plan.startup || Object.keys(plan.environment).length) await io.startup(plan.startup, plan.environment);
  return written;
}
