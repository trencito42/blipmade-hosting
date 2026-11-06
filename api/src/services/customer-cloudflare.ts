import { badRequest } from '../lib/errors.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import type { CustomerRecord, OwnedRecord, RecordPreview } from './dns-approval.js';

export { DNS_PREVIEW_TTL_MS, approvalDecision, recordsFingerprint } from './dns-approval.js';
export type { CustomerRecord, OwnedRecord, RecordPreview } from './dns-approval.js';

const WRITABLE = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'MX']);

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

/** The customer feature can be switched off without a deploy: CUSTOMER_CLOUDFLARE_DNS=off. */
export function customerCloudflareEnabled(): boolean {
  return !['off', '0', 'false'].includes((process.env.CUSTOMER_CLOUDFLARE_DNS ?? 'on').trim().toLowerCase());
}

/**
 * Checks a customer token and keeps it only when it is active and sees exactly one active zone
 * it can read DNS in. Nameservers are only read, never changed.
 */
export async function zoneForToken(token: string): Promise<{ zoneId: string; zoneName: string; nameServers: string[] }> {
  const verified = await cf(token, 'GET', '/user/tokens/verify');
  const state = verified.result && typeof verified.result === 'object' ? (verified.result as { status?: string }).status : undefined;
  // Account-owned tokens have another verify path; those are judged by the zone calls below.
  if (verified.ok && state !== 'active') throw badRequest('Cloudflare says this token is not active. Create a new one.');
  const listed = await cf(token, 'GET', '/zones?per_page=5');
  if (!listed.ok) throw badRequest(listed.errors[0] ?? 'Cloudflare did not accept that token.');
  const zones = Array.isArray(listed.result) ? listed.result as { id?: string; name?: string; status?: string; name_servers?: string[] }[] : [];
  const zone = zones[0];
  if (zones.length !== 1 || !zone?.id || !zone.name) {
    throw badRequest('Create a token that can edit DNS on exactly one zone.');
  }
  if (zone.status && zone.status !== 'active') {
    throw badRequest('That zone is not active on Cloudflare yet. Finish moving its nameservers at your registrar first; Blipmade never changes them.');
  }
  const probe = await cf(token, 'GET', `/zones/${zone.id}/dns_records?per_page=1`);
  if (!probe.ok) throw badRequest('The token cannot read DNS records on that zone. Give it Zone: DNS: Edit on this one zone.');
  return { zoneId: zone.id, zoneName: zone.name.toLowerCase(), nameServers: zone.name_servers ?? [] };
}

export const sealZoneToken = (token: string) => encryptSecret(token);
export const openZoneToken = (sealed: string) => decryptSecret(sealed);

interface CfRow {
  id?: string;
  type?: string;
  content?: string;
  proxied?: boolean;
  data?: { priority?: number; weight?: number; port?: number; target?: string };
}

function inZone(name: string, zoneName: string): boolean {
  return name === zoneName || name.endsWith(`.${zoneName}`);
}

function srvText(data: { priority?: number; weight?: number; port?: number; target?: string } | undefined): string | null {
  return data ? `${data.priority ?? 0} ${data.weight ?? 0} ${data.port ?? 0} ${(data.target ?? '').replace(/\.$/, '').toLowerCase()}` : null;
}

function rowValue(type: string, row: CfRow): string | null {
  if (type === 'SRV') return srvText(row.data) ?? row.content ?? null;
  return row.content ?? null;
}

function wantedValue(record: CustomerRecord): string {
  return record.type === 'SRV' && record.data ? srvText(record.data) ?? record.content : record.content;
}

interface Inspection {
  action: RecordPreview['action'];
  current: string | null;
  ours: CfRow | undefined;
}

/**
 * The one decision, used by the preview and by the write, so they cannot disagree.
 * - the same value already there: unchanged (running twice writes nothing)
 * - a record this platform created with another value: update it
 * - a TXT with other values: add ours beside them, shared values are never touched
 * - any other value, or a CNAME next to an address record: conflict, left in place
 */
