import { inflateRawSync } from 'node:zlib';

/**
 * Reads public project manifests and proposes a catalogue product.
 * A zip is read for those manifest names only. Nothing in it is written to disk or executed.
 */

export interface SuggestedService { slug: string; reason: string }

export interface ImportProposal {
  productSlug: string | null;
  runtime: string | null;
  confidence: 'confirmed' | 'likely' | 'unknown';
  start: string | null;
  files: string[];
  notes: string[];
  services: SuggestedService[];
}

function suggestServices(files: { path: string; text: string }[]): SuggestedService[] {
  const keys = new Set<string>();
  const pkg = files.find((file) => file.path === 'package.json');
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      for (const key of Object.keys({ ...parsed.dependencies, ...parsed.devDependencies })) keys.add(key.toLowerCase());
    } catch { /* The runtime detector reports a broken package.json. */ }
  }
  const text = files.filter((file) => file.path !== 'package.json').map((file) => file.text.toLowerCase()).join('\n');
  const services: SuggestedService[] = [];
  const add = (slug: string, reason: string) => { if (!services.some((entry) => entry.slug === slug)) services.push({ slug, reason }); };
  if (keys.has('pg') || keys.has('@prisma/client') || text.includes('psycopg') || text.includes('postgresql')) add('postgresql', 'The project declares PostgreSQL.');
  if (keys.has('mysql2') || keys.has('mysql') || text.includes('pymysql') || text.includes('mariadb')) add('mariadb', 'The project declares MySQL or MariaDB.');
  if (keys.has('redis') || keys.has('ioredis') || text.includes('redis')) add('redis', 'The project declares Redis.');
  if (keys.has('mongodb') || keys.has('mongoose') || text.includes('pymongo')) add('mongodb', 'The project declares MongoDB.');
  return services;
}

function proposal(partial: Omit<ImportProposal, 'services'>, files: { path: string; text: string }[]): ImportProposal {
  return { ...partial, services: suggestServices(files) };
}

const MANIFESTS = ['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'composer.json', 'Dockerfile', 'Procfile'] as const;
const MAX_BYTES = 65_536;

export function inspectManifests(files: { path: string; text: string }[]): ImportProposal {
  const notes: string[] = [];
  const found = files.map((file) => file.path);
  const pkg = files.find((file) => file.path === 'package.json');
  if (pkg) {
    let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: { start?: string } } | null = null;
    try { parsed = JSON.parse(pkg.text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: { start?: string } }; } catch { notes.push('package.json could not be parsed.'); }
    const deps = { ...parsed?.dependencies, ...parsed?.devDependencies };
    const start = typeof parsed?.scripts?.start === 'string' ? parsed.scripts.start.slice(0, 200) : null;
    if (deps && ('discord.js' in deps || 'eris' in deps || '@discordjs/core' in deps)) {
      return proposal({ productSlug: 'discord-bot', runtime: 'nodejs', confidence: 'confirmed', start, files: found, notes }, files);
    }
    if (parsed) return proposal({ productSlug: 'nodejs', runtime: 'nodejs', confidence: 'confirmed', start, files: found, notes }, files);
  }
  if (files.some((file) => file.path === 'requirements.txt' || file.path === 'pyproject.toml')) {
    return proposal({ productSlug: 'python', runtime: 'python', confidence: 'confirmed', start: null, files: found, notes }, files);
  }
  if (files.some((file) => file.path === 'go.mod')) {
    return proposal({ productSlug: 'golang', runtime: 'go', confidence: 'confirmed', start: null, files: found, notes }, files);
  }
  if (files.some((file) => file.path === 'Cargo.toml')) {
    return proposal({ productSlug: 'rust-runtime', runtime: 'rust', confidence: 'confirmed', start: null, files: found, notes }, files);
  }
  if (files.some((file) => file.path === 'composer.json')) {
    notes.push('PHP was detected. There is no PHP product to order.');
  }
  if (files.some((file) => file.path === 'Dockerfile')) {
    notes.push('A Dockerfile was found. Blipmade does not build an arbitrary image from it.');
  }
  return proposal({ productSlug: null, runtime: null, confidence: 'unknown', start: null, files: found, notes }, files);
}

/** Turns a public GitHub or GitLab project URL into the manifest URLs that may be fetched. */
export function manifestUrls(raw: string): string[] {
  let url: URL;
  try { url = new URL(raw); } catch { return []; }
  if (url.protocol !== 'https:') return [];
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean).map((part) => part.replace(/\.git$/, ''));
  if (parts.length < 2) return [];
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_.-]+$/.test(parts[1]!)) return [];
  let base = '';
  if (host === 'github.com' || host === 'www.github.com') {
    const branch = parts[2] === 'tree' && parts[3] && /^[A-Za-z0-9._/-]+$/.test(parts.slice(3).join('/')) ? parts.slice(3).join('/') : 'HEAD';
    base = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${branch}`;
  } else if (host === 'gitlab.com' || host === 'www.gitlab.com') {
    base = `https://gitlab.com/${parts[0]}/${parts[1]}/-/raw/HEAD`;
  } else {
    return [];
  }
  return MANIFESTS.map((name) => `${base}/${name}`);
}

