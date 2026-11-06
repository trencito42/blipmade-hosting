import { env } from '../env.js';

/**
 * Read-only GlitchTip (Sentry-compatible) API. Tokens stay on the server.
 * A configured DSN does not prove events arrived.
 */

export interface GlitchTipIssueView {
  id: string;
  title: string;
  culprit: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  count: number | null;
  level: string | null;
  status: string | null;
  permalink: string;
  project: string | null;
}

export interface GlitchTipStatus {
  origin: string;
  dsnConfigured: boolean;
  dsnHost: string | null;
  environment: string;
  apiTokenConfigured: boolean;
  reachable: boolean | null;
  ingestionVerifiedAt: string | null;
  limitation: string | null;
  issues: GlitchTipIssueView[];
  openCount: number | null;
}

function dsnMeta(dsn: string): { host: string } | null {
  if (!dsn) return null;
  try {
    return { host: new URL(dsn).hostname };
  } catch {
    return null;
  }
}

function originOf(): string {
  const explicit = env.GLITCHTIP_URL.replace(/\/+$/, '');
  if (explicit) return explicit;
  const host = dsnMeta(env.SENTRY_DSN)?.host;
  return host ? `https://${host}` : 'https://errors.blipmade.com';
}

function issueLink(origin: string, raw: Record<string, unknown>): string {
  if (typeof raw.permalink === 'string' && raw.permalink.startsWith('http')) return raw.permalink;
  const id = String(raw.id ?? '');
  const project = (raw.project as { slug?: string } | undefined)?.slug ?? env.GLITCHTIP_PROJECT;
  if (project && id) return `${origin}/issues/${id}`;
  return `${origin}/`;
}

function asIssue(origin: string, raw: unknown): GlitchTipIssueView | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = row.id != null ? String(row.id) : '';
  if (!id) return null;
  const meta = (row.metadata as { type?: string; value?: string } | undefined) ?? {};
  const title =
    (typeof row.title === 'string' && row.title) ||
    [meta.type, meta.value].filter(Boolean).join(': ') ||
    'Untitled issue';
  const project = (row.project as { slug?: string; name?: string } | undefined) ?? {};
  const countRaw = row.count;
  const count = typeof countRaw === 'number' ? countRaw : typeof countRaw === 'string' ? Number(countRaw) : null;
  return {
    id,
    title: title.slice(0, 240),
    culprit: typeof row.culprit === 'string' ? row.culprit.slice(0, 200) : null,
    firstSeen: typeof row.firstSeen === 'string' ? row.firstSeen : null,
    lastSeen: typeof row.lastSeen === 'string' ? row.lastSeen : null,
    count: Number.isFinite(count) ? count : null,
    level: typeof row.level === 'string' ? row.level : null,
    status: typeof row.status === 'string' ? row.status : null,
    permalink: issueLink(origin, row),
    project: project.name ?? project.slug ?? null,
  };
}

async function getJson(url: string, token: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: ac.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { detail: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { detail: (error as Error).message.slice(0, 200) } };
  } finally {
    clearTimeout(timer);
  }
}

/** Open unresolved issues, if the token can list them. Never returns the DSN or the token. */
export async function glitchtipStatus(): Promise<GlitchTipStatus> {
  const origin = originOf();
  const dsnConfigured = Boolean(env.SENTRY_DSN);
  const dsnHost = dsnMeta(env.SENTRY_DSN)?.host ?? null;
  const token = env.GLITCHTIP_AUTH_TOKEN;
  const org = env.GLITCHTIP_ORG;
  const project = env.GLITCHTIP_PROJECT;
  const base: GlitchTipStatus = {
    origin,
    dsnConfigured,
    dsnHost,
    environment: env.SENTRY_ENVIRONMENT,
    apiTokenConfigured: Boolean(token),
    reachable: null,
    ingestionVerifiedAt: null,
    limitation: null,
    issues: [],
    openCount: null,
  };

  if (!token) {
    base.limitation =
      'No GLITCHTIP_AUTH_TOKEN. Open issues cannot be listed from Admin. A DSN only proves the SDK can be pointed at GlitchTip, not that events arrived. Use the native UI at the origin.';
    return base;
  }

  const issuesUrl =
    org && project
      ? `${origin}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is:unresolved&limit=25`
      : `${origin}/api/0/issues/?query=is:unresolved&limit=25`;

  const listed = await getJson(issuesUrl, token);
  if (!listed.ok) {
    base.reachable = listed.status > 0;
    base.limitation = `GlitchTip API ${listed.status || 'unreachable'}. ${
      typeof listed.body === 'object' && listed.body && 'detail' in listed.body
        ? String((listed.body as { detail?: unknown }).detail).slice(0, 200)
        : 'Could not list issues. Open the native UI rather than inventing values.'
    }`;
    return base;
  }

  const rows = Array.isArray(listed.body) ? listed.body : [];
  base.reachable = true;
  base.issues = rows.map((row) => asIssue(origin, row)).filter((row): row is GlitchTipIssueView => Boolean(row));
  base.openCount = base.issues.length;
  if (!Array.isArray(listed.body)) {
    base.limitation = 'The issues endpoint did not return a list. Open the native GlitchTip UI.';
  }
  return base;
}