async function inspect(token: string, zoneId: string, zoneName: string, record: CustomerRecord, owned: OwnedRecord[]): Promise<Inspection> {
  const name = record.name.toLowerCase();
  if (!WRITABLE.has(record.type) || !inZone(name, zoneName)) return { action: 'skip', current: null, ours: undefined };
  const listed = await cf(token, 'GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`);
  if (!listed.ok) return { action: 'skip', current: null, ours: undefined };
  const all = (Array.isArray(listed.result) ? listed.result : []) as CfRow[];
  const same = all.filter((row) => row.type === record.type);
  const wanted = wantedValue(record);
  const exact = same.find((row) => rowValue(record.type, row)?.toLowerCase() === wanted.toLowerCase());
  const ownedId = owned.find((row) => row.type === record.type && row.name === name)?.cloudflareId ?? null;
  const ours = ownedId ? same.find((row) => row.id === ownedId) : undefined;
  const current = rowValue(record.type, same[0] ?? {}) ?? null;
  const ADDRESS = ['A', 'AAAA', 'CNAME'];
  const clashing = ADDRESS.includes(record.type)
    ? all.find((row) => row.type !== record.type && ADDRESS.includes(row.type ?? '') && (record.type === 'CNAME' || row.type === 'CNAME'))
    : undefined;
  if (exact) {
    // A record that Cloudflare proxies (the orange cloud) hides the address: the certificate of the gateway cannot be
    // issued for it and a game connection cannot reach the server. A record we wrote is put back to DNS only; one that is not
    // ours is left in place and named.
    if (ADDRESS.includes(record.type) && exact.proxied === true) {
      return { action: ours && ours.id === exact.id ? 'update' : 'conflict', current: `${wanted} (proxied by Cloudflare)`, ours };
    }
    return { action: 'unchanged', current: wanted, ours };
  }
  if (clashing) return { action: 'conflict', current: clashing.content ?? null, ours };
  if (same.length === 0) return { action: 'create', current: null, ours };
  if (ours) return { action: 'update', current, ours };
  if (record.type === 'TXT') return { action: 'create', current, ours };
  return { action: 'conflict', current, ours };
}

/** Reads the zone and says what a write would do. It does not change the zone. */
export async function previewCustomerRecords(
  token: string,
  zoneId: string,
  zoneName: string,
  records: CustomerRecord[],
  owned: OwnedRecord[] = [],
): Promise<RecordPreview[]> {
  const preview: RecordPreview[] = [];
  for (const record of records) {
    const found = await inspect(token, zoneId, zoneName, record, owned);
    preview.push({ type: record.type, name: record.name.toLowerCase(), wanted: wantedValue(record), current: found.current, action: found.action });
  }
  return preview;
}

export interface PublishedRecord {
  type: string;
  name: string;
  content: string;
  cloudflareId: string;
}

/** Writes approved records. A conflicting record this platform does not own is left in place. */
export async function publishCustomerRecords(
  token: string,
  zoneId: string,
  zoneName: string,
  records: CustomerRecord[],
  owned: OwnedRecord[] = [],
): Promise<{ written: string[]; skipped: string[]; created: PublishedRecord[] }> {
  const written: string[] = [];
  const skipped: string[] = [];
  const created: PublishedRecord[] = [];
  for (const record of records) {
    if (!WRITABLE.has(record.type)) continue;
    const name = record.name.toLowerCase();
    const label = `${record.type} ${name}`;
    if (!inZone(name, zoneName)) {
      skipped.push(`${label} is outside the connected zone.`);
      continue;
    }
    const found = await inspect(token, zoneId, zoneName, record, owned);
    if (found.action === 'unchanged') {
      written.push(label);
      continue;
    }
    if (found.action === 'conflict') {
      skipped.push(found.current?.includes('proxied by Cloudflare') ? `${label} is proxied by Cloudflare. Turn the proxy off (DNS only) and run it again. It was left unchanged.` : `${label} already has a different value. It was left unchanged.`);
      continue;
    }
    if (found.action === 'skip') {
      skipped.push(`${label} could not be read.`);
      continue;
    }
    const payload = record.type === 'SRV'
      ? { type: 'SRV', name, data: record.data, ttl: 120 }
      : record.type === 'MX'
        ? { type: 'MX', name, content: record.content, priority: record.priority ?? 10, ttl: 120 }
        : { type: record.type, name, content: record.content, ttl: 120, ...(record.type === 'TXT' ? {} : { proxied: false }) };
    if (found.action === 'update' && found.ours?.id) {
      const saved = await cf(token, 'PATCH', `/zones/${zoneId}/dns_records/${found.ours.id}`, payload);
      if (!saved.ok) skipped.push(saved.errors[0] ?? `${label} was not updated.`);
      else written.push(label);
      continue;
    }
    const saved = await cf(token, 'POST', `/zones/${zoneId}/dns_records`, payload);
    const cloudflareId = saved.ok && saved.result && typeof saved.result === 'object' && 'id' in saved.result ? String((saved.result as { id?: unknown }).id ?? '') : '';
    if (!saved.ok || !cloudflareId) skipped.push(saved.errors[0] ?? `${label} was not written.`);
    else {
      written.push(label);
      created.push({ type: record.type, name, content: wantedValue(record), cloudflareId });
    }
  }
  return { written, skipped, created };
}

/** Deletes records this platform created. Anything else in the zone is left alone. */
export async function deleteOwnedRecords(token: string, zoneId: string, cloudflareIds: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const id of cloudflareIds) {
    if (!/^[a-zA-Z0-9]+$/.test(id)) continue;
    const result = await cf(token, 'DELETE', `/zones/${zoneId}/dns_records/${id}`);
    if (result.ok) removed.push(id);
  }
  return removed;
}
