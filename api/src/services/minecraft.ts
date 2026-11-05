import net from 'node:net';
import { badRequest } from '../lib/errors.js';

/**
 * Minecraft helpers. Everything here is for the Java servers (Paper, Folia, Forge); Bedrock speaks another protocol and
 * keeps the generic tools of the panel. The commands go through the panel's own command endpoint, so no RCON port is
 * opened and no RCON password exists.
 */

export const MINECRAFT_JAVA = new Set(['minecraft-paper', 'minecraft-folia', 'minecraft-forge']);

const JAVA_NAME = /^[A-Za-z0-9_]{3,16}$/;

export function cleanPlayer(raw: string): string {
  const name = raw.trim();
  if (!JAVA_NAME.test(name)) throw badRequest('A Minecraft name is 3 to 16 letters, numbers or underscores.', { player: 'Not a valid name.' });
  return name;
}

export type PlayerAction = 'whitelist-add' | 'whitelist-remove' | 'op' | 'deop' | 'kick' | 'ban' | 'pardon';

/** The one-line command for an action. The reason is plain text on one line. */
export function commandFor(action: PlayerAction, player: string, reason = ''): string {
  const name = cleanPlayer(player);
  const why = reason.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 100);
  switch (action) {
    case 'whitelist-add': return `whitelist add ${name}`;
    case 'whitelist-remove': return `whitelist remove ${name}`;
    case 'op': return `op ${name}`;
    case 'deop': return `deop ${name}`;
    case 'kick': return why ? `kick ${name} ${why}` : `kick ${name}`;
    case 'ban': return why ? `ban ${name} ${why}` : `ban ${name}`;
    case 'pardon': return `pardon ${name}`;
  }
}

/** A raw command from the owner of the server: one line, nothing that could end it early. */
export function cleanRawCommand(raw: string): string {
  const command = raw.trim().replace(/^\//, '');
  if (!command || command.length > 200 || /[\u0000-\u001f]/.test(command)) {
    throw badRequest('A command is one line of at most 200 characters.', { command: 'One line, up to 200 characters.' });
  }
  return command;
}

// --- server list ping -----------------------------------------------------------------------------------------

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let n = value >>> 0;
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (n !== 0);
  return Buffer.from(bytes);
}

function readVarint(buffer: Buffer, offset: number): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  for (let i = offset; i < buffer.length && shift < 35; i++) {
    const byte = buffer[i]!;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: i + 1 };
    shift += 7;
  }
  return null;
}

export interface McStatus {
  online: boolean;
  version?: string;
  motd?: string;
  players?: { online: number; max: number; sample: string[] };
}

/** Asks the server, the way the game client does, who is on and what version it runs. Gives up after 4 seconds. */
export function pingJava(host: string, port: number): Promise<McStatus> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let data = Buffer.alloc(0);
    const done = (status: McStatus) => { socket.destroy(); resolve(status); };
    socket.setTimeout(4000, () => done({ online: false }));
    socket.on('error', () => done({ online: false }));
    socket.on('connect', () => {
      const hostBytes = Buffer.from(host);
      const handshake = Buffer.concat([varint(0), varint(767), varint(hostBytes.length), hostBytes, Buffer.from([(port >> 8) & 0xff, port & 0xff]), varint(1)]);
      socket.write(Buffer.concat([varint(handshake.length), handshake, varint(1), Buffer.from([0])]));
    });
    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      const length = readVarint(data, 0);
      if (!length || data.length < length.next + length.value) return;
      const id = readVarint(data, length.next);
      const size = id ? readVarint(data, id.next) : null;
      if (!id || !size) return done({ online: false });
      const json = data.subarray(size.next, size.next + size.value).toString('utf8');
      try {
        const parsed = JSON.parse(json) as { version?: { name?: string }; players?: { online?: number; max?: number; sample?: { name?: string }[] }; description?: unknown };
        const description = parsed.description;
        const motd = typeof description === 'string' ? description : typeof (description as { text?: string })?.text === 'string' ? (description as { text: string }).text : '';
        done({
          online: true,
          version: parsed.version?.name,
          motd: motd.replace(/§./g, '').slice(0, 200),
          players: { online: parsed.players?.online ?? 0, max: parsed.players?.max ?? 0, sample: (parsed.players?.sample ?? []).map((p) => String(p.name ?? '')).filter(Boolean) },
        });
      } catch {
        done({ online: true });
      }
    });
  });
}

