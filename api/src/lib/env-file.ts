/**
 * Reading and writing a `.env` file without losing what the customer wrote around the variables.
 *
 * Comments and blank lines stay where they are. A variable that is changed is changed in place, a new one goes at
 * the end and a removed one leaves its line. The value is quoted only when it needs it.
 */

export interface EnvEntry {
  key: string;
  value: string;
}

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  // An unquoted value ends at a comment that is separated by a space.
  return value.replace(/\s+#.*$/, '');
}

function quote(value: string): string {
  if (value === '') return '';
  if (/^[A-Za-z0-9_./:@%+,=-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

export function parseEnv(text: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const match = LINE.exec(line);
    if (match) entries.push({ key: match[1], value: unquote(match[2]) });
  }
  return entries;
}

export function applyEnv(text: string, entries: EnvEntry[]): string {
  const wanted = new Map(entries.map((entry) => [entry.key, entry.value]));
  const written = new Set<string>();
  const out: string[] = [];
  for (const line of text === '' ? [] : text.replace(/\n$/, '').split(/\r?\n/)) {
    const match = /^\s*#/.test(line) ? null : LINE.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }
    const key = match[1];
    if (!wanted.has(key)) continue;
    if (written.has(key)) continue;
    written.add(key);
    // A line that already says the wanted value is kept as it was written.
    out.push(unquote(match[2]) === wanted.get(key) ? line : `${key}=${quote(wanted.get(key) ?? '')}`);
  }
  for (const [key, value] of wanted) {
    if (!written.has(key)) out.push(`${key}=${quote(value)}`);
  }
  return out.join('\n') + '\n';
}

/** A name a shell and an app can read. */
export const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_.]{0,127}$/;

/** The files of the server that are read as environment files: `.env`, `.env.local`, `.env.production`... Not the templates. */
export function isEnvFileName(name: string): boolean {
  return /^\.env(\.[A-Za-z0-9_-]+)*$/.test(name) && !/\.(example|sample|template|dist)$/i.test(name);
}

/** A variable that probably holds a secret. The screen shows it masked until the reader asks to see it. */
export function isSensitiveKey(key: string): boolean {
  return /(SECRET|TOKEN|PASS|PWD|KEY|PRIVATE|CREDENTIAL|AUTH|DSN|SALT|SIGNING|COOKIE|SESSION|DATABASE_URL|_URI$|_URL$)/i.test(key);
}
