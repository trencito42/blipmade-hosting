/**
 * Reads public project manifests and proposes a catalogue product.
 * It never extracts an archive, never runs a command from the project, and never provisions.
 */

export interface ImportProposal {
  productSlug: string | null;
  runtime: string | null;
  confidence: 'confirmed' | 'likely' | 'unknown';
  start: string | null;
  files: string[];
  notes: string[];
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
      return { productSlug: 'discord-bot', runtime: 'nodejs', confidence: 'confirmed', start, files: found, notes };
    }
    if (parsed) return { productSlug: 'nodejs', runtime: 'nodejs', confidence: 'confirmed', start, files: found, notes };
  }
  if (files.some((file) => file.path === 'requirements.txt' || file.path === 'pyproject.toml')) {
    return { productSlug: 'python', runtime: 'python', confidence: 'confirmed', start: null, files: found, notes };
  }
  if (files.some((file) => file.path === 'go.mod')) {
    return { productSlug: 'golang', runtime: 'go', confidence: 'confirmed', start: null, files: found, notes };
  }
  if (files.some((file) => file.path === 'Cargo.toml')) {
    return { productSlug: 'rust-runtime', runtime: 'rust', confidence: 'confirmed', start: null, files: found, notes };
  }
  if (files.some((file) => file.path === 'composer.json')) {
    notes.push('PHP was detected. There is no PHP product to order.');
  }
  if (files.some((file) => file.path === 'Dockerfile')) {
    notes.push('A Dockerfile was found. Blipmade does not build an arbitrary image from it.');
  }
  return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: found, notes };
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

export async function inspectGitUrl(raw: string): Promise<ImportProposal> {
  const urls = manifestUrls(raw);
  if (!urls.length) {
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], notes: ['Use a public https://github.com or https://gitlab.com project URL.'] };
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
    return { productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], notes: ['No supported manifest was readable. Private repositories are not fetched.'] };
  }
  return inspectManifests(files);
}
