import type { MailDnsRecord } from './mail-dns.js';

export type MailAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'skip';

export interface MailPreviewRow {
  type: string;
  name: string;
  wanted: string;
  current: string | null;
  action: MailAction;
}

export interface MailZoneRow {
  type: string;
  name: string;
  value: string;
  owned?: boolean;
}

export function mailDnsWritesEnabled(): boolean {
  return process.env.MAIL_DNS_WRITES === 'true';
}

function key(row: { type: string; name: string }): string {
  return `${row.type}:${row.name.toLowerCase()}`;
}

export function previewMailDns(wanted: MailDnsRecord[], zone: MailZoneRow[]): MailPreviewRow[] {
  const live = new Map(zone.map((row) => [key(row), row]));
  return wanted.map((record) => {
    const current = live.get(key(record));
    if (!current) return { type: record.type, name: record.name, wanted: record.value, current: null, action: 'create' };
    if (current.value.toLowerCase() === record.value.toLowerCase()) {
      return { type: record.type, name: record.name, wanted: record.value, current: current.value, action: 'unchanged' };
    }
    if (current.owned) {
      return { type: record.type, name: record.name, wanted: record.value, current: current.value, action: 'update' };
    }
    return { type: record.type, name: record.name, wanted: record.value, current: current.value, action: 'conflict' };
  });
}

export function applyMailDns(wanted: MailDnsRecord[], zone: MailZoneRow[]): { zone: MailZoneRow[]; written: number; skipped: number; conflicts: string[] } {
  const preview = previewMailDns(wanted, zone);
  if (preview.some((row) => row.action === 'conflict')) {
    return {
      zone,
      written: 0,
      skipped: preview.filter((row) => row.action === 'skip' || row.action === 'unchanged').length,
      conflicts: preview.filter((row) => row.action === 'conflict').map((row) => `${row.type} ${row.name}`),
    };
  }
  const next = [...zone];
  let written = 0;
  for (const row of preview) {
    if (row.action === 'unchanged' || row.action === 'skip') continue;
    const index = next.findIndex((entry) => key(entry) === key(row));
    const record = { type: row.type, name: row.name, value: row.wanted, owned: true };
    if (index >= 0) next[index] = record;
    else next.push(record);
    written += 1;
  }
  return { zone: next, written, skipped: preview.filter((row) => row.action === 'unchanged').length, conflicts: [] };
}

export function rollbackCopy(preview: MailPreviewRow[]): { type: string; name: string; value: string | null }[] {
  return preview
    .filter((row) => row.action === 'create' || row.action === 'update')
    .map((row) => ({ type: row.type, name: row.name, value: row.current }));
}