// --- server.properties ----------------------------------------------------------------------------------------

/** The keys the panel lets a customer change, with the values each accepts. Anything else stays in the file as it is. */
export const EDITABLE_PROPERTIES: Record<string, (value: string) => boolean> = {
  motd: (v) => v.length <= 200 && !/[\u0000-\u001f]/.test(v),
  'max-players': (v) => /^\d{1,4}$/.test(v) && Number(v) >= 1,
  difficulty: (v) => ['peaceful', 'easy', 'normal', 'hard'].includes(v),
  gamemode: (v) => ['survival', 'creative', 'adventure', 'spectator'].includes(v),
  pvp: (v) => v === 'true' || v === 'false',
  'white-list': (v) => v === 'true' || v === 'false',
  'enforce-whitelist': (v) => v === 'true' || v === 'false',
  'view-distance': (v) => /^\d{1,2}$/.test(v) && Number(v) >= 3 && Number(v) <= 32,
  'simulation-distance': (v) => /^\d{1,2}$/.test(v) && Number(v) >= 3 && Number(v) <= 32,
  'spawn-protection': (v) => /^\d{1,3}$/.test(v),
  'allow-flight': (v) => v === 'true' || v === 'false',
  'online-mode': (v) => v === 'true' || v === 'false',
  hardcore: (v) => v === 'true' || v === 'false',
  'level-seed': (v) => v.length <= 64 && !/[\u0000-\u001f]/.test(v),
};

export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/** Changes the given keys and leaves every other line, comment and order as it was. */
export function applyProperties(text: string, changes: Record<string, string>): string {
  for (const [key, value] of Object.entries(changes)) {
    const check = EDITABLE_PROPERTIES[key];
    if (!check) throw badRequest(`${key} cannot be changed here.`, { [key]: 'Not editable here.' });
    if (!check(value)) throw badRequest(`"${value}" is not valid for ${key}.`, { [key]: 'Not valid.' });
  }
  const remaining = new Map(Object.entries(changes));
  const lines = text.split('\n').map((line) => {
    const at = line.indexOf('=');
    const key = at > 0 && !line.startsWith('#') ? line.slice(0, at).trim() : '';
    if (key && remaining.has(key)) {
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return lines.join('\n') + '\n';
}

// --- names of players in the JSON lists --------------------------------------------------------------------------

export function namesOfList(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as { name?: string }[];
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry.name ?? '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// --- versions and plugins (public APIs, nothing is stored) ---------------------------------------------------------

const cache = new Map<string, { at: number; value: unknown }>();
async function cachedJson<T>(url: string, minutes: number): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < minutes * 60_000) return hit.value as T;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'blipmade-hosting/1.0 (support@blipmade.com)' } });
  if (!response.ok) throw badRequest('The list of versions could not be read right now. Try again in a moment.');
  const value = (await response.json()) as T;
  cache.set(url, { at: Date.now(), value });
  return value;
}

const RELEASE = /^\d+\.\d+(\.\d+)?$/;

/**
 * The game versions a PaperMC project (Paper or Folia) has builds for, newest first and only releases. The old
 * address (`api.papermc.io/v2`) is sunset and answers 410; `fill.papermc.io/v3` groups the versions by minor
 * release, newest group first, and the newest version first inside a group.
 */
