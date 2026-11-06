import { describe, expect, it } from 'vitest';
import { applyMailDns, mailWriteDecision, previewMailDns, rollbackCopy } from '../src/services/mail-dns-apply.js';
import { mailDnsRecords } from '../src/services/mail-dns.js';

describe('mail dns apply', () => {
  const wanted = mailDnsRecords({
    domain: 'shop.example',
    mailHostname: 'mail.blipmade.com',
    dkimPublic: null,
    fromAddress: 'postmaster@shop.example',
  });

  it('previews creates and refuses a foreign MX', () => {
    const preview = previewMailDns(wanted, [{ type: 'MX', name: 'shop.example', value: 'other.mail.', owned: false }]);
    expect(preview.find((row) => row.type === 'MX')?.action).toBe('conflict');
    const applied = applyMailDns(wanted, [{ type: 'MX', name: 'shop.example', value: 'other.mail.', owned: false }]);
    expect(applied.written).toBe(0);
    expect(applied.conflicts).toContain('MX shop.example');
  });

  it('writes only after a clean preview and keeps a rollback copy', () => {
    const preview = previewMailDns(wanted, []);
    expect(preview.every((row) => row.action === 'create')).toBe(true);
    const applied = applyMailDns(wanted, []);
    expect(applied.written).toBeGreaterThan(0);
    expect(applied.conflicts).toEqual([]);
    expect(rollbackCopy(preview).every((row) => row.value === null)).toBe(true);
    expect(mailWriteDecision({ writesEnabled: false, provider: 'cloudflare' })).toEqual({ outcome: 'preview_only', applied: false });
    expect(mailWriteDecision({ writesEnabled: true, provider: 'none' })).toEqual({ outcome: 'provider_unavailable', applied: false });
    expect(mailWriteDecision({ writesEnabled: true, provider: 'cloudflare' })).toEqual({ outcome: 'ready', applied: false });
  });
});
