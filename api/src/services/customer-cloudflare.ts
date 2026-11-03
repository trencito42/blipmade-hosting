import { badRequest } from '../lib/errors.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import type { CustomerRecord, OwnedRecord, RecordPreview } from './dns-approval.js';

export { DNS_PREVIEW_TTL_MS, approvalDecision, recordsFingerprint } from './dns-approval.js';
export type { CustomerRecord, OwnedRecord, RecordPreview } from './dns-approval.js';

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
    const name = record.name.toLowerCase();
    if (!WRITABLE.has(record.type) || (name !== zoneName && !name.endsWith(`.${zoneName}`))) {
      preview.push({ type: record.type, name, wanted: record.content, current: null, action: 'skip' });
      continue;
    }
    const listed = await cf(token, 'GET', `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(name)}`);
    const existing = listed.ok && Array.isArray(listed.result) ? listed.result as { id?: string; content?: string }[] : [];
    const current = existing[0]?.content ?? null;
    const ownedId = owned.find((row) => row.type === record.type && row.name === name)?.cloudflareId ?? null;
    const ours = ownedId ? existing.find((row) => row.id === ownedId) : undefined;
    let action: RecordPreview['action'] = 'skip';
    if (!listed.ok) action = 'skip';
    else if (current === null) action = 'create';
    else if (current === record.content) action = 'unchanged';
    else if (ours) action = 'update';
    else action = 'conflict';
    preview.push({ type: record.type, name, wanted: record.content, current, action });
  }
  return preview;
}

export interface PublishedRecord {
  type: string;
  name: string;
  content: string;
  cloudflareId: string;
}

/** Writes approved address records. A conflicting record this platform does not own is left in place. */
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
    const ownedId = owned.find((row) => row.type === record.type && row.name === name)?.cloudflareId ?? null;
    const ours = ownedId ? existing.find((row) => row.id === ownedId) : undefined;
    const same = existing.find((row) => row.content === record.content);
    if (existing.length > 0 && !same && !ours) {
      skipped.push(`${record.type} ${name} already has a different value. It was left unchanged.`);
      continue;
    }
    if (same?.id && !ours) {
      written.push(`${record.type} ${name}`);
      continue;
    }
    if (ours?.id && ours.content === record.content) {
      written.push(`${record.type} ${name}`);
      continue;
    }
    const payload = record.type === 'SRV'
      ? { type: 'SRV', name, data: record.data, ttl: 120, proxied: false }
      : { type: record.type, name, content: record.content, ttl: 120, proxied: false };
    if (ours?.id) {
      const saved = await cf(token, 'PATCH', `/zones/${zoneId}/dns_records/${ours.id}`, payload);
      if (!saved.ok) skipped.push(saved.errors[0] ?? `${record.type} ${name} was not updated.`);
      else written.push(`${record.type} ${name}`);
      continue;
    }
    const saved = await cf(token, 'POST', `/zones/${zoneId}/dns_records`, payload);
    const cloudflareId = saved.ok && saved.result && typeof saved.result === 'object' && 'id' in saved.result ? String((saved.result as { id?: unknown }).id ?? '') : '';
    if (!saved.ok || !cloudflareId) skipped.push(saved.errors[0] ?? `${record.type} ${name} was not written.`);
    else {
      written.push(`${record.type} ${name}`);
      created.push({ type: record.type, name, content: record.content, cloudflareId });
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
