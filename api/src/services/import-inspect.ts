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
  build: string | null;
  files: string[];
  notes: string[];
  services: SuggestedService[];
}

/** Serves a Vite `dist` folder with Node itself. No extra package is installed. */
export const VITE_START = 'node -e \'const h=require("http"),f=require("fs"),p=require("path");h.createServer((q,s)=>{let u=decodeURIComponent((q.url||"/").split("?")[0]);if(u.includes(".."))return s.writeHead(400).end();let a=p.join("dist",u);try{if(f.statSync(a).isDirectory())a=p.join(a,"index.html")}catch{}f.readFile(a,(e,b)=>{if(!e)return s.end(b);f.readFile("dist/index.html",(e2,b2)=>s.writeHead(e2?404:200).end(e2?"missing":b2))})}).listen(process.env.SERVER_PORT||3000,"0.0.0.0")\'';

const PHP_BUILD = 'php -r \'copy("https://getcomposer.org/installer","composer-setup.php");\' && php composer-setup.php --quiet && php composer.phar install --no-interaction --no-dev';

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
    let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: { start?: string; build?: string } } | null = null;
    try { parsed = JSON.parse(pkg.text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: { start?: string; build?: string } }; } catch { notes.push('package.json could not be parsed.'); }
    const deps = { ...parsed?.dependencies, ...parsed?.devDependencies };
    const declaredStart = typeof parsed?.scripts?.start === 'string' ? parsed.scripts.start.slice(0, 200) : null;
    const hasBuild = typeof parsed?.scripts?.build === 'string';
    if (deps && ('discord.js' in deps || 'eris' in deps || '@discordjs/core' in deps)) {
      return proposal({ productSlug: 'discord-bot', runtime: 'nodejs', confidence: 'confirmed', start: declaredStart ?? 'node index.js', build: 'npm install', files: found, notes }, files);
    }
    if (parsed && deps && 'next' in deps) {
      return proposal({
        productSlug: 'nodejs', runtime: 'nodejs', confidence: declaredStart ? 'confirmed' : 'likely',
        start: declaredStart ?? 'npx next start -H 0.0.0.0 -p $SERVER_PORT',
        build: hasBuild ? 'npm install && npm run build' : 'npm install',
        files: found,
        notes: declaredStart ? notes : [...notes, 'Next.js was detected. The start command listens on SERVER_PORT. Replace it if the project has its own start script.'],
      }, files);
    }
    if (parsed && deps && 'vite' in deps) {
      notes.push('Vite was detected. The start command serves the dist folder with Node. It does not install a static server package.');
      return proposal({ productSlug: 'nodejs', runtime: 'nodejs', confidence: 'likely', start: VITE_START, build: hasBuild ? 'npm install && npm run build' : 'npm install', files: found, notes }, files);
    }
    if (parsed) {
      if (!declaredStart) notes.push('Node.js was detected. The start command runs index.js. Replace it if the entry file has another name.');
      return proposal({ productSlug: 'nodejs', runtime: 'nodejs', confidence: declaredStart ? 'confirmed' : 'likely', start: declaredStart ?? 'node index.js', build: 'npm install', files: found, notes }, files);
    }
  }
  const python = files.find((file) => file.path === 'requirements.txt' || file.path === 'pyproject.toml');
  if (python) {
    const text = python.text.toLowerCase();
    const build = python.path === 'requirements.txt' ? 'pip install -r requirements.txt' : 'pip install .';
    if (text.includes('fastapi')) {
      notes.push('FastAPI was detected. The start command uses main:app. Change it if the application object lives elsewhere.');
      return proposal({ productSlug: 'python', runtime: 'python', confidence: 'likely', start: 'python -m uvicorn main:app --host 0.0.0.0 --port $SERVER_PORT', build, files: found, notes }, files);
    }
    notes.push('Python was detected. The start command runs main.py. Change it if the entry file has another name.');
    return proposal({ productSlug: 'python', runtime: 'python', confidence: 'likely', start: 'python main.py', build, files: found, notes }, files);
  }
  if (files.some((file) => file.path === 'go.mod')) {
    return proposal({ productSlug: 'golang', runtime: 'go', confidence: 'confirmed', start: null, build: null, files: found, notes }, files);
  }
  if (files.some((file) => file.path === 'Cargo.toml')) {
    return proposal({ productSlug: 'rust-runtime', runtime: 'rust', confidence: 'confirmed', start: null, build: null, files: found, notes }, files);
  }
  const composer = files.find((file) => file.path === 'composer.json');
  if (composer) {
    let laravel = false;
    try {
      const parsed = JSON.parse(composer.text) as { require?: Record<string, string> };
      laravel = Boolean(parsed.require && 'laravel/framework' in parsed.require);
    } catch { notes.push('composer.json could not be parsed.'); }
    if (laravel) notes.push('Laravel was detected. The start command is artisan serve inside the PHP container.');
    else notes.push('PHP was detected. The start command serves the public folder. Change it if the project has another entry.');
    return proposal({
      productSlug: 'php', runtime: 'php', confidence: 'likely', files: found, notes,
      build: PHP_BUILD,
      start: laravel ? 'php artisan serve --host=0.0.0.0 --port=$SERVER_PORT' : 'php -S 0.0.0.0:$SERVER_PORT -t public',
    }, files);
  }
  if (files.some((file) => file.path === 'Dockerfile')) {
    notes.push('A Dockerfile was found. Blipmade does not build an arbitrary image from it.');
  }
  return proposal({ productSlug: null, runtime: null, confidence: 'unknown', start: null, build: null, files: found, notes }, files);
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
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, build: null, files: [], services: [], notes: ['The zip is larger than 8 MB.'] };
  }
  const files = readZipManifests(zip);
  if (!files.length) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, build: null, files: [], services: [], notes: ['No supported manifest was inside the zip. The archive was not run.'] };
  }
  return inspectManifests(files);
}

export async function inspectGitUrl(raw: string): Promise<ImportProposal> {
  const urls = manifestUrls(raw);
  if (!urls.length) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, build: null, files: [], services: [], notes: ['Use a public https://github.com or https://gitlab.com project URL.'] };
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
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, build: null, files: [], services: [], notes: ['No supported manifest was readable. Private repositories are not fetched.'] };
  }
  return inspectManifests(files);
}