const MAX_ZIP = 8 * 1024 * 1024;

/** Names inside a zip the container is allowed to unpack. Returns the reason it is refused, or null. */
export function zipLayoutProblem(zip: Buffer): string | null {
  if (zip.length < 22 || zip.length > MAX_ZIP) return 'The zip must be a zip file of at most 8 MB.';
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return 'That file is not a zip archive.';
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  if (count > 4_000 || cursor >= zip.length) return 'The archive has too many files.';
  let declared = 0;
  for (let index = 0; index < count && cursor + 46 <= zip.length; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) return 'The archive listing is not readable.';
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.startsWith('/') || name.includes('..') || name.includes('\0')) return 'The archive contains a path that leaves its folder.';
    declared += size;
    if (declared > 80 * 1024 * 1024) return 'The archive expands to more than 80 MB.';
  }
  return null;
}

/** Pulls known manifest files out of a zip buffer. Other entries are skipped. */
export function readZipManifests(zip: Buffer): { path: string; text: string }[] {
  if (zip.length < 22 || zip.length > MAX_ZIP) return [];
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return [];
  const count = zip.readUInt16LE(eocd + 10);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (count > 4_000 || cdOffset >= zip.length) return [];
  const wanted = new Set<string>(MANIFESTS);
  const files: { path: string; text: string }[] = [];
  let cursor = cdOffset;
  for (let index = 0; index < count && cursor + 46 <= zip.length && files.length < MANIFESTS.length; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
    cursor += 46 + nameLength + extraLength + commentLength;
    const base = name.split('/').pop() ?? '';
    if (!wanted.has(base) || name.includes('..') || name.startsWith('/') || size > MAX_BYTES || compressedSize > MAX_BYTES) continue;
    if (size === 0xffffffff || localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const localName = zip.readUInt16LE(localOffset + 26);
    const localExtra = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    const compressed = zip.subarray(start, start + compressedSize);
    if (compressed.length !== compressedSize) continue;
    let raw: Buffer = Buffer.alloc(0);
    try {
      if (method === 0) raw = Buffer.from(compressed);
      else if (method === 8) raw = inflateRawSync(compressed);
    } catch { continue; }
    if (raw.length > MAX_BYTES) continue;
    files.push({ path: base, text: raw.toString('utf8') });
  }
  return files;
}

/** Reads one named file from a zip. The file is not written anywhere. */
export function readZipText(zip: Buffer, baseName: string): string | null {
  if (zip.length < 22 || zip.length > 30 * 1024 * 1024) return null;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  if (count > 8_000 || cursor >= zip.length) return null;
  for (let index = 0; index < count && cursor + 46 <= zip.length; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.split('/').pop() !== baseName || name.includes('..') || size > 2_000_000 || compressedSize > 2_000_000) continue;
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const compressed = zip.subarray(start, start + compressedSize);
    if (compressed.length !== compressedSize) continue;
    try {
      const raw = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
      if (raw && raw.length <= 2_000_000) return raw.toString('utf8');
    } catch { /* The next entry may still be the index. */ }
  }
  return null;
}

export function inspectZip(zip: Buffer): ImportProposal {
  if (zip.length > MAX_ZIP) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], services: [], notes: ['The zip is larger than 8 MB.'] };
  }
  const files = readZipManifests(zip);
  if (!files.length) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], services: [], notes: ['No supported manifest was inside the zip. The archive was not run.'] };
  }
  return inspectManifests(files);
}

export async function inspectGitUrl(raw: string): Promise<ImportProposal> {
  const urls = manifestUrls(raw);
  if (!urls.length) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], services: [], notes: ['Use a public https://github.com or https://gitlab.com project URL.'] };
  }
  const files: { path: string; text: string }[] = [];
  for (const target of urls) {
    const name = target.slice(target.lastIndexOf('/') + 1);
    try {
      const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
      if (response.status !== 200) continue;
      const length = Number(response.headers.get('content-length') ?? '0');
      if (length > MAX_BYTES) continue;
      const text = (await response.text()).slice(0, MAX_BYTES);
      files.push({ path: name, text });
    } catch { /* A missing manifest is a result, not a failure of the whole look. */ }
  }
  if (!files.length) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], services: [], notes: ['No supported manifest was readable. Private repositories are not fetched.'] };
  }
  return inspectManifests(files);
}
