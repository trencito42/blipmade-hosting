import { describe, expect, it } from 'vitest';
import { builtInReservedDomains, isReservedUnderBase } from '../src/routes/domains.js';
import { env } from '../src/env.js';

describe('the names that the platform keeps under its own base', () => {
  const base = 'apps.blipmade.com';
  const entries = ['blipmade.com', base, `panel.${base}`, `mail.${base}`, 'reserved.example.org'];

  it('lets a customer take a free name under the base, such as daily81', () => {
    expect(isReservedUnderBase(`daily81.${base}`, entries, base)).toBe(false);
    expect(isReservedUnderBase(`minecraft-paper.${base}`, entries, base)).toBe(false);
  });

  it('refuses the names that the platform really uses', () => {
    expect(isReservedUnderBase(`panel.${base}`, entries, base)).toBe(true);
    expect(isReservedUnderBase(`x.mail.${base}`, entries, base)).toBe(true);
  });

  it('still refuses an entry that the staff added outside the base', () => {
    expect(isReservedUnderBase('reserved.example.org', entries, base)).toBe(true);
  });

  it('keeps the built-in list free of the free names', () => {
    const base2 = env.DOMAIN_BASE.trim().toLowerCase();
    expect(isReservedUnderBase(`daily81.${base2}`, builtInReservedDomains(), base2)).toBe(false);
  });
});
