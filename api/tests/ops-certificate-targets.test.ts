import { describe, expect, it } from 'vitest';
import { certificateTargets } from '../src/lib/ops-certificate-targets.js';

describe('the certificates the platform watches', () => {
  it('reads the address of the mail server like every other address', () => {
    const targets = certificateTargets([['the mail server', 'https://mail.blipmade.com']]);
    expect(targets).toEqual([
      { label: 'the mail server', host: 'mail.blipmade.com', port: 443 },
    ]);
  });

  it('keeps the port of an address that has one', () => {
    const targets = certificateTargets([['the relay', 'smtps://relay.example.com:465']]);
    expect(targets).toEqual([{ label: 'the relay', host: 'relay.example.com', port: 465 }]);
  });

  it('leaves out an address that is not written down', () => {
    const targets = certificateTargets([
      ['the public address', 'https://blipmade.com'],
      ['the mail server', ''],
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.label).toBe('the public address');
  });

  it('leaves out an address that cannot be read', () => {
    const targets = certificateTargets([['the broken address', 'not an address']]);
    expect(targets).toEqual([]);
  });
});
