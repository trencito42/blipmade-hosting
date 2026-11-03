import { env } from '../env.js';

const WRITABLE = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'SRV']);

export function hostnameInZone(hostname: string, zoneName = env.CLOUDFLARE_ZONE_NAME): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const zone = zoneName.trim().toLowerCase().replace(/\.$/, '');
  if (!host || !zone || host === zone) return false;
  return host.endsWith(`.${zone}`);
}

export interface DnsWrite {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'SRV';
  name: string;
  content: string;
}

interface CloudflareResult {
  published: boolean;
  reason: string | null;
}

async function cloudflare(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; result: unknown; errors: string[] }> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { success?: boolean; result?: unknown; errors?: { message?: string }[] } | null;
  return {
    ok: response.ok && payload?.success !== false,
    status: response.status,
    result: payload?.result,
    errors: (payload?.errors ?? []).map((error) => error.message ?? 'Cloudflare refused the request.'),
  };
}

/** Creates or updates one record inside the platform zone. Mail and nameserver records are refused. */
export async function upsertZoneRecord(record: DnsWrite): Promise<CloudflareResult> {
  if (!env.cloudflareDnsEnabled) return { published: false, reason: 'Cloudflare DNS is not configured.' };
  if (!WRITABLE.has(record.type)) return { published: false, reason: 'That record type is not written by the platform.' };
  if (!hostnameInZone(record.name)) return { published: false, reason: 'That name is outside the platform zone.' };
  const listed = await cloudflare('GET', `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`);
  if (!listed.ok) return { published: false, reason: listed.errors[0] ?? 'The DNS record could not be read.' };
  const existing = Array.isArray(listed.result) ? (listed.result as { id?: string }[])[0] : undefined;
  const payload = { type: record.type, name: record.name, content: record.content, ttl: 120, proxied: false };
  const saved = existing?.id
    ? await cloudflare('PUT', `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${existing.id}`, payload)
    : await cloudflare('POST', `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`, payload);
  return saved.ok ? { published: true, reason: null } : { published: false, reason: saved.errors[0] ?? 'The DNS record could not be written.' };
}

/** Removes one platform record. The zone apex and every mail or nameserver record stay. */
export async function deleteZoneRecord(type: DnsWrite['type'], name: string): Promise<CloudflareResult> {
  if (!env.cloudflareDnsEnabled) return { published: false, reason: 'Cloudflare DNS is not configured.' };
  if (!WRITABLE.has(type) || !hostnameInZone(name)) return { published: false, reason: null };
  const listed = await cloudflare('GET', `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
  if (!listed.ok) return { published: false, reason: listed.errors[0] ?? 'The DNS record could not be read.' };
  const rows = Array.isArray(listed.result) ? (listed.result as { id?: string }[]) : [];
  for (const row of rows) {
    if (!row.id) continue;
    const removed = await cloudflare('DELETE', `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${row.id}`);
    if (!removed.ok) return { published: false, reason: removed.errors[0] ?? 'The DNS record could not be removed.' };
  }
  return { published: true, reason: null };
}
