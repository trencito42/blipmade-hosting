import { badRequest } from '../lib/errors.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';

const WRITABLE = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'SRV']);

interface CfResponse {
  ok: boolean;
  result: unknown;
  errors: string[];
}

async function cf(token: string, method: string, path: string, body?: unknown): Promise<CfResponse> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const payload = (await response.json().catch(() => null)) as { success?: boolean; result?: unknown; errors?: { message?: string }[] } | null;
  return {
    ok: response.ok && payload?.success !== false,
    result: payload?.result,
    errors: (payload?.errors ?? []).map((error) => error.message ?? 'Cloudflare refused the request.'),
  };
}

/** Checks a customer token and keeps it only when it can see exactly one zone. */
export async function zoneForToken(token: string): Promise<{ zoneId: string; zoneName: string }> {
  const listed = await cf(token, 'GET', '/zones?per_page=5');
  if (!listed.ok) throw badRequest(listed.errors[0] ?? 'Cloudflare did not accept that token.');
  const zones = Array.isArray(listed.result) ? listed.result as { id?: string; name?: string }[] : [];
  if (zones.length !== 1 || !zones[0]?.id || !zones[0]?.name) {
    throw badRequest('Create a token that can edit DNS on exactly one zone.');
  }
  return { zoneId: zones[0].id, zoneName: zones[0].name.toLowerCase() };
}

export const sealZoneToken = (token: string) => encryptSecret(token);
export const openZoneToken = (sealed: string) => decryptSecret(sealed);

export interface CustomerRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'SRV';
  name: string;
  content: string;
  data?: { priority: number; weight: number; port: number; target: string };
}

/** Writes approved address records. Existing different records are reported and left in place. */
export async function publishCustomerRecords(
  token: string,
  zoneId: string,
  zoneName: string,
  records: CustomerRecord[],
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const record of records) {
    if (!WRITABLE.has(record.type)) continue;
    const name = record.name.toLowerCase();
    if (name !== zoneName && !name.endsWith(`.${zoneName}`)) {
      skipped.push(`${record.type} ${name} is outside the connected zone.`);
      continue;
    }
    const listed = await cf(token, 'GET', `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(name)}`);
    if (!listed.ok) {
      skipped.push(listed.errors[0] ?? `${record.type} ${name} could not be read.`);
      continue;
    }
    const existing = (Array.isArray(listed.result) ? listed.result : []) as { id?: string; content?: string }[];
    const same = existing.find((row) => row.content === record.content);
    if (existing.length > 0 && !same) {
      skipped.push(`${record.type} ${name} already has a different value. It was left unchanged.`);
      continue;
    }
    if (same?.id) {
      written.push(`${record.type} ${name}`);
      continue;
    }
    const payload = record.type === 'SRV'
      ? { type: 'SRV', name, data: record.data, ttl: 120, proxied: false }
      : { type: record.type, name, content: record.content, ttl: 120, proxied: false };
    const saved = await cf(token, 'POST', `/zones/${zoneId}/dns_records`, payload);
    if (!saved.ok) skipped.push(saved.errors[0] ?? `${record.type} ${name} was not written.`);
    else written.push(`${record.type} ${name}`);
  }
  return { written, skipped };
}