export async function papermcVersions(project: 'paper' | 'folia'): Promise<string[]> {
  const data = await cachedJson<{ versions: Record<string, string[]> }>(`https://fill.papermc.io/v3/projects/${project}`, 10);
  return Object.values(data.versions ?? {}).flat().filter((version) => RELEASE.test(version));
}

export const paperVersions = (): Promise<string[]> => papermcVersions('paper');

/** The Minecraft versions Forge has a build for (the keys of its promotions are `<version>-latest` and `<version>-recommended`), newest first. */
export async function forgeVersions(): Promise<string[]> {
  const data = await cachedJson<{ promos: Record<string, string> }>('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', 30);
  const found = new Set<string>();
  for (const key of Object.keys(data.promos ?? {})) {
    const version = key.replace(/-(latest|recommended)$/, '');
    if (version !== key && RELEASE.test(version)) found.add(version);
  }
  const parts = (version: string) => version.split('.').map(Number);
  return [...found].sort((a, b) => {
    const left = parts(a);
    const right = parts(b);
    for (let index = 0; index < 3; index += 1) {
      const delta = (right[index] ?? 0) - (left[index] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  });
}

export interface PluginHit { slug: string; title: string; description: string; downloads: number; icon: string | null }

export async function searchPlugins(query: string, gameVersion: string): Promise<PluginHit[]> {
  if (!/^[A-Za-z0-9 ._-]{1,60}$/.test(query)) throw badRequest('Search for a plugin name: letters and numbers.');
  const facets = JSON.stringify([['project_type:plugin'], [`versions:${gameVersion}`], ['categories:paper', 'categories:spigot', 'categories:bukkit']]);
  const data = await cachedJson<{ hits: { slug: string; title: string; description: string; downloads: number; icon_url?: string }[] }>(
    `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=10&facets=${encodeURIComponent(facets)}`, 5,
  );
  return data.hits.map((hit) => ({ slug: hit.slug, title: hit.title, description: hit.description, downloads: hit.downloads, icon: hit.icon_url ?? null }));
}

export interface PluginFile { url: string; filename: string; size: number; version: string }

/** The newest file of a plugin that is built for this game version, from the CDN of Modrinth and nowhere else. */
export async function pluginFileFor(slug: string, gameVersion: string): Promise<PluginFile> {
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(slug)) throw badRequest('That is not a plugin.');
  const versions = await cachedJson<{ version_number: string; files: { url: string; filename: string; primary: boolean; size: number }[] }[]>(
    `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}&loaders=${encodeURIComponent(JSON.stringify(['paper', 'spigot', 'bukkit']))}`, 5,
  );
  const first = versions[0];
  const file = first?.files.find((entry) => entry.primary) ?? first?.files[0];
  if (!first || !file) throw badRequest(`No version of this plugin is built for Minecraft ${gameVersion}.`);
  if (!file.url.startsWith('https://cdn.modrinth.com/') || !/^[A-Za-z0-9._+-]{1,120}\.jar$/.test(file.filename) || file.size > 50 * 1024 * 1024) {
    throw badRequest('That file is not accepted.');
  }
  return { url: file.url, filename: file.filename, size: file.size, version: first.version_number };
}

export async function searchModpacks(query: string, gameVersion: string): Promise<PluginHit[]> {
  if (!/^[A-Za-z0-9 ._-]{1,60}$/.test(query)) throw badRequest('Search for a modpack name: letters and numbers.');
  const facets = JSON.stringify([['project_type:modpack'], [`versions:${gameVersion}`], ['categories:forge']]);
  const data = await cachedJson<{ hits: { slug: string; title: string; description: string; downloads: number; icon_url?: string }[] }>(
    `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=8&facets=${encodeURIComponent(facets)}`, 5,
  );
  return data.hits.map((hit) => ({ slug: hit.slug, title: hit.title, description: hit.description, downloads: hit.downloads, icon: hit.icon_url ?? null }));
}

export interface ModpackFile { directory: string; filename: string; url: string }

/** The mod jars a Forge modpack wants, taken from its index. Only Modrinth CDN files are kept. */
export async function modpackFilesFor(slug: string, gameVersion: string): Promise<{ title: string; files: ModpackFile[] }> {
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(slug)) throw badRequest('That is not a modpack.');
  const versions = await cachedJson<{ name: string; files: { url: string; filename: string; primary: boolean; size: number }[] }[]>(
    `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}&loaders=${encodeURIComponent(JSON.stringify(['forge']))}`, 5,
  );
  const pack = versions.find((entry) => entry.files.some((file) => file.filename.endsWith('.mrpack')));
  const file = pack?.files.find((entry) => entry.filename.endsWith('.mrpack') && entry.url.startsWith('https://cdn.modrinth.com/'));
  if (!pack || !file || file.size > 30 * 1024 * 1024) throw badRequest(`No Forge modpack file is published for Minecraft ${gameVersion}.`);
  const response = await fetch(file.url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'blipmade-hosting/1.0 (support@blipmade.com)' } });
  if (!response.ok) throw badRequest('The modpack could not be downloaded.');
  const bytes = Buffer.from(await response.arrayBuffer());
  const { readZipText } = await import('./import-inspect.js');
  const indexText = readZipText(bytes, 'modrinth.index.json');
  if (!indexText) throw badRequest('That modpack has no index.');
  let parsed: { files?: { path?: string; downloads?: string[]; fileSize?: number; env?: { server?: string } }[] };
  try { parsed = JSON.parse(indexText) as typeof parsed; } catch { throw badRequest('That modpack index could not be read.'); }
  const files: ModpackFile[] = [];
  for (const entry of parsed.files ?? []) {
    if (entry.env?.server === 'unsupported') continue;
    const path = (entry.path ?? '').replaceAll('\\', '/');
    const url = entry.downloads?.find((value) => value.startsWith('https://cdn.modrinth.com/'));
    if (!url || !/^(mods|config)\/[A-Za-z0-9._+-]{1,120}$/.test(path)) continue;
    if ((entry.fileSize ?? 0) > 50 * 1024 * 1024) continue;
    if (files.length >= 200) throw badRequest('This modpack has more server files than can be installed in one step. It was not partially installed.');
    const slash = path.lastIndexOf('/');
    files.push({ directory: `/${path.slice(0, slash)}`, filename: path.slice(slash + 1), url });
  }
  if (!files.length) throw badRequest('None of the modpack files are hosted on the Modrinth CDN.');
  return { title: pack.name, files };
}

