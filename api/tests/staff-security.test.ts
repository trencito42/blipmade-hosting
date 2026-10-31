import { describe, expect, it } from 'vitest';
import { ipAllowed, validAllowlistEntry } from '../src/lib/staff-security.js';

describe('the list of addresses of the staff area', () => {
  it('matches single addresses and ranges', () => {
    const list = ['203.0.113.7', '198.51.100.0/24'];
    expect(ipAllowed('203.0.113.7', list)).toBe(true);
    expect(ipAllowed('203.0.113.8', list)).toBe(false);
    expect(ipAllowed('198.51.100.200', list)).toBe(true);
    expect(ipAllowed('198.51.101.1', list)).toBe(false);
  });

  it('reads an IPv4 address that arrives mapped into IPv6', () => {
    expect(ipAllowed('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
  });

  it('matches IPv6 addresses and ranges, and never an address of the other kind', () => {
    expect(ipAllowed('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(ipAllowed('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    expect(ipAllowed('203.0.113.7', ['2001:db8::/32'])).toBe(false);
    expect(ipAllowed('not an address', ['203.0.113.7'])).toBe(false);
  });

  it('checks the entries', () => {
    expect(validAllowlistEntry('203.0.113.0/24')).toBe(true);
    expect(validAllowlistEntry('203.0.113.0/33')).toBe(false);
    expect(validAllowlistEntry('hello')).toBe(false);
    expect(validAllowlistEntry('2001:db8::/32')).toBe(true);
  });
});
