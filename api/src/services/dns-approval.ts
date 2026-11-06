import { createHash } from 'node:crypto';

/** A preview can be approved for ten minutes. After that the zone is read again. */
export const DNS_PREVIEW_TTL_MS = 10 * 60 * 1000;

export interface CustomerRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'SRV' | 'MX';
  name: string;
  content: string;
  priority?: number;
  data?: { priority: number; weight: number; port: number; target: string };
}

export interface RecordPreview {
  type: string;
  name: string;
  wanted: string;
  current: string | null;
  action: 'create' | 'update' | 'unchanged' | 'conflict' | 'skip';
}

export interface OwnedRecord {
  type: string;
  name: string;
  cloudflareId: string;
}

/** The hash of the records the customer is being asked to approve. */
export function recordsFingerprint(records: CustomerRecord[]): string {
  const stable = records
    .map((record) => ({
      type: record.type,
      name: record.name.toLowerCase(),
      content: record.content,
      priority: record.priority ?? null,
      data: record.data ?? null,
    }))
    .sort((left, right) => `${left.type} ${left.name}`.localeCompare(`${right.type} ${right.name}`));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function samePreview(stored: RecordPreview[], live: RecordPreview[]): boolean {
  if (stored.length !== live.length) return false;
  const key = (row: RecordPreview) => `${row.type} ${row.name}`;
  const liveByName = new Map(live.map((row) => [key(row), row]));
  return stored.every((row) => {
    const other = liveByName.get(key(row));
    return Boolean(other && other.action === row.action && other.current === row.current && other.wanted === row.wanted);
  });
}

/**
 * An approval is valid only for the preview the server stored.
 * A different diff, a conflict that appeared later, or an expired preview is refused.
 */
export function approvalDecision(input: {
  now: number;
  expiresAt: number;
  consumedAt: number | null;
  fingerprint: string;
  currentFingerprint: string;
  stored: RecordPreview[];
  live: RecordPreview[];
}): { ok: true } | { ok: false; reason: string } {
  if (input.consumedAt !== null) return { ok: false, reason: 'This preview was already used. Preview the changes again.' };
  if (input.now > input.expiresAt) return { ok: false, reason: 'This preview has expired. Preview the changes again.' };
  if (input.fingerprint !== input.currentFingerprint) return { ok: false, reason: 'The records to write have changed. Preview them again.' };
  if (!samePreview(input.stored, input.live)) return { ok: false, reason: 'The zone changed since the preview. Preview the changes again.' };
  return { ok: true };
}