/** A plugin file in /plugins: a .jar is on, a .jar.disabled is switched off (Paper does not load it). */
export const PLUGIN_FILE = /^[A-Za-z0-9._+-]{1,120}\.jar(\.disabled)?$/;

export function pluginEntries(files: { name: string; size: number; is_file: boolean }[]): { name: string; size: number; enabled: boolean }[] {
  return files
    .filter((file) => file.is_file && PLUGIN_FILE.test(file.name))
    .map((file) => ({ name: file.name, size: file.size, enabled: !file.name.endsWith('.disabled') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The file name a plugin must have to be on or off. */
export function pluginToggleName(name: string, enable: boolean): string {
  const base = name.replace(/\.disabled$/, '');
  return enable ? base : `${base}.disabled`;
}

/** The folders of a world: the one the server names in `level-name`, and the two of its dimensions. Nothing else is ever listed for removal. */
export function worldFolders(levelName: string | undefined): string[] {
  const name = (levelName ?? '').trim() || 'world';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name) || name.includes('..')) return ['world', 'world_nether', 'world_the_end'];
  return [name, `${name}_nether`, `${name}_the_end`];
}

/** The last answer of `/tps` in a log: the averages of the last 1, 5 and 15 minutes. The colour codes of the game are ignored. */
export function parseTps(log: string): { m1: number; m5: number; m15: number } | null {
  const clean = log.replace(/\u001b\[[0-9;]*m/g, '').replace(/§./g, '');
  const matches = [...clean.matchAll(/TPS from last 1m, 5m, 15m:\s*\*?([\d.]+)\*?,\s*\*?([\d.]+)\*?,\s*\*?([\d.]+)\*?/g)];
  const last = matches[matches.length - 1];
  return last ? { m1: Number(last[1]), m5: Number(last[2]), m15: Number(last[3]) } : null;
}

export type LagVerdict = 'good' | 'slow' | 'bad' | 'unknown';

/** What the numbers say, in words a customer can act on. Twenty ticks a second is a healthy server. */
export function lagAdvice(input: { tps: { m1: number } | null; memoryBytes: number; memoryLimitMb: number; hasSpark: boolean }): { verdict: LagVerdict; lines: string[] } {
  const lines: string[] = [];
  const usedShare = input.memoryLimitMb > 0 ? input.memoryBytes / (input.memoryLimitMb * 1024 * 1024) : 0;
  if (input.tps === null) return { verdict: 'unknown', lines: ['The server did not answer with its ticks. Try again in a moment.'] };
  const verdict: LagVerdict = input.tps.m1 >= 19 ? 'good' : input.tps.m1 >= 15 ? 'slow' : 'bad';
  if (verdict === 'good') lines.push('The server keeps 20 ticks a second. There is no lag from the server.');
  else lines.push(`The server runs at ${input.tps.m1} ticks a second instead of 20, so the game lags.`);
  if (usedShare > 0.9) lines.push('The memory is almost full. More memory, or fewer plugins and a smaller view distance, usually helps.');
  if (verdict !== 'good') lines.push(input.hasSpark ? 'Spark is installed: run /spark profiler start for a minute, then /spark profiler stop, to see which plugin takes the time.' : 'Install the Spark plugin and run /spark profiler to see which plugin takes the time.');
  return { verdict, lines };
}

/** In the config of Geyser, the port of the Bedrock side: the first `port:` line under `bedrock:`. Everything else stays as it was. */
export function setGeyserBedrockPort(yaml: string, port: number): string | null {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  const lines = yaml.split('\n');
  let inBedrock = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^bedrock:\s*$/.test(line)) { inBedrock = true; continue; }
    if (inBedrock && /^\S/.test(line)) break; // The next top-level section starts: no port line was found.
    if (inBedrock && /^\s+port:\s*\d+\s*(#.*)?$/.test(line)) {
      lines[index] = line.replace(/port:\s*\d+/, `port: ${port}`);
      return lines.join('\n');
    }
  }
  return null;
}

/** Where the Bedrock crossplay of a Java server stands, step by step. */
export function crossplayStatus(input: { plugins: string[]; gamePort: number | null; configured: boolean | null }): { geyser: boolean; floodgate: boolean; steps: { key: string; label: string; done: boolean }[]; joinPort: number | null } {
  const has = (name: string) => input.plugins.some((entry) => entry.toLowerCase().includes(name));
  const geyser = has('geyser');
  const floodgate = has('floodgate');
  return {
    geyser,
    floodgate,
    joinPort: input.gamePort,
    steps: [
      { key: 'geyser', label: 'Install Geyser', done: geyser },
      { key: 'floodgate', label: 'Install Floodgate (lets Bedrock players in without a Java account)', done: floodgate },
      { key: 'start', label: 'Restart the server once, so Geyser writes its config', done: input.configured !== null },
      { key: 'port', label: `Point Geyser at the game port${input.gamePort ? ` ${input.gamePort}` : ''}`, done: input.configured === true },
    ],
  };
}

/** An archive a customer uploaded to the root of the server, named plainly: a name with a path or odd characters is never used. */
export const WORLD_ARCHIVE = /^[A-Za-z0-9][A-Za-z0-9 _.+()-]{0,98}\.zip$/;
export const WORLD_ARCHIVE_MAX_BYTES = 2 * 1024 ** 3;
